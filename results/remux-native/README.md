# Remux-to-Native findings

Host FFmpeg can progressively remux these H.264/AAC streams into fragmented MP4
and feed the existing Native Player without whole-file prebuffering. The useful
policy is **try direct Native first, use remux when packaging prevents Native
playback**. Chrome already plays the tested MKV directly; remux adds overhead for
that file. Chrome rejects the equivalent MPEG-TS directly, while the corrected
remux path plays it successfully.

Measured on Chrome 152.0.7977.83 with host FFmpeg 8.1.2, using the existing
26-second synthetic 1080p30 H.264/AAC fixture. Assets were staged on the local
temporary volume after an external-volume control encountered storage stalls.
Each performance interval is eight seconds after two seconds of warmup. CPU is
percent of one core; RSS is summed browser process RSS, including shared pages.

| Path | Browser CPU | First available frame | Mean browser RSS |
| --- | ---: | ---: | ---: |
| Direct MP4 Native, two trials | 5.8–6.0% | 240–305 ms | 1091–1092 MiB |
| Direct MKV Native, one control | 6.8% | 233 ms | 1096 MiB |
| MKV remux → Native, two trials | 7.9–11.2% | 358–451 ms | 1072–1073 MiB |
| TS remux → Native, two trials | 8.8–9.3% | 293–302 ms | 1074–1075 MiB |
| MKV Hybrid, two trials | 16.0–17.0% | 430–454 ms | 1226–1230 MiB |
| MKV Software, two trials | 41.0–41.2% | 392–399 ms | 1314–1316 MiB |

MKV remux adds **0.37–0.61% CPU and approximately 23 MiB RSS for FFmpeg**.
Node HTTP-serving CPU is not included. Both remux trials maintained approximately
30 fps with zero measured drops. Only about 2.13 MB had been emitted at the first
available frame, and FFmpeg was still running. Input bursts three seconds then
is paced in real time; output uses 500 ms fragments and HTTP pipe backpressure.
This establishes progressive playback, not a production buffer-cap guarantee.

The main comparison has **seven passing trials out of eight**: one Hybrid trial
recorded one dropped frame and fails the strict zero-drop assertion. Both
Software trials and the second Hybrid trial pass. The mpv audio intervals had
zero underruns and internal A/V estimates below 16 ms. Native has no equivalent
independent A/V output measurement. All trials destroyed their workers; no
FFmpeg processes remained after suite cleanup.

The direct-MKV control passes. In the MPEG-TS control, direct Native fails with
`DEMUXER_ERROR_COULD_NOT_OPEN`. TS requires `aac_adtstoasc` when copying AAC into
fragmented MP4; without it, FFmpeg emits a partial file and exits with an error.
That failed attempt is retained. The corrected TS remux uses a bitstream framing
conversion, not audio/video re-encoding, and is measured in the final run below.
Both corrected TS remux trials pass at approximately 30 fps with zero drops;
FFmpeg adds 0.25–0.37% CPU and 27–28 MiB RSS. Playback begins while remuxing is
still in progress.

The first corrected TS run left one FFmpeg process blocked after cancellation;
it was explicitly terminated. The harness now escalates termination after one
second and awaits child exit before recording suite cleanup. Playback and
cleanup were repeated with this fix in the final lifecycle run below.

Seeking remains a prototype limitation. Restarting the MKV remux at requested
18 seconds yielded a playable stream in 361–366 ms, but packet hashes prove the
first video packet comes from **16.021 seconds**, the preceding source keyframe.
The browser timeline resets. Exact seeking needs source/output timestamp mapping
and skipping preroll; this experiment does not implement it.

Compressed video and audio stream hashes match between MKV and offline remuxed
MP4. Timestamp normalization shifts video by 46 ms; AAC priming/rounding produces
audio shifts from 0 to 46.5 ms. This verifies packet preservation and exposes
timestamp changes; it is not acoustic lip-sync validation. Long pauses, long
files, remote-source latency, strict buffering bounds, mobile/Safari, and
browser-Wasm remux cost remain untested.

## Evidence and reproduction

- [Main comparison](2026-09-09T03-46-52.197Z/result.json): eight trials, one Hybrid drop failure.
- [Direct MKV control](2026-09-09T03-49-19.437Z/result.json): passes.
- [TS direct rejection and initial mux failure](2026-09-09T03-50-30.748Z/result.json).
- [Corrected TS remux](2026-09-09T03-51-47.558Z/result.json).
- [TS playback and cancellation follow-up](2026-09-09T03-54-45.504Z/result.json).
- [Packet and seek proof](packet-proof.json), [staged asset hashes](asset-hashes.json).
- [Reproduction instructions](../../experiments/remux-native/README.md),
  [test harness](../../experiments/remux-native/test.mjs).

Earlier timestamped directories are exploratory runs, not additional successful
qualification. Production sources and public playback modes are unchanged.
