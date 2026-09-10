# Playback routing completion plan

Status: initial implementation increments in progress, 2026-09-09 (local date).
Stage 0 baseline passed. Stage 1 bounded File input passed the recorded Chrome and
Firefox functional gates. Stage 2 audio-only/WebM packaging passed eight visible
playback cases in each browser; its broader correctness/release gates remain open.
See [current evidence](../results/routing-completion/README.md) and
[local-file results](../results/routing-completion/LOCAL-FILES.md).
Stages 3–6 and release qualification remain open. Preserve existing source edits
and recorded runs. Implementation does not authorize committing or pushing.

The next Stage 2 increment negotiates compatible MP4/WebM packaging before muxing,
including one alternative-container retry after initialization failure. Five visible
rejection/recovery cases passed in Chrome and Firefox; see
[packaging negotiation](../results/packaging-negotiation/README.md).
The separately opt-in [Software YUV presenter](SOFTWARE-YUV-PRESENTER.md) shares the
maintained Software worker. Its integration has intermittent filtered-seek failures;
it is not a completed correctness or production promotion gate.

| Candidate in this increment | Decision | Integration/maintenance boundary |
| --- | --- | --- |
| Native MP4/WebM negotiation | Implement within the existing remux plan; broader release gates remain open | Small muxer-selection export plus worker/MSE handshake; moderate cancellation and browser-qualification burden |
| Software YUV presentation | Experiment further, opt-in only | Private mpv render ABI, extra engine asset and WebGL lifecycle; significant pixel-format and seek qualification burden |

The smallest useful architecture remains Native direct → Native compatible remux
→ Hybrid → Software, with RGB as the Software default. YUV is a presenter option
inside Software. Neither candidate adds a playback mode or server transcoding.

## Objective and policy

Preserve three public modes: Native, Hybrid and Software. Automatically prefer
Native direct, then a suitable Native remux/adaptation plan, then Hybrid, then
Software, subject to the selected tracks, requested features and output destination.
A route that cannot preserve a requirement must reject explicitly. Software remains
the broad decoder fallback, not a promise that every file or output requirement works.

Keep original compressed packets whenever possible. Lossless representation changes,
feature-removing adaptation, audio conversion and video conversion must be distinct
in diagnostics. No server transcoding requirement, silent downmix, language switch,
HDR downgrade or substitution for exact CPU filters.

## Verified starting point before these increments

- The local mpv path calls `File.arrayBuffer()` and caps input at 32 MiB in both
  `src/unified-player.ts` and `src/internal/wasm-player.ts`. Remote mpv playback and
  Native remux already use bounded worker-backed reads.
- `native/remux/remux.c` still requires a video stream and produces MP4. Its generic
  video paths need valid DTS; specialized repairs cover AVC Matroska and AVC/AAC TS.
- Hybrid bridges AVC, HEVC, VP8, VP9 and AV1 to actual browser decoding. Other video
  codecs use Software. More FFmpeg decoder registrations do not expand WebCodecs.
- Native ASS rendering, optional audio conversion and seamless remux configuration
  changes remain unimplemented. Existing Hybrid compatibility makes the first two
  potential optimizations rather than prerequisites for basic playback coverage.
- The [broad-routing evidence](../results/broad-routing/README.md) is short functional
  coverage. It does not qualify every registered demuxer, long playback, HDR, speaker
  layout, all browsers or sustained 4K performance.

## Order and dependencies

| Stage | Work | Dependency | Completion gate |
| --- | --- | --- | --- |
| 0 | Freeze contracts and baseline | None | Requirements, fixtures, metrics and acceptance thresholds recorded before edits |
| 1 | Bounded local File input for both mpv modes | 0 | Large local files open, seek, fall back and clean up without full-file materialization |
| 2 | Audio-only MP4 and WebM remux | 0; use stage 1 for realistic large-file fallback tests | New packet-copy plans pass startup, seeking, synchronization, bounds and browser rejection tests |
| 3 | Broader timestamp and TS support | 1–2 | Each added codec/container has proved random-access and preroll behavior |
| 4 | Track/configuration transitions | 2–3 | New initialization and decoder state preserve timeline, selected tracks and cancellation |
| 5 | Selective Native features | Stable stages 1–4 | A measured benefit over Hybrid plus complete feature/output fidelity |
| 6 | Release qualification and routing matrix | Gates run throughout; final after selected additions | Reproducible platform evidence and explicit unsupported outcomes |

