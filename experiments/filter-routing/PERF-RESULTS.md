# Quick filter performance result

The foreground comparison completed in 143.5 seconds. All three trials passed,
each with 10 seconds warmup and approximately 30 seconds of measurement.

| Route | CPU, percent of one core | Median browser-family RSS | Presented frames | Reported drops |
| --- | ---: | ---: | ---: | ---: |
| Retained frames, filters off | 23.94% | 1062.5 MiB | 924 | 0 |
| Copy-back, neutral `null` filter | 50.63% | 1153.6 MiB | 925 | 0 |
| Copy-back, `hflip` mirror | 50.93% | 1061.0 MiB | 922 | 0 |

Selecting the compatibility pipeline added 26.69 CPU percentage points, or
111.49% relative to retained playback (2.11 times the CPU). Mirroring versus
neutral copy-back added only 0.30 percentage points (0.59% relative). In this
screen, almost all of the observed increase accompanies the full-frame pipeline.
The small mirror difference should not be treated as a precise filter-cost
estimate from one fixed-order triplet. RSS differences are whole browser-family
snapshots, not isolated filter allocations or persistent-memory measurements.

All routes sustained approximately 30 fps, advanced audio, stayed on WebCodecs,
and had zero reported drops. Retained playback performed zero decoded-video
copy-back. The neutral compatibility arm recorded approximately 3.40 ms/frame
decoder-copy wall time, 3.32 ms/frame native-render wall time and 2.58 ms/frame
Canvas-copy wall time. These timers describe separate stages and are not CPU
percentages or an additive attribution of total process CPU.

All 63 sampled foreground checks passed. No worker, recorded browser process or
active origin request remained after cleanup; decoder-frame ownership balanced.
Measured input hashes match before/after measurement and the current files.
The native binaries and libraries were unchanged for this benchmark.

This supports implementing common filters in the retained/GPU presenter to avoid
the compatibility-pipeline cost. It does not measure a GPU filter implementation,
native-browser playback, complex filter graphs, subtitle-enabled filtering,
hot-switch latency or endurance. Subtitles were off in all three arms. The
neutral and mirrored compatibility trials used the same engine binary.

## Preflight finding and regression checks

The first headless smoke failed during startup when a scheduling stall allowed
decoder messages to outrun presentation and exceed the retained-frame bound.
Before foreground measurement, the filter experiment was fixed to service mpv
selection under queue pressure, enforce its ownership bound before admission,
and close retained frames/stop presentation after a fatal receive error.
The original subtitle and earlier benchmark workers were preserved.

The replacement smoke passed all three arms. An injected 900 ms engine-worker
stall recovered with balanced ownership, and all eight functional plus four
lifecycle routing checks passed again against the final worker. The injected
stall and smoke are functional evidence, not performance measurements. Earlier
passing routing results describe the worker before this pressure-handling change.

- [Protocol](PERF-PROTOCOL.md)
- [Foreground result and input hashes](../../results/filter-routing/perf-screen-2026-09-08T01-11-14.157Z/result.json)
- [Raw samples](../../results/filter-routing/perf-screen-2026-09-08T01-11-14.157Z/raw.jsonl)
- [Assessment and final regression audit](../../results/filter-routing/perf-screen-2026-09-08T01-11-14.157Z/assessment.json)
- [Passing setup smoke](../../results/filter-routing/perf-smoke-2026-09-08T01-08-34.445Z/result.json)
- [Injected scheduling stall](../../results/filter-routing/pressure-2026-09-08T01-09-58.611Z/result.json)
