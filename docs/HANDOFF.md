# webmpv handoff

Updated 2026-09-07. M0, M1 and M2/G1 are complete for the declared software
profile. No implementation work remains for those milestones. M3 and S1 have
not started; the next development direction is still a decision.

## Checkpoint and source of truth

Repository: `git@github.com:Jagalite/webmpv.git`, branch `main`.
Current local checkout: `/Volumes/seed2/Projects/webmpv`.

| Milestone | Accepted commit | Tag |
|---|---|---|
| M0: reproducible local software playback | `fdb0bbe` | `m0-software-baseline` |
| M1: bounded remote streaming and controls | `2f77578` | `m1-streaming-baseline` |
| M2/G1: qualification and baseline delivery | `228d6fc` | `m2-software-baseline` |

This handoff is a documentation addition after the M2 checkpoint. Read these
documents before changing the playback contract:

- [Original architecture](../browser-player-feasibility-and-architecture-v3.md):
  preserved implementation baseline. Its historical “not run” entries are not
  current status.
- [Milestones](MILESTONES.md): current completion state and approval gates.
- [Supported profile](SUPPORTED-PROFILE.md) and [qualification contract](M1-M2-PROFILE.md):
  exact support boundaries, resource budgets and acceptance conditions.
- [M2 acceptance](validation/M2.md): final results, limitations and diagnostic history.
- [Integration guide](INTEGRATION.md), [patch inventory](PATCHES.md) and
  [provenance](PROVENANCE.md): API usage and upstream/build ownership.

## What is implemented

mpv owns playback; upstream FFmpeg decodes audio/video in threaded Wasm; libass
composes subtitles. CPU-backed frames reach Canvas 2D and PCM reaches an
AudioWorklet. Qualification disables `VideoDecoder`, `AudioDecoder` and
`VideoFrame` and forbids HTMLMediaElement playback.

| Location | Responsibility |
|---|---|
| `src/player.ts` | Public API, worker lifecycle, controls and authorization callbacks; compiled into `web/generated/` |
| `web/engine-worker.js` | mpv commands/events, rendering, PCM coordination and source/seek output state |
| `web/io-worker.js`, `web/range-reader.js` | Authenticated HTTP ranges, bounded cache, cancellation, retries and source identity |
| `native/stream_bridge.c`, `native/stream_bridge.h` | Public mpv stream callbacks, synchronous mailbox and read interruption |
| `native/player.c`, `native/events.c` | Native player setup and event bridge |
| `native/ao_browser.c`, `native/audio_bridge.h`, `web/audio-worklet.js` | Bounded PCM output and timing feedback |
| `patches/`, `sources.lock.json`, `toolchain.lock.json` | Documented native changes and pinned build inputs |
| `tests/`, `results/m2/` | Executable qualification and recorded evidence |

Preserve source/seek generations and request ownership when changing asynchronous
code. A late authorization response must not satisfy another source; interrupted
reads must not masquerade as EOF; old PCM/video must not appear after a seek.
Keep native and browser build provenance separate and join them through final
runtime hashes. Modify TypeScript source and regenerate its tracked outputs.

## Run and build

For a checkout with an engine already in `web/engine/`:

```sh
npm ci
npm run build
npm run dev
```

Open `http://127.0.0.1:4179`. The server supplies required COOP/COEP headers.
Use **Play test film**, a local file up to 32 MiB, or **Open URL** for large media.
`web/example.html` demonstrates the host API. A fresh clone does not include
the ignored native engine or large generated fixtures. Build the engine with
Docker using the pinned ARM64 environment:

```sh
bash scripts/build-container.sh
mkdir -p web/engine
cp build/container-result/player.* web/engine/
```

See the [README](../README.md) for a second independent build and local-toolchain
requirements. `bash scripts/build-bindings.sh` separately assembles browser
bindings and their manifest. Native and browser builds each have independent
reproducibility evidence.

The supplied MKV's original location is
`/Users/jagatranvo/Downloads/full_subs_test.mkv`. After macOS blocked resumed CLI
access, Finder created a private copy at
`build/private-fixture/full_subs_test.mkv`; the original was unchanged. The copy
is local-only, ignored by Git, and excluded from the archive. Its recorded identity
is in [supplied-fixture.json](../results/m2/supplied-fixture.json).

In a second terminal, from the repository root:

```sh
WEBMPV_TEST_MEDIA="$PWD/build/private-fixture/full_subs_test.mkv" npm run dev:media
```

Enter `http://127.0.0.1:4180/media/user` in the demo's **Open URL** field. The
fixture origin serves read-only ranges on ports 4180/4181; directly navigating
to the range-only URL is not a playback test. On another machine, supply a
readable fixture path. Server processes are session-local; check occupied ports
before starting new instances.

## Accepted evidence and practical limits

Acceptance covers Apple M1 / 8 GiB / macOS 26.5.2 with Chrome 152.0.7977.76,
H.264 High SDR 8-bit 1080p and AAC stereo, indexed MP4/MKV and declared ASS cases.
It does not establish support for arbitrary browsers, devices or codecs.

