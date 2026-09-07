# M3 matched decoder experiment

Contract declared 2026-09-07, before performance measurements. M3 is authorized;
G2 remains a separate user decision. Production mpv/browser bindings and M2
qualification artifacts remain the accepted software deliverable.

## Question and investment threshold

Does browser decoding plus CPU copy-back reduce browser-process-family CPU by
at least 30% against the pinned FFmpeg/Wasm decoder at equivalent 1080p30 output?
Use three paired repetitions with rotated path order. Require median paired
reduction >=30%, every pair >=20%, and all correctness gates below. Report the
range; three pairs do not establish population confidence. Retained-frame results
inform possible later work but cannot qualify copy-back or authorize M5.

## Fixed experiment

- Deterministic 32-second 1920x1080, 30 fps H.264 High, yuv420p, BT.709 limited
  range, 5 Mbps target, two B-frames, closed GOP every 60 frames. Record generating
  FFmpeg version, command, source hash, avcC and packet bytes/PTS/DTS/duration/hash.
- Demux once with ffprobe; extract the exact MP4 packet byte spans. Every path
  receives the same packed payload and metadata, in decode order. No native media
  playback or browser demuxing. The benchmark is video-only; audio, ASS, network,
  mpv scheduling and fallback remain outside this experiment.
- Three paths: pinned FFmpeg 7.1.1 Wasm SIMD with two decoding threads and
  fast-bilinear swscale to RGBA; WebCodecs plus native I420/NV12 `copyTo`, Wasm upload and the
  same swscale/Canvas 2D path; WebCodecs VideoFrame directly to Canvas 2D.
- Browser preference is `no-preference`. Record configuration support and returned
  frame formats; hardware acceleration is unknown without independent evidence.
- Each repetition plays three complete fixture passes (96 seconds), resets/drains
  at each boundary, and records those startup costs separately. Bound outstanding
  packets/frames to eight; present at PTS with a common clock. All paths own the
  same worker OffscreenCanvas. Include packet transfer, conversion, readback,
  upload and Canvas submission timings. Network and module loading are separately
  timed and excluded from steady playback CPU.
- Before performance, compare the same sampled output frames after Canvas
  presentation: RGB mean absolute error <=3, p99 <=16 against software. This is a
  declared synthetic-fixture check, not a general perceptual-quality claim.
- Every decoded PTS must match the ordered expected PTS exactly; no missing,
  duplicate or dropped frames; after the first second of each pass <=1% of frames
  may be submitted >33.334 ms late. Record queue peaks and maximum lateness.
- Wasm heap <=512 MiB; process-family RSS late-minus-early median <=64 MiB per
  repetition. Sample process-family cumulative CPU and RSS once a second. CPU
  percentage is relative to one core, including browser, renderer and GPU
  processes. Record raw data, runtime/source hashes, Chrome, OS and CPU model.
- Seek probe resets decoder, starts at a preceding keyframe and suppresses output
  until 17.5 seconds; verify first target PTS and report time to target. This
  measures decoder reset/preroll, not mpv exact-seek integration or recovery.
- Visible foreground Chrome; no competing benchmark/build work. Record visibility
  throughout. A smoke run is not qualification. Energy is unavailable unless an
  independently usable counter exists; CPU is the chosen metric, not an energy
  or thermal proxy. No one-hour durability claim follows from these runs.

## G2 evidence and ownership review

Results must distinguish this matched decoder/output harness from the accepted
full mpv player. A passing harness warrants reviewing a production experiment,
not claiming an integrated speedup. Document packet/filter ownership, timestamp
mapping, drain/reset, keyframe software recovery, tests and ongoing patch owner
before asking for the G2 decision. No M4/M5 production changes are authorized.

API references: [WebCodecs](https://www.w3.org/TR/webcodecs/),
[AVC registration](https://www.w3.org/TR/webcodecs-avc-codec-registration/), and
[FFmpeg send/receive contract](https://ffmpeg.org/doxygen/7.1/group__lavc__encdec.html).

## Setup correction before measurement

The first smoke attempt returned NV12 from Chrome, so the copy-back adapter now
accepts native I420 or NV12 planes and passes their layout to the same pinned
swscale converter. It does not assume browser I420 conversion support. The failed
smoke is retained; no performance threshold or pixel gate was relaxed.

The NV12 smoke exposed a second setup issue: swscale's direct NV12-to-RGBA
kernel produced different chroma interpolation from its planar I420 kernel.
The adapter now deinterleaves NV12 inside Wasm before invoking the identical
I420 converter; the deinterleave cost is included in conversion time. Browser
stderr warnings are recorded separately from uncaught page/decoder failures.

After planar normalization, all four copy-back samples are byte-identical to
software. Retained-frame presentation still fails the unchanged p99 <=16 gate
(p99 23–25). Its timing runs will therefore be diagnostic only. Copy-back is
assessed against software independently; a retained-path failure does not count
as a copy-back pass or authorize retained-frame integration. This distinction
was recorded before any paced performance run. Reusable ImageData and readback
buffers match the production worker's allocation policy and bound temporary
ownership; the full Wasm-to-Canvas pixel copy remains measured.
