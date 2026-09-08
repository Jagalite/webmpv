# Software and Hybrid performance work

Work window: **2026-09-08 12:29:14–22:29:14 UTC**. The ten-hour work window is complete.
[Final closeout](closeout.json) records the pre-commit Git HEAD, empty index and evidence.
The user subsequently authorized committing and pushing the selected changes.
Runs use the local toolchain and isolated headless
Chrome, without Docker or foreground-window holds.

**Post-window selection:** the user subsequently chose to keep Software's
optimizations and Hybrid's long-GOP correctness fix, while reverting Hybrid's
direct shared-packet construction. The worker again takes its original packet
slice; the generator integration and helper are removed. Shared timing and the
pre-existing Hybrid scheduler remain. The [rollback verification](hybrid-rollback-2026-09-08T23-03-00Z/README.md)
records checks against the selected runtime. Movie, feature and hour measurements
below describe the end-of-window worker, before this selective rollback; they
are preserved as measured rather than relabeled as new performance results.

The strongest measured gain is Software H.264 decoding: 23–34% less decoder CPU
and 15.81% less whole-browser CPU on the matched movie comparison. Hybrid removes
redundant packet work and passes its measured hour, but a movie CPU improvement
or native parity is not established. Software's measured hour fails the strict
gate with 12 presentation drops. All 56 final feature trials pass, and the
115-format matrix keeps its original outcomes and nine existing gaps.

## Maintained changes

- Software: eight-bit H.264 chroma interpolation, weighted biprediction,
  quarter-pixel interpolation and inter luma deblocking use validated Wasm SIMD.
  Other widths, depths and configured FFmpeg components remain available.
- Software: retain the 5 ms active worker cadence, settle paused work to 100 ms,
  service commands immediately and publish diagnostics every 200 ms.
- Both mpv modes: suppress unchanged audio-timing observations and force the
  initial engine-ready timing handoff.
- Hybrid: retained mode does not clone compressed packets into a software replay
  cache. Legacy copy-back mode still has its replay path. An injected retained
  decoder failure remains public and explicit Software recovery works.

The public modes remain Native, Hybrid and Software. Hybrid still uses mpv for
playback, scheduling and subtitles, and WebCodecs for video decoding.

## Decoder evidence

Decoder-only tests exclude rendering and audio. They compare balanced trials in
one Node process, record process CPU and elapsed time, and verify every decoded
frame. These percentages are observations on this M1 host, not general guarantees.

The final comparison rebuilds both variants from the same benchmark source and
FFmpeg archives. Manifests verify identical inputs; the candidate additionally
links the maintained SIMD sources. Each row uses six timed trials per variant,
with separate warmups and full-frame checksum passes.

| Input | Reference CPU per decode | Optimized CPU per decode | CPU reduction | Elapsed reduction |
| --- | ---: | ---: | ---: | ---: |
| Movie, 1080p30, 782 frames | 5.909 s | 3.919 s | **33.68%** | **30.86%** |
| Synthetic 1080p60, 1,560 frames | 6.319 s | 4.840 s | **23.40%** | **24.35%** |

Evidence: [movie result](decode-2026-09-08T18-37-18.758Z/result.json),
[1080p60 result](decode-2026-09-08T18-38-10.045Z/result.json).
Both checks pass, including unchanged input hashes and eight terminated workers
with no remaining active resources. Earlier incremental experiments remain in
this folder; their percentages must not be added together.

Movie checksums cover 782 frames (MD5 `5caed1881b0939caa8b8c34113b571a7`);
1080p60 checksums cover 1,560 frames (MD5 `f45eb7866de9b40297b15245671d4be9`).
The maintained-source kernel driver passes **3,972,224 differential cases** and
20 combined-dispatch cases at production `-O2`. The checks include mixed signed
weights, fractional positions, clipping boundaries, negative strides, untouched
bytes, and unchanged bit-depth selection. See `maintained-kernels-deblock.log`.

## Whole-player movie comparison

Software: [raw trials](2026-09-08T18-44-48.067Z/result.json),
[assessment](2026-09-08T18-44-48.067Z/assessment.json). Twelve balanced trials
alternate Native, the preserved Software baseline and the maintained Software
candidate. Each arm has four 60-second measured intervals, following a 30-second
prewarm and a 10-second warmup at the same movie position (236.9 seconds).

| Mode | Mean browser CPU, percent of one core | Trial range |
| --- | ---: | ---: |
| Native reference | 5.25% | 4.84–5.60% |
| Original Software | 51.76% | 50.31–54.93% |
| Optimized Software | 43.58% | 42.17–46.74% |

