# Quick subtitle overhead screen

Two fresh headed Chrome processes, fixed order: subtitles off, subtitles on.
Each uses 10 seconds warmup and at least 30 seconds measurement, with identical
1920x1080 H.264/AAC source, 960x540 CSS canvas, DPR 1, retained-frame presenter,
audio enabled, and the existing 10 Mbps / 80 ms benchmark origin. Both load the
same external ASS track; only subtitle visibility changes. There are no seeks
or loops during measurement. The visible page shows test count and countdown.
Foreground identity, document focus and visibility must pass every sample.

The ASS workload repeats the qualification fixture's Arabic/accented text,
karaoke, vector shape and animated rotation. This measures that styled workload,
not every subtitle format or typical simple-dialogue overhead.

Sample browser process-family cumulative CPU, RSS, frame presentation, audio,
decoder and subtitle counters approximately every two seconds. CPU is percent
of one core, computed from process CPU-time deltas / elapsed wall time. Require
no process turnover, active WebCodecs, zero video copy-back, advancing video and
audio, bounded queues, at least 29 displayed frames/second and at most 1% reported
drops. Subtitle-on must update bitmap content; off must copy no subtitle bitmap
bytes in its measured window. Check complete frame, worker, process and origin
request cleanup after each trial. Preserve raw samples and before/after hashes.

Report per-arm CPU/RSS and the paired CPU difference. A single fixed-order pair
is a diagnostic screen, not a replicated benchmark, energy result, endurance
qualification or comparison with native browser playback. Warmup is deliberately
short to honor the requested quick test. Stop and preserve evidence if foreground
changes; do not automatically restart long runs.

The optional headless smoke uses 2 seconds warmup and 5 seconds measurement per
arm with pixel checks enabled. Smoke CPU numbers are not performance evidence.

Run `python3 experiments/retained-subtitles/prepare-perf.py` to generate isolated
benchmark bindings, then `node tests/subtitle-perf.mjs --smoke` and
`node tests/subtitle-perf.mjs`. Reuse the app server on 4179 and benchmark media
server on 4183. No native rebuild or Docker is required.
