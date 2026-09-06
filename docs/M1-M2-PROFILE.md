# M1/M2 qualification contract

Declared before streaming qualification, 2026-09-06. This extends the accepted
M0 codec/output profile with streaming and qualification workloads; M0 remains
preserved by the `m0-software-baseline` Git tag and accepted artifact directory.

Device: MacBookAir10,1, Apple M1, 8 GiB RAM, macOS 26.5.2. Browser: installed
Google Chrome 152, visible foreground localhost page with COOP/COEP. FFmpeg
software decoding only, with VideoDecoder, AudioDecoder and VideoFrame removed.

Inputs:
- User-provided `full_subs_test.mkv`: 1,632,771,887 bytes, 1604.127 seconds,
  1920x1080 H.264 High yuv420p at 24000/1001 fps, AAC LC 44.1 kHz stereo,
  English ASS and 14 embedded font attachments. The original file is read-only,
  served only through an explicit loopback test route and not included in releases.
- Original controlled 1080p30 H.264/AAC MP4, 5 Mbps video, two-second GOP, indexed
  file larger than 1 GiB, with front and tail index variants. Flash/click signals
  provide independent decoded-output timing observations.
- Original multiple-audio/subtitle-track MKV and VFR/ASS examples, with declared
  fonts and styles. Fixture recipes and hashes are recorded with results.

Transport budgets: one active callback/read per instance, 256 KiB range block,
16 MiB LRU cache, one 256 KiB native mailbox, bounded retries (15-second deadline),
terminal close and separate seek interruption. No whole-file materialization for
remote media. Signed URLs/headers remain in the browser broker; logs use opaque
stream identifiers. Strong ETag/If-Range or an explicit immutable asset contract.

Playback budgets retain M0's 128 MiB initial / 512 MiB maximum Wasm heap, eight
prestarted pthreads with 2 MiB stacks, two video decoder threads, stereo 8192-frame
PCM queue, 32/8 MiB demux forward/backward limits, 1920x1080 render ceiling. Any
necessary budget/profile revision must be documented before requalification.

Required targets follow the architecture's Phase 1 matrix: controlled 10 Mbps /
80 ms RTT; warm startup <=3 s, <4 MiB and <1% of media fetched; distant seek <=2 s
and <=8 MiB additional bytes; 100 seeks at 5/s; five-second outage recovery;
real-browser authorization/cookies/CORS/renewal; two audio and subtitle tracks;
ASS reference comparisons; 60-minute memory/sync run (p95 <=40 ms, max <=80 ms
outside recorded discontinuities); 1080p30 ten-minute playback with <=1% late or
dropped frames; VFR/B-frame correctness; 100 complete player lifecycles including
failure states. Cold artifact startup is reported separately. Missing browser
codec support is recorded only if measured on this device.

Completion requires a versioned baseline, integration example, manifests, raw
results and supported-profile table. Failed targets remain visible and are not
silently removed to declare M2 complete.

## Measured renderer revision, before qualification

The initial full-resolution probe measured approximately 38 ms in the default
software scaler, 46% dropped frames and output A/V errors over 80 ms. Using
mpv's public `sws-fast=yes,sws-scaler=bilinear` options reduced conversion to
4.64 ms/frame in a 30-second probe, with zero dropped frames and 23.5 ms p95 /
31.7 ms maximum flash/click difference. This profile therefore uses bilinear
software scaling and disables swscale's high-quality chroma interpolation and
accurate-rounding flags. This is a deliberate image-quality tradeoff, not a
change to decoding, resolution, frame-rate or acceptance thresholds. Libass
composition remains inside mpv. Raw before/after probes are retained.

Long-run measurement excludes the first five seconds after initial playback
and explicit file-loop/seek discontinuities. Flash edges are sampled from the
actual decoded/composited pixels after Canvas submission; click edges come
from decoded PCM written by the AudioWorklet and are mapped using the browser's
output timestamp. This measures the browser output timeline, not physical
display scanout or speaker propagation. Report unmatched/missing signals and
frame drops separately; do not discard them as sync outliers.

Parser/resource limits for the release build: at most 64 libavformat streams,
64 probe packets, 1 MiB probe budget and one second analysis budget. Individual
libavutil allocations are capped at 32 MiB; the Wasm heap retains its 512 MiB
ceiling. The browser-only demux attachment guard retains at most 32 attachments,
4 MiB each and 16 MiB total. An exceeded attachment budget logs an explicit error
and omits that attachment; correct typography is unsupported in that case.
FFmpeg may allocate an attachment before this retention guard, so its parser
allocations are additionally subject to the allocation/heap ceilings. These
limits are resource bounds, not a claim of hostile-parser security certification.

The 60-minute process-memory plateau check compares median process-family RSS
in minutes 10–20 with minutes 50–60, allowing at most 64 MiB growth after warmup;
it also records every sample, peak RSS and fixed queue/heap counters. This
allows bounded browser/JIT caches while rejecting sustained growth. Missing
output signals are reported separately and must remain below 1%; the sync
threshold requires more than 3500 independently paired signals.
