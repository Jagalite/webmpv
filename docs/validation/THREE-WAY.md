# Three-way playback results

Measured 2026-09-07 on Apple M1 / 8 GiB, using the same synthetic front-index
1080p30 H.264/AAC test film for all three paths. All nine trials passed the
[predeclared protocol](../THREE-WAY-BENCHMARK.md): three rotating rounds, fresh
Chrome processes, 30 seconds warmup and at least 60 seconds measured per trial,
foreground throughout, audio enabled, aggregate 10 Mbps / 80 ms origin shaping.

Native HTML video used substantially less CPU in every round. The patched mpv
WebCodecs path reduced median CPU compared with software, but was slower in one
round; these results do not establish a consistent decoder benefit.

| Playback path | Median CPU (% of one core) | CPU range | Median trial RSS (MiB) | Dropped frames |
|---|---:|---:|---:|---:|
| Native browser HTML video | 10.24 | 6.11–11.92 | 939.5 | 0 |
| mpv / FFmpeg Wasm software | 54.09 | 42.86–55.60 | 1088.9 | 0 |
| Patched mpv / WebCodecs copy-back | 45.27 | 44.51–49.64 | 1423.2 | 0 |

| Round | Native CPU | Software CPU | WebCodecs CPU | WebCodecs CPU savings vs software |
|---|---:|---:|---:|---:|
| 1 | 6.11% | 54.09% | 44.51% | 17.72% |
| 2 | 11.92% | 42.86% | 49.64% | −15.83% |
| 3 | 10.24% | 55.60% | 45.27% | 18.57% |

Median paired savings are 17.72%; WebCodecs wins two of three rounds. Median CPU
ratios are 5.28× native for software and 4.42× native for WebCodecs. These are
complete playback pipelines: native browser demux/audio/rendering versus mpv's
Wasm demux/audio/filter path and CPU-backed Canvas output. They do not isolate
decoding cost. The third path is our pinned upstream mpv plus local patches,
including the browser decoder driver, rather than a separately published mpv fork.

All trials preserved foreground, stable process membership, playback progress
and zero reported frame drops. Workers and origin requests were zero after
teardown. Native and mpv frame counters have different internal semantics.
Native audio was enabled but its PCM output and independent A/V sync were not
measured. RSS is process residency, not a long-term memory bound. Hardware
selection and energy were not measured. Optional copyTo wall time was
2.85–2.92 ms/frame; it is neither CPU time nor the full transfer cost.

The browser transferred roughly 79 MB per trial versus 62 MB for mpv, including
warmup and prefetch. Equal aggregate shaping preserves those pipeline buffering
differences. This minimal page and native-compatible origin differ from the
older G3 comparison; its evidence and the candidate's endurance exception remain
separate and unchanged.

## Evidence and reproduction

- [Measured result and runtime hashes](../../results/benchmark/measurement-2026-09-07T22-38-32.546Z/result.json)
- [Raw samples](../../results/benchmark/measurement-2026-09-07T22-38-32.546Z/raw.jsonl)
- [Independent arithmetic assessment](../../results/benchmark/measurement-2026-09-07T22-38-32.546Z/assessment.json)
- [Short smoke result](../../results/benchmark/smoke-2026-09-07T22-37-08.028Z/result.json), ineligible for performance conclusions
- [Origin range and lifecycle test](../../tests/benchmark-media-server.mjs)

Recompute the raw CPU/RSS summary with:

```sh
python3 scripts/assess-three-way.py results/benchmark/measurement-2026-09-07T22-38-32.546Z
```

See the [README](../../README.md) for server and benchmark commands. No Docker
was used. The accepted 0.2.0 archive and playback runtime were unchanged.
