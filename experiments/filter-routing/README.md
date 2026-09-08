# mpv video-filter compatibility routing

`web/filter-player.js` adds an experimental `FilterPlayer` facade over the retained
subtitle player and an isolated full-frame copy-back engine. An empty video-filter
chain chooses retained VideoFrames. Any nonempty chain chooses full decoded pixels
through mpv's filter and software-render pipeline. WebCodecs remains the preferred
video decoder on both routes; selecting a video filter does not force software
decoding. The copy-back route can also display the native decoder's software
recovery frames.

This is the compatibility step, not GPU-accelerated filtering. Common effects
can be ported to a GPU presenter later without claiming equivalence to arbitrary
mpv/FFmpeg filter graphs.

## Behavior

Filter changes create a candidate engine and reload the source at the current
position. The existing engine pauses and keeps its picture until the candidate
has presented the target frame. The facade restores pause/play state, rate,
volume, audio/subtitle track IDs, subtitle visibility and its audio-filter setting.
After success it publishes the candidate and destroys the previous engine. A
candidate error rejects the operation, destroys the candidate, and resumes the
previous player if it was playing. This entails a visible/audible reload gap;
seamless switching is not claimed. At most two engines overlap during a change.

Commands serialize through a bounded 32-operation queue. Repeated selection of
the same filter string does nothing. Clearing the chain returns to the retained
route. Shutdown cancels an opening candidate and releases its source reference,
worker owners, AudioContexts and frames. A bounded diagnostic history records
recent engine cleanup results.

The experiment's retained worker also retires frames older than mpv's selected
presentation timestamp, while preserving pending scheduled frames. Seek-preroll
cutoffs remain active after mpv reports seek completion, covering late-arriving
decoder-worker messages. This fixes a frame-bound failure found during restoration.
The earlier subtitle and performance workers are preserved unchanged. Under queue pressure, the filter experiment now services mpv selection before accepting another frame; the 16-frame ownership bound includes the held frame. A fatal receive error closes retained ownership and stops the presentation timer.

Subtitles on the filtered route are composed by mpv's software renderer after
video filtering. The retained route continues to use the qualified libass bitmap
overlay. Mirroring the video therefore leaves subtitle text upright.

## API and demo

```js
import {FilterPlayer} from '/web/filter-player.js';
const player = new FilterPlayer(document.querySelector('#surface'));
await player.open(file); // File or ArrayBuffer, up to 32 MiB
await player.play();
await player.setVideoFilters('hflip');
await player.setVideoFilters('crop=960:540:480:270');
await player.setVideoFilters(''); // restore retained VideoFrames
await player.destroy();
```

The facade also exposes `openRemote`, `seek`, `pause`, `rate`, `volume`,
`selectTrack`, `subtitleVisible`, `resize`, `properties`, `diagnostics` and
`audioDiagnostics`. Remote authorization callbacks stay on the host. ArrayBuffer
sources are snapshotted for later reloads; File sources remain immutable objects.
The container owns its canvas, which is replaced on successful route changes.
Consumers should use facade methods and events rather than retain canvas or
backend references.

`command('set','vf',chain)`, `command('vf','set',chain)` and
`command('vf','clr','')` route through the facade. Supported state-setting
commands are preserved across replacement. Other arbitrary commands, including
incremental `vf add/remove/toggle`, are rejected rather than silently bypassing
routing. Filter settings made before a source opens are validated when opening.

Open `/web/filters.html` on the app server for a manual demo. It downloads the
short fixture before opening and provides mirror, flip, negative, grayscale and
crop controls. Functional tests run headlessly and require no foreground hold.

## Build

The baseline FFmpeg configuration enabled only conversion and null video filters.
The isolated library adds `hflip`, `vflip`, `crop`, `lut` and `negate`. `format`
and `scale` remain available. This is not a build of every FFmpeg filter; unsupported
filters must fail visibly and leave the previous source usable.

```sh
python3 experiments/filter-routing/prepare.py
bash experiments/filter-routing/build.sh
node tests/filter-routing.mjs
node tests/filter-routing-lifecycle.mjs
```

The script configures and builds only an isolated libavfilter under
`build/obj-filter-ffmpeg`, then links it with existing libraries and unchanged
production native player/decoder/stream sources. It never installs over the
baseline prefix. The compatibility binary lives under ignored
`web/engine-filter-copyback`. No Docker is used. Prior accepted and measured
engines remain unchanged.

## Limits

The first qualification covers the local H.264/AAC MKV fixture and listed filters.
The existing throttled remote seek issue remains relevant to route replacement,
which reloads and seeks. Remote/HLS/DASH switching, EOF switching, arbitrary
filter chains, external subtitles/fonts, independent A/V synchronization,
prolonged switching and a fully seamless transition are not yet
qualified. Persisted commands are deliberately limited to the facade's API.
No general M5 completion or production integration is claimed.

## Verification

All eight [functional checks](../../results/filter-routing/functional-2026-09-08T01-10-24.657Z/result.json)
and four [lifecycle checks](../../results/filter-routing/lifecycle-2026-09-08T01-10-47.462Z/result.json)
passed against the final runtime inputs. The suites cover:

- Retained playback without filters; full-frame WebCodecs when filters are set.
- Mirroring, vertical flipping, center cropping, negative and grayscale output.
- Position, rate, volume, pause state, audio/subtitle track restoration.
- Subtitles composed after video effects and restored on the retained route.
- Advancing audio/video across a filter switch during playback.
- Invalid-filter rollback while paused and while playing.
- Serialized filter changes, filtered seeks/resizing and local source replacement.
- Shutdown during candidate initialization and complete worker/frame cleanup.

Sampled mirror and vertical-flip pixels exactly matched the corresponding
coordinates in the unfiltered copy-back image. Center crop had mean absolute
channel error 0.77/255 against mapped source samples. The subtitle on/off masks
retained 99.999% coverage within a three-pixel tolerance after mirroring the
video. Grayscale channels differed by at most two levels. These are fixture
checks, not exhaustive format or filter-graph qualification.

The [mirrored screenshot](../../results/filter-routing/functional-2026-09-08T01-10-24.657Z/flipped-on.png)
shows real filtered video with upright ASS text. [Build provenance](../../results/filter-routing/build.json)
records the isolated library and confirms unchanged shared native inputs,
production engines, prior subtitle engine and accepted archive. Earlier failed
development attempts remain separate from the passing final evidence.

The [quick performance comparison](PERF-RESULTS.md) completed all three foreground trials; it also documents the subsequent queue-pressure fix and final regression checks.
