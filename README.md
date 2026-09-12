# webmpv

A browser media compatibility runtime that selects the cheapest correct path across three playback modes:

1. **Native** — browser video playback, with a progressive packet-copy remux fallback.
2. **Hybrid** — browser video decoding with mpv timing and libass subtitles.
3. **Software** — expanded FFmpeg software decoding, mpv subtitles, and filters.

The public TypeScript API exports `Player` and `PLAYBACK_MODES` from
`web/generated/index.js`. With no mode specified, the library automatically selects
Native direct/remux, Hybrid or Software. An explicit `mode` pins that engine;
`setAutomaticSelection()` restores automatic routing. CPU filters select Software
automatically when automatic selection is enabled. See the
[integration guide](docs/INTEGRATION.md) for capabilities, state preservation,
source restrictions and migration from the older decoder API.

## Release status

The three-mode architecture is the target for a scoped beta. The current checkout
is a development integration with a standalone beta-candidate packager, not a
production-qualified release. See [beta installation and gates](docs/BETA.md). The package preserves relative paths for JS, workers, Wasm, AudioWorklet and fonts,
and includes a three-mode asset manifest. `scripts/package-beta.py` produces an
offline-installable candidate; `tests/beta-consumer.mjs` checks a clean installation.

Release gates remain: independent clean engine builds, exact A/V and audio-layout
qualification, sustained memory/resource stability, remux recovery/configuration
edges, and a declared browser/device matrix tied to shipped hashes. Software YUV
stays opt-in; its seek and movie-performance blockers are not closed by retries.

The compatibility expansion adds Software AV1 (8/10-bit), bounded 4K input,
external SRT/ASS/WebVTT files and fonts, explicit HDR-to-SDR tone mapping,
negotiated 5.1/7.1 PCM, streaming variant selection and finite DASH periods.
See [supported inputs and APIs](docs/COMPATIBILITY-EXPANSION.md) for exact limits
and current qualification evidence.

Hybrid now bridges AVC, HEVC, VP8, VP9 and AV1 when the browser accepts the actual
configuration and delivers frames. Native first tries direct playback, then uses
bounded progressive remuxing for browser-compatible packet contracts when packaging prevents
direct playback. Neither operation re-encodes media. See [media routing](docs/MEDIA-ROUTING.md).

Current limits include bounded Hybrid source-frame size (4K tested), browser-dependent Native format
support, 32 MiB ArrayBuffer inputs (larger Files use bounded local reads), and
software-only filter execution. Mode changes reopen playback and are not gapless.
Bounded local File reads in both mpv modes are implemented and functionally tested,
including >4 GiB sparse offsets, a 259 MB movie, seeking, fallback and cleanup.
Long-duration memory stability and broader device qualification remain open; see
[local-file evidence](results/routing-completion/LOCAL-FILES.md). Deep automatic inspection
requires isolation and random-access sources; see [automatic selection](docs/AUTOMATIC-SELECTION.md).
See the [integration guide](docs/INTEGRATION.md) for the full support contract.

The [three-mode API validation](results/player-api/README.md) records the original API and legacy regression checks. The
[review-fix verification](results/player-api/REVIEW-FIXES.md) adds regressions for
long-playback seeking, aspect ratio, cancellation and source replacement; the
current API suite has 21 checks plus AudioWorklet, presentation and timing unit checks.
These are functional results; they do not constitute new performance or endurance
qualification. See [beta preparation and consumer evidence](results/beta/README.md).

## Run the demo

```sh
npm ci
npm run build
npm run dev
```

Open <http://127.0.0.1:4179> or `/web/player.html` for the player playground. Drop a video
or audio file onto the player, or click **Open media**. Local files stay in the
browser; the page does not upload them. You can add subtitles and fonts, compare
Native/Hybrid/Software, apply filters or HDR-to-SDR tone mapping, and export session
diagnostics. Choose surround output before opening media; **Close media** releases
the session and lets you change it. The URL panel also accepts HLS/DASH streams
from servers permitting browser access. Diagnostic downloads include media names
and backend session details.

`npm run test:demo` checks the page with real local files in Chrome. Run
`BROWSER=firefox npm run test:demo` for Firefox. These checks use the compatibility
fixtures from `npm run fixtures:compatibility`.

The demo uses the media's display aspect ratio (including pixel aspect ratio and
rotation), with height limited to the viewport. Hybrid and Software canvas output
follows that ratio within the 1920×1080 output limit. Audio and unloaded media use
a neutral stage size. Geometry changes during playback update the layout. The
Software build clears the GPU-only rotation capability on its libmpv VO so mpv
autorotates before RGB rendering; Hybrid retains its browser frame rotation.

