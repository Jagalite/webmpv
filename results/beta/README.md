# Beta preparation

This is a standalone beta candidate, not a production qualification or a new public
mode. Native direct → Native packet-copy remux/adaptation → Hybrid → Software remains
the route order. Software's default presenter is RGB; YUV is excluded from the
standard package and remains explicitly experimental.

## Implemented changes

A conservative JavaScript selector admits simple local MP4 from bounded actual
metadata, not filename or MIME. It checks complete track enumeration, self-contained
data references, AVC configuration, AAC-LC mono/stereo configuration and browser
admission. Unknown, encrypted, multi-track, large-index or unfamiliar configurations
retain the FFmpeg inspector. The local metadata budget is 256 KiB plus 2 KiB headers.
Remote sources keep existing source/permission/identity inspection; automatic remote
Native startup is not optimized in this increment. Actual Native playback still
must succeed. The original source is neither remuxed nor transformed by this check.

Clean-consumer testing found Firefox rejects the generic `avc1` string after accepting
an exact configuration. The selector now carries the exact inspected string into the
final Native admission check. A unit regression covers that false-negative path.

The README now distinguishes implemented bounded File streaming from its remaining
endurance/device qualification. Existing >4 GiB sparse-file and 259 MB movie results
remain authoritative functional evidence, not a promise of long-duration stability.

## Standalone package

`python3 scripts/package-beta.py` produces `build/beta/webmpv-0.3.0-beta.0.tgz`.
The archive contains the reusable API, workers, three current engine assets,
AudioWorklet, fonts, notices and a per-asset SHA-256 manifest. Relative paths are
preserved. `--yuv` adds an optional engine without changing any default.
[Installation and engine recipe](../../docs/BETA.md) describes the static asset mount,
isolation headers, source/build prerequisites and independent-build gate.

The consumer test installs the archive offline into a new temporary application's
`node_modules`, verifies every shipped asset against its manifest, and serves only
that installation and copied media. Runtime files are not loaded from this checkout.
Each result records the archive hash, manifest, requests, browser and consumer path.

Initial Chrome consumer run: 10/10. Initial Firefox exposed four failures: three
false Native rejections due to generic AVC and a missing-engine fault injection that
never reached the worker. These failed artifacts are retained. The corrected test
injects an actual HTTP 404 at the consumer origin, including Firefox worker requests.
Final Chrome and Firefox consumer runs each pass 10/10: automatic local Native,
explicit Native without isolation or Wasm, Hybrid/Software pins, ASS→Hybrid,
Native remux, transitions, rollback, missing engine and isolation failure. Each
successful/error scenario requires complete worker/surface cleanup.

## Startup observations

[Six visible Chrome trials](startup-2026-09-10T04-25-59.973Z/result.json) used the
same `fixtures/example.mp4`, dimensions and fresh browser instances. The control
forces the preexisting deep inspector through a test-only module replacement.
Every arm selected Native and reached a presented-frame callback, with foreground
verification and zero workers after cleanup. This is startup measurement, not CPU
or physical audible-startup qualification.

| Plan | Presented callback latency, ms (each trial) | Median, ms | Inspector Wasm requested |
| --- | --- | ---: | ---: |
| Deep inspection | 1085.6, 399.9, 402.4 | 402.4 | 3,011,212 bytes |
| Cheap local metadata | 390.5, 376.5, 578.2 | 390.5 | 0 bytes |

The cheap inspector read 16,329 source bytes. Browser-native media reads are not
included in that counter. Ranges overlap and the first deep run is an outlier; three
trials per path cannot establish a reliable latency win. Avoiding the inspector's
Wasm request is directly verified. No claim about all MP4 files or remote startup
follows from this deliberately narrow test.

## Reproduce

```sh
npm run build
node --test tests/cheap-mp4-probe.mjs tests/native-selection.mjs tests/file-reader.mjs tests/remux-buffering.mjs tests/remux-packaging-contracts.mjs
python3 scripts/package-beta.py
node tests/beta-consumer.mjs
BROWSER=firefox node tests/beta-consumer.mjs
node tests/automatic-selection.mjs
node tests/selection-startup.mjs
node tests/beta-remux-storm.mjs
node experiments/software-yuv-integration/seek-isolation.mjs
```

