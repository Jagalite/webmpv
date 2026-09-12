# Three-mode beta candidate

webmpv is a browser media compatibility runtime. Automatic selection chooses Native
direct → Native packet-copy adaptation/remux → Hybrid retained WebCodecs → Software
FFmpeg, subject to source permissions, selected tracks and requested features. There
are exactly three public modes. This candidate is not production-qualified.

## Assemble and install

From a checkout with the three current engine builds available:

```sh
npm ci
npm run build
python3 scripts/package-beta.py
npm install --offline /absolute/path/build/beta/webmpv-0.3.0-beta.2.tgz
```

Copy the entire installed `node_modules/webmpv` directory to your application's
static `/vendor/webmpv/` directory. Preserve the relative layout. Do not bundle just
`index.js`: dynamic imports, module workers, pthread workers, fonts and AudioWorklet
modules resolve relative to their own module URLs.

```js
import {Player, PLAYBACK_MODES} from '/vendor/webmpv/index.js';
const player = new Player(document.querySelector('#player'));
await player.open(fileInput.files[0]);
await player.play(); // invoke from a user gesture where autoplay policy requires it
// await player.setMode('hybrid'); // explicit pin
// await player.setAutomaticSelection();
// await player.destroy();
```

Use HTTPS (localhost is suitable for testing). Serve the application and assets
with `Cross-Origin-Opener-Policy: same-origin` and
`Cross-Origin-Embedder-Policy: require-corp`, plus appropriate CORS/CORP for media.
Serve JS/MJS as `text/javascript` and Wasm as `application/wasm`. The consumer test
also checks explicit Native direct without isolation: that path creates no Wasm
engine, worker or AudioWorklet. mpv and remux require isolation.

## Asset and engine contracts

`index.js` and `index.d.ts` expose the reusable API. `web/generated/` contains its
bindings; `web/` contains workers, presentation, source I/O and AudioWorklet modules.
`web/engine-remux/`, `web/engine-hybrid/` and `web/engine-software-full/` contain
engine modules and Wasm. `fixtures/DejaVuSans.ttf` is the bundled subtitle font.
`third_party/` and the font license retain notices. No test media is bundled.

The manifest names three modes, automatic plan order, software default and every
runtime asset's SHA-256. Build hashes are provenance, not playback qualification.
`--yuv` adds the optional YUV asset and presenter; it never changes the RGB default.
Without that asset, requesting the experimental option fails explicitly.

## Engine build recipe and reproducibility boundary

Follow [the clean release recipe](docs/RELEASE.md) to build all three engines from the
locked inputs, package a clean tagged revision, include matching source/build
materials, and test the exact archive. One independent clean engine build is a
required developer-beta gate. Deterministic archive assembly and historical
baseline builds do not close it.

## Licensing

Read [the licensing contract](docs/LICENSING.md) before embedding or redistributing this
package. Hybrid and Software ship GPL-enabled mpv/FFmpeg; Remux uses an independent
LGPL FFmpeg build. The original bindings' license does not override engine terms.
The release must include its matching source companion, notices and build materials.

## Qualification boundaries

Implemented and functionally tested: automatic routing, explicit pins, stateful mode
changes, bounded local File input (including sparse >4 GiB offsets and a 259 MB movie),
Native MP4/WebM remux negotiation and bounded buffering. ArrayBuffer remains capped
at 32 MiB. Sparse files establish offset/allocation behavior, not endurance.

Chrome and Firefox have recorded functional coverage on the reference macOS host.
Safari, mobile and wider device support remain unqualified. Browser codec probes are
admission hints; actual frames and audio must work. No hardware-acceleration,
zero-copy or physical output-fidelity guarantee is made. Hybrid/Software support
stereo, 5.1 and 7.1 PCM with device negotiation. Software offers explicit HDR-to-SDR
tone mapping. The [compatibility expansion](docs/COMPATIBILITY-EXPANSION.md) defines
input limits, subtitle APIs and streaming support. Mode changes reopen sources and are not gapless.

Software YUV stays experimental. Keep intermittent filtered-seek failures and failed
movie comparisons visible. A passing retry or short ASS CPU improvement cannot close
those blockers. Before release, prioritize physical A/V/priming, long-duration
memory/resource stability, repeated seeks, broader sample-description transitions,
physical HDR/audio-layout measurements, browser/device qualification and lifecycle cleanup against
the exact packaged hashes. No additional public mode is needed for this work.

## Seek-read correction

The beta worker lets an in-flight bounded read finish when mpv seeks. Previously the
seek hook interrupted `stream_cb` in the middle of a packet, allowing FFmpeg to
receive truncated data; controlled RGB and YUV tests reproduced this. Source
replacement and destruction still cancel I/O. A seek may now wait for the active
read, and each uncached range-read operation has an absolute 15-second deadline across
headers, body progress, retries and credential refresh. The 1.2-second idle watchdog
is separate and cannot extend that deadline. A deadline fails the read with an
explicit transport error; it never returns a partial packet or a false EOF. This
is a per-read bound, not a 15-second bound on an entire seek or open operation. This correction
does not promote YUV or establish physical A/V/endurance qualification.
