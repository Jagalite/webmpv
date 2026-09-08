# Hybrid performance optimization

The final change is the retained-worker scheduler in
`experiments/filter-routing/retained-scheduler.py`, applied by the existing worker
generator. Active polling uses 10 ms; settled paused polling uses 100 ms. Commands
and resize restart work immediately. Canvas rendering, audio timing messages,
software mode and native engine binaries remain unchanged from the baseline.

[Final results](../../results/hybrid-performance/README.md) include the alternating
comparison, observed CPU ranges, rejected component experiments and limitations.
[Protocol](PROTOCOL.md) describes reproduction and the immutable `79c2daf` baseline.
[Final demo validation](../../results/player-api/demo-2026-09-08T12-26-07.314Z/result.json)
passed after the scheduler change.

This is a short headless development screen. It does not qualify native parity,
foreground performance, long-run reliability, animated-subtitle performance or
all supported formats. Everything from this optimization pass is left uncommitted.
