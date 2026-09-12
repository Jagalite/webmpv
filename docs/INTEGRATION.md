# Browser integration

The public entry point is `web/generated/index.js` (with matching TypeScript
declarations). It exports `Player`, `PLAYBACK_MODES`, and public types. Exactly
three modes are accepted, in this order: `native`, `hybrid`, `software`.
Omitting `mode` enables automatic selection; `player.mode` reports the actual engine
(initially `native` before opening). An explicit mode pins selection. Copy-back and experimental decoder controls are not
public modes or constructor options.

```ts
import {Player, PLAYBACK_MODES} from './web/generated/index.js';

const player = new Player(document.querySelector<HTMLElement>('#surface')!, {
  width: 1280, height: 720, // Automatic selection; pass mode to pin an engine.
});
await player.openRemote({url: mediaURL});
await player.play(); // Use a user gesture when autoplay is restricted.
await player.seek(120);
await player.volume(75);
await player.rate(1.5);

await player.setMode('hybrid'); // Explicit reopen, preserving position/play state.
await player.selectTrack('sub', '1');
await player.setMode('software');
await player.setVideoFilters('hflip,eq=brightness=0.1');
await player.setAudioFilters('volume=0.5');
await player.setVideoFilters('');
await player.setAudioFilters('');
await player.setMode('native');
await player.destroy();
```

| Mode | Video decode/presentation | Subtitles | Filters |
| --- | --- | --- | --- |
| Native | Browser `<video>` | Browser-supported embedded tracks and external WebVTT | Unavailable |
| Hybrid | WebCodecs video, mpv scheduling, retained browser frames | mpv/libass | Unavailable through this API |
| Software | Expanded FFmpeg software decode and mpv software render | mpv/libass | FFmpeg video/audio filters |

Hybrid bridges AVC (avcC or Annex B), HEVC, VP8, VP9 and AV1 using the actual
browser decoder configuration and decoded-frame delivery. Its audio and demuxing
use the expanded FFmpeg build. Decoder registration alone does not establish
playback support. Automatic selection falls back to Software when Hybrid fails;
manual Hybrid reports the failure.

Native defaults to `nativeRemux: 'auto'`: direct `<video>` first, then progressive
[browser-compatible packet-copy remuxing](BROAD-ROUTING.md) on packaging/decode rejection. Sources requiring
custom authentication go directly to the remux plan. `'never'` preserves direct-only
behavior; `'always'` forces remux qualification. These are internal plans, not
public modes. Native HLS/DASH still depends on browser manifest support.
See [routing, qualification and remaining limits](MEDIA-ROUTING.md).

`setVideoFilters()` and `setAudioFilters()` automatically select Software when
automatic selection is enabled. In manual mode they reject outside software, even
for an empty chain. In manual mode, select software explicitly first. Clear active filters before
leaving software mode. Filter changes reopen with filters configured before load.
Mode/filter changes preserve position, pause, volume and speed. Failed candidate
opens/configuration restore the old player. Changes are not gapless; at most an
old and candidate session coexist. Track IDs are mode-specific and reset to auto
when replacing a source or crossing between native and mpv modes. Disabled (`no`)
track selections remain disabled across mode changes. External browser text tracks remain
associated with the current source and are restored when returning to native.

See [automatic selection](AUTOMATIC-SELECTION.md) for source preflight, fallback,
runtime recovery and policy controls. Use `player.capabilities` to enable controls;
filter capabilities include automatic switching when enabled. Observe `modechange` events with
`phase: 'loading' | 'ready' | 'failed'`, and `mpv` events for normalized properties
(`time-pos`, `duration`, `pause`, `track-list`, volume and speed). Native events are
adapted to these common property names; they do not imply mpv is running.
`error`, `log`, `source` and `output` events carry backend information when
available. `diagnostics.mode` always identifies a public mode; `backend` contains
mode-specific details. Native audio does not expose Wasm PCM counters.

The host supplies a container element, not a canvas. Player owns its surface and
worker tree. `ready` resolves without loading an engine; `open()`/`openRemote()`
resolve once the selected backend has loaded. Source/control operations serialize
through a bounded 32-operation queue. `destroy()` cancels in-flight work on both current and candidate sessions,
awaits cleanup, removes owned DOM and is idempotent. Await it before discarding a
slot. New sources open paused; call `play()` explicitly.

