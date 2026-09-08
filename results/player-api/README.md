# Three-mode API validation

The public API exposes `native`, `hybrid`, and `software`, in that order. Native is the default. Hybrid retains WebCodecs frames with mpv timing and subtitles; software uses the expanded FFmpeg engine and supports filters.

- [API checks](functional-2026-09-08T02-54-12.444Z/result.json): 15 passed, including native playback without Wasm, real retained frames, expanded software decoding, filters, mode/state transitions, rollback, terminal-backend recovery, cancellation and worker/frame cleanup.
- [Demo controls](demo-2026-09-08T02-54-29.670Z/result.json): passed, including all three modes, filter guards and Close reset. [Screenshot](demo-2026-09-08T02-54-29.670Z/software.png).
- [Legacy software regression](legacy-m0/m0-browser.json): nine checks passed, including ten complete lifecycles and subtitle composition.
- TypeScript build, four AudioWorklet unit checks and `git diff --check`: passed.
- [Integrity audit](audit.json): all 11 protected engine/client/worker hashes match the pre-change snapshot.

The default page is now `/web/player.html`. Historical tests explicitly target `/web/index.html` and the preserved `/web/legacy-example.html`; their engines remain unchanged. See [integration documentation](../../docs/INTEGRATION.md).

These are short headless functional checks, not performance measurements or new foreground-hour qualification. Hybrid video support remains H.264; native codec support depends on the browser; software format support depends on the FFmpeg build. Earlier failed attempts are retained in this directory; the linked final runs above passed. No Docker was used.