Prioritize at most two major implementation experiments initially: **bounded local
File input** and **additional remux packaging**. Start stage 0 immediately and qualify
each increment as it lands. Do not begin audio transcoding while the fallback source
path remains incomplete.

## Stage 0 — Baseline and requirements

Record current source/binary hashes and rerun the existing automatic-selection,
remux, API and codec-configuration suites. Serve only completed builds; publish build
outputs from a staging directory to prevent tests reading a partially written Wasm.

Make route requirements explicit: selected source-stream identities, subtitle
visibility, exact filters, source permissions/authentication, output destination,
HDR/color policy and audio codec/layout. Keep these separate from the current backend.
Classify errors by source, packaging, decoder, presentation, resource or requirement;
replace message-pattern classification with typed errors as the affected code changes.
A source identity/authorization violation is terminal, not an invitation to reopen
an unprotected reader. Keep forward recovery bounded and inspect failures on the
replacement session after an in-flight recovery finishes.

Deliver a fixture inventory and a table distinguishing compiled, browser-probed,
functionally tested and release-qualified combinations. No completion percentage
based on component registration counts.

## Stage 1 — Large local files: first experiment

Integration: `src/internal/wasm-player.ts`, `web/io-worker.js`, the existing engine
workers and `native/stream_bridge.c`. Reuse the established AVIO/mailbox and playback
owner; do not add a second playback scheduler or an HTTP server requirement.

Introduce a bounded local reader with the same read-at/length/cancel/close contract
as the remote adapter. Pass the File handle by structured clone, read bounded slices
in the I/O worker, and keep the complete media out of the Wasm filesystem. Reuse the
Native remux File reader where practical. Keep the existing ArrayBuffer size guard:
that API already implies an in-memory source. Remove the File cap only after the
new reader is used by both Hybrid and Software.

Acceptance:

- Valid files above 32 MiB, approximately 1 GiB, and a valid container exercising
  offsets above 4 GiB; test both modes and automatic fallback between them.
- Front/tail-indexed MP4, indexed MKV, distant/backward seeks and at least 100 rapid
  target changes. Cancel obsolete reads; only the final generation may publish data.
- Preserve position, play/pause intent, rate, selected source tracks and subtitles
  during recovery. Test replacing and destroying a player during a blocked read.
- No whole-File `arrayBuffer()` call or full-file WasmFS write. Instrument requested,
  active, retained and discarded bytes; separate file-backed pages from owned buffers.
- At matched bit rate, changing duration must not scale retained media buffers.
  All workers, pending reads and owned buffers must be released after destruction.

Smallest disproof: open one large local indexed MKV in Hybrid, force browser-decoder
failure, recover in Software and seek near the end. If full-file materialization,
unbounded memory or track loss occurs, do not remove the guard.

Maintenance: moderate JS/I/O integration; extend native AVIO only if its current
contract cannot carry the File reader. No decoder patches should be needed.

## Stage 2 — More remux packaging: second experiment

First make selected video optional. Choose the timing/seek reference from the active
streams, generate `audio/mp4` when appropriate, and remove video-only readiness,
fragment-flush and random-access assumptions. Then introduce a mux-plan interface
and WebM output rather than duplicating the source, cancellation or MSE controllers.

Initial contracts: audio-only AAC/Opus/FLAC in suitable MP4, and VP8/VP9 with
Vorbis/Opus plus audio-only Vorbis/Opus in WebM where the browser accepts them.
Test MP3 against actual available MSE byte-stream formats; do not force it into MP4
when that browser rejects the contract. Reject unsupported combinations to Hybrid.

Preserve CodecPrivate/extradata, codec delay, discard padding, channel layout and
packet timestamps. WebM initialization/Tracks and bounded Clusters need explicit
TimecodeScale and timestamp rules. Seek the original file's index; do not wait for
a complete generated output index. Make fragment readiness, EOF, buffering, eviction
and backpressure independent of a required video track.

Acceptance: visible video or measured audible output, startup before a long source
is fully processed, all seek/cancel tests from stage 1, audio priming and A/V sync,
MSE quota recovery, and actual browser rejection followed by working Hybrid playback.
Compare the same original media through remux and Hybrid with identical selected
features. Ship a plan only if it adds useful access/output compatibility or a
repeatable resource benefit without violating correctness.

