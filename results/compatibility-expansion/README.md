# Compatibility expansion closeout

All eight scoped additions are implemented in `0.3.0-beta.1`. See the
[support/API contract](../../docs/COMPATIBILITY-EXPANSION.md) and
[machine-readable verification](verification.json).

| Verification | Result | Record |
| --- | --- | --- |
| Compatibility unit checks | 38/38 | [Acceptance log](acceptance.log) |
| New compatibility browser scenarios | 26/26 | [Frozen-input Chrome run](2026-09-11T16-52-40.192Z/result.json) |
| Existing API browser regressions | 21/21 | [API run](../player-api/functional-2026-09-11T16-54-35.960Z/result.json) |
| Automatic selection | 22/22 | [Routing run](../automatic-selection/run-2026-09-11T16-55-37.870Z/result.json) |
| Existing remux regressions | 6/6 | [Remux run](../media-routing-integration/review-fixes-2026-09-11T16-56-33.805Z/result.json) |
| Large-file regressions | 8/8 | [File run](../routing-completion/large-files-2026-09-11T16-57-27.566Z/result.json) |
| Clean Chrome consumer | 17/17 | [Consumer record](../beta/consumer-chrome-2026-09-11T16-57-32.489Z/result.json) |
| Clean Firefox consumer | 17/17 | [Consumer record](../beta/consumer-firefox-2026-09-11T16-57-32.490Z/result.json) |

The regression command also passed its 13 API dependency, six Native-selection and
four File-reader unit checks. Six AudioWorklet checks overlap the compatibility
suite; these counts are executions, not unique new tests. The browser records total
117 successful scenario executions. Consumer tests installed the archive offline,
type-checked it, verified all asset hashes, exercised the new APIs, and checked
worker/surface cleanup.

The local archive is `build/compatibility-beta/webmpv-0.3.0-beta.1.tgz`.
SHA-256: `cc9c336b4ff535df5907d77ceed17cf400dd65de9315916dda5a37eecc86096d`.
A second assembly in `build/compatibility-beta-repeat` is byte-identical. This proves
repeatable packaging of these artifacts, not independent clean-engine reproducibility.
Both consumers used this exact archive; its runtime hashes match the frozen-input
compatibility run. The source remains a local, uncommitted change set.

The suite proves 8/10-bit Software AV1, 4K input rendered at 1080p, lower-budget
rollback, custom-font glyph changes, external SRT/ASS selection and seeks,
channel-by-channel 5.1/7.1 PCM, PQ/HLG-to-SDR reference colors, HLS rendition and
segmented subtitle handling, DASH video-only and A/V period transitions, basic live
HLS/DASH, and bounded remux recovery. The six/eight-channel graph uses a virtual
output device; it does not certify physical speakers. Source 4K decoding is not a
real-time performance promise. Safari/mobile, physical HDR/surround, sustained
endurance and independent clean builds remain release qualification work. The
optional YUV engine was rebuilt for the new ABI and remains experimental.

Earlier timestamped runs in this directory are development replays. Their failures
and changed-input flags are retained; only the frozen-input run above is final
acceptance. The original format matrix is also retained. Its invalid comfort-noise
sample rate and malformed RealMedia fixture are distinguished from implementation
fixes in the support contract. No user source media was modified.
