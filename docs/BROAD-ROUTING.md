# Broad browser routing

The policy is Native direct, Native packet-copy remux when packaging blocks direct
playback, Hybrid when browser decoding can satisfy the source and selected features,
and Software for the remaining supported FFmpeg sources. There are still three
public modes. Explicit mode selection pins the requested mode.

The remux build now enables the available FFmpeg demuxers, parsers and bitstream
filters, with MP4/WebM output and no audio/video decoders or encoders. The local build has
350 demuxers, 60 parsers and 45 bitstream filters. Registration is not a playback
guarantee: nested resources, permissions, source indexing, packet contracts and
browser support still matter. Networking remains owned by the bounded source reader.

| Path | Admission and remaining correctness boundaries |
| --- | --- |
| Hybrid | AVC, HEVC, VP8, VP9 and AV1 through the existing WebCodecs contracts; FFmpeg demux/audio and libass. Actual configuration and frame delivery must succeed. Retained source frames may now exceed 1080p, up to 8192 per dimension and 33,554,432 pixels. Canvas output dimensions retain their existing limit. Legacy pixel-copy code retains its smaller bounds. |
| Native MP4 remux video | AVC, HEVC, VP9 and AV1; a selected audio stream is optional. AVC SPS, HEVC configuration records/Annex B, VP9 keyframe metadata and AV1 configuration identify the actual browser codec. |
| Native MP4 remux audio | AAC ASC profiles, MP3, Opus, FLAC, AC-3 and E-AC-3 are attempted when the browser accepts the packaging. AAC multichannel configuration is retained. Browser rejection proceeds to Hybrid. |
| Additional remux packaging | Audio-only AAC/FLAC use MP4; audio-only Opus prefers WebM with MP4 as an alternative; Vorbis requires WebM. VP8 uses WebM with compatible selected audio. VP9/AV1 plus Opus can negotiate either container. These are packet-copy paths; no audio conversion is introduced. |
| Specialized timestamp repair | AVC Matroska retains its bounded reorder reconstruction. MPEG-TS still requires the verified AVC/AAC ADTS path. Other codec/container combinations require usable source DTS; missing timestamps fall back instead of guessing a reordered timeline. |
| Software | Unsupported browser video codecs/configurations, failed browser presentation, and exact CPU filters. Existing Wasm/source limits still apply; Software is not a guarantee that every input is playable. |

MSE MIME admission considers both MP4 and WebM possibilities instead of rejecting
VP9/AAC because it cannot fit WebM. The MP4 muxer uses the precise video configuration
at runtime. MP3 and Dolby-audio MSE support varies by browser; rejecting them does not
reject Hybrid's FFmpeg audio decoding. No alternate track is silently substituted.
The remux worker offers compatible packaging before starting the muxer; MSE support
and SourceBuffer creation choose the container. An initialization failure permits
one alternative-container restart at the same target. See
[negotiation evidence](../results/packaging-negotiation/README.md).

AVC and HEVC parameter changes, VP9 profile/chroma/range changes, changed packet
extradata and invalid timelines reject the current remux operation. Broader adaptive
configuration changes, HDR output fidelity and every codec/container permutation
are not qualified by this change. The remuxer keeps bounded fragments, source reads,
MSE backpressure/eviction and source identity across seeks and fallback.

The VP9 configuration box needs pixel-format metadata that packet-only demuxing may
not populate. A bounded initial keyframe read derives that metadata without decoding.
FLAC STREAMINFO supplies the sample depth needed by the MP4 AudioSampleEntry; leaving
that field unset makes Chromium reject an otherwise valid FLAC initialization segment.

This implementation does not transcode audio/video or extract reduced-quality codec
cores. FFmpeg's muxer may change compressed packet framing and codec-configuration
placement. No hardware-acceleration, zero-copy, HDR or performance claim follows
from successful configuration or frame delivery.

## Evidence and reproduction

See [broad-routing results](../results/broad-routing/README.md) and
[routing-completion evidence](../results/routing-completion/README.md) for the bounded
local File reader and additional remux packaging. Tests play rendered video, perform
backward and forward seeks, resume, check errors and destroy workers.
The 4K fixture is a short 12-fps functional test, not sustained 4K performance
qualification. Audio output layout and exact A/V synchronization need separate
measurement; preserving compressed channel data does not establish speaker layout.

```sh
python3 scripts/generate-broad-routing-fixtures.py
bash scripts/build-remux.sh
npm run build
node --test tests/video-codec-config.mjs tests/native-selection.mjs tests/retained-codec-worker.mjs
node tests/broad-routing.mjs
npm run test:automatic-selection
node tests/remux-regressions.mjs
```

The relevant upstream contracts are the [WebCodecs codec registry](https://w3c.github.io/webcodecs/codec_registry.html)
and [MSE specification](https://www.w3.org/TR/media-source-2/). Browser probes are
admission hints; actual playback remains a separate gate. Local FFmpeg source
`libavformat/movenc.c`, `vpcc.c` and `mov.c` supplies the authoritative packet/mux
behavior used here.
