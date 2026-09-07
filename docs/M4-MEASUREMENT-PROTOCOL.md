# Integrated M4 measurement protocol

This protocol is declared before collecting integrated comparison results.
It complements full G1 qualification; it cannot substitute for the 60-minute
sync/memory run or change any acceptance gate.

Run `node tests/m4-measure.mjs` with the local application and direct-media
servers available. Use the installed independently built software and optional
artifacts, with no concurrent builds or other qualification runs. The test
Chrome window must remain foreground. No Docker is involved.

Before starting browsers, request one byte to verify the origin and finish its
fixture identity-cache initialization. Record the ETag and elapsed time outside
all playback/warmup/measurement intervals.

Use the same front-index 1080p30 H.264/AAC fixture, 1920×1080 output, 10 Mbps
network and 80 ms RTT for both backends. Each sample starts a fresh browser,
warms playback for 30 seconds, then measures for 60 seconds. Collect three
pairs, alternating order: software/optional, optional/software,
software/optional. Establish foreground after playback startup, immediately before the full
30-second warmup; observe without refocusing throughout warmup and measurement.
Sample every two seconds and retain raw data, hashes,
browser/host identity, process changes, focus, output, queues and errors.

Report CPU seconds per elapsed second across browser processes, median RSS,
rendered/dropped frames, and decoder `copyTo` elapsed milliseconds per copied
frame. The last metric measures asynchronous wall time, not CPU usage. It
excludes allocation, staging into Wasm, native planar conversion, and unknown
browser/driver traffic. Renderer and canvas-copy elapsed counters are reported
separately. Never add these counters as if they were complete pipeline CPU time.
Process turnover invalidates a sample's CPU comparison because departed
process CPU can no longer be collected reliably.

All samples must retain foreground, advance video/audio, use the requested
decoder, have no player errors, stay within existing queue/cache/heap bounds,
and release workers on teardown. Retain failing samples rather than selecting
the fastest subset. This is a small matched comparison on one host, not an
energy, hardware-acceleration or broad-device claim.

G3 reviews the observed cost together with G1 correctness and existing M3
evidence. A retained-frame implementation needs a demonstrated opportunity,
an explicit ownership/filter/subtitle design and a maintenance owner. A small
copy wall-time counter alone does not prove either a CPU benefit or zero-copy.
Deferring M5 closes the evaluation decision, not its implementation milestone.
