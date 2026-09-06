# M0 acceptance profile

Frozen before the first playback test, 2026-09-06. This is local port validation;
it does not pass G1 or promise general browser support.

- Device: this Apple Silicon macOS host; record exact device and browser in results.
- Browser: installed Google Chrome, foreground, secure localhost with COOP/COEP.
- Fixture: original 12-second 640x360, 30 fps SDR H.264 8-bit 4:2:0, two B-frames,
  two-second GOP, 48 kHz stereo AAC, embedded styled/animated ASS and DejaVu Sans.
- Browser decoding: remove VideoDecoder, AudioDecoder and VideoFrame. No video
  element, MSE or compressed-media browser decoder is used.
- Required: actual changing canvas pixels, nonzero AudioWorklet output connected
  to the audio destination, mpv events and controls, pause/resume, local seek,
  visible ASS, resize, end-of-file, and graceful create/open/play/destroy cycles.
- Output: public libmpv software renderer to Canvas 2D, Float32 stereo AudioWorklet.
- M0 input: a caller-selected local fixture up to 32 MiB, copied to stock WasmFS's in-memory backend. This
  bounded local bootstrap is not the M1 remote streaming implementation. M1 must
  use range callbacks and must not materialize whole remote files.
- Heap: 128 MiB initial, 512 MiB ceiling; eight prestarted pthread workers with
  2 MiB stacks; two FFmpeg video decode threads, one audio decode thread.
- PCM: 8192 logical stereo frames (171 ms at 48 kHz), a native staging ring plus
  a separate fixed 64 KiB SAB. Both store the same bounded logical queue. The
  worklet's consumed count advances only on real PCM, never inserted silence.
- mpv audio buffer: 100 ms. Demux cache: disabled for M0 local input, configured
  forward/backward ceilings 32/8 MiB. Render target: at most 1920x1080 RGBA.
- Font: one 739 KiB bundled fixture font, also attached to the test container.
- Timing: worklet consumption and reported output latency feed the mpv AO delay;
  independent physical A/V latency and 60-minute sync qualification remain M2.
- Scope: H.264/AAC MP4 or MKV, ASS and PCM WAV are compiled; only the fixture and
  cases recorded in the result file are qualified. No network/live/hardware/HDR
  or broad codec, device, subtitle-fidelity, or performance claim.

Clean-container build and source/patch/artifact manifests are required evidence.
The architecture's companion documents and prototype were not supplied, so this
repository implements its own M0 platform code rather than claiming those files exist.
