# Software playback profile

M1 and M2/G1 are accepted for this declared software profile. See the
[M2 acceptance record](validation/M2.md) for measured results and limitations.

| Area | Implemented and exercised boundary |
|---|---|
| Device | Apple M1 MacBookAir10,1, 8 GiB RAM, macOS 26.5.2 |
| Browser | Google Chrome 152.0.7977.76, isolated secure/localhost page |
| Decode | Upstream FFmpeg in threaded Wasm; browser decoder globals removed during acceptance |
| Video | H.264 High, SDR 8-bit yuv420p; controlled 1920×1080 at 30 fps and supplied 24000/1001 fps MKV |
| Audio | AAC LC, stereo, 44.1/48 kHz sources, resampled by mpv to AudioContext's rate |
| Containers | Indexed MP4 with front/tail moov; indexed MKV with tracks and attached fonts |
| Remote input | HTTP(S) 206 ranges, stable length/identity representation, strong ETag or explicit immutable contract |
| Authentication | Caller headers, credentialed cookies, origin allowlist and one asynchronous renewal after 401 |
| Network recovery | Truncated body resume, retryable statuses, watchdog, 5-second outage, seek interruption and terminal destroy |
| Subtitles | ASS via libass, attached/bundled DejaVu and supplied MKV fonts; shaping, accents, karaoke, vectors, overlap and paused redraw |
| Rendering | CPU-backed libmpv software output to Canvas 2D, up to 1920×1080; fast bilinear scaler with reduced chroma interpolation quality |
| Controls | Pause/resume, exact seek, audio/subtitle tracks, visibility, volume, 0.5–2× speed and explicit output sizing |
| Local files | At most 32 MiB, copied into WasmFS; use remote ranges for large sources |
| Memory | 128 MiB initial / 512 MiB maximum heap; 16 MiB HTTP LRU; one 256 KiB active body and mailbox; 8192 stereo PCM frames |
| Parser/fonts | 32 MiB libavutil allocation cap, 64 streams/probe packets; at most 32 retained attachments, 4 MiB each / 16 MiB total |

Over-budget attachments are omitted with an explicit native log event, and their
font fidelity is unsupported. Global heap/allocation limits also constrain
FFmpeg's initial attachment parsing. These limits do not constitute a hostile
media security certification.

The controlled 1.16 GB MP4s have approximately 1.9 MB indexes. Warm startup
passed the 3-second target with little margin on the shaped 10 Mbps / 80 ms
connection; the exact runs and byte counts remain in the raw results. The
supplied higher-bitrate MKV is additional compatibility evidence, not the
controlled 5 Mbps performance fixture. Cold engine initialization is separate
from warm media startup. Other index structures and GOP lengths can change
startup and exact-seek cost.

No browser-unsupported codec configuration has been established for this
declared H.264/AAC profile. No claim is made for other browsers/devices, multiple
simultaneous instances, arbitrary codecs, HDR, surround output, network
redirects, segmented/live streams, DRM, hardware acceleration or WebCodecs.

The final shaped hour measured 18.8 ms p95 / 25.2 ms maximum output sync error,
zero drops in the required ten-minute window and zero drops across the hour.
Wasm stayed at 128 MiB, HTTP cache at 16 MiB, and median browser-process RSS
decreased by 65.2 MiB between the declared windows. Median browser CPU use was
56.2% of one core. File-loop boundaries produced brief PCM underruns and are
excluded from steady-state sync as declared in advance.

Exact MKV seeks use a half-second demux preroll through a public mpv option.
MP4 uses zero additional preroll. Warm startup explicitly follows playback of
unrelated local media on the same engine; first-use startup can exceed three
seconds. See the qualification contract for the full cache-state definition.

## S1 development checkout (not an accepted release)

Finite single-video HLS TS/fMP4 and single-period static DASH fMP4 now use nested
browser resource loading with software decode. Synthetic 640×360 H.264/AAC tests
cover alternate stereo audio, HLS single-resource WebVTT subtitles, fMP4 init and
byte ranges, nonzero timestamp offsets, missing-segment recovery, seeks and
teardown. TS and fMP4 timestamp-reset discontinuity seeks also pass.
These S1 checks do not extend the M2 performance
or long-run qualification to segmented media. See [S1 evidence](validation/S1.md).
