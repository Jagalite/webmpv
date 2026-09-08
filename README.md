# webmpv

A browser player with three explicit modes:

1. **Native** — browser video playback.
2. **Hybrid** — browser video decoding with mpv timing and libass subtitles.
3. **Software** — expanded FFmpeg software decoding, mpv subtitles, and filters.

The public TypeScript API exports `Player` and `PLAYBACK_MODES` from
`web/generated/index.js`. Native is the default. Mode changes are explicit;
video/audio filters require software mode. See the
[integration guide](docs/INTEGRATION.md) for capabilities, state preservation,
source restrictions and migration from the older decoder API.

## Release status

The three-mode architecture is the target for a scoped beta. The current checkout
is a development integration, not yet a standalone library release. The core does
not need another redesign before beta; release preparation still needs:

- A standalone asset layout for JavaScript, workers, Wasm, the audio worklet and fonts.
- A three-mode release manifest and reproducible engine build instructions, separate
  from the historical software-baseline packager.
- Validation of the packaged artifacts in a clean consumer application, including
  loading, isolation headers, mode changes and cleanup.
- A declared browser support matrix and qualification tied to the exact shipped artifacts.

Current limits include H.264 avcC video in Hybrid, browser-dependent Native format
support, 32 MiB local files in mpv modes (larger sources require HTTP ranges), and
software-only filters. Mode changes reopen playback and are not gapless. Automatic
fallback, broader Hybrid codecs and large local-file streaming are future work.
See the [integration guide](docs/INTEGRATION.md) for the full support contract.

The [three-mode API validation](results/player-api/README.md) records 15 API checks,
main-demo controls, nine legacy regression checks and four AudioWorklet checks.
These are functional results; they do not constitute new performance or endurance
qualification. Next is packaging a beta and testing it from a clean consumer app.

## Run the demo

```sh
npm ci
npm run build
npm run dev
```

Open <http://127.0.0.1:4179> or `/web/player.html`. The mode selector shows Native,
Hybrid and Software in that order. Native playback needs no Wasm bundle; hybrid
and software require their corresponding built engines and isolation headers.
`web/example.html` is a minimal [integration example](web/example.html).

`npm run test:api` starts its own local server and runs short headless Chrome
checks. It does not need the test window foreground. The new API is a development
integration over previously measured engines, not a new endurance or performance
qualification.

## Expanded software playback

The [expanded software profile](experiments/software-full/README.md) enables
FFmpeg's built-in decoders, demuxers and software filters using the local SDK.
Run `npm run build:software-full`, then select Software in the main demo.
The legacy `/web/software-full.html` fixture remains for its original verification;
accepted and benchmarked engines are preserved. Its component inventory is broader than its
representative browser test matrix; it does not imply every format is qualified.
See the [expanded-profile verification](results/software-full/README.md) for the
21 passing checks, payload sizes and documented limitations.

## Historical baseline build from upstream sources

The accepted historical baseline build uses Docker and the stock Emscripten 4.0.14 SDK on a digest-pinned ARM64 Ubuntu image:

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

With Google Chrome installed and both mpv engine profiles built:

```sh
npm run build
npm test
```

`npm test` runs AudioWorklet unit tests and the three-mode API suite. The API suite
starts its own server and headless Chrome, recording evidence in `results/player-api/`.
For the historical software-only acceptance test, start `npm run dev` and run
`node tests/m0.mjs`; that suite disables browser codecs and native playback.
`HEADED=1 node tests/m0.mjs` runs that legacy test in a visible browser.

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
but misses the net CPU-benefit threshold. The subsequent G2 decision authorized optional production integration; see the
[development candidate acceptance](docs/validation/CANDIDATE.md).

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

## Development milestones

S1 fixed HLS/DASH VOD passes its declared functional profile, including TS/fMP4
timestamp-reset seeks and worker cleanup. See [S1 validation](docs/validation/S1.md).
The optional M4 browser copy-back decoder is accepted with an explicit
user-approved 57:38 endurance exception; software was the default in that candidate.
The current three-mode API defaults to Native. See
[clean candidate acceptance](docs/validation/CANDIDATE.md). See [M4 validation](docs/validation/M4.md) and
[integration instructions](docs/INTEGRATION.md). The accepted 0.2.0 archive is
unchanged.

## Compare the three playback paths

The [three-way results](docs/validation/THREE-WAY.md) compare native HTML video,
mpv software decoding and our patched mpv with WebCodecs copy-back. On the test
host, median CPU was 10.24%, 54.09% and 45.27% of one core respectively; WebCodecs
was slower than software in one of three rounds.

With both local engine variants and browser bindings built, generate the fixture
using `bash scripts/make-qualification-fixtures.sh`. Start `npm run dev` on port
4179 and `node scripts/benchmark-media-server.mjs` on port 4183 in separate
terminals, checking for existing servers first. Then run:

```sh
node --test tests/benchmark-media-server.mjs
node tests/three-way-benchmark.mjs --smoke
node tests/three-way-benchmark.mjs
```

The measured run takes about 15 minutes. Leave its Chrome window foreground and
avoid concurrent heavy work. The short headless smoke only checks plumbing.
Results are saved under `results/benchmark/`; the validation report includes the
raw-sample assessment command. Use the local toolchain; Docker is not required.