Press **Space/K** to play or pause, **←/→** to seek 5 seconds, **J/L** to seek
10 seconds, **↑/↓** for volume, **M** to mute, **C** for subtitle visibility,
**[/]** for speed, and **0–9** to jump to 0–90%. **F** or a double-click on the
video requests browser fullscreen; **Esc** exits. **?** opens the shortcut list
in playback settings. Shortcuts respect text fields, focused controls and settings.
Fullscreen retains the transport and settings. Embedded hosts can deny fullscreen;
the demo then offers a link to open it in a browser tab. Local files must be reopened
in that tab. Older Safari can use native video fullscreen when element fullscreen
is unavailable; canvas playback requires element fullscreen support.

With the dev server running, generate small synthetic geometry fixtures using
`python3 scripts/player-ui-fixtures.py`, run `node --test tests/player-geometry.mjs`,
then `node tests/player-interaction.mjs` (or `BROWSER=firefox node tests/player-interaction.mjs`).
These checks cover actual media geometry in all engines, shortcuts and fullscreen.


Native direct playback needs no Wasm bundle;
Native remux, Hybrid and Software require their built engines and isolation headers.
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

## Hybrid scheduling performance

The [latest scheduling screen](results/hybrid-performance/README.md) reduces
Hybrid polling during playback and while paused, while keeping commands responsive.
The short headless comparison observed lower active and paused CPU with frame,
audio and cleanup checks passing. Baseline CPU varied; these results do not
establish a fixed speedup, foreground qualification or native parity.

## Decoder and playback optimization work

The development Software engine now specializes selected eight-bit H.264
interpolation, weighted prediction and deblocking operations with Wasm SIMD.
FFmpeg still owns decoding and keeps its other widths, bit depths and configured
formats. Both software build recipes accept `WEBMPV_DECODER_SIMD=0` to omit these
additional replacements. See the [kernel notes](native/simd/README.md).

Software keeps a 5 ms active service cadence and slows its worker pump after
paused work settles. Both mpv modes suppress unchanged audio-timing messages.
Hybrid omits the software replay cache that its retained-frame renderer cannot
use, fixing long-GOP playback beyond the old cache bound. Automatic selection can
recover decoder failures by reopening in Software; pinned modes report the failure.

The [performance work record](results/playback-performance/README.md) separates
accepted changes, experimental renderers, CPU measurements and functional checks.
Development engine artifacts differ from the historical accepted release archive.
No new foreground qualification or native-parity claim follows from these changes.

## Generated browser format matrix

The [format matrix](results/format-matrix/README.md) tests 115 small generated
sample configurations through the public Software API in Chrome: 112 decode,
106 pass decode/seek/cleanup, and all 115 release their workers. Failures remain
listed. There are also 47 generation/identification gaps and 334 decoder
registrations without a matching local encoder; these are not coverage claims.

Run `npm run fixtures:formats` with host FFmpeg/ffprobe, then
`npm run test:formats`. Fixtures stay under `build/fixtures/format-matrix/`.
The browser harness starts its own server, displays progress when headed, and
returns a nonzero exit status if any sample fails. These two-second synthetic
samples do not establish all-profile, all-container or performance support.

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
The current three-mode API selects automatically unless a mode is pinned. See
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

See [broad routing](docs/BROAD-ROUTING.md) for current remux codecs, Hybrid limits and fallback evidence.

## Release and license status

See [the release recipe](docs/RELEASE.md) for a clean three-engine build, tagged
candidate assembly, matching source materials and tests against the exact archive.
See [the licensing contract](docs/LICENSING.md) before embedding or redistributing
the package. Original webmpv code and the combined package use GPL-2.0-or-later;
dependency notices and matching source/build materials accompany the engines.

## GitHub Pages demo

The published demo is served from the `gh-pages` branch. Its matching development
source is on `demo-source`; `main` is not modified by a demo deployment.

Run `python3 scripts/build-pages.py --output build/pages-site` after building the
engines and TypeScript. Use a fresh output directory. The builder packages the
runtime, demo, scoped isolation service worker, licenses, preferred project source,
locked upstream source archives, SDK library sources and engine build materials.
The first visit reloads once to enable cross-origin isolation on GitHub Pages;
subsequent visits start directly. Local media is never uploaded or cached by the
service worker. Remote media still needs CORS permission from its origin.

Run `node tests/pages-demo.mjs` and `BROWSER=firefox node tests/pages-demo.mjs` to
verify the site under `/webmpv/` on a local server without isolation headers.
Set `PAGES_DIR` for a different output directory, or `PAGES_URL` to test the live
site. The deployment manifest hashes the actual site assets and source downloads.
This hosted development demo does not certify the separate clean-build beta gate.
