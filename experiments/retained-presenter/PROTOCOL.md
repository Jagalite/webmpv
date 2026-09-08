# Retained-frame presenter screen

Compare native HTML video with an isolated retained-VideoFrame mpv presenter.
The decoder still decodes original 1080p H.264 packets but returns timestamped
2x2 placeholder CPU frames to mpv; actual VideoFrames transfer to the engine
worker. An experimental hook in the selected mpv VO frame reports its media PTS
and target display time. Match by exact microsecond PTS, draw the corresponding
VideoFrame directly with Canvas2D drawImage at that deadline, then report swap.
No frame.copyTo, Wasm pixel transfer, CPU software render or ImageData output.
This path bypasses mpv video filters and subtitle composition: it is an isolated
presenter for the no-subtitle synthetic test film, not an M5 release candidate.

Use the same large front-index 1080p30 H.264/AAC film, audio enabled, 10 Mbps /
80 ms aggregate origin, CSS960x540 / backing1920x1080 / DPR1, fresh Chrome and
foreground guard. One native then retained pair. Warmup30s, measured >=60s;
headless smoke warmup2s / measured10s is not performance evidence. Show visible
phase countdown, test count and estimated total time (about 3–4 minutes).

Require original decoded dimensions, >=29 frames/sec, <=1% reported drops,
playback progress within3%, no fallback/errors/process turnover, PCM progression
>=95% of sample rate, bounded queues and no retained workers/browser/origin
requests. Presented/decoded/acknowledged counts must differ by <=12 in a window;
pixel-copy count zero and placeholder count equal decoded count. Retained owner
queue <=16 frames, pending presentation requests <=8, no missing frame deadline
beyond500ms; observed presentation lateness p95<=33ms and max<=100ms in each final
120-frame sample. PTS must increase. Observe nonuniform canvas pixels during the smoke check only (pixel readback
is disabled for measured runs to avoid altering Canvas behavior), and verify decoder transferred count equals receiver received/closed counts
at teardown. Save raw samples and input hashes before/after.

Deadline checks measure Canvas submission against mpv's scheduled timestamp,
not physical display latency or independent audio-output sync. One pair only:
results are preliminary. drawImage does not prove zero internal browser copies
or hardware acceleration. Preserve failures without weakening gates. No Docker.
