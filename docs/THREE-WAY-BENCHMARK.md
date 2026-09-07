# Three-way playback comparison protocol

Compare ordinary HTML video playback, mpv/FFmpeg Wasm software decoding, and
mpv with the optional WebCodecs copy-back decoder. Use the same controlled
front-index 1920×1080 30 fps H.264/AAC MP4 as G3. Audio is enabled, volume is
100%, playback rate is 1, and no subtitles are selected. This measures complete
playback pipelines, not isolated decoder algorithms or proof of hardware use.

Use a dedicated loopback origin supporting closed, open-ended and suffix byte
ranges. Each trial receives aggregate 10 Mbps pacing and 80 ms response delay;
browser request/prefetch differences are measured rather than normalized away.
Record the fixture ETag, transferred bytes and peak concurrent requests.
The origin computes fixture identity before any trial begins.

All paths use a minimal page with a 960×540 CSS presentation area at DPR 1.
Source dimensions and the mpv canvas backing store are 1920×1080. Native video
uses the browser's own rendering and scaling. Do not force native frames through
Canvas or WebAudio, which would change the native reference pipeline.

Run three rounds with rotating order: native/software/webcodecs,
software/webcodecs/native, webcodecs/native/software. Each trial gets a fresh
Chrome process, 30 seconds of playback warmup and at least 60 seconds between
the first and final measurement samples. Sample every two seconds. Establish
foreground after playback startup, then observe without refocusing throughout
warmup and measurement. Run no builds or other benchmarks concurrently.

Capture process-family CPU and RSS, playback position, frame counters, errors,
network traffic and available decoder/copy/audio diagnostics. Reject process
turnover during the CPU window, focus changes, decoder fallback, player errors,
stalled playback, excessive frame loss or retained workers. Frame counts use
native VideoPlaybackQuality versus mpv presented frames; retain this difference
and do not claim identical internal counter semantics. Native audio is enabled;
this benchmark does not independently measure its PCM output or A/V sync.

Report every round and median paired CPU reductions; preserve failed trials.
CopyTo counters are asynchronous wall time, not CPU or total transfer cost.
Hardware acceleration, energy, browser-internal copies and long-term memory
stability are not established by this comparison. The prior G3 results and
candidate endurance exception remain unchanged.

`--smoke` uses short headless trials to verify plumbing only. Such results are
explicitly ineligible for performance conclusions or qualification.