Run visible measurements without concurrent builds or other test browsers. Never
combine these startup observations with old decoder benchmarks or the failed movie
comparison. Package assembly repeatability and clean-consumer behavior do not prove
independent engine-build reproducibility.

## Remaining release gates

Physical A/V sync, priming and exact seeking; hour-long memory/resource stability;
remux discontinuities/configuration changes and retries; Safari/mobile/device
coverage; HDR/color and explicit multichannel-output policy; source-build
reproducibility and qualification of the exact shipped archive. The current mpv
AudioWorklet output is stereo. No implicit full HDR or multichannel support is claimed.
Keep all YUV failures and historical limitations visible; passing retries and short
ASS results do not authorize promotion. No commit, push or registry publication is
part of this work.

## Shared seek-read correction

The diagnostic reproduced partial-packet/invalid-NAL errors and seek timeouts in
both default RGB and YUV, using the same Software engine/source contracts. The old
seek hook interrupted a pending `stream_cb` read. That returned a short/error result
to FFmpeg in the middle of a packet. The maintained Software and Hybrid workers now
let the bounded read complete and let mpv discard obsolete demux data itself.
Source replacement and destruction still cancel I/O. Slow-source seek latency is
an explicit remaining tradeoff; no native engine or decoder defaults were changed.

The initial diagnostic's worker interception omitted isolation headers, invalidating
its disabled-interruption arms; those failures are retained. The corrected disabled
control passed 3/3 rounds and nine exact target-PTS checks. The maintained fix then
passed 12/12 RGB/YUV × File/remote trials, covering 36 exact targets. Reinstating the
archived old worker reproduced the failure again in RGB; its YUV arm passed,
consistent with the original intermittence. This is a controlled correction, not
promotion based solely on a passing retry.

Both full YUV correctness suites pass 11/11 after the correction (Chrome and Firefox),
including filtered seeks, color, subtitle lifecycle and expected unsupported-output
rejection. The public API passes 21/21 and automatic routing 22/22. These scoped
checks do not replace seek-storm/endurance qualification on every source profile.

## Current visible movie comparison

[Four matched arms](../software-yuv-integration/visible-2026-09-10T04-42-34.979Z/result.json)
used the corrected workers, identical movie bytes staged under `/tmp`, an Apple M1
with 8 GiB RAM on AC power, Chrome 152.0.7977.83, 1920×1080 canvas displayed at
960×540, selected audio enabled, no subtitles/filters, target 236.9 s, 10 s warmup
and 30 s measurement. Foreground matching, playback clock, drops and cleanup gates
passed in all four arms. No concurrent test browser or engine build ran.

| Arm | Presenter | CPU (% of one core) | Mean summed process RSS (MiB) | Frame counter/s |
| --- | --- | ---: | ---: | ---: |
| 0 | RGB | 48.28 | 1346.2 | 29.93 |
| 1 | YUV | 37.38 | 1274.6 | 29.93 |
| 2 | YUV | 33.88 | 1071.7 | 29.93 |
| 3 | RGB | 43.23 | 1339.2 | 29.89 |

All arms recorded zero presentation/decoder drops and zero audio underruns; maximum
reported absolute A/V error was under 14 ms. Workers closed and YUV texture ownership
returned to zero. CPU sums CDP browser process deltas, excluding WindowServer,
external VideoToolbox and HTTP-server cost. Summed RSS can double-count shared pages.
Frame counters include redraws; internal GPU copies are not measured. YUV retains
three explicit plane uploads per frame. This short comparison is promising, not a
universal CPU/memory claim or long-duration qualification. Do not combine it with
the earlier failed movie run or short ASS results. YUV remains experimental.

## Final local startup and cancellation

Final review replaced the fast probe's bounded `arrayBuffer()` slice reads with the
existing cancellable `LocalFileReader`. A blocked-read abort regression passes. This
avoids leaving automatic selection waiting on an obsolete metadata read.

[Fresh six-arm startup run](startup-2026-09-10T04-48-34.311Z/result.json), after that
correction: deep presented-callback times were 574.8, 400.2 and 395.1 ms (median
400.2); cheap times were 357.0, 357.8 and 361.3 ms (median 357.8). All six passed.
The cheap path still reads 16,329 metadata bytes and requests no inspector Wasm.
This run is separate from the earlier overlapping distributions; three observations
per plan are not a general latency guarantee. Remote startup remains unchanged.

