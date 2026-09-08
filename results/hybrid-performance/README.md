# Hybrid scheduling optimization

This is the scheduling checkpoint from 2026-09-08 at 12:22 UTC. The subsequent
[Software and Hybrid optimization record](../playback-performance/README.md)
describes later timing, decoder and artifact changes. Statements below about
unchanged files and binaries refer to this checkpoint.

The retained change adjusts the active engine pump from a 5 ms interval to a
10 ms self-scheduled timeout. After paused work settles for 300 ms, with no seek
or pending presentation, it uses 100 ms. Commands and resize restart the pump
immediately; playback resumes 10 ms polling. Diagnostics retain an approximately
200 ms cadence independently of the pump rate. Fatal errors and destroy stop it.

Canvas drawing and AudioContext timing messages remain unchanged from `79c2daf`.
Their attempted optimizations were rejected after isolated CPU screens were
slower. In particular, removing canvas clears did not improve this workload.

## Final comparison

[Final result and raw samples](2026-09-08T12-22-04.421Z/result.json),
[calculated assessment and engine hashes](assessment.json).

The same 26-second 1080p30 H.264/AAC sample and engine were used with baseline /
candidate / candidate / baseline order. Each trial measured 12 seconds of active
playback after warmup, then 6 seconds paused. Whole-browser CPU is expressed as
percent of one core.

| Metric | Baseline mean | Optimized mean |
| --- | ---: | ---: |
| Active CPU | 26.99% | 19.06% |
| Paused CPU | 9.16% | 4.94% |

The mean reductions were 29.4% active and 46.1% paused. Baseline active CPU varied
substantially (21.87–32.12%); candidate trials were 19.02–19.10%. Compared with the
lower baseline trial, the candidate mean was about 12.8% lower. These short
headless screens support retaining the scheduling change, not promising a fixed
speedup. They do not establish foreground native parity or endurance. Do not
compare the final candidate with Native CPU from an earlier screen.

All four final trials passed: approximately 30 fps, media position following wall
time, audio throughput, zero decoder errors/copy-back time/missing retained frames,
and full frame/worker cleanup. No process churn was observed. RSS samples are in
the evidence, but this scheduler change does not establish a general memory-size
reduction. Native Wasm binaries were not rebuilt and their hashes remain unchanged.

## Functional verification

[All 21 API checks](../player-api/functional-2026-09-08T12-21-07.296Z/result.json)
passed, alongside seven AudioWorklet/presentation unit checks and TypeScript
compilation. A new paused-idle check observed six pump ticks over approximately
500 ms and then verified seeking, subtitle controls and resumed playback.
Delayed worker initialization also remains covered. The maintained generation
path produces the candidate worker exactly. The final demo result is linked in
the experiment README.

## Earlier attempts

- `2026-09-08T12-10-56.601Z`: invalid worker comparison; substituted responses
  initially omitted the required isolation headers. Excluded.
- `2026-09-08T12-14-35.622Z`: the combined drawing/timing/polling candidate passed
  playback but used more CPU than its baseline. Rejected.
- `2026-09-08T12-17-26.693Z`: isolated component screen. Drawing and timing-message
  changes were slower; polling was the promising component.
- The first API attempt exposed an initial timing-message handoff race in the
  deduplicating prototype. That entire prototype was removed; the final client
  retains the existing repeated timing messages.

See [protocol and reproduction](../../experiments/hybrid-performance/PROTOCOL.md).
No Docker, native rebuild, foreground hold, commit or push was used for this work.
