# Review fixes after 5380bc4

All four correctness findings from the post-push review are addressed.

- Hybrid's current presentation position updates on every newly drawn frame, independently of the bounded diagnostic history. Seek/close clears the current position. The API no longer reads the historical sample array for seek completion.
- Retained video is centered and fitted to the canvas with black bars, using demux sample aspect ratio and rotation. The same drawing path handles paused redraws and restores canvas coordinates before subtitle composition.
- Destroy starts cancellation on both current and candidate backends before waiting for queued operations, allowing a pending current subtitle request to release immediately.
- Opening a replacement source resets source-specific track choices to auto. First-open configuration and same-source mode/filter reopen behavior remain supported.

## Verification

[The final API run](functional-2026-09-08T11-09-31.263Z/result.json) passed all 19 checks. Its new regression evidence includes:

- A deliberately prefilled 10,000-entry diagnostic history remains stale, while actual Hybrid seeking succeeds at position 3 seconds. This exercises the cap without requiring thousands of real-time frames.
- A 16:9 video on a 640x480 canvas has black letterbox pixels during initial presentation and paused redraw, with nonblack video inside.
- A stalled current native WebVTT request cancels with `Player is destroyed`; public destruction completed in 0.5 ms in this sample, compared with 14.9 seconds in the original review probe. This is cancellation evidence, not a performance benchmark.
- Opening another native source after explicit subtitle/audio choices succeeds, clears old tracks, and preserves volume.

Three presentation geometry unit checks passed (letterboxing, non-square pixels, rotation/restored subtitle coordinates), alongside four AudioWorklet checks. `npm test` now includes both unit files and the 19-check API suite. TypeScript compilation and the diff whitespace check passed.

The [demo control check](demo-2026-09-08T11-10-18.687Z/result.json) verifies mode changes, filters and Close. The retained-worker generation path produces the fixed worker exactly, so regeneration preserves these fixes.

Native engine binaries were not rebuilt. Historical acceptance and measurement results remain evidence of their original inputs; these changes do not establish a new endurance or performance qualification. No Docker or long foreground run was used.
