# S1 fixed segmented VOD acceptance contract

Status: passed for the declared profile. TS/fMP4 discontinuities, core playback,
gap/offset, failure handling, worker ownership and direct/local regressions pass.
See [S1 evidence and limitations](validation/S1.md).
M3 is committed as `77c9b9b`. The user has approved proceeding through the
remaining milestones despite M3's recommendation to defer M4.

## Scope

Extend the accepted software player with explicitly selected `hls` and `dash`
remote source formats. mpv and FFmpeg retain demuxing, decoding, track selection,
clocking, seek and subtitle ownership. The browser only fetches bounded resources.

Support finite, unencrypted HLS TS/fMP4 (one video variant, alternate audio and
WebVTT subtitles supplied as one full-timeline resource per rendition, without
X-TIMESTAMP-MAP) and single-period static DASH fMP4 (one representation per
adaptation set). Segmented WebVTT and multiple DASH periods are rejected. The
WebVTT subset uses FFmpeg 7.1.1's existing experimental demux path; its lifecycle
checks are required before acceptance.
Qualify initialization resources, explicit byte ranges, relative URLs, timestamp
offsets, discontinuities, gaps, audio/subtitle selection and forward/backward seek.
Live/reloading manifests, adaptive video switching, encryption/DRM and HDR remain
outside this contract. Reject unsupported manifests before fetching their media.

## Ownership and bounds

Use the existing native mailbox and browser I/O worker. Add resource open/read/
close operations and serialize mailbox ownership across native callers. Preserve
session and seek epochs. Top-level and nested resources retain their real base
URL. Route mpv's nested AVIO open/close through the bridge; narrowly patch pinned
FFmpeg 7.1.1 DASH calls that otherwise bypass `AVFormatContext.io_open`.
Do not add a private FFmpeg URLProtocol or browser demuxer.

Direct files retain the existing RangeReader contract. Segmented VOD accepts
bounded streaming HTTP 200 GETs; requested byte ranges require matching 206.
Limits: manifest 1 MiB, individual media/init resource 8 MiB, total retained
resource bodies 16 MiB, 16 simultaneous resource handles, 10,000 resource opens
per source, 4,096-byte URLs, one network body in flight, 15-second request deadline,
and bounded retries. Native demux/PCM/heap limits remain as in M2.

Only HTTP(S), explicit allowed origins, no URL credentials, and no redirects.
Nested resources use the source origin policy. Authorization refresh receives
the requested resource URL, so a refreshed root URL cannot silently replace a
segment URL. Closing/epoch changes abort pending fetches and discard stale replies;
closing one nested handle does not cancel other resources or the source session.

## Required evidence before S1 is complete

- Deterministic loader tests: 200/206, ranges, relative URL policy, auth refresh,
  retry/truncation, malformed responses, size/count bounds, cancel and stale reply.
- Real software-only Chrome playback for HLS TS, HLS fMP4 and static DASH fMP4.
  Observe moving output and nonzero AudioWorklet analyser output.
- Forward/backward and stalled-resource seeks, alternate audio/subtitle selection,
  discontinuity/offset fixtures, recoverable gaps/retries and terminal failure.
- Destroy during nested open/read, source replacement, repeated player lifecycles;
  no late output, pending requests or retained handles after teardown.
- Direct-file range/audio tests and accepted local/direct playback regression.
- Retained raw browser evidence and build hashes under `results/s1/`; update
  supported profile, integration instructions, patch inventory and handoff.

Do not relabel M2 evidence or overwrite the accepted 0.2.0 release archive.
