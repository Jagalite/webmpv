# Qualified pipeline experiments

Continuation of `experiments/pipeline-separation`, kept in a new directory so the previous sources, builds and results remain reproducible. Public Native/Hybrid/Software modes and production defaults are unchanged. No commits or pushes.

Prerequisites are the existing pinned FFmpeg 7.1.1/mpv 0.40 and Emscripten 4.0.14 build trees used by the prior experiment, Node/Playwright, Python, host FFmpeg/ffprobe and installed test browsers.

```sh
python3 experiments/pipeline-qualification/extra-fixtures.py
bash experiments/pipeline-qualification/build-remux.sh
bash experiments/pipeline-qualification/build-yuv.sh
node experiments/pipeline-qualification/suite.mjs
```

The original `build/pipeline-separation/fixtures` and performance fixtures are read-only inputs. Extra fixtures go into `build/pipeline-qualification/fixtures`. Wait for builds to finish before opening test browsers. The suite runs sequentially and archives its sources and runtime binaries in `inputs.tgz`; an aggregate pass requires every driver and unchanged engine hashes. Chrome/Firefox/WebKit results are separately labeled. WebKit automation is not a Safari release certification.

Targeted drivers:

```sh
BROWSER=firefox CASES=single-ts,long-gop-ts node experiments/pipeline-qualification/qualify.mjs
CASES=animated,tenbit node experiments/pipeline-qualification/yuv-qualify.mjs
node experiments/pipeline-qualification/remux-faults.mjs
node experiments/pipeline-qualification/remux-lifecycle.mjs
node experiments/pipeline-qualification/io-epoch.mjs
node experiments/pipeline-qualification/seek-stress.mjs
MEDIA=offset TARGET=0 node experiments/pipeline-qualification/packet-check.mjs
node experiments/pipeline-qualification/av-sync.mjs
node experiments/pipeline-qualification/metadata.mjs
node experiments/pipeline-qualification/audio-startup.mjs
python3 experiments/pipeline-qualification/verify-preservation.py
```

Visible playback tests require Chrome to remain foreground and should run without another browser test/build workload:

```sh
VARIANTS=native,remux,remux,native MEDIA=movie TARGET=236.9 WARMUP=10 MEASURE=30 node experiments/pipeline-qualification/run.mjs
VARIANTS=software,yuv,yuv,software MEDIA=movie TARGET=236.9 WARMUP=10 MEASURE=30 node experiments/pipeline-qualification/run.mjs
VARIANTS=software,yuv,yuv,software MEDIA=animated TARGET=2 SUBTITLES=1 WARMUP=1 MEASURE=7 node experiments/pipeline-qualification/run.mjs
VARIANTS=remux,yuv MEDIA=movie TARGET=0 WARMUP=10 MEASURE=300 node experiments/pipeline-qualification/run.mjs
```

Every driver creates a timestamped results directory. Functional tests include positive playback assertions and explicit, reason-checked rejection of unsupported configurations; an expected rejection is not a claim of playback support. Browser-clock flash/beep timing is separate from performance and from physical display/speaker latency.

Implementation boundaries:

- `remux.c`: packet-only AVC/AAC qualification, SPS/configuration validation, bounded MKV DTS reconstruction, AAC ADTS/configuration/timestamp adaptation, verified TS IDR seeking. No decoder or encoder is linked.
- `remux-player.js` / workers: source identity, authorized header refresh, bounded buffering, cancellation, EOS and source-time mapping. MSE retains a one-second internal bias so decoder preroll before source time zero survives. Library positions remain source-based; raw native video controls expose the internal timeline and are outside this plan's qualified UI contract.
- `yuv-backend.c` / `yuv.js`: software-decoded SDR 8-bit planes, GPU quarter-turn rotation, matrix/range conversion and dirty-region ASS composition; existing RGB renderer for qualified unsupported pixel formats. Rotated fallback formats are explicitly rejected until a qualified CPU transpose is selected.
- `io-worker.js` / `stream-bridge.c`: isolated epoch synchronization and exact-ticket cancellation fix; the deterministic old-worker reproduction and 60 paused distant seeks cover the stale-frame failure. Baseline routes still use maintained IO.
- `prepare-yuv.py`: isolates private backend linkage, GPU context restoration, paused redraw and error reporting that returns from Wasm before shutting down. JS rendering errors must not unwind through mpv's locked render call.

The two private integration surfaces remain pinned to the current FFmpeg/mpv versions. These are opt-in experimental plans, not an automatic routing/default change.

Read the [qualification record](../../results/pipeline-qualification/README.md) and [findings](../../docs/PIPELINE-QUALIFICATION.md) for exact evidence and remaining production gates.
