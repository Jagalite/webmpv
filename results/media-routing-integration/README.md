# Broader Hybrid and integrated Native remux

Maintained integration on `main`, base `41e3ba2d3b85a7520ded73be4c51bc8e2a31a496`.
No commit or push. [Findings and routing contract](../../docs/MEDIA-ROUTING.md),
[runtime/fixture hashes](runtime-manifest.json), [environment](environment.json),
[original-file preservation audit](preservation.json).

## Authoritative runs

| Run | Outcome |
| --- | --- |
| [Chrome full integration](chrome-2026-09-09T15-55-16.412Z/result.json) | 12/12 pass: Native direct; Hybrid AVC, HEVC/AC-3, VP8/Vorbis, VP9/Opus, AV1, 10-bit HEVC, AVC Annex B TS; Native TS fallback, MKV/WebVTT, remote auth, seek stress. |
| [Public API regression](../player-api/functional-2026-09-09T15-55-16.409Z/result.json) | 21/21 pass, including ASS, mode/filter changes, rollback, seeking, retained ownership and cleanup. The unsupported-Hybrid fixture is now MPEG-4 Part 2, since VP9 is supported. |
| [Firefox](firefox-2026-09-09T15-56-16.482Z/result.json) | 6 playback cases pass; HEVC and 10-bit HEVC reject their actual browser configuration. The harness reports these as failures because it requests successful playback for each case. They are explicit capability rejections, not demonstrated playback support. |
| [WebKit](webkit-2026-09-09T15-59-55.999Z/result.json) | 4/4 pass: Native direct, Hybrid AVC and VP9, Native MKV remux with WebVTT. Playwright WebKit is not a qualification of shipping Safari or iOS. |
| [Unit regression](unit-tests.log) | 34/34 pass, including codec configuration, invisible packets, ownership, audio ring, timing and resource contracts. |
| [Range transport](range-tests.log) | 11/11 pass with the local fixture service. An earlier sandboxed invocation could not connect; this is the successful network-enabled rerun. |
| [TypeScript](typescript.log) | Build passed. |

The Chrome integration run uses Chrome 152.0.7977.83 on Apple M1, macOS 26.5.2,
AC power. Tests present actual frames into visible page surfaces in headless browser
execution, advance playback, pause/seek, capture screenshots, and destroy players.
They are not stage-removal tests. The API and Chrome routing runs overlapped, so
startup timings below are **observations, not controlled performance comparisons**.
CPU/RSS, first audible sample, decoder hardware status, browser-internal pixel
uploads and sample-exact A/V markers were not measured in these short checks.

## Observed results from the single Chrome full integration run

| Case | Public open, ms | First playable remux region, ms | Source bytes by playable region |
| --- | ---: | ---: | ---: |
| Native direct | 344 | — | Not instrumented |
| Hybrid AVC | 1,189 | — | Local fixture materialized under existing mpv limit |
| Hybrid HEVC / AC-3 | 492 | — | Same local-file policy |
| Hybrid VP8 / Vorbis | 484 | — | Same local-file policy |
| Hybrid VP9 / Opus | 441 | — | Same local-file policy |
| Hybrid AV1 | 529 | — | Same local-file policy |
| Hybrid 10-bit HEVC | 838 | — | Same local-file policy |
| Hybrid AVC Annex B TS | 586 | — | Same local-file policy |
| Native TS fallback | 1,024 | 551 | 1,356,000 (includes rereads of a 778,320-byte source) |
| Native forced MKV / WebVTT | 1,177 | 47 | 4,035,849 of 9,039,757 bytes |
| Native authenticated remote MKV | 359 | 187 | 196,608 of 248,479,294 bytes |

The remux-region timer starts inside controller restart and ends once useful MSE
buffer is available. It excludes some public admission/import time and is not a
first-audible-sample or compositor-presentation measurement. Bytes are fetched/read
counts and can count the same source ranges multiple times. They do not prove unique
coverage. The short TS and MKV cases reach EOF within the forward-buffer budget;
complete-file processing **did occur**, but is not required before long-source startup.
The 248 MB remote source started from about 192 KiB fetched and did not reach EOF
in the tested seek sessions. No complete remux output is accumulated before playback.

