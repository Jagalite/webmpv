# Clean candidate acceptance

The clean software candidate passes strict G1 requalification. The optional
M4 candidate is **accepted by the user with an explicit endurance exception**:
its foreground run ended at 57:38 instead of completing the required hour.
The original optional test remains failed. This is development-candidate
acceptance, not publication of a new release.

The [machine-readable acceptance record](../../results/development/candidate-acceptance.json)
links every result and the current runtime hashes. All six runtime before/after
records are unchanged and match the installed files. Independent native builds
and separately assembled browser bindings were already verified; see
[M4 provenance](M4.md). The accepted 0.2.0 archive is unchanged.

| Backend | Foreground functional | Foreground supplemental | Endurance |
|---|---|---|---|
| Software | [8/8, including 100 lifecycles](../../results/development/software/functional-2026-09-07T20-10-00.910Z/functional.json) | [7/7](../../results/development/software/supplemental-2026-09-07T20-20-42.700Z/supplemental.json) | [3607.233 seconds; all gates pass](../../results/development/software/long-2026-09-07T20-23-22.906Z/long.json) |
| Optional | [8/8, including 100 lifecycles](../../results/development/webcodecs/functional-2026-09-07T20-16-29.790Z/functional.json) | [7/7](../../results/development/webcodecs/supplemental-2026-09-07T20-21-28.855Z/supplemental.json) | [3458.271 seconds; interrupted, user accepted](../../results/development/webcodecs/long-2026-09-07T21-23-56.152Z/long.json) |

## Endurance evidence

| Metric | Software full run | Optional interrupted run |
|---|---:|---:|
| Matched sync signals | 3590 | 3447 |
| Sync p95 / maximum | 21.95 / 30.65 ms | 21.23 / 29.92 ms |
| Rendered / dropped in declared ten-minute window | 18052 / 0 | 18077 / 1 |
| Maximum Wasm heap | 128 MiB | 128 MiB |
| Median late-minus-early process RSS | +50.7 MiB | −299.1 MiB |

Optional metrics come from the [separate diagnostic analysis](../../results/development/webcodecs/long-2026-09-07T21-23-56.152Z/partial-analysis.json);
its original harness stopped before calculating a full-run verdict. The chosen
optional decoder remained active and no player errors were recorded. 659 of
660 foreground samples matched; the terminal sample found T3 Code active.
Both runs recorded audio underruns at the file-loop boundary. Looping remains
non-gapless; the predeclared sync exclusions were retained.

## Explicit user exception

After being told that the optional run lost foreground at 57:38 and would
require another full hour, the user instructed: “thats good enough, use that.
its pretty much 1h”. This accepts the measured shorter run and its terminal
focus interruption for this candidate. It also means the duration-dependent
full-hour sync-count requirement was not met. No threshold, raw result or
historical failure has been relabeled. The baseline release packager still
requires its original full qualification evidence.

M0–M4 and S1 work is closed within the declared scope, with the M4 exception
above. G3 evaluation is complete; [M5 remains deferred](G3.md), not implemented.
Software remains the default. No Docker was used and no new release package,
commit, push or tag was requested.
