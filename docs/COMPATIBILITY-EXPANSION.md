# Compatibility expansion — 0.3.0-beta.1

This increment extends Native, Hybrid and Software without adding a public mode.
It is a functional beta increment; performance, physical output and production
qualification remain separate. The original result files remain historical evidence.

| Addition | Implementation | Functional acceptance |
| --- | --- | --- |
| External subtitles/fonts | SRT, ASS, SSA, WebVTT, TTF and OTF | Pixels, custom glyphs, track language/selection, seeks and mode changes |
| Software AV1 | Pinned dav1d 1.5.1 | 8/10-bit decoding with browser codecs disabled, visible frames, seeks and filters |
| Recorded format gaps | SBC hints, DFPWM/Dirac packet admission, SWF durations, RealAudio Matroska mapping, MPEG seek preroll | Corrected and original generated fixtures replayed separately |
| 4K Software input | Configurable decode/allocation budgets | 3840×2160 input, bounded output, lower-budget rejection and rollback |
| Remux resilience | One transient worker/MSE restart; short-hole recovery; AVC TS without audio | Recovery, bounded retries, seeks and automatic fallback at configuration changes |
| Multichannel PCM | Stereo, 5.1 and 7.1 ring/output layouts | Per-channel values through native decoding and Web Audio, wrap/reset and device fallback |
| HDR to SDR | zimg 3.0.6 plus FFmpeg Mobius tone mapping | Tagged PQ/HLG colors compared against a separate native reference |
| Broader streaming | HLS/DASH rendition selection, finite segmented WebVTT, finite DASH periods and standard live audio/video | Playback, seeks, period boundaries, live reload/cancellation and resource cleanup |

The final verification record below identifies the exact artifacts checked.

## API

```ts
import {Player} from '/vendor/webmpv/index.js';

const player = new Player(container, {
  // Omit mode to allow automatic feature-aware selection.
  audioOutput: 'auto',       // 'stereo' (default), '5.1', '7.1', or 'auto'
  audioFallback: 'stereo',   // or 'reject' when the device cannot supply the layout
  resourceLimits: {
    maxDecodePixels: 3840 * 2160,
    maxAllocationBytes: 128 * 1024 * 1024,
  },
});
await player.addFont(fontFile);             // optional TTF/OTF; survives new sources
await player.open(movieFile);
await player.addSubtitle(srtOrAssFile, {
  label: 'English', language: 'eng', select: true,
});
await player.setToneMapping('hdr-to-sdr');   // Software; 'off' restores normal filters
await player.play();
await player.destroy();
```

External mpv subtitles require Hybrid or Software. Automatic selection can move a
Native session into an mpv mode; explicit Native pins reject that operation.
`addTextTrack()` remains the separate browser URL/text-track API. `capabilities`
reports `externalSubtitles`, `customFonts` and `externalTextTracks` separately.
Subtitle tracks survive same-source mode/filter changes and clear on a new source.
Fonts survive new sources and clear on destruction. Additions reopen transactionally,
retaining the previous session if the candidate fails; these changes are not gapless.

Each subtitle/font file is limited to 8 MiB. A player retains at most 16 subtitles
and 16 fonts, with aggregate limits of 16 MiB and 32 MiB respectively. Use `select:
false` to add an unselected subtitle; existing `selectTrack()` and
`subtitleVisible()` controls continue to apply.

Raw SBC lacks a reliable probe signature. Named `.sbc` Files are recognized; byte
buffers or extensionless remote sources can supply a demuxer hint:

```ts
await player.open(bytes, {demuxer: 'sbc'});
await player.openRemote({url, demuxer: 'sbc'});
```

## Output and resource contract

Software's decode cap defaults to 8,294,400 pixels and can be reduced. The permitted
individual FFmpeg allocation cap is 32–256 MiB, default 128 MiB. Each mpv Wasm engine
starts at 128 MiB and may grow to 1 GiB. Canvas output remains within 1920×1080.
A source replacement temporarily owns two engines, and browser decoder/DOM memory
is additional. These are allocation bounds, not a universal real-time 4K guarantee.
ArrayBuffers remain limited to 32 MiB; larger Files use bounded reads.

`audioOutput: 'auto'` selects 7.1, 5.1 or stereo from Web Audio's advertised device
capacity. An explicit PCM layout uses an mpv mode. `audioDiagnostics()` reports the
requested layout, selected channels and device capacity. Native packet remux keeps
its existing browser-controlled audio output. The multichannel functional tests use
an explicit virtual output graph and verify each channel; they do not certify a
physical surround receiver or speaker arrangement. Encoded surround bitstream
passthrough and object-based audio rendering are not included.

`toneMapping: 'hdr-to-sdr'` (constructor or setter) runs a linear-light conversion,
BT.2020-to-BT.709 primaries conversion, Mobius compression, and limited-range BT.709
output before user video filters. Inputs must carry valid color metadata. The
reference checks cover tagged PQ and HLG; native HDR output, Dolby Vision dynamic
metadata, display calibration and all mastering-peak combinations are not covered.

