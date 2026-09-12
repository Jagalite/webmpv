# API migration

The current baseline is demo-source 8bb451b, not the older main implementation.
All existing playback methods remain; no fourth mode or raw command passthrough
is introduced. Keep `volume(75)` and `rate(1.5)` as-is, or use `setVolume(.75)` and
`setPlaybackRate(1.5)`. Use `setMuted(true)` instead of storing a second volume.

Replace UI reads of time-pos/duration/track-list with `player.state` and
`player.subscribe(state => render(state))`. Unknown duration/ranges are null.
Use state.mediaInfo for geometry and state.capabilities.features for availability;
legacy boolean flags are retained. Use stable `state.audioTracks` and
`state.subtitleTracks` IDs with selectAudioTrack/selectSubtitleTrack. Legacy
selectTrack continues to accept backend IDs.

Replace destroy-and-recreate on Close with await player.close(). Keep destroy for
final teardown. Pass an AbortSignal to open rather than destroying the working
session to cancel a replacement. Catch PlayerError; the error event now carries
structured error detail instead of an untyped backend string. mpv, modechange and
selectionchange remain advanced interfaces.

The optional component is a separate `webmpv/player` import. Custom controls use
exactly the same Player API. Runtime static directories continue to work; the
assetBase and copy-assets interfaces are described in RUNTIME-ASSETS.md. These
interfaces are undergoing milestone validation; see PUBLIC-API-VALIDATION.md for
implemented versus qualified behavior and remaining release gates.

```js
// Before
player.addEventListener('mpv', ({detail}) => {
  if (detail.name === 'time-pos') updatePosition(detail.data);
});
// After
const unsubscribe = player.subscribe(state => updatePosition(state.currentTime));
```

`modechange.detail.mode` in a loading/failed event is the candidate, not necessarily
the accepted session. Prefer state.activeMode for viewer labels. It is null when
idle. player.mode retains its historical idle route value. Rendering status uses
observed progress; playbackIntent is distinct. Do not wait for playing to resolve
an open: sources intentionally open paused. `seeked` accompanies a settled seek,
not command submission.

The migrated playground source uses the optional component. Earlier recorded
playground screenshots/tests describe its predecessor and are preserved as
history. The public Pages deployment remains unchanged until publication is
separately authorized. This work has not published a new npm package or closed
the independent clean-engine-build release gate.
