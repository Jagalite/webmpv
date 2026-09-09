# Experimental pipeline separation

Findings, routing decisions, raw results and limits: [results README](../../results/pipeline-separation/README.md).

Nothing here changes the public Native/Hybrid/Software API or production defaults. The test server selects isolated candidates through its URL mapping. Do not replace maintained engines with these prototypes.

## Reproduce in this checkout

Prerequisites: existing pinned Emscripten 4.0.14 (`build/emsdk-4.0.14`, `build/gap.emscripten`), FFmpeg 7.1.1/mpv 0.40 source trees, `build/prefix`, `build/obj-mpv`, and the already-built optimized Software FFmpeg archives. The normal repository build documentation supplies those prerequisites; these scripts intentionally reuse them rather than rebuilding/replacing production engines. Node dependencies, installed Chrome, Python and host FFmpeg/ffprobe are required. The exact current fixture/binary hashes are recorded with results.

From `/Volumes/seed2/Projects/webmpv`:

```sh
python3 experiments/pipeline-separation/fixtures.py
bash experiments/pipeline-separation/build-remux.sh
bash experiments/pipeline-separation/build-yuv.sh
```

Wait for each build to finish before testing. Output goes only to `build/pipeline-separation`; fixtures are created only if absent. Never run a build against an engine while a browser trial is loading it.

Correctness and capability probes (headless, not CPU evidence):

```sh
node experiments/pipeline-separation/qualify.mjs
node experiments/pipeline-separation/packet-check.mjs
node experiments/pipeline-separation/fidelity.mjs
node experiments/pipeline-separation/capabilities.mjs
SMOKE=1 VARIANTS=yuv MEDIA=movie TARGET=236.9 WARMUP=2 MEASURE=3 node experiments/pipeline-separation/run.mjs
```

The remux matrix is expected to report known MKV/TS failures until those gaps are implemented. The fidelity driver records differences; it does not assert color parity. A failed run writes artifacts and returns nonzero where the driver has playback assertions.

Run visible benchmarks sequentially, without another browser test/build workload, keeping Chrome foreground:

```sh
MEDIA=movie TARGET=236.9 WARMUP=10 MEASURE=30 node experiments/pipeline-separation/run.mjs
VARIANTS=software,yuv,yuv,software MEDIA=movie TARGET=236.9 WARMUP=10 MEASURE=30 node experiments/pipeline-separation/run.mjs
VARIANTS=software,yuv,yuv,software MEDIA=animated TARGET=2 SUBTITLES=1 WARMUP=1 MEASURE=7 node experiments/pipeline-separation/run.mjs
```

Useful experimental controls: `VARIANTS=native,remux,software,yuv,hybrid`, `MEDIA=movie|sample|tail|mkv|long|animated|ass`, `TARGET`, `SUBTITLES=1`, `FILTERS=hflip`, and `SEEKS=400,30,500,1`. Filters/subtitle overlays on the remux plan are explicitly unsupported. Every run creates a timestamped results directory; existing results are never replaced. These macOS CPU runs require localhost listening, Chrome launch and process inspection permissions.

## Exact changes

- `remux.c`, `build-remux.sh`: decoder/encoder-free FFmpeg AVIO and fragmented-MP4 build.
- `source-worker.js`, `remux-worker.js`, `remux-player.js`: bounded source mailbox, packet production credits, MSE ownership and cancellable seek generations.
- `yuv-backend.c`, `yuv.js`: private mpv software output replacement plus WebGL2 plane/overlay presentation.
- `prepare-yuv.py`, `build-yuv.sh`: isolated worker generation and link using the maintained optimized decoder libraries.
- `server.mjs`, `page.html`, `run.mjs`: experimental routing and equivalent visible benchmark harness; direct backend-worker cleanup observation handles the iframe-owned worker realm.
- `fixtures.py`, `qualify.mjs`, `packet-check.mjs`, `fidelity.mjs`, `capabilities.mjs`: bounded targeted fixtures and evidence drivers.

No existing production source, generated engine or previous benchmark artifact is intentionally edited. The preservation manifest/check covers the pre-existing files selected at investigation start.
