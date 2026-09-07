# M3 follow-up: isolated processes and packet bridge

Declared 2026-09-07 before follow-up measurement. Preserve the original contract,
source files and result directories. This follow-up changes setup and adds an
explicit transport candidate; it does not relax the original acceptance limits.

Three variants: software/direct, copyback/direct, copyback/bridge. Each gets a
fresh headed Chrome process and fresh renderer/worker. Use the same pinned
engine, fixture, scaler, decoder settings and output checks as M3. Each timed
run warms its own decoder and Canvas for exactly one complete 32-second pass,
then measures three passes (96 seconds) without replacing the worker. Never
extend warm-up in response to observed RSS. Capture warm-up and measured samples,
but use only consecutive measured samples for CPU/RSS. Run three rotations:
S/D/B, D/B/S, B/S/D. No retained-frame work is part of this follow-up.

All variants place the same packet corpus in the real shared Emscripten heap
before playback. Direct variants read packet views in that heap. The bridge
variant's separate producer worker reads each requested access unit from that
heap, copies it into one owned transferable ArrayBuffer, and sends packet
metadata and bytes to the decoder worker over MessageChannel. The decoder
submits only after receiving it. Include the producer's CPU/RSS in browser-family
measurements, and record request round-trip, copy time, message counts and bytes.
Bound requests to one in flight and decoded packet/frame ownership to eight.
Validate request ID, generation, packet metadata and buffer length on every
reply; verify each packet hash during untimed correctness checks for all paths.

This measures a concrete shared-Wasm-heap-to-worker transport candidate. The
producer is JavaScript, not an installed mpv pthread/filter callback. Native pin
wakeup, packet lifetime and fallback integration remain future M4 responsibilities.
No claim of an integrated mpv bridge follows from this experiment.

Before measurement, all three variants must pass the four existing pixel grids
(MAE <=3 and p99 <=16), exact PTS, EOF drain and the 17.5-second reset/preroll
probe. During measurement require all 960 timestamps/presentations per pass,
<=1% frames >33.334 ms late after the first second of each pass, outstanding
ownership <=8, heap <=512 MiB and late-minus-early process-family median RSS
<=64 MiB. Record visibility and focus; visible document and a focused page are
required. They do not establish physical display latency or OS foreground time.

Use three paired net reductions of bridged copy-back versus software. Require
median >=30% and every pair >=20%, with all comparison/resource gates passing.
Direct copy-back quantifies incremental bridge cost, not the primary approval
metric. Report every pair and the range; do not discard an unfavorable run.
RSS windows use the original upper-middle median convention, first-third
samples excluding the first two measured samples, versus final-third samples.
CPU uses consecutive process counters; newly observed processes contribute their
current lifetime counter, and process disappearance is recorded as uncertainty.
No energy or hardware-acceleration claim is made.

Smoke is correctness plus one 32-second timed pass per variant, with the same
32-second warm-up. It cannot qualify. A full follow-up takes about 20 minutes.
G2 remains a separate explicit user decision on evidence and maintenance scope.
