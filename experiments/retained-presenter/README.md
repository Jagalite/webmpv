# Retained-VideoFrame presenter: implemented experimental path

The prototype displays actual decoded VideoFrames directly through Canvas2D
at mpv-selected timestamps, while keeping mpv demuxing, playback timing and
FFmpeg/AudioWorklet audio. It avoids VideoFrame.copyTo, decoded-pixel return to
Wasm, mpv software rendering and ImageData output.

The short foreground comparison completed in 3 minutes 14 seconds. Both trials
passed, with zero reported drops and complete cleanup:

| Path | CPU (% of one core) | Median process-family RSS |
|---|---:|---:|
| Native HTML video | 4.74% | 673.6 MiB |
| Retained-VideoFrame mpv presenter | 15.03% | 699.2 MiB |

The retained presenter used 3.17 times native CPU in this one pair. This is a
working picture-output experiment, but it does not yet match native playback.
Do not subtract older copy-back results from these values to claim a measured
speedup: those runs used different binaries and observation conditions. The
prior ablations support the direction; this pair measures retained versus native.

## Actual presentation and ownership

The browser decoder transfers ownership of the original 1080p VideoFrame to the
engine worker and returns a tiny timestamped placeholder to mpv. A hook in the
isolated copy of mpv's libmpv video output records the selected frame's media PTS
and target display time. The worker matches the retained frame by microsecond
PTS, schedules drawImage(VideoFrame) for that deadline and reports swap afterward.
Frames are not simply drawn on decoder output arrival.

During the measured window, 1812 frames were drawn and acknowledged, 1808 were
decoded, and audio progressed at the expected sample rate. The small count
difference is bounded buffering/diagnostic sampling at the window edges. Every
sampled presentation timestamp advanced. Reconstructing all 1812 observed draw
submissions from overlapping raw samples gives **12.19 ms p95 / 16.07 ms maximum
lateness** relative to mpv's deadline. That measures Canvas submission timing,
not physical display latency or independent audio-output synchronization.

Across startup, warmup, measurement and cleanup, 2752 VideoFrames transferred to
the presenter and all 2752 were closed. Peak retained ownership was four frames;
peak pending presentation count was one. Decoder output queues remained bounded,
with no fallback, missing frame or pixel-copy operations. No workers, recorded
browser processes or active origin requests remained after teardown.

The [smoke screenshot](../../results/retained-presenter/smoke-2026-09-08T00-00-33.721Z/retained.png)
and pixel checks verify actual image output. Pixel readback is enabled only for
smoke, and disabled in the measured comparison to avoid changing Canvas behavior.
Both measured pages had the same test-count and countdown display.

## Scope and limits

This is an isolated no-subtitle presenter for the same synthetic front-index
1080p30 H.264/AAC test video, Apple M1 / 8 GiB / Chrome 152, 10 Mbps / 80 ms shaped
origin, 960x540 CSS presentation and 1920x1080 Canvas backing. Native and retained
each used a fresh foreground Chrome process, 30 seconds warmup and at least
60 seconds of measurement. It is one fixed-order pair, not replicated evidence.

The path bypasses mpv video filter output and libass subtitle composition.
Seeking, resets, multiple sources, VFR, codec changes and a full endurance run
have not been qualified. The bounded queues intentionally fail rather than grow
if frame matching breaks. This does not complete M5 or replace the accepted
production decoder. The ordinary software and copy-back paths remain unchanged.

Canvas2D drawImage may involve browser-internal copies or GPU work. Neither
hardware selection nor zero-copy operation is established. The remaining CPU
difference could include presentation/compositing, worker transfer and scheduling,
mpv audio/demux/runtime work, or decoder implementation differences. This pair
does not separately attribute those costs. A targeted presenter-stage comparison
would be more useful than assuming they all belong to mpv.

## Evidence and reproduction

- [Protocol](PROTOCOL.md)
- [Measured result and input hashes](../../results/retained-presenter/screen-2026-09-08T00-01-31.674Z/result.json)
- [Raw samples](../../results/retained-presenter/screen-2026-09-08T00-01-31.674Z/raw.jsonl)
- [CPU, timing and ownership audit](../../results/retained-presenter/screen-2026-09-08T00-01-31.674Z/assessment.json)
- [Experimental build provenance](../../results/retained-presenter/build.json)
- [Previous remaining-cost screen](../remaining-gap/README.md) and [Canvas ablation](../canvas-ablation/README.md)

With the local toolchain, static libraries, prior experiment bindings and fixture
available, run from the repository root:

```sh
python3 experiments/retained-presenter/prepare.py
python3 experiments/retained-presenter/compile-hook.py
WEBMPV_EM_CONFIG="$PWD/build/gap.emscripten" WEBMPV_BROWSER_DECODER=1 bash experiments/retained-presenter/link.sh
```

The hook object compiles from a copied upstream source with one callback added,
then links before the existing static library. Production mpv sources/libraries
are not edited. Experimental binaries live in ignored web/engine-retained.
The configuration used is recorded in the preceding experiment's build provenance.
No Docker was used. The accepted 0.2.0 archive remains unchanged.

Reuse/start the app server on 4179 and benchmark origin on 4183, then:

```sh
node tests/retained-presenter.mjs --smoke
node tests/retained-presenter.mjs
python3 experiments/retained-presenter/assess.py results/retained-presenter/screen-2026-09-08T00-01-31.674Z
```

The visible run has two tests and takes approximately 3–4 minutes. Keep its
Chrome window foreground; the page shows countdowns and completion status.
All measured inputs match their saved before/after hashes and current files.
