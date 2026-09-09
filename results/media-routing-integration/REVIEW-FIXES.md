# Native remux review fixes

The three review findings are fixed in the maintained JavaScript sidecars. No
Wasm rebuild or public-mode change was required.

- Source and mux workers now handle script/runtime and message errors. Source
  initialization has a ten-second deadline; failed restart attempts stop workers.
  Failed candidate opens leave the previous public player usable.
- The controller retains the remote source's initial strong ETag and length across
  seek and audio-track restarts. New source workers seed the range reader with that
  identity before fetching, so the first request carries the original `If-Range`
  and changed metadata rejects before reaching the remuxer. A new explicit public
  source open gets a fresh controller and may accept a new representation. Sources
  without ETags still rely on the caller's explicit immutable contract.
- Seek validation runs before generation changes, worker termination or MSE reset.
  Non-finite, negative and at/beyond-end requests reject without clearing playback.
  End requests are rejected rather than clamped; the prior session remains usable.

[Regression run](review-fixes-2026-09-09T18-16-42.571Z/result.json): **6/6 pass** in
Chrome 152.0.7977.83. Covers blocked source/mux scripts, an initialized but silent
source worker, invalid/end-boundary seeks, changed ETags, and changed lengths.
Each case checks teardown to zero workers. Rollback/invalid-seek cases resume actual
playback; a fresh explicit open successfully accepts the changed ETag. Runtime
source hashes are recorded in the result.

[Existing Native integration cases](chrome-2026-09-09T18-16-20.547Z/result.json):
**4/4 pass**, covering automatic TS fallback, MKV with WebVTT, remote authorization
renewal, distant/backward/repeated seeks, and cleanup. These are functional checks,
not a new performance or endurance claim.

The earlier regression run is preserved. Its silent-worker test response lacked
worker isolation headers, causing a script-load error instead of testing the
initialization deadline; the final test supplies those headers.

```sh
npm run test:remux-regressions
CASES=native-ts-fallback,native-mkv-forced,native-remote-auth,native-seek-stress node tests/media-routing.mjs
```

Implementation changes are confined to `web/native-remux-player.js` and
`web/native-remux-source-worker.js`, with a new `tests/remux-regressions.mjs` and npm
script. Earlier work and recorded results remain in place. No commit or push.
