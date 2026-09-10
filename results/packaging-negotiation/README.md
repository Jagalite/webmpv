# Native packaging negotiation

The packet-only worker now derives MP4/WebM candidates from the selected video and
audio codec configuration. It sends full MIME strings to the MSE owner before muxing.
The window checks actual MSE type support and SourceBuffer creation, then selects a
container. AAC cannot be proposed in WebM; VP8/Vorbis cannot be proposed in MP4.
Codec registration is not admission. No compressed extensions, tracks or channels are
discarded, and no decoder/encoder is added to the remux build.

A SourceBuffer initialization error can restart once with the other compatible
container, retaining the original source identity and target time. Each attempt uses
new workers/MSE state. A source error is not a packaging retry. Steady-playback errors
still use the existing Hybrid/Software recovery owner; this change does not retry
containers indefinitely. Per-generation `stats.sessions[].packaging` records offered,
rejected and selected MIME strings, with reasons. No fourth public mode is introduced.

Five visible-browser cases passed in both Chrome and Firefox: MP4 probe rejection,
MP4 SourceBuffer-creation rejection, MP4 initialization rejection, audio-only Opus
using MP4 after WebM rejection, and both containers rejected with Hybrid recovery.
Each case plays, seeks to 40 seconds and back to two seconds, resumes and closes all
workers. Audio non-silence is covered separately by the preserved packaging matrix;
these rejection tests check media-time progression and errors rather than physical
A/V timing. Initial lifecycle checks cover EOF/backward recovery and destruction
while the worker waits for negotiation. Exact runs are in the adjacent logs/JSON.

The [final lifecycle run](lifecycle-2026-09-10T02-45-41.133Z/result.json) passed all
three cases: MP4 EOF/backward seek, WebM EOF/backward seek, and destruction during
negotiation. Automatic-selection (22 cases), existing remux regressions (six cases),
the eight-case Chrome packaging matrix and four unit contracts also passed in
separate recorded runs. [Final manifest](final-manifest.json) records source and
binary identities; [starting manifest](starting-manifest.json) preserves the prior
routing-completion snapshot.

These are controlled capability/SourceBuffer rejection injections, followed by real
visible playback in the selected container. They do not qualify arbitrary malformed
media. Per-case numbers are preserved in [metrics.json](metrics.json), without
pooling Chrome and Firefox or retry attempts. For example, Chrome's MP4-probe-denial
case reached its first playable WebM fragment in 492 ms after fetching 65,536 source
bytes; Firefox's corresponding case took 591 ms and 131,072 bytes. Those are single
functional observations, not startup performance estimates. Across these cases the
recorded MSE queue depth stayed at one and peak buffering was approximately six
seconds. Initialization-retry latency in a successful session excludes the failed
attempt; use the complete session list when accounting for total recovery cost.

```sh
bash scripts/build-remux.sh
npm run build
node --test tests/remux-packaging-contracts.mjs tests/remux-buffering.mjs
node tests/remux-negotiation.mjs
BROWSER=firefox node tests/remux-negotiation.mjs
node tests/remux-negotiation-lifecycle.mjs
HEADLESS=0 node tests/remux-packaging.mjs
npm run test:automatic-selection
node tests/remux-regressions.mjs
```

Boundaries: `web/remux-packaging.js`, `web/native-remux-worker.js`,
`web/native-remux-player.js`, `native/remux/remux.c`, and Native's suppression of
intermediate media errors during an internal restart. The new native export only
selects one of the validated muxers before output creation. All existing experiments
and failed artifacts remain preserved. Long GOP, VFR, configuration changes, exact
priming/A/V timing and wider browser qualification are not implied by these tests.