## Streaming contract

```ts
await player.openRemote({
  url: masterURL,
  format: 'hls',
  streaming: {maxBandwidth: 2_000_000},
});
await player.openRemote({
  url: mpdURL,
  format: 'dash',
  streaming: {representation: 'video-720p'},
});
await player.openRemote({
  url: liveURL, format: 'hls', streaming: {live: true},
});
```

Selection chooses one rendition for the session; it does not continually switch
bitrates. With `maxBandwidth`, the highest advertised bandwidth within the limit is
chosen, or the lowest when none fit. With no preference, the highest is chosen.
`representation` is a zero-based variant index string for HLS and a representation
ID for DASH video. Associated audio/subtitle groups remain available.

Finite HLS WebVTT playlists are combined into one indexed subtitle resource,
preserving cue settings, absolute MPEGTS/LOCAL maps, wrap and discontinuities.
The combined subtitle window is bounded to 1 MiB. Native cue queues are reset on
seek. Rolling live subtitle-window replacement is not included in this profile.

Finite multiple-period DASH is adapted to discontinuity playlists while FFmpeg
continues to demux the compressed segments. This profile requires contiguous finite
periods, stable track identities, fMP4 audio/video, aligned first segments, and
SegmentTemplate/SegmentTimeline or SegmentList addressing. Separate byte-range
SegmentLists, multiple video adaptation sets, period gaps/overlaps and changing
track sets reject explicitly. Single-period DASH retains FFmpeg's demuxer.

Standard HLS live and single-period dynamic DASH require `live: true`. Live seeking
is limited by the upstream demuxer and available window; dynamic DASH seeking is
not supported by the pinned FFmpeg demuxer. LL-HLS parts, DRM/encryption, live
multi-period DASH, manifest patching and universal live-subtitle support remain out
of scope. HTTP(S), origin/credential policy, bounded requests and cancellation still
apply. Active resources retain the existing 16-handle/16-MiB bounds; generated
manifest/subtitle resources have a separate 4-MiB budget. Each finite playlist has
at most 10,000 segments. Live playback does not consume a finite lifetime-open cap.

## Format and remux corrections

The old comfort-noise fixture encoded 48-kHz timestamps for an 8-kHz decoder. Its
replacement uses 8 kHz. The old generated RealMedia 14.4 stream had repeated zero
packet timestamps and a truncated tail. Qualification uses valid RealAudio 14.4 in
Matroska, whose mapping was missing from mpv's native Matroska demuxer. These fixture
corrections do not establish support for those malformed historical files.

DFPWM and generated intra Dirac/VC-2 NUT packets lacked keyframe flags; bounded
codec-specific admission prevents their loss during startup/seek. Dirac admission
checks for a sequence header and an intra picture parse unit. DFPWM decoder state
is reset on seek. SWF ADPCM block durations now supply the missing audio timeline.
One second of mpv demux preroll resolves the recorded MPEG-1/MPEG-2 seek cases.

Native remux retries a transient worker/MSE fault once per explicit open, preserving
source identity, position and playback intent. Small coded-range holes (up to half
a second) can be crossed when a playing output stalls. Configuration changes and
unrepairable timeline failures invoke the existing automatic Hybrid/Software
fallback. Explicit Native pins report unsupported transitions. This is not a claim
of gapless MSE reconfiguration for every sample-description change. Recovery and
buffer diagnostics remain bounded and available under `diagnostics.backend.remux`.

## Build and verification

The locked-source engine recipe is `bash scripts/build-beta-engines.sh`. It builds
portable dav1d and zimg into a separate playback dependency prefix. The complete
patch series is replayed against verified upstream archives before updating source
files, so overlapping patches remain idempotent and unrecognized edits are preserved.
Optional YUV must be rebuilt with `npm run build:software-yuv`; it stays experimental.

Generate functional fixtures with `npm run fixtures:compatibility`. This requires a
host FFmpeg with SVT-AV1 and the existing DejaVu font archive. HDR reference generation
uses the small native executable built by `bash scripts/build-color-reference.sh`
(with a host zimg development package). Then run `npm run test:compatibility`.
Fixture manifests record host encoder versions, commands and input hashes.

Functional acceptance: 38 unit checks and 26 Chrome browser scenarios passed against
unchanged input hashes. The repository record is
`results/compatibility-expansion/2026-09-11T16-52-40.192Z/result.json`.
PQ/HLG mean absolute RGB errors against the native reference were 1.857/0.709
on the 0–255 scale. Six/eight-channel tests preserved each channel's expected
PCM value through the native ring and Web Audio graph. The 4K-to-1080p case used
161,087,488 bytes of Wasm heap in this short generated test.

Package validation uses `node tests/beta-consumer.mjs` and
`BROWSER=firefox node tests/beta-consumer.mjs`; those records include the installed
archive SHA-256, type check, asset hashes and browser version. See repository
`results/compatibility-expansion/README.md` for the completed regression and
clean-consumer record. No production or long-duration qualification is inferred.