The observed whole-player reduction is **15.81%**, distinct from the 33.68%
decoder-only reduction on the movie clip. All 12 trials pass. Software seek
pixels match exactly across variants; measured frame drops and audio underruns
are zero, and worker teardown passes. Render and copy stages remain essentially
unchanged. The short two-second paused samples are variable and do not establish
an idle-CPU or memory reduction.

The [process breakdown](2026-09-08T18-44-48.067Z/process-costs.json) attributes
most of the reduction to Chrome's renderer process: 42.14% to 34.10% of one core.
GPU-process CPU stays close (8.72% to 8.58%). These are process CPU totals, not
GPU utilization or function-level attribution. Together with the decoder-only
and render/copy measurements, this is consistent with a decoding improvement.

Hybrid: [raw trials](2026-09-08T19-06-41.935Z/result.json),
[assessment](2026-09-08T19-06-41.935Z/assessment.json),
[process breakdown](2026-09-08T19-06-41.935Z/process-costs.json). The same
12-arm movie protocol passes all playback, pixel and cleanup checks, but the
candidate averages **4.84% more browser CPU**: 19.66% versus 18.75% of one core.
This is not a demonstrated whole-player improvement. Trial ranges overlap
(18.14–21.18% candidate; 17.51–19.87% baseline), and the concurrent Native reference
ranges from 4.91% to 7.38%, averaging 6.14%.

The increase is spread across renderer, GPU, audio and browser processes; that
does not isolate a cause. The [timing-only follow-up](2026-09-08T19-29-31.681Z/result.json)
restores repeated timing messages while holding the maintained decoder and packet
path fixed. All eight trials pass, but CPU varies widely: the maintained client
averages 18.24% (12.69–28.19%) and the repeated-message client 22.69%
(14.38–36.55%). This does not establish coalescing as the cause of the earlier
increase, nor a dependable speedup percentage. Coalescing remains selected;
Hybrid whole-player improvement is not established by these movie screens.

This Hybrid baseline includes the strict long-GOP correctness fix in the native
engine and worker on both sides, while retaining the original packet slice and
repeated timing messages. The original start-of-window snapshot already includes
the earlier adaptive Hybrid scheduler. This adjusted baseline must be kept
distinct from an entirely original runtime.

## Final functional and artifact checks

The final feature CPU screen uses eight balanced baseline/candidate trials per
case, with six seconds of warmup and twelve measured seconds per trial. It checks
1080p60 Software H.264, H.264 10-bit, HEVC 10-bit, VP9, Software ASS subtitles with
`hflip,eq=brightness=0.1` and `volume=0.5`, and Hybrid with and without ASS. Plain
Software and Hybrid also get fifteen-second paused intervals; other cases use
two seconds. These shorter screens supplement the longer movie comparison.
Feature baseline assets are the original preserved snapshot, including its
pre-existing Hybrid scheduler. They do not use the movie's adjusted Hybrid
baseline.

The [seven-case result](final-features-2026-09-08T21-49-57.442Z/result.json)
passes all **56 trials**, including identical seek pixels, zero measured drops
and underruns, and worker cleanup. Each row averages four trials per variant;
CPU is percent of one core across the browser processes.

| Feature | Original CPU | Optimized CPU | Observed CPU reduction |
| --- | ---: | ---: | ---: |
| Software H.264 1080p60 | 79.09% | 70.51% | 10.84% |
| Software H.264 10-bit | 35.81% | 30.06% | 16.06% |
| Software HEVC 10-bit | 22.78% | 21.35% | 6.28% |
| Software VP9 | 22.19% | 23.59% | **−6.32% (more CPU)** |
| Software filters and ASS | 56.22% | 49.55% | 11.85% |
| Hybrid ASS | 18.03% | 17.66% | 2.05% |
| Hybrid plain | 17.45% | 16.36% | 6.24% |

These short screens do not establish an across-codec speedup. VP9 trial ranges
are broad and overlap (14.98–31.92% original; 13.14–31.86% optimized); its higher
mean remains recorded without a causal attribution. The H.264 kernels do not
apply to VP9, HEVC or ten-bit H.264. The synthetic Hybrid reductions also do not
supersede the longer movie result, which showed no proven CPU improvement.

Fifteen-second paused intervals average 5.95% to 5.24% browser CPU for Software
1080p60 and 4.62% to 3.50% for plain Hybrid. These are short, variable observations
on this host, not an idle-power guarantee; neither mode suspends its AudioContext.

The [final regression driver](final-checks-2026-09-08T19-37-56.001Z/result.json)
passes TypeScript checking, all 46 core unit checks, five raw-upload experiment
unit checks, both SIMD-enabled and disabled legacy browser suites, and all 21
expanded Software checks. The legacy suites cover browser decoding, software
fallback, injected decoder failure, subtitle pixel comparison and 20 lifecycles
per build. Actual served module/Wasm hashes match each intended build manifest.

