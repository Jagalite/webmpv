# Remaining pipeline cost experiment

Four arms: native HTML video; WebCodecs copy-back with mpv software rendering
and Canvas output disabled (copy-render); same with mpv's documented
MPV_RENDER_PARAM_SKIP_RENDERING (copy-skip); same with decoded VideoFrames closed
without pixel readback and timestamped 2x2 placeholder mpv frames (nocopy-skip).
All non-native arms use the same isolated experimental native binary and worker.
The last arm removes copyTo, JS-to-Wasm pixels and most native frame allocation,
copy and chroma unpacking work together. It does not isolate these individually.
All arms decode the original 1920x1080 H.264 video; keep audio and playback pace.
Native displays video, other arms acknowledge frames but intentionally do not.
This is a cost isolation experiment, not a retained-frame presenter qualification.

Use the prior front-index H.264/AAC fixture, 10 Mbps / 80 ms aggregate origin,
960x540 CSS area, 1920x1080 canvas backing, DPR1, fresh foreground Chrome and
30-second warmup plus at least 60-second measured sample span. Three rounds:
native/copy-render/copy-skip/nocopy-skip;
copy-skip/nocopy-skip/native/copy-render;
nocopy-skip/copy-render/copy-skip/native.
No builds or other benchmarks during measurement. Smoke is headless, 2-second
warmup and 10-second measurement and is not performance evidence.

Require >=29 acknowledged or native frames/sec, <=1% reported drops, wall/playback
progress within 3%, unchanged process membership and foreground, no fallback,
errors or leaked workers/browser PIDs/origin requests. Non-native audio must
advance >=95% of its sample rate. Decoded and acknowledged counts must differ
by at most 12. Source decoded dimensions must stay 1920x1080. Pixel-copy counts
must equal decoded counts in copy arms and zero in the placeholder arm; placeholder
counts must equal decoded counts there and zero elsewhere. All non-native Canvas
submissions and Canvas-stage times must be zero. Decoder queues remain bounded
at eight. Preserve failures. Hash inputs before and after. Report each round,
paired CPU differences and variability; asynchronous wall time is not CPU.

Skipping render preserves mpv timing and frame acknowledgement, as documented
by the pinned mpv render API. Placeholder frames preserve timestamps but change
pixel content and dimensions downstream of the real decoder. Thus this arm is
a lower-work diagnostic, not evidence of usable image quality, subtitles or sync.
Hardware acceleration and energy are unmeasured. Native counter semantics and
prefetch differ. Residual CPU can include demux/audio, worker coordination,
packet copies, runtime polling and browser decoder differences.


## Screening and visible progress (added after the interrupted first run)

`--screen` runs one four-arm round with the same 30-second warmup and 60-second
measurement windows, about 6–7 minutes including startup/cleanup. It is preliminary
performance evidence, explicitly not a replicated comparison. The default retains
three rounds for confirmation when warranted. All pages show test number/total,
phase countdown, estimated total time and completion/stop status. The shared HUD
updates once per second in every arm; its overhead is common but unmeasured.
