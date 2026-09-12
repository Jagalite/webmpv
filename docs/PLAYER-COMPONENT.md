# Optional player component

This is the target contract; qualification is recorded separately. Import
`definePlayerElement` from `webmpv/player` and call it once (repeat calls with the
same implementation are harmless). Core import does not import UI or register a
tag. SSR imports are safe; registration and construction require a browser.

`<webmpv-player controls asset-base="/assets/webmpv/" poster="/preview.jpg">`
creates one Player on connection. ready resolves with that core; player exposes it
read-only after initialization. open, close, destroy and playback conveniences
delegate to it. The component contains no route selector or playback scheduler.

src is a remote URL. Changing it cancels a previous pending source open; only the
latest accepted change wins. Removing src closes media. Programmatic open accepts
all core source types. autoplay requests play only after acceptance and reports
normal browser policy rejection without fallback. muted reflects configured mute;
controls toggles controls; poster is an idle/loading preview. asset-base is fixed
after initialization and rejects changes. Set it before connection. Pre-upgrade
properties are replayed on upgrade. Boolean attributes follow HTML presence rules.

A microtask grace period preserves playback during synchronous DOM moves. Actual
removal aborts work and destroys the owned core; reconnect waits for that cleanup
before creating the next core. Explicit destroy is terminal, including reinsertion.
ready waits for connection; destroy before connection rejects it.

The open shadow root includes stage, controls, settings and status parts, CSS
variables for background/foreground/accent/border/radius, and before-controls /
after-controls slots. Labels can be overridden before or after connection.
Controls use semantic buttons/ranges/selects, visible focus, scoped keyboard
shortcuts, local drag preview, and an aria-live status that excludes time updates.
Settings restore focus on close. Fullscreen requests the component container in
the user gesture, keeping controls and subtitles together. PiP/casting are not
qualified. Loading, live windows and errors use core state only.

Forwarded core events are dispatched once with unchanged detail, bubbles:false;
listen directly on the element. No event-name aliases are generated. Component
lifecycle failures use error with a structured operation-scoped detail.

## Embedding and styling

```js
import {definePlayerElement} from 'webmpv/player';
definePlayerElement();
const element = document.querySelector('webmpv-player');
element.labels = {play: 'Lire', pause: 'Pause', settings: 'Réglages'};
const core = await element.ready;
const unsubscribe = core.subscribe(state => console.log(state.status));
await element.open(file, {signal: controller.signal});
// Later: await element.close() to reuse, or await element.destroy() to finish.
```

Methods also include play, pause, seek, setVolume, setMuted, setPlaybackRate,
selectAudioTrack, selectSubtitleTrack and addSubtitle. Advanced font, filter,
tone-mapping and source policy methods are available through the read-only player
reference. Replacing that reference is unsupported. Use a new element for a
new asset-base; the old one must finish cleanup first. An asset-base attribute
change after initialization is reverted and reports INVALID_ARGUMENT.

```css
webmpv-player {
  --webmpv-background: #121318;
  --webmpv-foreground: #f2f1f7;
  --webmpv-accent: #b7a0ff;
  --webmpv-border: #393941;
  --webmpv-radius: 16px;
}
webmpv-player::part(controls) { padding-inline: 20px; }
```

Stable parts: container, stage, controls, settings, error, status. Limited slots:
before-controls and after-controls. Shadow IDs/classes are implementation details.
Controls stay visible, including while focused. Keyboard shortcuts apply only to
focus inside the component stage: Space/K, arrows, J/L, M, C, brackets, digits,
Home/End, F and ?. Inputs, buttons, selects, editable content and modified keys
retain their normal handling. C uses the core's subtitle visibility setting;
it does not select a different language. Scrubbing previews locally; release
commits one seek. Settings are an accessible disclosure and restore trigger focus.

Local file/subtitle pickers are available in settings; opening files never uploads
them. The component contains no example media, remote URL form, engine selector,
raw filters, memory metrics or diagnostics panel. The playground supplies these
surrounding developer tools. A live stream with no known seek window shows LIVE
and disables the finite seek control. Browser fullscreen denial produces a message;
no fake fullscreen, PiP or casting fallback is applied.
