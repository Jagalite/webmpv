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

## S1 fixed segmented VOD

In the development checkout, supply `format: 'hls'` or `format: 'dash'` to
`openRemote`; omission keeps the direct-file range behavior. For example:

```ts
await player.openRemote({
  url: manifestURL,
  format: 'hls',
  allowedOrigins: [new URL(manifestURL).origin],
  refreshAuthorization: async resource => ({headers: {
    Authorization: `Bearer ${await renewAccessToken()}`
  }})
});
```

The optional refresh argument identifies the actual requested resource URL.
Return renewed headers for nested requests; a replacement URL must refer to that
resource, not unconditionally to the root manifest. All resources must satisfy
the origin and credential policy. Ordinary resources require HTTP 200; explicit
byte ranges require matching 206 responses. Redirects are rejected.

Manifest bodies are limited to 1 MiB, each media/init body to 8 MiB, retained
bodies to 16 MiB, simultaneous handles to 16, and resource opens to 10,000. One
request runs at a time, with a 15-second deadline and four attempts.

Only finite single-video HLS and single-period, one-representation-per-adaptation
DASH are admitted. TS/fMP4 timestamp-reset discontinuities are handled natively. HLS WebVTT must be one full-timeline resource without
X-TIMESTAMP-MAP. Live, adaptive and encrypted HLS manifests are rejected. See
[the passing S1 profile and its limits](validation/S1.md).

## Optional M4 decoder (accepted with endurance exception)

Build the optional artifact with `npm run build:browser-decoder` after the native
libraries are built. It writes `web/engine-m4/`; the software engine remains in
`web/engine/`. Instantiate `BrowserPlayer(canvas, {decoder: 'webcodecs'})` to opt
in. The default remains `software`. AAC, filtering, subtitle composition and
presentation timing remain with mpv. Unsupported configurations and decode
errors recover through software; diagnostics report `decoder` and `decoderStats`.

The current copy-back path admits bounded H.264 avcC inputs and I420/NV12 output.
It retains compressed keyframe replay data up to 16 MiB / 256 packets and bounds
browser inputs/frames to eight. The host owns a hidden same-origin frame for the
worker tree and removes it during destruction. Keep awaiting `destroy()` before
reusing a player slot. This development candidate is accepted with the user-approved 57:38 endurance
exception; its original strict long-run gate remains failed. See
[candidate acceptance](validation/CANDIDATE.md) and [the M4 contract](M4-CONTRACT.md).


For supplemental diagnostics without occupying the foreground browser, run
`node scripts/qualify-development.mjs software supplemental --headless-diagnostic`
and then the same command with `webcodecs`. These commands preserve accepted
evidence and mark new results `qualificationEligible: false`. They do not run
long tests or replace foreground acceptance. Ensure the synthetic
oversized-attachment fixture and native subtitle reference images exist first.
