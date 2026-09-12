# Public API and component qualification

Implementation baseline: working files matched demo-source 8bb451b while main was
f9a8f9c. No branch was merged or published. The pre-change source snapshot is
build/public-api-baseline/source-before.tar.gz. Historical results and failed
artifacts are retained.

## Milestone status

| Milestone | Implementation | Qualification boundary |
| --- | --- | --- |
| M0 | Public contract, component contract, migration notes | Source-reviewed against current transaction/engine owners |
| M1 | Immutable snapshots, subscriptions, typed events, media geometry/tracks, capabilities | Real Native/Hybrid/Software tests; unknown/live-window mappings have separate adapter-injection evidence |
| M2 | Additive commands, stable IDs, cancellation, close/reopen, idempotent teardown, structured/redacted errors | Real rollback, stale-event, mute, track transition, seek and cleanup checks |
| M3 | Same-origin runtime base, verified copy CLI, static and bundled entry points, SSR-safe imports | Exact archives installed into independent static and esbuild apps at two runtime paths |
| M4 | Optional custom element and migrated playground, same core | Two independent instances, source changes, removal/reconnect and actual fullscreen |
| M5 | Keyboard, semantic controls, accessible names, focus restoration, live announcements, styling hooks | Chrome/Firefox keyboard and accessibility-tree checks; manual screen-reader and physical touch sessions remain open |
| M6 | Tests, examples, package evidence, overhead samples | Local candidate qualification only; clean three-engine builds, Safari/mobile, physical output and release gates remain open |

Archive-specific qualification is generated **after** assembly, alongside the
archive as qualification.json. An embedded copy of this document describes the
build-time status; it cannot contain its own archive hash. Consult the accompanying
record and the repository results for final pass/fail status and test hashes.

## Reproducible commands

```sh
npm run build
node --test tests/public-api-state.mjs
node tests/public-api.mjs
BROWSER=firefox node tests/public-api.mjs
node tests/player-component.mjs
BROWSER=firefox node tests/player-component.mjs
node tests/autoplay-policy.mjs
BROWSER=firefox node tests/autoplay-policy.mjs
node tests/player-api.mjs
node scripts/media-server.mjs # separate terminal; synthetic origins 4180/4181
node --test tests/range-reader-deadline.mjs tests/range-reader.mjs \
  tests/audio-worklet.mjs tests/resource-loader.mjs tests/streaming-expansion.mjs \
  tests/remux-buffering.mjs tests/video-codec-config.mjs \
  tests/retained-codec-worker.mjs tests/native-selection.mjs
ONLY='Live,External,HLS,Finite DASH,Audio device' node tests/compatibility-expansion.mjs
node tests/player-ui-overhead.mjs
npm install --prefix build/public-api-tooling --no-audit --no-fund esbuild@0.28.2
python3 scripts/package-beta.py --output build/public-api-release-candidate
BETA_ARCHIVE=build/public-api-release-candidate/webmpv-0.3.0-beta.2.tgz node --test tests/copy-assets.mjs
BETA_ARCHIVE=build/public-api-release-candidate/webmpv-0.3.0-beta.2.tgz node tests/public-api-consumer.mjs
BETA_ARCHIVE=build/public-api-release-candidate/webmpv-0.3.0-beta.2.tgz BROWSER=firefox node tests/public-api-consumer.mjs
BETA_ARCHIVE=build/public-api-release-candidate/webmpv-0.3.0-beta.2.tgz node tests/beta-streaming.mjs
BETA_ARCHIVE=build/public-api-release-candidate/webmpv-0.3.0-beta.2.tgz BROWSER=firefox node tests/beta-streaming.mjs
```

Results go to timestamped results/public-api/, results/player-component/,
results/public-api-consumer/, results/beta/ and existing regression directories.
The archive tests record SHA-256, browser version, consumer root and case results.
The esbuild application imports only shipped package entry points and copies its
runtime via the shipped command. No repository-specific browser code is needed.

## Interpreting evidence

The prior 21-case API suite, 73 reader/routing/audio unit checks and focused HLS,
DASH, subtitle/font and audio-device regressions passed during this work. New
normalized-state and component suites exercise real engines, while explicitly
labeled adapter injection tests cover unknown metadata and live-window mapping.
They do not certify every live demuxer or codec. Browser isolation and missing
assets are tested as distinct errors. Missing assets must be rejected at the HTTP
origin because worker fetch interception differs across automation engines.

Autoplay checks must not run evaluation polling while the initial play request
is pending: automation evaluation can grant transient activation. Chrome rejected
Native and Hybrid and resumed after a click. Firefox rejected Native but allowed
the Web Audio Hybrid path in the observed environment; that difference is not
reported as a codec failure or an invented autoplay rejection.