Smallest disproof: one indexed VP8/Vorbis MKV and one audio-only Opus source; open,
seek far outside the generated region and resume under a small forward-buffer budget.
Maintenance: moderate mux/segment work; avoid a parallel player implementation.

## Stage 3 — Timestamps, random access and MPEG-TS

Expand per codec/container contract, starting with common HEVC Matroska and HEVC/AAC
TS. Determine whether FFmpeg parsers/demuxers can supply missing timing or a codec's
explicit reorder metadata can justify bounded reconstruction. Do not infer DTS by
sorting arbitrary PTS or restarting a muxer at zero.

Test B-frames, long/open GOPs, HEVC IDR/CRA and leading pictures, negative preroll,
nonzero starts, edit lists, audio offsets, VFR, TS wrap/discontinuities and repeated
seeks. Preserve source-time coordinates across every restart; regenerate only useful
bounded fragments. Treat mid-stream discontinuities as explicit timeline epochs.

Smallest disproof: seek into a B-frame HEVC MKV and an open-GOP HEVC TS with an A/V
sync marker. Wrong decode order, missing leading-picture handling or sync drift keeps
that combination on Hybrid. Maintenance: high correctness risk; prefer upstream
parser behavior over bespoke bitstream/timing code and add narrow patches only with
reproducers and regression fixtures.

## Stage 4 — Track and configuration changes

Model an epoch using selected source track identities and codec parameters. On a
change, cancel old work, drain/discard obsolete decoder state, determine whether the
browser permits reconfiguration, and append a new initialization segment or replace
the MSE session as required. Preserve the destination timeline, append windows,
preroll and selected audio/subtitle identities. If seamless continuation is not
supported, recover transactionally to Hybrid or Software at that same source time.

Cover resolution, profile/depth, color, extradata, audio rate/layout and track changes;
seek across a change in both directions and cancel during reinitialization. Verify
subtitles active before the target remain visible. Do not claim seamless changes
from a successful `changeType` or decoder configuration probe alone.

## Stage 5 — Optional Native feature replacements

Evaluate ASS first: reuse extraction and attachment/font handling, render against
the media-element clock, and qualify animated ASS/karaoke, pause, rate, resize, DPR,
seek and track changes. Fullscreen must include the overlay; PiP and remote playback
need their own fidelity checks. If an output cannot carry the requested subtitles,
report that limitation or choose a route that can; never silently omit them.

Audio conversion follows only with an explicit caller quality/layout policy. Consider
compatible alternate tracks through that policy without changing language or channel
count silently. Copy video, encode only selected audio, and qualify priming, sync,
seeking, quality, layout and CPU/startup cost. Keep conversion visible in diagnostics.
It is not lossless remuxing and must not become the default merely to retain Native.

Smallest disproof for either feature: matched playback against current Hybrid. If
whole-browser cost/startup or required output behavior is worse without another
concrete benefit, defer the addition. Subtitle rendering has moderate integration
cost; audio conversion has high ongoing codec, quality and timing qualification cost.

## Stage 6 — Qualification and release gates

Run on named browser/OS versions: Chrome/Edge, Firefox and Safari on supported desktop
platforms, then mobile targets separately. A Playwright WebKit run is not a substitute
for a real Safari/device qualification result. Record supported and rejected outcomes.

For each promoted combination, use repeated matched visible/audible runs plus at
least one hour-long session and 100 seeks. Record the CPU accounting method, machine,
power state, frame size/rate, tracks/subtitles/effects, process memory, startup video
and audio separately, fetched/remuxed bytes, first fragment latency, buffer bytes and
seconds, queue depth, copies/uploads, owned/closed frames, presentation/decoder drops,
audio underruns, scheduling lateness, A/V timing, seek recovery and cleanup.

Hard gates: no track/feature loss, stale-generation append, identity bypass, unbounded
queue or leaked resource; correct seek/preroll and measured sync; clean automatic
fallback for deliberately rejected codecs. Freeze workload-specific numerical sync,
latency, drop and memory thresholds in stage 0 before evaluating results. Report
median and spread for repeated trials without combining unrelated runs or redefining
thresholds after seeing failures. Benefit must exceed run-to-run uncertainty; otherwise
retain the simpler existing route.

Release outputs: maintained integration tests and valid fixtures, per-platform routing
matrix, exact source/binary hashes and reproduction commands, measured limitations,
updated API documentation and a list of intentionally deferred contracts.
