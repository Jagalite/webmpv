# Quick subtitle performance result

The foreground screen completed in 92.7 seconds. Both trials passed: 10 seconds
warmup and approximately 30 seconds measurement each, using fresh Chrome
processes, the same long 1080p30 video and the same subtitle-capable engine.

| Mode | CPU, percent of one core | Median browser-family RSS | Presented frames | Reported drops |
| --- | ---: | ---: | ---: | ---: |
| Subtitles off | 24.33% | 940.0 MiB | 900 | 0 |
| Animated ASS on | 29.76% | 1065.1 MiB | 902 | 0 |

This pair shows **5.44 percentage points more CPU**, or **22.36% relative
overhead**, and 125.1 MiB higher median process-family RSS with subtitles enabled.
The RSS difference is not an isolated subtitle allocation measurement or evidence
of a persistent leak. All 1,247 transferred VideoFrames closed in each trial,
and no workers, recorded browser processes or active origin requests remained.

Both arms sustained approximately 30 fps and advancing audio, with zero
decoded-video copy-back and no decoder fallback. Presentation submission lateness
was 11.90 ms p95 / 16.06 ms maximum with subtitles off, and 13.28 ms p95 /
22.29 ms maximum with subtitles on. These statistics cover all 900/902 observed
draw submissions in the measured windows; they do not measure physical display
latency or independent audio-output synchronization.

The enabled workload includes continuous Arabic/accented text and repeated
karaoke, vectors and rotated text. It produced 201 subtitle snapshot updates
and copied 118,243,584 native bitmap bytes over 30.044 seconds (about 3.75 MiB/s),
with a largest packet of 599,668 bytes. The disabled arm copied zero subtitle
bitmap bytes during measurement. This suggests that reusing unchanged tiles
within animated snapshots is a useful next experiment; this screen does not
separately attribute CPU or RSS to allocation, rasterization or composition.

This is one fixed-order pair with deliberately short warmup, not a replicated
benchmark or endurance qualification. It measures styled ASS overhead on this
machine and workload. It does not establish overhead for simple dialogue or
compare current performance against native browser playback. Earlier baseline
numbers should not be subtracted from this new run.

All 42 foreground samples passed. Runtime inputs matched their before/after
hashes and the files on disk after measurement. The prior local and unthrottled
remote functional-test inputs remain unchanged. No native rebuild or Docker
was needed; changes remain local and uncommitted.

- [Protocol](PERF-PROTOCOL.md)
- [Results and exact input hashes](../../results/retained-subtitles/perf-screen-2026-09-08T00-44-04.521Z/result.json)
- [Raw samples](../../results/retained-subtitles/perf-screen-2026-09-08T00-44-04.521Z/raw.jsonl)
- [Audit](../../results/retained-subtitles/perf-screen-2026-09-08T00-44-04.521Z/assessment.json)
- [Headless setup screenshot](../../results/retained-subtitles/perf-smoke-2026-09-08T00-43-21.884Z/subs-on.png)

The smoke screenshot and its CPU values are setup evidence only. The foreground
run disabled pixel readback, and its timing aggregation was expanded from the
last 120 frames to all measured draw submissions before that run began.