The UI adds no engine polling. The short overhead harness compares the same
example.mp4, mode and 1920×1080 output for four seconds, using browser main-thread
ScriptDuration. Those samples describe UI/event work only, not full engine CPU,
real-time output quality, sustained playback or a performance improvement.

The in-app browser plugin could not connect because an installed module was
missing. Qualification used standalone real Chrome/Firefox automation. No manual
VoiceOver/NVDA session, physical touch, Safari, PiP, casting, physical HDR/surround
fidelity or independent clean build of all three engines is claimed. GPL/source
obligations and the release gate in RELEASE.md remain intact. The public Pages
site has not been updated by this work.

## Archive-specific record

The final archive hash and exact result paths are recorded after assembly in the
accompanying qualification.json and in the working repository's final report.
This embedded build-time statement deliberately contains no self-referential
archive hash. Earlier candidates, failures and their evidence remain preserved.


## Final local candidate — 2026-09-12

Artifact: `build/public-api-release-candidate/webmpv-0.3.0-beta.2.tgz` (17,845,779 bytes).

SHA-256: `2b7d99731bb05c33d8d24648550fafda90c4ad13968d2dbbdb777ef48421bb4a`.

The package assembled alongside `build/pages-api-release-candidate` is byte-identical.
Every packaged manifest entry was verified. Generated core/component files match the
working implementation; all three shipped Wasm binaries match the previous Pages
manifest. These are existing engine binaries, not newly qualified clean engine builds.
The final report is external to the archive to avoid a self-referential archive hash.

| Suite | Chrome 152.0.7977.83 | Firefox 146.0.1 | Evidence scope |
| --- | --- | --- | --- |
| Normalized core | 14/14 | 14/14 | Current core source hashes |
| Component | 14/14 | 14/14 | Current component source hashes, including release of retry sources |
| Clean static and esbuild consumers | 8/8 | 8/8 | Exact archive; two runtime bases, all three modes, SSR/types/import isolation |
| Streaming/seek | 6/6 | 6/6 | Exact archive; packet integrity, absolute deadline, cleanup |
| Local Pages assembly | 8/8 | 8/8 | Matching packaged runtime manifest; no public deployment |
| Autoplay policy | 2/2 | 2/2 | Recorded browser policy behavior, including Firefox allowing Hybrid |

Additional checks: 4 asset-copy tests, 5 pure state/error tests, 73 existing unit
checks, 21 existing API cases and 7 focused compatibility cases passed. The actual
`npx --offline webmpv copy-assets npx-runtime` command copied 96 verified assets
from a clean installation of this archive. Exact paths, result hashes, CLI output,
source/build-material archive hashes and qualification boundaries are recorded in
`build/public-api-release-candidate/qualification.json`.

A Pages harness failure is retained at
`results/pages/firefox-2026-09-12T14-06-43.067Z/result.json`.
The harness could mistake the previous source's idle operation state for completion
of the asynchronously fetched example. The final harness explicitly waits for a
new accepted source identity. This test-only correction does not change package
bytes. Historical candidates and failures remain preserved.

Four-second matched playback samples measured core/component main-thread script
work of 4.027/6.377 ms (Native), 44.603/57.464 ms (Hybrid), and 19.553/32.696 ms
(Software). Notification counts were equal within each pair: 19, 129 and 129.
These earlier short samples are not engine CPU or sustained performance claims.

The implementation is complete for the stated scope. M5's manual screen-reader
and physical touch gate and M6's broader browser/clean-engine/release gates remain
open as listed above. No commit, push, merge or publication was performed.


## Review corrections — 2026-09-12

The candidate above is historical and predates three review corrections: external
subtitle identities no longer alias their per-file stream indices; unrecovered
fatal mpv end-file events populate the structured session error before notification;
and caller cancellation is detached at source acceptance, before subscribers run.
Instance close/destroy retain their internal cancellation authority.

`tests/public-api.mjs` now includes real two-attachment selection and cross-mode
retention, fatal-event adapter injection for each public mode, and synchronous
abort-at-sourcechange checks in Native and Software. The existing pre-acceptance
cancellation, rollback, stale-event and bounded-close checks remain in that suite.
`tests/public-api-state.mjs` additionally checks external/embedded ID separation.
New timestamped results and a separate review-fix archive preserve the previous
candidate and its evidence. The review does not change the release gates above.

Review-fix validation: Chrome 152.0.7977.83 and Firefox 146.0.1 each passed
20 normalized API cases and 8 clean static/bundled consumer cases. The 6 state
unit tests and TypeScript build passed. The archive is
`build/public-api-review-fixes/webmpv-0.3.0-beta.2.tgz`, SHA-256
`806b07a4c7fc7df8c96781cc69b0f0fa77984f062ec0a51bf8ab0caef700bc42`. Its manifest hashes and generated runtime
match the working build; the Wasm engines are unchanged. Detailed result hashes
are in the accompanying `qualification.json`. Broader historical suites were
not rerun for these targeted core corrections.
