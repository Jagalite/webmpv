# Broad routing correctness evidence

The final [Chrome run](run-2026-09-09T22-11-13.222Z/result.json) passes all 13 cases.
Each case opens, plays rendered video, pauses, seeks forward/backward three times,
checks target position, resumes, takes a screenshot and destroys all workers.
Hybrid 4K also asserts actual 3840-pixel decoded width and no video-plane copyTo
accounting. This does not establish hardware acceleration or zero-copy presentation.

| Case | Actual route | Open ms | Seek ms range (three different targets) |
| --- | --- | ---: | ---: |
| hevc-aac | native | 1203 | 55–59 |
| vp9-aac | native | 77 | 54–58 |
| h264-opus | native | 83 | 53–56 |
| h264-flac16 | native | 87 | 57–58 |
| h264-51 | native | 88 | 55–59 |
| h264-4k | native | 830 | 82–108 |
| av1-video-only | native | 72 | 51–58 |
| platform-ac3 | hybrid | 1227 | 225–228 |
| platform-eac3 | hybrid | 283 | 227–253 |
| platform-flac | native | 155 | 55–60 |
| platform-mp3 | hybrid | 354 | 230–252 |
| hybrid-4k | hybrid | 1035 | 278–308 |
| unsupported-video-software | software | 690 | 218–222 |

These are individual functional trials on Chrome 152.0.7977.83, not repeated
benchmarks. Open times include asynchronous engine and media initialization; seek
ranges describe different targets, not statistical variability. CPU, power state,
exact A/V timing, speaker layout, HDR fidelity and sustained 4K playback were not
measured. The 4K fixture is four seconds at 12 fps, displayed on a 640×360 canvas.
Short fixtures can be completely remuxed within the existing forward-buffer window;
these runs do not establish duration-independent memory for every new combination.
Fragment sizes, source bytes, buffer statistics, rendered/dropped counters and
per-seek positions are retained in each case's diagnostics. Zero-worker cleanup
is asserted by the test rather than inferred from a screenshot.

The unchanged routing/lifecycle behavior additionally passed:

- [22 automatic-selection cases](../automatic-selection/run-2026-09-09T22-07-07.393Z/result.json), including real Firefox browser rejection and the four prior review regressions.
- [6 remux regressions](../media-routing-integration/review-fixes-2026-09-09T22-08-02.400Z/result.json), including remote representation changes and invalid seeks.
- [13 configuration/worker unit tests](unit-tests.log).

Those automatic/remux suites ran before the final added VP9 keyframe
configuration-change guard; the complete final broad matrix ran after rebuilding it.
No results from those runs are combined into a performance comparison.

Earlier runs are preserved. Initial failures found missing VP9 pixel-format metadata,
FLAC AudioSampleEntry sample depth, a video-only signed/unsigned stream-index check,
and a seek test targeting the exact end of a two-second fixture. MP3 and Dolby MSE
rejections are platform outcomes and now exercise automatic Hybrid fallback. The
22:09:51 run overlapped a binary write, read incomplete Wasm, and is excluded.

[manifest.json](manifest.json) records exact final source/binary and fixture hashes,
and compiled component counts: 350 demuxers, 60 parsers, 45 bitstream filters, MP4/MOV
muxers, zero decoders and zero encoders. Components are not individually qualified.
[Implementation and commands](../../docs/BROAD-ROUTING.md) describe the remaining gates.
