# Optional Software YUV integration

Decision: **experiment further; do not promote to the default renderer**. The
integration is available only through `softwarePresenter: 'experimental-yuv'`.
Default Software remains RGB. Native and Hybrid retain their existing presenters.
No commit or push is part of this work.

## Changes and boundary

- `native/yuv-backend.c` retains the prior experimental backend, including the CPU
  RGB fallback. It replaces mpv's private software-renderer symbol at link time.
- `scripts/build-software-yuv.sh` and `prepare-software-yuv.py` build an optional
  engine from the maintained native player/source bridge and Software FFmpeg libs.
- `web/software-full-engine-worker.js` owns both presenters and continues to own
  mpv events, audio, seeking, bounded input and destruction. No duplicate worker,
  playback clock or WebCodecs video decoder is introduced.
- `web/yuv-presenter.js` uploads YUV planes, converts/scales in WebGL2 and composes
  libass's changed subtitle rectangles. Supported GPU input remains 8-bit YUV420P,
  BT.601/709 SDR, with quarter-turn rotation; other qualified formats use RGB.
- `src/types.ts`, `src/unified-player.ts` and `src/internal/wasm-player.ts` carry
  the explicit option, including when automatic routing reaches Software.

Frame pointers are used synchronously under the mpv rendering call. Staging arrays
copy Wasm pixels before texture upload; this is not zero-copy. Three plane uploads
for 1920×1080 YUV420P total 3,110,400 bytes per frame, excluding subtitle uploads.
RGB fallback uploads 8,294,400 bytes at that size. Counters record staging copies,
texture bytes and cleanup; internal browser/driver copies are unknown. The retained
RGB allocation and optional second Wasm binary prevent a general memory-saving
claim. Screenshots explicitly read pixels back.

## Correctness observations

Each row is a separate run; passing repetitions do not erase failures.

| Run | Result |
| --- | --- |
| [Initial Chrome](yuv-chrome-2026-09-10T02-29-48.973Z/result.json) | 9/11; YUV444 and vflip seeks timed out |
| [Isolated Chrome filtered repeat](yuv-chrome-2026-09-10T02-37-57.163Z/result.json) | 2/3; hflip plus brightness seek timed out |
| [Full Chrome repeat](yuv-chrome-2026-09-10T02-38-41.648Z/result.json) | 11/11 |
| [Firefox](yuv-firefox-2026-09-10T02-39-52.560Z/result.json) | 9/11; subtitle lifecycle and YUV444 seeks timed out |

Browsers: Chrome 152.0.7977.83 and Playwright Firefox 146.0.1. These are headless
correctness runs, not performance measurements. Four analytic color-patch cases
passed tolerance ≤3/255, including BT.601/709 and full/limited range. Ten-bit input
used RGB fallback. Rotated unsupported fallback explicitly rejected, as expected.
Chrome's complete repeat also checked animated subtitles, backward/forward seeks,
filter/track changes, resize, two context restorations and identical paused redraw.
Recorded worker cleanup completed, including failed cases.

The failing filtered seeks reached an incorrect presented position with no new
useful target frame. A separate preserved-prototype sample run passed 3/3:
[old prototype diagnostic](../pipeline-qualification/yuv-chrome-2026-09-10T02-34-38.936Z/result.json).
A one-off default RGB vflip seek also passed. Neither observation identifies the
cause: engine differences, source cancellation and scheduling remain candidates.
No source/seek fix is claimed. Reproduce and isolate this race before promotion;
do not increase the timeout or weaken target-position assertions to make it pass.

## Reproduction

Use the existing qualified fixture corpus; keep prior artifacts. The initial fixture
setup is documented in [pipeline qualification](../pipeline-qualification/README.md).

```sh
npm run build:software-yuv
npm run build
node experiments/software-yuv-integration/qualify.mjs
CASES=sample node experiments/software-yuv-integration/qualify.mjs
BROWSER=firefox node experiments/software-yuv-integration/qualify.mjs
npm run test:api
MEDIA=movie TARGET=236.9 WARMUP=10 MEASURE=30 node experiments/software-yuv-integration/compare.mjs
MEDIA=ass SUBTITLES=1 TARGET=2 WARMUP=1 MEASURE=7 node experiments/software-yuv-integration/compare.mjs
```

