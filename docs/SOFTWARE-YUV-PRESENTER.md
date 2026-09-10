# Experimental Software YUV presenter

Software still uses RGB rendering by default. To build and explicitly choose the
integrated experimental presenter:

```sh
npm run build:software-yuv
npm run build
```

```js
const player = new Player(container, {
  mode: 'software',
  softwarePresenter: 'experimental-yuv',
});
```

This is a presentation choice within Software, also applied when automatic selection
reaches Software if explicitly requested. It does not change Native or Hybrid and
requires no WebCodecs. The optional engine assets must be served with the library.
No production default is changed and no broad qualification is asserted.

Beta follow-up isolated a shared RGB/YUV seek-read failure: interrupting a bounded
stream read could feed a partial packet to FFmpeg. The maintained workers now let
that read complete. Controlled legacy-worker failures and new exact-target checks
are recorded in [beta results](../results/beta/README.md). This scoped correction
does not establish broad seek/endurance or performance qualification. Keep the
presenter experimental and retain every earlier failed run.

The native backend keeps mpv's decoding, audio, clock, filters and rendering lock.
SDR 8-bit YUV420P with BT.601/709 matrix/range and quarter-turn rotation uses three
reusable WebGL2 plane textures. Libass composition uses a separate texture with
changed-rectangle uploads. Other qualified pixel formats use mpv's CPU RGB renderer
and GPU RGB upload; unsupported rotated fallback output rejects explicitly. The old
RGB allocation remains, so there is no general memory-saving claim. HDR output
fidelity and high-bit-depth GPU conversion remain outside this qualified subset.

The current Software worker owns both presenters, source I/O and resource cleanup;
there is no copied production worker or second playback scheduler. GPU context loss
pauses through mpv, recreates textures on restoration and redraws. The explicit
experimental option requires WebGL2; failure to initialize it is an error, not a
silent conversion to another renderer. Native mpv private rendering interfaces are
version-pinned and require review when upgrading mpv.
The separate optional Wasm artifact also adds build time and distribution size;
applications choosing RGB do not load it at runtime.

1080p YUV uploads explicitly copy/upload 3,110,400 bytes per frame, plus subtitles.
Browser/driver internal copies are not measured. PNG extraction is an explicit
readback operation. Integration results and fresh comparisons are recorded under
[software-yuv-integration](../results/software-yuv-integration/README.md); earlier
prototype results are preserved separately.