| Evidence | Recorded result |
|---|---|
| [Functional matrix](../results/m2/functional.json) | Warm front/tail MP4 startup 2882/2838 ms; distant seeks 630/548 ms; auth/CORS/recovery, tracks, VFR, 100 seeks and 100 lifecycles pass |
| [Supplemental checks](../results/m2/supplemental.json) | Native-reference ASS comparisons, attachment budget, stalled-read destruction, renewal ownership and example pass |
| [Supplied MKV regression](../results/m2/m1-regression/browser.json) | All six checks pass, including distant and stalled-read seeks and paused ASS restoration |
| [M0 regression](../results/m2/m0-regression/m0-browser.json) | All nine browser checks pass |
| [Shaped hour](../results/m2/long.json) | 3607.913 s; 3590 matched output signals; 18.8 ms p95 / 25.2 ms maximum error; zero VO/decoder drops |
| [Native builds](../results/m2/reproducibility.json), [browser assemblies](../results/m2/bindings-reproducibility.json) | Independently built outputs match |
| [Extracted runtime](../results/release-smoke.json), [archive comparison](../results/release-reproducibility.json) | Smoke passes; repeat archives match; 188 extracted files verified and 17 tested runtime/fixture files unchanged |

The hour used application-layer loopback shaping at 10 Mbps with an 80 ms
response delay. Heap stayed at 128 MiB, HTTP cache at 16 MiB; median process-family
RSS declined 65.2 MiB. Median CPU was 56.2% of one core. These are recorded
reference-device results, not a WAN, physical display/audio latency or thermal
certification.

Known boundaries to preserve in product claims:

- Warm startup has little margin below three seconds and follows unrelated local
  playback on the same engine. First-use startup can exceed three seconds.
- File-loop boundaries produced brief PCM underruns; looping is not gapless.
- MKV exact seeking uses a public half-second demux preroll; MP4 retains zero.
- The CPU fast-bilinear scaler trades chroma interpolation quality for performance.
- Oversized font attachments are reported and omitted; their fidelity is not supported.
- Remote inputs require coherent 206 ranges and stable identity, with a strong
  ETag or explicit immutable contract. Redirects and ignored ranges fail.
- Other browsers/devices, simultaneous instances, HDR, surround, arbitrary codecs,
  segmented/live streams, DRM and hardware acceleration remain unqualified.

Historical interrupted/unshaped runs and correction probes are retained under
`results/m2/`. They are not substitutes for the accepted shaped hour. See the
acceptance record for unmatched signals, loop underruns and earlier failures.

## Validation when resuming

For runtime work, start with relevant tests. With the demo and media servers
running, the suite commands are:

```sh
npm run build
node --test tests/range-reader.mjs tests/audio-worklet.mjs
npm test
RESULT_DIR=results/m2/m1-regression HEADED=1 node tests/m1.mjs
npm run test:qualify
```

Generate missing controlled fixtures with
`bash scripts/make-qualification-fixtures.sh` and native subtitle references with
`bash scripts/make-reference-fixtures.sh`; the latter requires native mpv/FFmpeg.
The supplied-file regression also requires the private media route above.
Some tests overwrite tracked evidence: use a development branch and review
result changes against the accepted tag.

When requalifying a release, run `npm run test:long` for the full real hour under
the declared conditions, without competing heavy work. Complete independent
native/browser builds and extracted-package validation as documented. Do not
combine interrupted runs, silently relax thresholds, or reuse old runtime hashes
for changed code. Revise the target contract explicitly before changing its scope.
A documentation-only handoff does not require rerunning performance qualification.

## Delivery artifact

The accepted archive is local at `build/releases/webmpv-software-0.2.0.tar.gz`:
14,179,481 bytes, SHA-256
`b512d5bfffda77ec80a00a26893df0ce8dc9c840ed90d45f03ed6872bef4c58b`.
See [release-summary.json](../results/release-summary.json).
After extraction, run `node scripts/serve.mjs` from the extracted root.

`build/` is ignored: pushing Git commits does not upload the archive, engine or
private media. The accepted archive predates this handoff. Preserve it and its
recorded hash; a repack containing later documentation is a different artifact.
`python3 scripts/package-baseline.py` checks qualification and runtime hashes
before packaging; see the README and acceptance record before replacing release
evidence. Distribution beyond Git source requires a separate artifact delivery.

## Next milestones

Choose S1 for additional input formats or M3 to evaluate decoding efficiency.
Neither has been started or selected by this handoff.

1. **S1, independent after G1:** fixed HLS/DASH VOD with software decoding.
   Qualify nested manifests/segments, TS/fMP4 init and byte ranges, audio/subtitles,
   authorization, discontinuities, cancellation and retries. Live, low latency,
   ABR, DRM and HDR are separate scope.
2. **M3:** a matched benchmark using identical demuxed packets to compare software
   decoding, WebCodecs copy-back and practical retained-frame presentation.
   Predeclare the useful-benefit threshold; include message/copy overhead, frame
   delivery, memory, startup/seek effects, measurable CPU/energy and uncertainty.
   Estimate patch cost and maintenance ownership. This is not a production fork.
3. **G2 → M4:** only after explicit approval based on M3 evidence, implement
   WebCodecs copy-back with correct timestamps, drain/reset and bounded ownership,
   plus keyframe/preroll recovery into software. Keep a separately buildable
   software artifact and rerun G1 regressions.
4. **G3 → M5:** only if measured copy costs justify another approved integration,
   introduce retained browser frames, bounded leases, CPU-filter downloads and
   ASS composition. Compare all three complete paths before selecting defaults.

G1 acceptance is the completed stopping point; it does not automatically approve
M4 or M5. Broader browser/device/codec support requires its own qualification.
