# Expanded FFmpeg software playback

This profile removes the original small decoder/demuxer/filter allowlists. It
uses the pinned FFmpeg 7.1.1 defaults to enable built-in playback components that
compile for Wasm, including GPL filters (the existing mpv build is already GPL).
It reuses the already bundled zlib, libxml2 and libass. No external codec libraries
are added. The mpv software renderer, audio output, subtitle renderer and browser
I/O remain the existing implementation.

Build with `npm run build:software-full`. This requires the existing local SDK,
patched sources, mpv archive and dependency prefix from the main build. It uses
`build/gap.emscripten` by default; `WEBMPV_EM_CONFIG` can override that local SDK
configuration. No Docker is used. FFmpeg objects are isolated under
`build/obj-software-full-ffmpeg`; nothing is installed over `build/prefix`.
The output is `web/engine-software-full`, and all FFmpeg archives at link time
come from the expanded build. The accepted and previously measured engines are
preserved.

Run `npm run dev`, then open `/web/software-full.html`. The local-file picker
accepts any extension and lets mpv probe the contents. For an integration, import
`BrowserPlayer` from `/web/generated/software-full-player.js`. Its existing API
supports subtitles and software `vf`/`af` commands. This entry point always uses
software decode. Native browser and retained WebCodecs entries are unchanged.

`npm run fixtures:software-full` generates short original 320x180/24fps fixtures
using the host FFmpeg. With the app server at port 4179,
`npm run test:software-full` runs headless checks with browser codec APIs disabled.
Tests verify media tracks, actual video pixels, audible audio samples, seeking,
text subtitle pixels, software filter transformations, range I/O and worker
cleanup. The final case also exercises the existing 1080p fixture. These are
functional checks, not CPU benchmarks or qualification of every registered codec.

The build inventory in `results/software-full/build.json` records enabled and
new registrations, artifact sizes, and source/configuration/library hashes.
Decoder registrations must not be described as distinct playable formats:
several registrations share a codec, and compiled decoders can have runtime
requirements. In particular, FFmpeg 7.1.1's built-in AV1 decoder has no software
reconstruction: AV1 still needs an external library such as dav1d. Its compiled
registration is not evidence of software AV1 support.

Encoding, muxing, devices, hardware acceleration and native network protocols are
outside this playback profile. Components requiring unavailable external libraries
are left disabled by FFmpeg's dependency checks. Existing limits remain: 1080p
pixel cap, 512 MiB Wasm maximum, 32 MiB individual allocation and local-file cap,
stereo output, browser URL access/range requirements, and existing segmented-VOD
restrictions. Enabling a codec does not establish real-time playback for all
profiles, resolutions, files or filters.

Qualification details: select subtitle tracks before seeking into a cue, and
select software video filters before opening the source. The pixel checks cover
that explicit configuration flow; live filter reconfiguration is not qualified
here. The original and expanded players both show a buffered-output offset in
`time-pos` after pausing and seeking an audio-only file (about 0.17–0.21 seconds
in the diagnostic sample). The audio tests record that offset and verify seek
completion plus resumed position and audible samples; they do not claim exact
paused audio-only time reporting. See
`results/software-full/audio-seek-diagnostic.json` for the baseline comparison.
