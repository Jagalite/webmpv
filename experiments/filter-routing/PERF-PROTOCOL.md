# Quick filter-routing performance screen

Three fresh foreground Chrome processes, fixed order: retained frames without
filters, copy-back with `null`, copy-back with `hflip`. All use the FilterPlayer
facade, the same 1080p30 H.264/AAC benchmark source, 960x540 CSS canvas, DPR 1,
10 Mbps / 80 ms origin, audio enabled and subtitles disabled. Filters are selected
before opening. No seeks, loops or route switches occur during the measured
window. The copy-back pair shares the same engine binary.

Each arm uses 10 seconds warmup and at least 30 seconds measurement. The visible
page shows test count and countdown. Check real foreground browser PID, tab
visibility and document focus at each approximately two-second sample. Abort
and preserve the checkpoint if foreground changes. Do not automatically repeat.

Measure browser-family CPU-time deltas (percent of one core), RSS, rendered
frames, drops, decoder copy time, software-render time and Canvas-copy time.
Require WebCodecs in every arm, at least 29 displayed frames/second, no more than
1% reported drops, advancing audio/time, bounded queues and no process turnover.
Retained playback must perform zero video copy-back; both compatibility arms
must show actual pixel copying. Verify frame, worker, process and origin-request
cleanup and before/after input hashes.

This is a single diagnostic triplet, not replicated qualification, energy data,
a GPU-filter comparison, a current native-browser comparison, or a measurement
of hot-switch latency. The neutral copy-back comparison estimates the cost of
using the compatibility pipeline. Mirroring versus neutral estimates incremental
cost of this simple filter in that pipeline. It does not generalize to arbitrary
filters. No pixel readback runs in the foreground measurement.

The optional headless smoke uses two seconds warmup and five seconds measurement
per arm, then checks nonuniform pixels and captures a screenshot. Smoke CPU is
not performance evidence. Reuse servers on 4179/4183 and run:

```sh
python3 experiments/filter-routing/prepare-perf.py
node tests/filter-perf.mjs --smoke
node tests/filter-perf.mjs
```
