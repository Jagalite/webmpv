# Expanded software playback — verification

The expanded Wasm build enables FFmpeg 7.1.1's built-in playback components using
upstream default selection and existing bundled dependencies. All 21 representative
functional checks passed in Chrome 152.0.7977.76, headlessly with browser codec APIs
disabled. The final matrix took 112.6 seconds. This is functional qualification,
not a new CPU benchmark or proof that every registered codec plays every file.

| Component registrations | Previous build | Expanded build | Added |
| --- | ---: | ---: | ---: |
| Decoders | 6 | 496 | 490 |
| Demuxers | 11 | 352 | 341 |
| Filters | 6 | 472 | 466 |
| Parsers | 3 | 60 | 57 |
| Bitstream filters | 0 | 45 | 45 |

Counts include distinct implementations of the same codec and registrations with
runtime requirements. They are not counts of independently qualified formats.
FFmpeg's built-in AV1 registration in this version requires hardware acceleration;
software AV1 still needs an external decoder library. No external codec libraries
were added. GPL filters are enabled; encoders, muxers, native devices, hardware
acceleration and native network protocols are disabled.

| Representative files | Verified behavior |
| --- | --- |
| H.264/AAC MP4; HEVC/AC-3 MKV | Pixels, advancing frames, audio, seek, cleanup |
| VP8/Vorbis and VP9/Opus WebM | Pixels, advancing frames, audio, seek, cleanup |
| MPEG-4/MP3 AVI; MPEG-2/MP2 TS | Pixels, advancing frames, audio, seek, cleanup |
| FFV1/FLAC MKV; WMV2/WMA2 ASF | Pixels, advancing frames, audio, seek, cleanup |
| MJPEG/PCM AVI; ProRes/PCM MOV | Pixels, advancing frames, audio, seek, cleanup |
| FLAC, MP3, AC-3, E-AC-3, DTS, WavPack audio | Audible samples, resumed seek position, cleanup |
| SRT in MKV; MP4 timed text | Actual subtitle pixels after selecting track before seeking |
| Existing 1080p H.264/AAC/ASS MKV | Playback, audio and track handling |
| Software mirror, brightness and audio volume | Actual transformed pixels and audible output |
| VP9/Opus WebM over HTTP ranges | Bounded browser I/O, playback and seeking |

Video filter checks configure the filter before opening the file and synchronize
presentation before taking a snapshot. Live filter reconfiguration is outside
this qualification. The final mirror comparison had 2.784 mean RGB error against
the reflected reference; brightness raised the mean red-channel value by 33.782.

The audio-only paused `time-pos` offset remains: a 0.750-second seek settled around
0.54–0.58 seconds in the diagnostic samples, including the unchanged baseline PCM
player. Playback then resumed near the requested timeline position. The full
matrix records the paused offset and verifies resumed position/audio; exact paused
audio-only time reporting is not qualified. See the
[audio baseline comparison](audio-seek-diagnostic.json).

The Wasm payload is 20,720,845 bytes (19.76 MiB), or 7,651,155 bytes gzipped
(7.30 MiB). The previous software payload was 7,089,790 bytes (6.76 MiB), or
2,535,964 bytes gzipped (2.42 MiB). The JavaScript loader is 53,315 bytes.
No runtime CPU or memory-growth performance claim follows from these sizes.
Existing 1080p, 512 MiB Wasm, 32 MiB local-file/allocation, stereo-output and
browser I/O limits remain.

Open `/web/software-full.html` with the local app server running. Build and test
instructions are in the [profile README](../../experiments/software-full/README.md).
The accepted and previously measured engines remain separate.

Evidence:

- [Final 21-check matrix](functional-2026-09-08T02-19-18.231Z/result.json)
- [Build/component inventory and hashes](build.json)
- [Final integrity and preservation audit](audit.json): every check passed; 21 protected archives/engines unchanged
- [Version-header verification](version-header-verification.json): corrected header leaves the linked library bytes identical
- [Unfiltered frame](functional-2026-09-08T02-19-18.231Z/filter-before.png) and [mirrored frame](functional-2026-09-08T02-19-18.231Z/filter-flipped.png)

Earlier attempts are retained separately. Their failed paused-audio-position,
late subtitle selection and unsynchronized live filter snapshot assertions are
not counted as passes in the final matrix.
