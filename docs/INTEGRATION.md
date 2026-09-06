# Browser integration

Run `node scripts/serve.mjs`, then open `/web/example.html` for a complete small
host application. `/` supplies the fuller player with tracks, volume, playback
rate, timeline and diagnostics. Host the `web/` and `fixtures/DejaVuSans.ttf`
paths together as shown in the release bundle.

```ts
import {BrowserPlayer} from './web/generated/player.js';

const player = new BrowserPlayer(document.querySelector('canvas')!);
await player.ready;
await player.openRemote({
  url: mediaURL,
  headers: {Authorization: `Bearer ${accessToken}`},
  allowedOrigins: [new URL(mediaURL).origin],
  // Return fresh authorization or a renewed URL on one HTTP 401.
  refreshAuthorization: async () => ({headers: {
    Authorization: `Bearer ${await renewAccessToken()}`
  }})
});
await player.play(); // Call from a user gesture when autoplay is restricted.
await player.seek(120);
await player.selectTrack('audio', '2'); // IDs come from track-list events.
await player.selectTrack('sub', '1');
await player.volume(75);
await player.rate(1.5);
player.resize(1280, 720); // Output pixels, including the chosen device scale.
await player.pause();
await player.destroy();
```

Use `credentials: 'include'` for cookies when the origin permits credentialed
CORS. Renewal URLs must remain on the explicit origin allowlist. A source needs
coherent `206` byte ranges, identity representation, readable `Content-Range`
and a strong ETag. `immutable: true` is an explicit host assertion for a
version-addressed asset without an ETag. Redirects and ignored ranges fail.

Serve the page securely with `Cross-Origin-Opener-Policy: same-origin` and
`Cross-Origin-Embedder-Policy: require-corp`. The media origin must allow the page
origin and requested headers, and expose `Content-Range`, `ETag`, `Retry-After`
and representation headers. Credentialed CORS needs an explicit origin and
`Access-Control-Allow-Credentials: true`. The supplied servers demonstrate this
on localhost. No transcoding service is involved.

`mpv` events expose property changes, track lists, buffering, end-of-file and
command replies. Its `log-message` events include native warnings such as
unsupported attachment budgets; `error` and `log` events report host failures
and runtime logs. `diagnostics` and `audioDiagnostics()` expose the
selected software path, heap, range/cache counters, output position and PCM
consumption. Internal mpv `avsync` is not independent output-sync evidence.

The player accepts one open operation at a time. Seeks supersede old output and
network reads; command promises acknowledge mpv's command processing. Wait for
diagnostics to clear `seeking` and reach the target when actual presentation is
required. Destruction is asynchronous and idempotent. A canvas transferred to
an engine cannot be transferred again: create a fresh canvas for a new player.

Local `open(File | ArrayBuffer)` retains the explicit 32 MiB limit. Use remote
ranges for large files. Multiple instances, other browsers, HDR, DRM, live and
segmented streams are outside this release's qualification profile.