## Recovery and A/V observations

The remux stress test passed 100 overlapping seek requests in ten bursts, accepting
the final target of each burst and rejecting obsolete work cleanly. It then played
for 121.6 seconds, including EOF recovery. Peak MSE queue depth was one; recorded
buffered compressed bytes peaked at 701,581 and buffered duration at 8.53 seconds.
All workers closed. These counters establish bounded application buffering in this
fixture, not total browser/driver memory or hour-long endurance.

[Current Native/remux A/V run](av-sync-2026-09-10T04-48-48.477Z/result.json) passed
7/7 browser-clock flash/beep checks: direct/remux MP4, remux MKV, edit-list inputs,
and a +250 ms audio-offset fixture. Non-offset observations ranged approximately
12–54 ms; offset observations were 263–269 ms against the expected 250 ms. The
predeclared threshold was ±100 ms. This is not sample-accurate or physical A/V
qualification: it maps an AudioWorklet onset through `getOutputTimestamp` and
compares `requestVideoFrameCallback.expectedDisplayTime`, skips startup pulses and
observes only a few seconds. Priming, physical display/speaker latency and drift
remain release gates.

## Final candidate and verification map

The final artifact is `build/beta-candidate/webmpv-0.3.0-beta.0.tgz`:

```text
SHA-256 826086f20701a6793252f72568b591cc28723709a2ce0fbe2bd257519a722893
```

Two independent assembly invocations produced this exact archive hash. This checks
archive assembly only, not independent native engine builds. The
[candidate manifest](candidate-manifest.json) ties source hashes, archive identity,
fixture identity and individual run records together. The
[shipped release manifest](release-manifest.json) lists runtime asset hashes.
The final archive's current runtime files match the checkout.

[Final Chrome consumer](consumer-chrome-2026-09-10T04-47-46.542Z/result.json) and
[final Firefox consumer](consumer-firefox-2026-09-10T04-48-06.800Z/result.json) each
passed ten core scenarios and a TypeScript consumer import check. Separate
same-archive tests also passed clean rejection/cleanup when the excluded YUV engine
was explicitly requested. The final isolated unit set passed 19/19. Large-file
regressions after the seek correction passed 8/8 in each browser, including sparse
>4 GiB files, the 259 MB movie with track-preserving fallback/queued seeks, and
blocked-read destruction. Exact paths are in the candidate manifest.

To reproduce this final candidate rather than an earlier intermediate assembly:

```sh
npm run build
python3 scripts/package-beta.py --output build/beta-candidate
BETA_ARCHIVE=build/beta-candidate/webmpv-0.3.0-beta.0.tgz node tests/beta-consumer.mjs
BETA_ARCHIVE=build/beta-candidate/webmpv-0.3.0-beta.0.tgz BROWSER=firefox node tests/beta-consumer.mjs
```

The consumer runner now includes the omitted-YUV case in its default set (eleven
cases); the recorded final core and omitted-engine runs are separate artifacts.
Failed test records, invalid intervention records and historical benchmarks remain
preserved. Earlier retained candidate build directories are left in place.

| Capability | Implemented | Current functional evidence | Performance/endurance status |
| --- | --- | --- | --- |
| Cheap local MP4 admission | Yes, bounded and cancellable | Unit and consumer checks in Chrome/Firefox | Narrow startup measurements; remote path unchanged |
| Three-mode standalone package | Yes | Offline install, TypeScript, loading, routing, errors, cleanup | Not a production release; clean engine-build reproduction open |
| Shared seek-read correction | Yes, RGB/Hybrid/YUV worker paths | Controlled old/new comparison, API and large-file regressions | Slow-source seek latency and broad endurance still open |
| Native remux recovery | Yes | 100 overlapping seeks, 121.6 s bounded playback, seven A/V scenarios | Browser-clock estimates only; hour-long/physical A/V gates open |
| Software YUV | Opt-in only | 11/11 Chrome and Firefox correctness checks | Four short matched movie arms pass; no default promotion |

Keep the initial beta scope to the tested desktop browsers/host and inline SDR
stereo playback. Safari/mobile, physical A/V/priming, HDR/multichannel fidelity,
fullscreen/PiP/remote-output behavior and sustained resource qualification need
separate evidence. They are not inferred from these functional checks.
