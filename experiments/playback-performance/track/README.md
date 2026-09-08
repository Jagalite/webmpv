# Native video compositor experiment

This isolated candidate sends **mpv-selected** browser VideoFrames through a
transferred `MediaStreamTrackGenerator.writable` into a visible HTML video
element. mpv still demuxes, schedules frames, handles commands, renders libass
subtitles, and supplies audio to the existing AudioWorklet. The software decoder
and the public three-mode API are not replaced by this experiment.

The motivation is to measure the cost of the remaining canvas presentation.
Chrome can composite a hardware-backed video surface differently from a canvas
that draws the same frame. A synthetic capability probe establishes that Chrome
152 exposes the generator in the main realm, its writable can be transferred to
the engine worker, and successful writes close submitted VideoFrames. The
standard `VideoTrackGenerator` is not exposed in this Chrome build. Ending the
track clears the final picture, so capture must precede explicit teardown.

The prototype retains the original frame under the existing ownership rules and
hands a timestamp-adjusted reference to the generator. Pending writes are capped
at two. A transparent canvas draws only changed subtitle snapshots. Main-realm
video callbacks record actual compositor delivery and submission-to-display
latency; mpv's submission count alone cannot establish delivered playback.

## Deliberate experimental limits

- Only unrotated, square-pixel video is accepted initially.
- The public canvas contains only subtitles. Canvas-only capture no longer
  includes the video, so this is **not a compatible public implementation**.
- A browser live video track can add display latency. Its observed delay must be
  measured separately from mpv's A/V estimate before considering adoption.
- The synthetic probe is not a real movie performance comparison, independent
  A/V synchronization proof, or full lifecycle/format qualification.

Prepare with `python3 experiments/playback-performance/track/prepare.py`.
Run the bounded capability/ownership check with
`node tests/track-presenter-probe.mjs`.

The candidate lives under ignored `build/playback-performance/track/`; its
manifest can be mounted by the existing snapshot server. Keep it separate from
maintained engines and accepted release artifacts.

## Timestamp finding

A cloned frame's JavaScript timestamp override did not reach this Chrome build's
live-video sink. A focused probe (`tests/track-timestamps.mjs`) observes the new
JavaScript timestamp while video callbacks still report the original media PTS.
The current experiment keeps original timestamps and matches them to separately
posted submission wall times with a bounded clock map. The first movie screen's
huge delay values are invalid and excluded.

This matches the relevant Chromium source behavior: the VideoFrame constructor
can store a timestamp on its wrapper, while the live-video sink obtains the
underlying media frame. See [VideoFrame construction](https://raw.githubusercontent.com/chromium/chromium/main/third_party/blink/renderer/modules/webcodecs/video_frame.cc)
and [the video-track sink](https://raw.githubusercontent.com/chromium/chromium/main/third_party/blink/renderer/modules/breakout_box/media_stream_video_track_underlying_sink.cc).
The separately recorded submission time avoids relying on that override.

Chrome's `expectedDisplayTime` remains a prediction and can precede submission
in the observed callbacks. It is not an independent physical A/V measurement.
The corrected short screen passed frame, audio, ownership and stable composite
capture checks, but its mean CPU gain was modest and varied between trials.
This prototype has not replaced the maintained Canvas2D presenter.