The remote-auth case at its playing snapshot has a 6.037-second buffered range,
561,054-byte compressed-buffer upper bound, 589,824-byte source cache, 64 MiB Wasm
heap, and peak MSE queue depth one. Its first media fragment is 65,159 bytes; the
record lists each later fragment separately. Native internal audio-underrun and
separate decoder-drop counters are unavailable. Its reported video drops are zero.

The separate `native-seek-stress` case in this same run seeks to 120, 12, 240 and
2 seconds in 435, 717, 561 and 132 ms respectively, each finishing at the requested
source time. Four queued public seeks end at 4 seconds in 1,674 ms. They are serialized,
not coalesced. Across this case's sessions: peak coded buffer upper bound 6,238,455
bytes, peak buffered range total 11.451 seconds, MSE queue depth one, and zero pending
bytes observed discarded at cancellation. Each cancellation separately records old
retained compressed data and an 8 MiB in-flight output bound; zero observed pending
bytes does not mean no worker work/data was discarded. The source remains bounded
rather than retaining every remuxed destination region.

All seven Hybrid cases in the full run report actual retained browser frames,
zero application video-plane copy-back milliseconds, zero sampled presentation and
decoder drops, and zero sampled audio underruns. These brief samples cannot establish
long-playback rates or A/V fidelity. Every successful case ends with zero workers;
Hybrid ownership accounting balances received/closed retained frames and leaves no
pending/retained frames. The screenshots include actual 10-bit HEVC presentation
and a Native WebVTT cue still active after seeking inside its interval.

No new whole-browser CPU savings or native-equivalent efficiency is claimed. Do not
combine these observations with the earlier prototype CPU/endurance runs.

## Development failures and uncertainty

Earlier timestamped directories are retained, including the unselected-track
readiness race, VP9 missing container metadata, asynchronous frame-burst bound,
and TS random-access seek failures. The final full Chrome run follows their fixes.
The earlier API run used VP9 as an unsupported fixture and correctly failed that
obsolete assumption; it is preserved.

The final MKV remux logs still contain FFmpeg timestamp-rounding warnings (`Packet
duration ... -16`, `pts has no value`). Existing prototype qualification is preserved,
but these integration tests do not establish sample-exact AAC priming, arbitrary
edit-list equivalence or a new color/HDR contract. Dynamic codec changes still reject.
Native remux remains the qualified AVC/AAC subset; Hybrid's five codec families are
subject to configuration, source, resource and browser limits. Audio-only conversion,
Native ASS and Software GPU presentation are not promoted by this change.

There is one final full Chrome run, not a repeated matched benchmark. Earlier subset
runs have different code/conditions and must not be pooled into a variability estimate.
Browser versions and per-case diagnostics are in each run's JSON. Native copy/upload
counts and browser memory ownership are opaque; application queue bounds are not total
process-memory measurements. TS Hybrid's 30-second preroll can be expensive and does
not guarantee every long-GOP or discontinuous source is seekable.

## Commands

```sh
npm run build
bash scripts/link-hybrid.sh
WEBMPV_REMUX_FFMPEG_DIR="$PWD/build/pipeline-qualification/ffmpeg-remux" bash scripts/build-remux.sh
npm run test:media-routing
node tests/player-api.mjs
BROWSER=firefox CASES=native-direct,h264,hevc-ac3,vp8-vorbis,vp9-opus,av1,hevc-10bit,native-mkv-forced node tests/media-routing.mjs
BROWSER=webkit CASES=native-direct,h264,vp9-opus,native-mkv-forced node tests/media-routing.mjs
node --test tests/video-codec-config.mjs tests/retained-codec-worker.mjs tests/audio-worklet.mjs tests/retained-video.mjs tests/timing-coalescing.mjs tests/resource-loader.mjs
# Separate terminal: node scripts/media-server.mjs
node --test tests/range-reader.mjs
```

The new build scripts and maintained sources are listed in the linked findings.
The original experiment/results artifacts and old engines are protected by
`before.json`; requested maintained edits are reported separately in `preservation.json`.
Generated JS is rebuilt; new ignored engines are hashed so reproduction can detect drift.
