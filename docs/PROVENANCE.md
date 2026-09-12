# Source and build provenance

`sources.lock.json` records the upstream repository, exact release/commit,
archive URL and SHA-256 for each native dependency. `scripts/fetch-sources.py`
checks the archive before extraction. The original architecture attachment is
preserved unchanged at the repository root.

The engine is built from upstream mpv, FFmpeg, libass, FriBidi, HarfBuzz, FreeType,
zlib and libplacebo. Vulkan-Headers supplies the exact header submodule required
by the selected libplacebo release; no Vulkan output is enabled. The stock
Emscripten 4.0.14 toolchain supplies libc, libc++, pthread and WasmFS runtime code.
`Dockerfile` pins an upstream ARM64 Ubuntu image by digest, installs stock
Emscripten 4.0.14 and pins additional Python build tools. `toolchain.lock.json`
locks both downloaded SDK/Node archive hashes and all Debian package versions;
the image build fails if any differ. Build package inventories accompany each container result.

The copied upstream notices are under `third_party/notices/`; their source paths
and hashes are in `third_party/notices.json`. mpv's default GPL build setting is
retained. The current Hybrid and Software profiles enable FFmpeg's GPL option;
the independent remux profile does not. None enables nonfree or version3. See
[the licensing contract](LICENSING.md) and the actual clean build's
`build/beta-build.json`; the earlier baseline configuration is historical.
These are recorded build settings; the upstream copyright inventories contain
individual-file terms. The bundled DejaVu Sans 2.37 font has its own notice at
`fixtures/FONT-LICENSE.txt` and byte hash at `fixtures/assets.lock.json`.

The test film and subtitle script are original generated fixtures. The generation
command, media probe and checked-in bytes are supplied. Fixture generation is
separate from engine compilation; engine builds consume the frozen fixture.

The browser bindings, audio output driver, worker/worklet, build scripts, build/registration patches and browser attachment-budget guard
were written for this repository. The excluded
libmpv-wasm implementation, its wrapper, mpv fork and Emscripten fork were not
used as implementation inputs. See `docs/PATCHES.md` for each change's purpose.

`results/build-manifest.json` ties native sources, patches, configuration,
fixtures and engine artifact hashes together. Actual repeat-build comparisons
and browser acceptance results are recorded separately; pins alone are not a
claim of binary reproducibility or playback correctness. The final browser
sidecars have a separate assembly manifest under
`results/m2/bindings-reproducibility.json`; native build manifests preserve the
snapshot used at compilation, while runtime and release hashes identify the
final assembled player.

The final browser assembly also records the public mpv format query and MKV
preroll configuration, plus first-output diagnostics after reopening/seeking.
These historical binding/configuration results refer to their recorded native
engine hashes. They do not qualify the expanded three-engine beta. Follow
[the current release recipe](RELEASE.md) for its clean build and exact-archive tests.