## Sources and deployment

`open(File | ArrayBuffer)` supports native browser File playback, including files
larger than 32 MiB. ArrayBuffer sources remain limited to 32 MiB. Local Files use bounded worker
reads in Hybrid and Software as well as Native remux; an HTTP server is not required. Arrays are copied for reopen ownership;
Files are immutable references.

Native external subtitles:

```ts
await player.addTextTrack({src: subtitleURL, label: 'English', language: 'en'});
await player.selectTrack('sub', '1');
await player.subtitleVisible(false);
```

Keep caller-owned blob text-track URLs alive until the source is replaced or the
player is destroyed. Native direct audio track switching requires the browser's
audio track API. Remux exposes demuxed audio IDs and reopens at the source position
when selecting a qualified track. Unsupported requests reject.

mpv modes accept `RemoteSource` headers, credentials, explicit origin allowlists,
immutability assertions and authorization renewal:

```ts
await player.openRemote({
  url: mediaURL,
  headers: {Authorization: `Bearer ${token}`},
  allowedOrigins: [new URL(mediaURL).origin],
  refreshAuthorization: async () => ({headers: {Authorization: `Bearer ${await renewToken()}`}}),
});
```

Native routes headers, renewal callbacks, explicit origin restrictions,
immutability assertions and `credentials: 'omit'` through its bounded remux source.
With `nativeRemux: 'never'`, these requests reject because `<video>` cannot enforce them.
Native credentialed CORS uses `credentials: 'include'`; the default is anonymous
CORS. Range/redirect guarantees apply to the remux and mpv source adapters.

Serve all `web/` assets and `fixtures/DejaVuSans.ttf` at the relative locations in
the repository. Native direct lazily imports only its browser adapter and does not
require cross-origin isolation. Native remux and Hybrid/software require a secure isolated page:
`Cross-Origin-Opener-Policy: same-origin` and
`Cross-Origin-Embedder-Policy: require-corp`. The media server must satisfy CORS,
CORP where applicable, range and representation requirements. The complete
checkout is not a published npm distribution. A standalone, offline-installable
beta candidate and clean-consumer instructions are available in [BETA.md](BETA.md).

Build the JS/API with `npm run build`. Software uses `web/engine-software-full`
from `npm run build:software-full`. Hybrid uses `web/engine-hybrid` from
`npm run build:hybrid`; Native remux uses `web/engine-remux` from `npm run build:remux`.
These engine build scripts use the pinned local FFmpeg/Emscripten toolchain; see
[build prerequisites and commands](MEDIA-ROUTING.md). Worker filenames are implementation
details, not additional playback modes. FFmpeg build flags affect the bundled
Wasm capabilities, not the public mode list.

Software now admits input up to 3840×2160 under configurable pixel/allocation limits,
while canvas output remains bounded to 1920×1080. The [compatibility expansion](COMPATIBILITY-EXPANSION.md)
supersedes the older Software and S1 profiles for the new APIs and streaming cases.
No new performance or long foreground qualification is implied by API tests.

## Migration and historical experiments

Replace `BrowserPlayer(canvas, {decoder: ...})` with `Player(container, {mode: ...})`
from `index.js`. Replace raw mpv `command('set', 'vf', ...)` calls with
`setVideoFilters()` in software mode. There is no arbitrary public `command()`;
use typed controls so state survives a reopen. The package export map exposes
only this entry point.

The old `src/player.ts`, generated clients, `/web/index.html`,
`/web/legacy-example.html`, filter router and
experiment pages are frozen compatibility/evidence fixtures. They are not the
public API, default demo or default API test path. Their original inputs and
benchmark binaries remain preserved for comparison. Legacy test URLs now target
those explicit pages because `/` serves the three-mode demo. The new maintained mpv client
is shared by hybrid/software in `src/internal/wasm-player.ts`; native resource
ownership lives in `src/internal/native-player.ts`, and transaction/state ownership
lives in `src/unified-player.ts`.

Beta output scope: Hybrid and Software negotiate stereo, 5.1 or 7.1 PCM with an
explicit stereo fallback or rejection policy. Software can tone-map tagged HDR
to SDR. Physical surround/HDR fidelity, Safari/mobile coverage and
hour-long stability remain separate qualification gates. Exactly three public
modes are preserved; the optional Software YUV presenter is experimental.
