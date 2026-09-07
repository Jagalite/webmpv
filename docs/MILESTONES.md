# Milestones and acceptance

The original architecture is preserved unchanged. Current implementation and
test evidence live in the validation records below; its historical “not run”
table is not a current status report.

| Stage | Deliverable | Current state |
|---|---|---|
| M0 | Reproducible upstream build and local software playback | Complete; `m0-software-baseline` |
| M1 | Bounded authenticated direct-file streaming, seek cancellation, controls and cleanup | Complete; `m1-streaming-baseline`; [evidence](validation/M1.md) |
| M2 / G1 | Qualified, usable software player and versioned source/artifact delivery | Complete; `m2-software-baseline`; [acceptance record](validation/M2.md) |
| M3 | Matched experiments comparing software playback with browser decoding | Not started; requires G1 |
| G2 | Explicit decision on benefit, patch cost and ownership of a decoder fork | Pending M3 evidence |
| M4 | Approved WebCodecs integration with CPU frame copy-back and software recovery | Requires G2 approval |
| G3 / M5 | Decision and optional retained-browser-frame integration | Requires measured need after M4 |
| S1 | Fixed HLS/DASH VOD with software decoding | Independent workstream after G1 |

M2 acceptance requires all Phase 1 matrix rows on the declared
[reference profile](M1-M2-PROFILE.md), including the full 60-minute measurement,
100 seeks and 100 player lifecycles. Interrupted or differently conditioned
runs remain evidence of their actual conditions and cannot replace the required
run. A profile revision must be written before requalification.

The release packager rejects failing qualification, a short or unshaped long
run, and changed runtime hashes. Delivery also requires equal independent native
builds and browser assemblies, an extracted-package smoke test, the supported
profile, source/build/patch records and raw results. Tag the accepted software
baseline only after these checks pass.

Passing G1 completes this software delivery. It permits proposing M3 or S1;
it does not authorize implementing M4 or M5 automatically.
