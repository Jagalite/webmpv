# Automatic selection review fixes

Four regressions are covered in the linked automatic-selection run:

- A changed ETag is rejected during Native remux to Hybrid recovery; the replacement sends the original If-Range on its first request. The test changes the validator, not the fixture bytes.
- A second injected decoder failure at replacement selection proceeds to Hybrid instead of being swallowed.
- Explicit Japanese audio survives the Native remux to Software transition caused by hflip; FFmpeg source stream indices establish identity.
- Destroy resolves while the probe module response remains indefinitely withheld, and the pending open rejects.

These are correctness tests, not new performance or cross-platform qualification claims. Decoder failures are injected at the backend event boundary. Existing visible playback checks remain in the automatic suite. Source identity is carried by the bounded RangeReader routes; ordinary media-element HTTP requests cannot set If-Range.

Reproduce:

```sh
npm run test:automatic-selection
node scripts/media-server.mjs
# In another terminal, while the fixture server is running:
node --test tests/range-reader.mjs
node tests/player-api.mjs
```

The initial sandboxed range-test invocation was denied loopback access (EPERM). Its rerun with fixture-server access passed all 11 tests. Automatic selection passed 22 browser cases plus 3 eligibility unit tests; the public Player API suite passed all 21 cases. See manifest.json for exact source hashes and result paths. Prior run artifacts are preserved.
