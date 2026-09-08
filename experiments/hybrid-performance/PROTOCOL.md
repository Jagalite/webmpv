# Short Hybrid optimization screen

Compare the public Native mode, Hybrid at commit `79c2daf`, and the current Hybrid
candidate. The baseline substitutes exactly three browser assets; both variants
use identical response routing and isolation headers. The native engine binaries,
decoder, audio worklet, subtitle compositor and source media remain shared.

The source is the first 26 seconds of the existing 1080p30 H.264/AAC qualification
fixture, remuxed without re-encoding. Each fresh headless Chrome instance renders
a 1920x1080 surface displayed at 960x540. The order is Native, baseline, candidate,
candidate, baseline, Native. Each trial warms up for 3 seconds, measures for 12
seconds, then observes 2 seconds of paused idle CPU by default (`IDLE_SECONDS=6` in the
final scheduler screen). Startup is excluded.

Record whole-browser CPU time via CDP process counters, process-family RSS,
actual frame delivery, media-position advancement, audio-frame throughput,
decoder copy time, errors, and final ownership/worker cleanup. Frame delivery
must exceed 28.5 fps; position must remain within 0.5 seconds of elapsed time;
Hybrid audio consumption must exceed 94% of the nominal sample rate. Record
process churn and do not treat churned trials as stable CPU evidence.

This is a development screen, with two trials per variant and short windows.
It is not a foreground benchmark, endurance run, energy measurement or native
parity qualification. RSS includes browser infrastructure and is not a heap-only
allocation measurement. Paused CPU observations are especially short and noisy.

```sh
python3 experiments/hybrid-performance/prepare.py
npm run build
node tests/hybrid-performance.mjs
```

The harness starts and closes its own app server and browser instances. The test
page shows phase countdowns and total progress. No Docker or native rebuild is
needed. `VARIANTS=baseline,candidate` selects a shorter diagnostic pair; that pair
is not the full comparison order. `MEASURE_SECONDS=8` was used for the isolated
component comparisons; the final scheduler comparison uses 12-second measurement
windows in baseline/candidate/candidate/baseline order. Baseline/source hashes and raw samples are
stored with each result.
