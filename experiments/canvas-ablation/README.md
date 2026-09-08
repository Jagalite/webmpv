# Canvas output ablation results

Removing the final Wasm-to-ImageData copy, alpha fill and Canvas submission
reduced process-family CPU in all three pairs: **median paired reduction 35.49%**.
This supports a substantial causal cost for that output stage and its downstream
browser work. It does not prove that WebCodecs copy-back accounts for the rest
of the native-browser gap, or that a complete retained-frame player will match
native playback.

| Pair | Full output CPU | Bypass CPU | Reduction |
|---|---:|---:|---:|
| 1: full then bypass | 39.50% | 23.18% | 41.31% |
| 2: bypass then full | 43.46% | 28.03% | 35.49% |
| 3: full then bypass | 42.20% | 32.54% | 22.91% |

CPU is percent of one core. Median CPU is 42.20% full and 28.03% bypass; the
reduction of those medians differs from the median paired reduction above.
All six trials passed, with zero reported drops, stable process membership,
foreground throughout and zero retained workers, browser PIDs or origin requests.
Decoded/rendered counts differed by at most three frames per measured window;
audio and playback time advanced at the expected rate. Every full-path rendered
frame was submitted to Canvas; bypass submissions and Canvas-stage time were zero.

Both arms still decoded with WebCodecs, copied decoded pixels back into Wasm,
constructed mpv CPU frames, rendered through mpv and acknowledged every rendered
frame. The bypass is intentionally black and is not a working presentation path
or playback qualification. It saves the output work and changes the browser's
resulting compositing workload. This experiment cannot separate their costs.

The full output stage took 1.96–1.99 ms/frame of synchronous elapsed time.
WebCodecs copyTo stayed active at 2.36–3.09 ms/frame across the trials. These
elapsed timings are not process CPU measurements. Other stage timings varied,
especially in the third pair, so the observed savings are a range rather than a
universal fixed cost. Native HTML video was not rerun in this experiment; its
prior 10.24% median is a historical comparison, not a matched arm here.

The same synthetic front-index 1080p30 H.264/AAC fixture and 10 Mbps / 80 ms
aggregate origin shaping were used on Apple M1 / 8 GiB / Chrome 152. Each trial
used a fresh browser, 30 seconds warmup and at least 60 seconds measurement.
See the [predeclared protocol](PROTOCOL.md),
[measured results](../../results/canvas-ablation/measurement-2026-09-07T23-14-36.912Z/result.json),
[raw samples](../../results/canvas-ablation/measurement-2026-09-07T23-14-36.912Z/raw.jsonl)
and [arithmetic audit](../../results/canvas-ablation/measurement-2026-09-07T23-14-36.912Z/assessment.json).
Measured inputs matched their before/after hashes. Production tracked files and
the accepted 0.2.0 archive were unchanged. No Docker was used.

## Reproduce

From the repository root, with the existing engine variants and fixture built:

```sh
python3 experiments/canvas-ablation/prepare.py
```

Reuse or start the app server (`node scripts/serve.mjs`, port 4179) and shaped
origin (`node scripts/benchmark-media-server.mjs`, port 4183), then:

```sh
node tests/canvas-ablation.mjs --smoke
node tests/canvas-ablation.mjs
python3 experiments/canvas-ablation/assess.py results/canvas-ablation/measurement-2026-09-07T23-14-36.912Z
```

Replace the assessment folder with the newly generated measurement folder when
rerunning. Keep Chrome foreground throughout and avoid concurrent heavy work.
`prepare.py` creates separate experimental player, worker and page files from
the current production sources; it does not edit those sources. Both arms use
the same generated worker, selected by its skipCanvas query parameter.

Smoke evidence is not performance evidence. Preserved earlier smoke attempts
include a sandbox network failure, a four-second frame-rate threshold failure
(120 frames / 4.157 seconds, zero drops), and a completed full trial whose runner
was stopped while Playwright waited for Chrome close. The ten-second two-arm
smoke subsequently passed. The runner now bounds close acknowledgement and
requires all recorded browser PIDs to have exited; all measured closes were
acknowledged normally.

A next experiment would retain VideoFrames through presentation while preserving
decoded-frame rate and audio timing. That would test the remaining CPU-frame and
software-rendering costs, with filter and subtitle compatibility assessed
separately.
