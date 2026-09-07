# M3 follow-up — process isolation and per-packet bridge

**Recommendation: defer M4.** The complete follow-up passes every declared
correctness/resource check, including the memory gate that failed in the first
experiment. It does **not** pass the net CPU-benefit gate: paired reductions are
10.35%, 28.87% and 31.94%, with a 28.87% median. The contract required a median
of at least 30% and every pair at least 20%. No limit was relaxed and no pair was
excluded. G2 remains a user decision; no production integration is authorized.

## Evidence and method

The [follow-up contract](../M3-FOLLOWUP-CONTRACT.md) was declared before testing.
The [full result](../../results/m3/followup-measurement-2026-09-07T13-20-19.023Z/result.json),
[independent assessment](../../results/m3/followup-measurement-2026-09-07T13-20-19.023Z/result.assessment.json),
[raw samples](../../results/m3/followup-measurement-2026-09-07T13-20-19.023Z/raw.jsonl),
[browser exits](../../results/m3/followup-measurement-2026-09-07T13-20-19.023Z/browser-exits.json)
and [final screenshot](../../results/m3/followup-measurement-2026-09-07T13-20-19.023Z/15-copyback-direct.png)
are retained. Source/runtime hashes matched at closeout.

Apple M1 / 8 GiB / Darwin 25.5.0 / Chrome 152.0.7977.76. The successful complete
attempt ran from 13:20:19 to 13:40:18 UTC on 2026-09-07. Each of nine timed runs
used a fresh Chrome process and worker, one fixed 32-second warm-up, and three
32-second measured passes. Orders were software/direct/bridge, direct/bridge/
software, and bridge/software/direct. Quality and seek probes used six further
fresh browsers; all 15 browser processes exited cleanly in this complete attempt.

The original pinned FFmpeg/Wasm module and packet corpus were unchanged. All
variants placed the corpus in the real shared Wasm heap before playback. Direct
variants read views from that heap. The bridge's producer worker copied each
requested access unit from the heap into an owned transferable buffer, sent its
metadata and bytes over MessageChannel, and the receiving worker supplied it to
WebCodecs. The same NV12-to-I420 normalization, scaler and Canvas path were used.

This measures a specific transport candidate. The producer is JavaScript, not
an installed mpv pthread/filter hook. Native packet recycling, pin wakeup,
asynchronous cancellation and software recovery remain M4 integration work.
See the [source/ownership and maintenance review](../M3-INTEGRATION-REVIEW.md).

## CPU and bridge cost

Percentages are relative to one CPU core and cover the full benchmark Chrome
process family. They are not energy or GPU-utilization measurements.

| Pair | Software CPU | Direct copy-back CPU | Bridged copy-back CPU | Net bridged reduction |
|---|---|---|---|---|
| 1 | 40.74% | 27.44% | 36.53% | **10.35%** |
| 2 | 37.23% | 25.03% | 26.48% | 28.87% |
| 3 | 37.21% | 25.35% | 25.33% | 31.94% |

Direct copy-back reductions were 32.66%, 32.76% and 31.89%. Including the
candidate bridge produced a median net reduction of **28.87%** and a weakest
pair of **10.35%**, so both benefit conditions fail.

Bridged-minus-direct CPU differences were +9.09, +1.45 and -0.02 percentage
points of one core. Their variation means they are not a precise causal estimate
of message cost. In the first pair, both renderer and GPU-process CPU increased.
Do not attribute the entire difference to byte copying or pool this result with
the earlier shared-browser experiment.

Across 8,640 measured packet requests, round-trip latency was **0.165 ms median,
0.235 ms p95, 0.270 ms p99, 2.075 ms maximum**. Mean producer byte-copy time was
0.026 ms. These are elapsed request/copy timings, not CPU counters or physical
playback latency. Each bridged run completed all 3,840 requests/replies including
warm-up, transferring 81,690,364 bytes with zero protocol errors and at most one
request in flight. Across the three runs that is 11,520 requests/replies and
245,071,092 transferred bytes.

## Correctness and memory

All three variants verified every packet hash during untimed quality checks;
both copy-back variants were byte-identical to software on all four sampled RGB
grids. All seek probes reached exactly 17.5 seconds. Every timed pass presented
all 960 expected timestamps in order: 8,640 measured frames per variant. No
frame exceeded the 33.334 ms lateness limit after the first second of a pass.
Maximum lateness was 10.39 ms (software), 8.78 ms (direct) and 9.88 ms (bridge).
No page/decoder errors or measured process-counter churn occurred. All sampled
pages remained visible and focused. Ownership and fixed-warm-up checks passed.

| Variant | RSS growth per repetition, MiB | Peak measured family RSS, MiB |
|---|---|---|
| Software | +0.73, -343.73, +7.25 | 961.39 |
| Direct copy-back | +45.70, -35.53, -313.03 | 1218.55 |
| Bridged copy-back | -31.78, -427.11, +20.47 | 1173.30 |

All growth values passed the unchanged 64 MiB limit. Wasm heaps remained at
128 MiB. Maximum warm-up RSS was 1182.95, 1167.39 and 1180.34 MiB respectively.
The sizable RSS declines indicate that process working sets still vary; passing
this windowed gate is not a leak diagnosis or a long-duration stability claim.
The first experiment's failed memory result remains recorded. This follow-up
establishes that the controlled isolated/warmed comparison passes that gate,
not that a production memory bug was found and repaired.

Reset/preroll times from the single untimed seek probes were 246.68 ms, 158.88 ms
and 168.48 ms respectively. They are decoder probes, not mpv exact-seek guarantees.
Audio, ASS, networking, full-player scheduling, physical display timing, energy
and hardware-decoder selection remain outside the measured claim. Three pairs
provide an observed range, not statistical confidence across devices or media.

## Interrupted attempt and closeout

An [earlier follow-up attempt](../../results/m3/followup-measurement-2026-09-07T13-05-42.614Z/result.json)
closed during its sixth timed run after five complete runs. Its
[interruption record](../../results/m3/followup-measurement-2026-09-07T13-05-42.614Z/interruption.json)
and failing assessment are retained. No new Chrome crash report was found; the
cause remains unknown. It was not combined with the successful complete attempt
or used to select favorable pairs. Browser-exit diagnostics were enabled for the
entire retry; the runtime sources and limits were unchanged.

The [G2 scope and maintenance proposal](../M3-INTEGRATION-REVIEW.md) is written,
including the native packet-pool lifetime constraint and the existing decoder/
filter extension points. The planning range remains 3–6 engineer-weeks, with
maintenance acceptance still required. This evidence does not meet the declared
investment criterion, so the recommendation remains to defer M4. Do not keep
rerunning unchanged experiments until a favorable result appears. A different
workload, transport design or investment threshold would need its own explicit
contract before measurement. S1 remains independent feature work.

Validation: 18 benchmark unit tests (original assessment plus bridge/follow-up
checks), JavaScript syntax checks, complete browser comparison, independent gate
assessment, screenshot inspection, input/assessment hash checks and local report
link checks. The native module and production runtime were unchanged, so no
native rebuild or M2 requalification was performed for this follow-up.
