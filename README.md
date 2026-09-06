# webmpv

A software-only browser libmpv player, following
[the accepted architecture](browser-player-feasibility-and-architecture-v3.md).
mpv owns playback, FFmpeg decodes video and audio in Wasm, libass draws subtitles,
and original browser bindings provide Canvas 2D and AudioWorklet output.

**M0 is complete.** The software player passes nine real-browser acceptance checks
and four AudioWorklet tests. Two independent clean container builds produce
identical Wasm and JavaScript. See the [acceptance record](docs/validation/M0.md).

## Run the local demo

After building the engine:

```sh
npm ci
npm run build
npm run dev
```

Open <http://127.0.0.1:4179> and press **Play test film**, or select a small local
H.264/AAC MP4/MKV. The server supplies the COOP/COEP headers required by threads.
The initial profile is [documented here](docs/M0-PROFILE.md).

## Build from upstream sources

The canonical build uses Docker and the stock Emscripten 4.0.14 SDK on a digest-pinned ARM64 Ubuntu image:

```sh
bash scripts/build-container.sh
mkdir -p web/engine
cp build/container-result/player.* web/engine/
```

The image verifies SDK archive hashes and every installed Debian package version
against `toolchain.lock.json`. ARM64 avoids x86 emulation on the M0 Mac.
The script builds in an empty container directory and verifies each source
archive against `sources.lock.json`. The repository is mounted read-only;
artifacts, logs and manifests go to the selected result directory. For a second
independent build, pass a different output directory and compare artifact hashes:

```sh
bash scripts/build-container.sh build/container-repeat
python3 scripts/compare-builds.py build/container-result build/container-repeat
```

The comparison checks both engine files, their manifests and recorded inputs.

A local build is also available via `scripts/build.sh`, using stock Emscripten
4.0.14 at `build/emsdk-4.0.14` (override with `WEBMPV_SDK`), Meson 1.7.2, Ninja,
CMake, pkg-config, Python, Jinja2 3.1.6 and MarkupSafe 3.0.2. Native configure
generators require a host C compiler. The SDK's stock runtime cache is used.

## Validate

With the server running and Google Chrome installed:

```sh
npm run build
npm test
```

Tests remove VideoDecoder, AudioDecoder and VideoFrame, forbid native media
playback, and record actual canvas/PCM evidence, subtitles, controls and lifecycle
cleanup in `results/`. `HEADED=1 npm test` runs a visible browser.

See [the patch inventory](docs/PATCHES.md), [source lock](sources.lock.json), and
`results/build-manifest.json` for build provenance. Original browser code and
build definitions do not incorporate the excluded libmpv-wasm port or its forks.

The small local fixture is intentionally loaded into bounded in-memory WasmFS for M0.
Remote range streaming belongs to M1. G1 qualification, WebCodecs, segmented
streaming, live playback and hardware acceleration are later milestones.
