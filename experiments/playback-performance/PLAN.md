# Software and Hybrid performance work window

Authorized window: 2026-09-08 12:29:14 to 22:29:14 UTC (10 hours).
All changes remain uncommitted. No Docker or long foreground holds.

Baseline: current working tree at the start of this window, including the earlier adaptive Hybrid scheduler. Exact runtime bytes and hashes are preserved in `build/playback-performance/baseline/`.

1. Profile matched Software and Hybrid playback, including rendering, audio, worker polling and paused behavior.
2. Isolate software frame-copy and render optimizations; prove pixels, subtitles, filters, seeking and cleanup remain correct.
3. Reduce avoidable Hybrid work at the existing mpv/WebCodecs ownership seam; preserve frame lifetime and audio synchronization.
4. Run balanced comparisons across representative resolution, codec and feature cases. Reject regressions; retain limitations and raw results.
5. Finish with API, format, resource and lifecycle regression checks, source/build reproducibility and an evidence-backed report.

Short headless CPU screens guide engineering; they do not qualify native parity or foreground endurance. Do not run builds concurrently with measured CPU windows.
