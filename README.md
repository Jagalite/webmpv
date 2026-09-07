# webmpv

A software-only browser libmpv player, following
[the accepted architecture](browser-player-feasibility-and-architecture-v3.md).
mpv owns playback, FFmpeg decodes video and audio in Wasm, libass draws subtitles,
and original browser bindings provide Canvas 2D and AudioWorklet output.

**M0, M1 and M2/G1 are complete for the declared software profile.** The player
supports bounded remote streaming, authentication, exact seeking, tracks,
styled ASS and asynchronous cleanup. The final shaped hour, functional matrix,
supplied-MKV regression, reproducible builds and extracted-runtime checks pass.
See the
[M2 acceptance record](docs/validation/M2.md)
and [supported profile](docs/SUPPORTED-PROFILE.md).

For continuation, see the [handoff](docs/HANDOFF.md) for checkpoints, code
ownership, local setup, validation evidence and remaining milestones.

## Run the local demo

After building the engine:

```sh
npm ci
npm run build
npm run dev
```

Open <http://127.0.0.1:4179> and press **Play test film**, or select a small local
H.264/AAC MP4/MKV, or enter a byte-range-enabled media URL. The server supplies
the COOP/COEP headers required by threads. Large local sources can be exposed
through the explicit loopback fixture server with `WEBMPV_TEST_MEDIA=/path/to/file.mkv node scripts/media-server.mjs`, then opened at
`http://127.0.0.1:4180/media/user`. The original file is read-only.

A small [integration example](web/example.html) and
[TypeScript integration guide](docs/INTEGRATION.md) show host application usage.

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
cleanup in `results/m2/m0-regression/`. `HEADED=1 npm test` runs a visible browser.

For the streaming and qualification suites, also run `npm run dev:media`. Generate
the controlled large fixtures with `bash scripts/make-qualification-fixtures.sh`
and native subtitle references with `bash scripts/make-reference-fixtures.sh`
(the latter uses installed native mpv/FFmpeg). Run `npm run test:stream`, then
`npm run test:qualify`. For M2 delivery, also save the supplied-file regression
separately with `RESULT_DIR=results/m2/m1-regression HEADED=1 node tests/m1.mjs`.
`npm run test:long` takes a real hour and records output
sync, frame delivery and browser-process memory. Keep other heavy work off the
reference device during performance qualification.

See [the patch inventory](docs/PATCHES.md), [source lock](sources.lock.json), and
`results/build-manifest.json` for build provenance. Original browser code and
build definitions do not incorporate the excluded libmpv-wasm port or its forks.

The native engine and browser sidecars have separate reproducibility records:
`results/m2/reproducibility.json` and `results/m2/bindings-reproducibility.json`.
`bash scripts/build-bindings.sh` independently compiles TypeScript and assembles
the original browser files. The release packager checks qualification results
and runtime hashes before producing an accepted baseline.

The small local fixture retains its bounded WasmFS path; remote media uses HTTP
ranges. WebCodecs, segmented streaming, live playback and hardware acceleration
remain outside this software baseline. M3 now has an isolated
[decoder benchmark](experiments/m3/README.md) and a predeclared
[measurement contract](docs/M3-BENCHMARK.md). The [first results](docs/validation/M3.md)
show a CPU benefit but fail the comparison memory gate. The
[isolated packet-bridge follow-up](docs/validation/M3-followup.md) passes memory
but misses the net CPU-benefit threshold. Production decoder integration
still requires a separate G2 decision.

## Accepted baseline archive

Build the versioned archive after qualification with:

```sh
python3 scripts/package-baseline.py
```

The accepted `webmpv-software-0.2.0.tar.gz` is retained in `build/releases/`.
Extract it and run `node scripts/serve.mjs` from its root; prebuilt engine and
browser bindings are included. Archive hashes and reproducibility evidence are
recorded in the repository's `results/release-summary.json` and
`results/release-reproducibility.json`. Each archive includes its own
`release-manifest.json` with hashes of the contained files.