Run comparisons sequentially, with no other test browser or build running. Default
order is RGB, YUV, YUV, RGB. Each arm uses a fresh visible Chrome, audible selected
audio, a 1920×1080 canvas displayed at 960×540, and foreground checks throughout.
The subtitle run selects the same ASS track in every arm. CPU is the sum of CDP
process CPU deltas divided by elapsed wall time, where 100% equals one core. It
excludes WindowServer, external VideoToolbox processes and the HTTP origin. RSS sums
process RSS and can double-count shared pages. Power state is recorded per run.

`firstFrameMs` is the harness time through open/initial seek/play and observed frame
availability, not a physical display timestamp. Separate audible startup and
physical A/V timing are not measured. mpv A/V estimates, underruns, decoder/presentation
drops, per-frame uploads and source requests are preserved in raw snapshots.

## Visible movie comparison

[Complete run](visible-2026-09-10T02-47-07.371Z/result.json), Apple M1, 8 GiB RAM,
AC power, Chrome 152.0.7977.83. Same movie position 236.9 s, 10 s warmup and about
30 s measurement per arm; no subtitles or filters. Foreground checks matched in
every recorded sample; no process churn or page/player errors were recorded.

| Arm | Presenter | CPU, one core = 100% | Mean summed RSS, MiB | Frame counter/s | Drops | Startup harness, ms |
| --- | --- | ---: | ---: | ---: | ---: | ---: |
| 0 | RGB | 128.7 | 493.4 | 29.49 | 20 | 2445 |
| 1 | YUV | 91.0 | 543.9 | 29.67 | 13 | 2637 |
| 2 | YUV | 82.3 | 455.2 | 27.56 | 20 | 2254 |
| 3 | RGB | 81.7 | 583.8 | 29.96 | 5 | 1321 |

**All four arms failed the predeclared playback gates.** Arm 2 advanced only 28.10 s
over 30.05 s wall time. All arms recorded zero audio underruns; maximum reported
absolute A/V offsets were 21.3, 77.3, 9.3 and 9.3 ms respectively. Workers closed in
all arms and YUV cleanup reported zero live textures. CPU ranges overlap, with very
large RGB run-to-run variation. Do not average these into a performance-win claim,
combine them with older experiments, or interpret the lower CPU of the slow arm as
improved efficiency at equivalent playback. Cause of this variability is unresolved.
All recorded decoder-drop deltas were zero; the drops above were presentation drops.

## Visible ASS comparison

[Separate complete run](visible-2026-09-10T02-51-10.521Z/result.json), same host and
browser, ASS fixture at 2 s with subtitles selected, 1 s warmup and 7 s measurement.
Do not combine this shorter, different-media run with the movie comparison.

| Arm | Presenter | CPU, one core = 100% | Mean summed RSS, MiB | Frame counter/s | Startup harness, ms |
| --- | --- | ---: | ---: | ---: | ---: |
| 0 | RGB | 59.8 | 1053.6 | 29.81 | 1457 |
| 1 | YUV | 48.9 | 931.6 | 29.62 | 1320 |
| 2 | YUV | 54.5 | 875.1 | 29.51 | 1301 |
| 3 | RGB | 70.6 | 1026.7 | 29.82 | 1244 |

All four arms passed their short playback gates: zero presentation/decoder drops,
zero audio underruns, matching foreground state and complete worker cleanup. Maximum
reported A/V offset was under 12 ms. YUV used three plane uploads per rendered frame
and two changed subtitle uploads totaling 651,792 bytes over each complete arm;
cleanup reported zero live textures. These are application counters, not GPU-driver
allocation/readback measurements. With just two short observations per presenter,
the apparent CPU reduction is promising, not a production performance guarantee.
It does not close the longer movie or intermittent-seek failures.

The final public API regression suite passed 21/21, recorded in [api.log](api.log).
Source and binary identities are recorded in [final-manifest.json](final-manifest.json).

## Remaining gates

Intermittent seeks are a release blocker. Also open: sustained runs/seek storms,
large File plus YUV qualification, other browsers/devices, HDR fidelity, broader GPU
pixel formats, physical A/V/startup measurement and pause-intent changes during GPU
loss. Current rendering counters include redraws; their throughput is not a direct
count of unique display refreshes. Private mpv rendering ABI, build reproducibility,
extra artifact size and RGB fallback fidelity require ongoing maintenance.
