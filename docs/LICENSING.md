# Licensing and distribution

## Original webmpv code

Original webmpv code is licensed under **GPL-2.0-or-later**. The copyright notice
is **Copyright (C) 2026 webmpv contributors**. See the root `LICENSE` for the grant,
warranty disclaimer and complete GPL text. Upstream-derived files and dependencies
retain their own notices and licenses.

The distributed package is GPL-2.0-or-later. Commercial use is allowed under the
license's conditions. Redistributing a covered combined work entails GPL source
and license obligations; this package does not provide a proprietary embedding
exception. A particular application's relationship to the library and distribution
terms may need review.

## Current linked engines

These classifications follow the actual configured builds, not just the dependency
names. `build/beta-build.json` records the configuration and hashes for each build.

| Shipped artifact | Linked configuration | Applicable engine terms |
| --- | --- | --- |
| `web/engine-software-full/player.{mjs,wasm}` | mpv with `gpl=true`; FFmpeg with `CONFIG_GPL=1`, `CONFIG_VERSION3=0`, `CONFIG_NONFREE=0`; static libraries | GPL-2.0-or-later, plus retained component notices |
| `web/engine-hybrid/player.{mjs,wasm}` | The same mpv and full FFmpeg archives, browser decoder bridge, and modified mpv subtitle renderer | GPL-2.0-or-later, plus retained component notices |
| `web/engine-remux/remux.{mjs,wasm}` | Independent FFmpeg packet-only build; `CONFIG_GPL=0`, `CONFIG_VERSION3=0`, `CONFIG_NONFREE=0`; static libraries | FFmpeg library: LGPL-2.1-or-later; original wrapper and combined engine: GPL-2.0-or-later; retain the LGPL notices and source/relink materials |

The optional YUV engine is outside the standard three-engine candidate and must be
qualified and recorded separately before distribution.

Additional linked components include libass (ISC), FriBidi and libplacebo
(LGPL-2.1-or-later), HarfBuzz (MIT-style notices), FreeType (GPLv2 alternative for a GPLv2 combined distribution; retain
both its FTL and GPLv2 texts), zlib (Zlib), libxml2 (MIT-style notices), dav1d
(BSD-2-Clause), zimg (WTFPL), and Emscripten runtime libraries (the licenses and
exceptions under `third_party/notices/emscripten`). Inspect each component's source
headers for file-specific terms. Vulkan headers are build inputs; their notice is
retained without claiming that a Vulkan runtime is shipped. The bundled DejaVu font
has its separate copyright/license in `fixtures/FONT-LICENSE.txt`.

This software uses FreeType. Portions are copyright the FreeType Project
(https://freetype.org). The upstream notices identify the respective authors.

The patched upstream sources, including `experiments/retained-subtitles/vo_libmpv.c`,
retain their upstream licensing and any individual license headers. mpv's
`Copyright` inventory also covers its C files without individual headers. The
original-code license does not replace those upstream terms. The dated release record and `patches/` identify our modifications.

## Source and build materials accompanying a distribution

Ship the runtime archive and its matching `webmpv-*-source.tar.gz` together from the
same download location. The source companion must contain:

- The exact webmpv source revision, native wrappers, browser bindings, patches,
  build scripts, source/toolchain locks, package lock, notices and font asset.
- Every SHA-256-verified upstream archive in `sources.lock.json`, including the
  SDK installer source, plus the actual installed Emscripten sources and runtime
  library sources used in the build (excluding compiler caches).
- Actual FFmpeg configuration headers and configure arguments, mpv configuration,
  compiler/tool versions and hashes, the build log, and the engine build record.
- Instructions to rebuild all engines and to relink the remux wrapper with a
  modified FFmpeg. The supplied wrapper source and link command are part of the
  static LGPL relinking materials; do not remove them from the source companion.

The release manifest binds both archives to the source revision and engine hashes.
Archive assembly must fail if the linked configuration or inputs disagree with the
build record. Notices alone and a link to generic upstream sources do not substitute
for matching source/build materials. Keep the companion downloadable alongside the
runtime for recipients; do not rely on an unfulfilled written-source offer.

The public download page and integrator documentation must identify the GPL engines
and LGPL remux library and link the matching source archive. Preserve license texts,
copyright notices and change identification when redistributing. Do not impose terms
that conflict with the supplied licenses, including restrictions on the LGPL rights
to modify/relink and debug those modifications.

The build audit establishes the inputs/configuration and presence of these materials.
It does not establish legal approval of a particular host application, EULA, store,
patent jurisdiction, or distribution arrangement. Have those arrangements reviewed
where needed, especially before embedding the GPL engines in a proprietary product.

References: [FFmpeg's license and distribution guidance](https://ffmpeg.org/legal.html),
[mpv's copyright and licensing statement](https://github.com/mpv-player/mpv/blob/v0.40.0/Copyright),
[GPL version 2](https://www.gnu.org/licenses/old-licenses/gpl-2.0.html),
[LGPL version 2.1](https://www.gnu.org/licenses/old-licenses/lgpl-2.1.html).
