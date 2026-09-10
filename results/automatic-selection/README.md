# Automatic selection verification

Base: `ecbde8f` on `main`. Implementation and checks are uncommitted in this worktree.
[Policy and limitations](../../docs/AUTOMATIC-SELECTION.md), [source/engine hashes](manifest.json),
[preservation check](preservation.json).

| Check | Evidence | Outcome |
| --- | --- | --- |
| Final automatic selection | [run-2026-09-09T20-21-36.017Z](run-2026-09-09T20-21-36.017Z/result.json) | 18/18 pass |
| Final public API compatibility | [functional-2026-09-09T20-23-11.617Z](../player-api/functional-2026-09-09T20-23-11.617Z/result.json) | 21/21 pass |
| Existing remux failure regressions | [review-fixes-2026-09-09T20-16-20.626Z](../media-routing-integration/review-fixes-2026-09-09T20-16-20.626Z/result.json) | 6/6 pass |
| Unit checks | [unit-tests.log](unit-tests.log) | 37/37 pass |
| Demo automatic/manual/filter controls | [demo.json](demo.json), [screenshot](demo.png) | Pass; no errors, zero workers after destroy |

Automatic tests use Chrome **152.0.7977.83**, with Firefox **146.0.1** for the real
HEVC browser-rejection case. Tests exercise visible media surfaces in headless browser
execution, advance playback, inspect the actual chosen mode, and assert worker cleanup.
These are functional checks, not an endurance or CPU comparison.

The final automatic run covers:

1. Qualified Native direct playback.
2. Native progressive remux after TS direct rejection, including a seek.
3. Embedded ASS requiring Hybrid.
4. Native-incompatible AC-3 audio with HEVC video selecting Hybrid.
5. MPEG-4 Part 2 selecting Software.
6. Actual Firefox HEVC rejection selecting Software.
7. A new source returning to Native after the previous source required Software.
8. CPU filters selecting Software and removal permitting Native again.
9. Explicit mode pinning and returning to automatic selection.
10. Hybrid runtime-error recovery preserving playback intent, rate and volume.
11. Native runtime-error recovery trying remux before another public mode.
12. Enabling embedded subtitles triggering reselection.
13. Terminal source-identity errors stopping the chain.
14. A real changed-range response retaining the original `If-Range` and refusing fallback.
15. Authenticated remote playback with credential renewal through inspection and remux.
16. Disabled audio/subtitle selections remaining disabled across reselection.
17. All routes failing without replacing the previous working source.
18. Destroy during asynchronous probe loading.

Runtime-error cases inject backend error events to exercise the recovery policy while
real media is open; they do not simulate every browser/GPU decoder failure. The changed
range test overrides HTTP status/ETag responses at the browser boundary. The Firefox
case is an actual decoder-configuration rejection, not an injected capability result.

Earlier runs are retained. The first run's decoder-rejection injection did not affect
the nested decoder worker, so that case correctly failed its expected-mode assertion;
the final suite uses actual Firefox rejection instead. Later runs add source-integrity
and disabled-track regressions and should not be pooled into performance statistics.

Automatic Native inspection now loads Wasm even when direct playback wins. This extra
startup cost is not benchmarked here. Explicit Native remains the direct-only/Wasm-free
option when remux is unnecessary. No new hardware-acceleration, zero-copy, HDR, audio
quality, channel-layout or universal-container claim follows from route selection.

Previously tracked experiment and results files are unchanged. New runs have distinct
paths. The remux engine was rebuilt to add packet-only `rm_probe`; older measured
engine hashes remain historical rather than being relabeled as tests of the new binary.

```sh
npm run build
WEBMPV_REMUX_FFMPEG_DIR="$PWD/build/pipeline-qualification/ffmpeg-remux" npm run build:remux
npm run test:automatic-selection
npm run test:api
npm run test:remux-regressions
node --test tests/native-selection.mjs tests/video-codec-config.mjs tests/retained-codec-worker.mjs tests/audio-worklet.mjs tests/retained-video.mjs tests/timing-coalescing.mjs tests/resource-loader.mjs
```