The [final 115-format run](../format-matrix/2026-09-08T19-40-57.096Z/result.json)
records **112 decode, 106 seek and 115 cleanup successes**. Its
[exact fixture comparison](../format-matrix/2026-09-08T19-40-57.096Z/baseline-comparison.json)
finds no outcome changes from the original baseline. Nine existing gaps remain;
the raw matrix exit status is 1 and is preserved rather than presented as an
all-formats pass.

The [ten-hour development manifest](integrated-build/final-manifest.json) verifies
that the five maintained kernel sources match the differential-test build,
standalone decoder build and Software build inventory. All Software build inputs
matched at closeout. It also verifies the exact end-of-window inputs against the
21 passing API checks and the two passing strict decoder runtime checks. The
post-window rollback has a separate manifest; the historical manifest is preserved.

[Artifact preservation](baseline-preservation-final.json) checks 19 saved snapshot
files plus five historical artifacts, including the original release archive.
The two active development engines are recorded separately.

## Sustained playback

The [Software hour](stability-software-2026-09-08T19-46-55.738Z/result.json) and
[assessment](stability-software-2026-09-08T19-46-55.738Z/assessment.json) cover
**3,600.017 measured seconds** in one player across six ten-minute segments and
repeated remote seeks. Warmups add approximately one minute of wall time.

Software **fails the strict zero-drop gate** with **12 presentation drops** across
three segments (1, 8 and 3). Decoder drops and audio underruns are zero. The
largest sampled absolute mpv A/V estimate is 16.0 ms, the Wasm heap stays at
128 MiB, all workers close, and runtime input hashes remain unchanged. Browser
RSS peaks at 1,373,257,728 bytes and finishes below its first sample; this is not
an across-platform memory guarantee. The final ten-minute segment has zero drops.

The [Hybrid hour](stability-hybrid-2026-09-08T20-48-09.084Z/result.json) and
[assessment](stability-hybrid-2026-09-08T20-48-09.084Z/assessment.json) **pass**:
3,600.080 measured seconds, 107,989 presented frames and zero presentation drops,
decoder drops or audio underruns. The largest sampled absolute mpv A/V estimate
is 20.0 ms and the Wasm heap stays at 128 MiB. All 109,776 received frames close,
no retained frames or workers remain, and runtime hashes match. The presenter
records a lifetime peak of four retained frames; decoder peaks are six queued
frames and eight outstanding submissions. Browser RSS peaks at 1,225,801,728
bytes and finishes at 731,398,144 bytes, below its first sample.

These are headless development checks, separate from historical foreground
release qualification. The combined hour driver correctly exits 1 because the
Software zero-drop criterion failed; Hybrid independently exits 0.

[Drop observations](software-hour-drop-observations.json) identify presentation
drops at multiple movie positions. Counters reset on seek, so the total must sum
per-segment deltas. The [host observation](software-hour-host-observation.json)
records concurrent Render/Shopper test processes and other busy Chrome processes.
That is relevant context, not proof of causation or a matched long-baseline
comparison. It does not justify erasing the failed criterion.

The [matched passage replay](2026-09-08T22-14-48.082Z/passage-assessment.json)
uses baseline/candidate/candidate/baseline order, measuring 90 seconds per arm
around movie seconds 496–587. Both optimized trials and the first original trial
pass. The last original trial records one presentation drop near seconds
584.93–587.00; decoder drops and audio underruns remain zero in all four arms.
This comparison therefore **fails** and has no clean CPU aggregate. It shows that
a presentation drop also occurs on the preserved runtime under these conditions;
it does not isolate a cause or clear the optimized Software hour's failed gate.

## Experiments and limits

- Direct WebGPU presentation produced a synthetic gain but no repeatable movie
  CPU benefit. Frame-lifetime and color tests remain useful evidence; it is not
  the default presenter.
- A browser video-track compositor gave a small, variable gain in a corrected
  short screen. It changes the public canvas into a subtitle-only surface and
  remains experimental. Native still used substantially less browser CPU.
- One decoder thread lost too much throughput. Two threads remain selected.
- Thin LTO, direct Software RGB upload and decoder readiness hints did not show
  enough consistent benefit to justify promotion.
- The 10 ms Software cadence dropped two presentation frames in one long trial.
  That entire comparison remains failed. Unrelated Rust compiler load was
  observed during the high-cost period, but the observation does not establish
  causality. The maintained worker uses 5 ms.
