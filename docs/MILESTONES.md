# Milestones and acceptance

The original architecture is preserved unchanged. Current implementation and
test evidence live in the validation records below; its historical “not run”
table is not a current status report.

| Stage | Deliverable | Current state |
|---|---|---|
| M0 | Reproducible upstream build and local software playback | Complete; `m0-software-baseline` |
| M1 | Bounded authenticated direct-file streaming, seek cancellation, controls and cleanup | Complete; `m1-streaming-baseline`; [evidence](validation/M1.md) |
| M2 / G1 | Qualified, usable software player and versioned source/artifact delivery | Complete; `m2-software-baseline`; [acceptance record](validation/M2.md) |
| M3 | Matched experiments comparing software playback with browser decoding | Follow-up complete; memory passes, net CPU benefit fails; [evidence](validation/M3-followup.md) |
| G2 | Explicit decision on benefit, patch cost and ownership of a decoder fork | Approved by user to proceed despite M3 recommendation to defer |
| M4 | Approved WebCodecs integration with CPU frame copy-back and software recovery | Complete with user-accepted 57:38 endurance exception; [candidate acceptance](validation/CANDIDATE.md) |
| G3 | Integrated copy-back cost evaluation | Complete; median paired CPU reduction 20.1%; [decision](validation/G3.md) |
| M5 | Optional retained-browser-frame integration | Deferred by G3; further net benefit is unproven |
| S1 | Fixed HLS/DASH VOD with software decoding | Complete for the declared fixed-VOD profile; [evidence](validation/S1.md) |

The clean software candidate also passed full G1 requalification. The optional
M4 candidate has a specific user-approved exception for its interrupted 57:38
run; its original strict gate result remains failed. See the acceptance record
above. M5 is deferred, not implemented.

Baseline M2 acceptance requires all Phase 1 matrix rows on the declared
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
