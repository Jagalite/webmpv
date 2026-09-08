# Remaining playback costs: preliminary screen

The four-arm foreground screen passed. Its results point to mpv software
rendering and decoded-pixel return as substantial remaining costs. With both
removed, decoding, demuxing, audio and coordination consumed less CPU than the
native-video reference in this run. That diagnostic displays no picture: it is
not a working player that beats native video.

| Arm | CPU (% of one core) | Picture displayed |
|---|---:|---|
| Native HTML video | 10.46 | Yes |
| mpv WebCodecs copy-back + software rendering, no Canvas output | 43.57 | No |
| Same, skipping software rendering | 15.88 | No |
| Same, also skipping pixel return and using timestamped 2x2 placeholder frames | 5.87 | No |

Observed differences were 27.70 CPU percentage points for the render-skip step
and 10.01 points for the pixel-return step. These are single-pass differences,
not independently established component budgets. Each arm had 30 seconds warmup
and at least 60 seconds measured, in one fixed order. There were no repetitions
or order reversals in this screen.

A material limitation: copyTo wall time itself fell from 3.95 ms/frame in the
render arm to 2.40 ms/frame in the render-skip arm. The software-render call took
5.02 ms/frame, versus about 0.011 ms/frame for skip acknowledgement. This shows
that conditions or pipeline interactions varied; the entire 27.70-point change
cannot be attributed solely to a fixed rendering cost. Likewise, the 5.87% arm
removes presentation work that native video still performs. It provides a useful
low-work diagnostic, not a prediction of a retained-VideoFrame presenter's CPU.

## What was held and verified

All four arms decoded the same synthetic front-index 1920x1080 30 fps H.264/AAC
MP4 over the same aggregate 10 Mbps / 80 ms loopback origin. Host: Apple M1 / 8 GiB,
Chrome 152. Native audio was enabled; every mpv arm retained FFmpeg audio decode,
AudioWorklet output, original video decoding, frame timestamps and mpv timing.
The native arm displays video; the other three acknowledge frames without display.

All trials passed the foreground guard and recorded zero frame drops. The mpv
arms acknowledged 1829, 1818 and 1799 frames over their respective measured
windows. Actual decoded frames differed by at most two. PCM progressed at the
expected sample rate. Each copy arm copied every decoded frame; the placeholder
arm copied zero pixels and returned one timestamped placeholder per decoded
frame. Decoder queues remained bounded; no fallback occurred. All workers,
recorded browser PIDs and active origin requests were gone after teardown.

Skipping render uses the pinned mpv API's MPV_RENDER_PARAM_SKIP_RENDERING, which
preserves timing and acknowledgement. The placeholder arm closes actual decoded
1080p VideoFrames without copyTo and returns tiny CPU frames with their original
timestamps. This removes browser readback, JavaScript-to-Wasm pixel copying and
most native allocation/copy/chroma-unpacking work together. It does not isolate
those operations individually or establish image quality or subtitle behavior.

The native counter's semantics differ from mpv's acknowledged-frame counter.
Native fetched about 80 MB versus 61–62 MB for mpv including warmup/prefetch.
Hardware selection, energy and independent output A/V sync were not measured.
No Docker was used. Production runtime files and the accepted archive were not
replaced; all mpv arms share a separately linked experimental binary. Do not add
these differences numerically to the earlier Canvas-ablation results: they are
separate experiments with different binaries and observation conditions.

## Evidence

- [Screen result, hashes and per-trial samples](../../results/remaining-gap/screen-2026-09-07T23-43-14.845Z/result.json)
- [Raw samples](../../results/remaining-gap/screen-2026-09-07T23-43-14.845Z/raw.jsonl)
- [Independent arithmetic and invariant audit](../../results/remaining-gap/screen-2026-09-07T23-43-14.845Z/assessment.json)
- [Native link provenance](../../results/remaining-gap/build.json)
- [Protocol](PROTOCOL.md)
- [Earlier interrupted comparison](../../results/remaining-gap/measurement-2026-09-07T23-39-04.559Z/interruption.json), preserved separately and excluded
- [Earlier replicated Canvas-output ablation](../canvas-ablation/README.md)

All measured input hashes match both the before/after records and current files.
The audit recomputes CPU from raw process samples and checks frame, pixel-copy,
audio, foreground and cleanup invariants. This screen is explicitly marked
`replicated: false`; it is sufficient to prioritize the next experiment, not to
publish a repeatable performance claim.

## Reproduce

With local engines, static libraries, browser bindings and the large fixture
available, from the repository root:

```sh
python3 experiments/canvas-ablation/prepare.py
python3 experiments/remaining-gap/prepare.py
WEBMPV_EM_CONFIG="$PWD/build/gap.emscripten" WEBMPV_BROWSER_DECODER=1 bash experiments/remaining-gap/link.sh
```

Use a valid local Emscripten configuration; the exact configuration used here is
recorded in build.json. The experimental output goes to ignored web/engine-gap.
Reuse or start the app server on port 4179 and shaped benchmark origin on 4183.
The short diagnostic is:

```sh
node tests/remaining-gap.mjs --screen
```

It runs four tests in approximately 6–7 minutes. Each page shows test number,
phase countdown, estimated overall time and completion/stop status. Keep Chrome
foreground. `--smoke` is short headless plumbing validation; without either flag
the harness runs a longer three-round comparison. Choose the short screen first.

To audit this saved screen:

```sh
python3 experiments/remaining-gap/assess.py results/remaining-gap/screen-2026-09-07T23-43-14.845Z
```

## Next useful step

Build an isolated presenter that retains and displays the decoded VideoFrames
at the correct time, then run a short comparison against native video. That adds
real presentation back to the low-work path and tests whether the savings can
be realized in a usable player. mpv filter/subtitle compatibility and independent
A/V sync need separate treatment. Another long confirmation run is not required
to choose this next implementation experiment.
