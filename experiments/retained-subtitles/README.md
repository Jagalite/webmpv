# Subtitles over retained VideoFrames

This experiment keeps mpv and libass responsible for subtitle decoding, fonts,
shaping, layout, timing and ASS animation. The browser draws their bitmap tiles
over the real retained VideoFrame selected by mpv. Full video pixels still avoid
the Wasm copy-back and software-render paths.

`subtitles.c` exports a bounded packet of A8/color or premultiplied BGRA tiles.
`web/subtitle-overlay.js` converts changed tiles into cached browser surfaces.
Each pending presentation holds the subtitle snapshot for its selected media
timestamp. Paused redraws reuse the held video frame and update the overlay;
seeks clear retained ownership and reject frames from earlier decoder generations.

The native packet allows at most 512 parts and 2 MiB of bitmap data. Exceeding
either bound stops the experimental renderer with an error. The browser expands
A8 tiles to RGBA and pending presentations can retain separate snapshots, so
2 MiB is a packet limit, not a total browser-memory limit. VideoFrame ownership
and pending presentation limits remain enforced by the retained presenter.

## Functional validation

The final build passed all six checks for both
[local playback](../../results/retained-subtitles/local-2026-09-08T00-38-24.421Z/result.json)
and an [unthrottled remote source](../../results/retained-subtitles/remote-2026-09-08T00-38-51.509Z/result.json).
Recorded inputs match their before/after hashes. Native layout mask precision
and recall were 100% within the stated three-pixel tolerance at 1080p and 720p.
During the local animation check, video advanced by 43 displayed frames, subtitles
updated 39 times, and audio advanced by 72,448 sample frames. All 256 transferred
VideoFrames were closed after the local suite; pending frames and workers reached
zero. Decoded-video copy-back time remained zero.

The [final screenshot](../../results/retained-subtitles/local-2026-09-08T00-38-24.421Z/ass-on.png)
shows the actual composited output. [Build provenance](../../results/retained-subtitles/build.json)
records native sources, hook command, local static libraries, engine hashes and
the unchanged accepted archive.

The harness checks six behaviors with the existing 12-second H.264/AAC MKV and
its embedded ASS tracks and attached font:

1. Paused Arabic shaping, accents, karaoke, vectors and overlapping text against
   native mpv reference images.
2. Subtitle visibility and unchanged bitmap caching while paused.
3. Placement after a 1920x1080 to 1280x720 canvas resize.
4. Backward seeks and karaoke color progression at 2.25 and 3.25 seconds.
5. Animated subtitles during actual retained video and advancing audio.
6. Track switching and closure of all transferred VideoFrames and workers.

Reference comparisons use subtitle-on/off masks, a 12-level RGB difference
threshold and a three-pixel edge tolerance. They require at least 95% precision
and recall in each relevant region. These are layout/coverage checks, not claims
of pixel-identical rendering. Karaoke additionally compares highlighted colors.

The test is headless and does not require the user's Chrome window to stay
foreground. The page includes test count and remaining-time feedback. It is a
functional check, not a CPU benchmark or endurance qualification.

### Remote-seek limitation

The 10 Mbps / 80 ms remote test exposed an existing seek problem: Matroska
resynchronization followed by a non-key first packet after decoder reset. The
WebCodecs guard then falls back to software. The unchanged production copy-back
player reproduces this under the same shaping; an earlier unshaped production
probe remained on WebCodecs. See the
[shaped production probe](../../results/retained-subtitles/production-shaped-remote-probe.json)
and [unshaped probe](../../results/retained-subtitles/production-remote-probe.json).
The production software fallback can display pixels; this retained presenter
does not yet have that fallback display path.

An isolated diagnostic that suppressed the read interrupt removed the Matroska
warning but still failed the keyframe guard. It was reverted. The final build
uses the unchanged production decoder and stream bridge. No keyframe guard was
relaxed. Remote seeking is not qualified by the successful local subtitle checks.

## Build and run

With the existing local SDK, static libraries and prior retained-presenter
experiment available, run from the repository root:

```sh
python3 experiments/retained-subtitles/prepare.py
python3 experiments/retained-subtitles/compile-hook.py
WEBMPV_EM_CONFIG="$PWD/build/gap.emscripten" WEBMPV_BROWSER_DECODER=1 bash experiments/retained-subtitles/link.sh
```

Reuse/start the app server on 4179 and fixture media server on 4180, then:

```sh
node tests/retained-subtitles.mjs
node tests/retained-subtitles.mjs --remote
```

`--remote --unshaped` runs the same checks without origin throttling. The manual
page at `/web/subtitled.html` downloads the short fixture completely before
opening it, using the local-file path rather than relying on remote seeking.

The isolated native hook links before the existing mpv archive. Generated Wasm
is ignored under `web/engine-retained-subs`. No Docker is used. Production
runtime files, the accepted release archive and earlier measured experiments
are preserved.

## Remaining scope

This is experimental subtitle composition, not M5 completion. It does not add
video filters. PGS/VobSub bitmap subtitles, non-square-pixel video, letterboxed
viewports, HDR blending, external subtitle/font loading, source replacement and
subtitle-enabled CPU/endurance measurements are not qualified by this fixture.
BGRA conversion is implemented but the current native reference suite exercises
ASS A8/color tiles. The retained presenter also needs a proper software-fallback
display path before production integration.