- Scalar gather/scatter horizontal deblocking was superseded by the packed-row
  implementation. The initial packed microbenchmark ran before compiler exit
  was confirmed; `deblock-horizontal-packed-kernel-isolated.jsonl` is the clean
  repeat used for its timing claim.

## Measurement boundaries

Whole-player CPU measurements include Chrome processes reported through CDP.
They exclude external macOS VideoToolbox and WindowServer processes. Headless
rendering, changing host load and short trials limit comparison with everyday
foreground playback. Failed trials remain in their original result folders;
`assess-playback.py` refuses a clean aggregate comparison if any trial fails.

The browser pages show phase, test count and countdown. Sustained development
runs keep one player alive across remote seeks, checkpoint regularly and check
frame/audio delivery, mpv's estimated A/V offset, bounded resources and teardown.
They do not replace a foreground qualification tied to packaged release bytes.

The original runtime snapshot and original engine/module pairs are preserved
under ignored `build/playback-performance/baseline/` and `accepted-artifacts/`.
Their manifests identify exact bytes. The active development engines have been
rebuilt; the historical release archive has not been replaced.

Movie fixtures derive from Big Buck Bunny, copyright 2008 Blender Foundation /
www.bigbuckbunny.org, [CC BY 3.0](https://peach.blender.org/about/). Fixture manifests
record source URLs, extraction commands and hashes.

## Additional presentation and packet checks

The opaque full-canvas shortcut passed 192 exact renderer cases but used 1.60%
more browser CPU in its eight-arm movie screen and **9.83% more** in the longer
four-arm follow-up. The original Hybrid Canvas2D presenter remains selected.

A raw RGBX VideoFrame uploader passed 24 pixel/ownership cases, with a startup
fix to avoid depending on an unavailable mpv timestamp. Its corrected short
screen passed all eight trials and used 3.43% less browser CPU. The longer
four-arm screen also passed quality/cleanup but used **9.95% more browser CPU**
overall. Trial CPU varied substantially. The measured copy stage was faster,
but that did not establish a reliable whole-player gain. ImageData remains the
Software default; the extra raw-frame API path is experimental.

Direct shared-packet construction passed 24 dedicated-worker ownership cases,
including mailbox overwrite, Wasm memory growth, unaligned offsets and sizes
through 8 MiB. Omitting the preliminary slice reduced constructor microbenchmark
time by 57–65% for the tested packet sizes. This is a small portion of overall
Hybrid cost, not a whole-player percentage. The ownership assumption follows the
[EncodedVideoChunk constructor algorithm](https://w3c.github.io/webcodecs/#encodedvideochunk-interface).

Direct packet-view handling was integrated for the ten-hour measurements, then
reverted in the post-window selection above. All 21 public API checks passed with
that measured worker (the snapshot records 11 actual loads). That runtime also
passed long-GOP/negative-preroll playback beyond the old packet-cache bound and
injected decoder-failure recovery through an explicit Software switch. The
retained long-GOP fix is independent of the restored packet slice.

## Reproduction

These commands assume the pinned local toolchain, built FFmpeg archives,
generated fixtures and preserved local baseline snapshots are present. The
snapshots live under ignored `build/`; the JSON results identify their hashes.
Do not run builds, encodes, profiles or other browser tests during CPU comparisons.

```sh
npm run test:decoder-simd
bash experiments/playback-performance/link-decode.sh reference
bash experiments/playback-performance/link-decode.sh maintained
BASELINE=reference CANDIDATE=maintained MATCH_BUILD_INPUTS=1 CYCLES=3 \
  INPUT=build/fixtures/playback-performance/bbb-key-240.mp4 \
  node tests/decode-performance.mjs
node experiments/playback-performance/run-final-checks.mjs
MODE=software DURATION_SECONDS=3600 node tests/playback-stability.mjs
MODE=hybrid DURATION_SECONDS=3600 node tests/playback-stability.mjs
node experiments/playback-performance/run-final-features.mjs
python3 experiments/playback-performance/verify-baselines.py
```

For the final movie comparison, use `tests/playback-performance.mjs` with
`REMOTE_INPUT=build/fixtures/playback-performance/bbb-stream.mp4`,
`START_SECONDS=236.9`, `PREWARM_SECONDS=30`, `WARMUP_SECONDS=10`,
`MEASURE_SECONDS=60`, `SAMPLE_SECONDS=5`, `REUSE_BROWSER=1`, `REUSE_PAGE=1`, and
`VARIANTS=native,baseline,candidate,candidate,baseline,native,native,baseline,candidate,candidate,baseline,native`.
Set `MODE=software` or `MODE=hybrid`; the Hybrid movie run additionally uses
`BASELINE_MANIFEST=build/playback-performance/hybrid-correctness-baseline.json`.
