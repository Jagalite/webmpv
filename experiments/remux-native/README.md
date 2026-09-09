# Progressive remux experiment

This is an isolated **host FFmpeg → progressive fragmented MP4 → Native Player**
experiment. It does not add a public mode or measure FFmpeg compiled to Wasm.

The fixture is the existing 26-second 1920×1080, 30 fps H.264/AAC sample.
Create an MKV containing the same compressed streams:

```sh
mkdir -p build/remux-native
ffmpeg -hide_banner -loglevel error -y \
  -i build/hybrid-performance/sample.mp4 \
  -map 0:v:0 -map 0:a:0 -c copy build/remux-native/sample.mkv
node experiments/remux-native/test.mjs
```

The test needs installed FFmpeg, ffprobe, Chrome, Playwright, built JavaScript,
and both existing Wasm engines. It starts an ephemeral localhost origin. On
macOS it uses `ps` for process RSS and FFmpeg CPU time, and CDP for browser CPU.
The local fixture is declared immutable to the mpv range reader.

Default order is Native, Remux, Hybrid, Software, Software, Hybrid, Remux, Native.
Each trial uses a fresh browser, two seconds of warmup, and eight seconds of
measurement. `VARIANTS=native,remux` selects a shorter run;
`VARIANTS=native-mkv` checks whether remuxing is needed at all for this fixture.
`MEDIA_ROOT` can point
to a local staging directory with `web/`, `fixtures/`, and the two fixture paths
under `build/`; the measured run used `/private/tmp/webmpv-remux-test` to avoid
external-volume stalls. Results and screenshots are written under
`results/remux-native/<timestamp>/`.

The second-container control uses the same codecs in MPEG-TS. With files staged
under the directory below, reproduce it using:

```sh
ffmpeg -hide_banner -loglevel error -y \
  -i /private/tmp/webmpv-remux-test/build/hybrid-performance/sample.mp4 \
  -map 0:v:0 -map 0:a:0 -c copy \
  /private/tmp/webmpv-remux-test/build/remux-native/sample.ts
MEDIA_ROOT=/private/tmp/webmpv-remux-test \
SOURCE=/private/tmp/webmpv-remux-test/build/remux-native/sample.ts \
VARIANTS=native-source,remux node experiments/remux-native/test.mjs
```

`SOURCE` must remain under `MEDIA_ROOT`. The direct source endpoint retains its
historical `/source.mkv` URL, but serves the actual file's MIME type (`video/mp2t`
for TS). A rejected direct container is recorded as a failed trial and gives a
nonzero exit status even if the subsequent remux trial passes.

Native reads the original MP4. Hybrid and Software read the MKV. Remux reads
that MKV using `-c copy`, `empty_moov+default_base_moof+frag_keyframe`, and 500 ms
fragments. FFmpeg bursts three seconds of input, then reads at playback speed.
For MPEG-TS input, `aac_adtstoasc` converts AAC packet framing for MP4 without
decoding or re-encoding audio; this is required by the fragmented MP4 muxer.
Node streams stdout to the HTTP response with pipe backpressure. No whole-file
Blob, completed output file, HLS library, or transcoding is involved.

The test checks frame throughput, playback clock advance, zero measured frame
drops, browser process stability, worker cleanup, and (for mpv) internal A/V sync
estimates and audio underruns. Failure data stays in the result; the process
returns nonzero for failed trials. FFmpeg job records establish whether the
first playable frame precedes process completion and track cancellation.

## Limits

- The startup counter is the backend's first available video-frame count,
  not independently measured screen illumination or acoustic output.
- Native does not expose mpv's A/V counters. Packet identity and timestamp
  checks do not establish perceptual lip sync.
- Remux seeking reopens FFmpeg with input `-ss 18`; the browser timeline resets.
  This proves a source restart, not exact or seamless seek or a production
  timeline mapping. Packet hashes confirm this fixture restarts at source
  16.021 seconds when 18 seconds is requested. Screenshots capture output after
  the restart.
- Input pacing limits generation during normal playback, but this prototype
  does not implement a strict buffer cap during a long pause. Long-duration
  memory, pause cancellation, arbitrary seeking, and network throttling need
  separate qualification.
- CPU is measured in percent of one core. Browser RSS sums process resident
  sets and can double-count shared pages. FFmpeg costs are separate; Node
  serving CPU is not included. Short headless runs are not device/browser-wide
  performance guarantees.

Packet-copy evidence is in `results/remux-native/packet-proof.json`. It compares
the MKV with an offline fragmented MP4 made using the same stream and mux flags.
Both compressed stream hashes match. Timestamp shifts are reported separately;
audio priming/rounding means timestamps are not byte-for-byte identical.
