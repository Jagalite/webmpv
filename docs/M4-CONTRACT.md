# M4 optional browser decoder integration

Authorized by the user's instruction to proceed with all remaining milestones.
This proceeds despite M3 failing the predeclared CPU benefit gate; that measured
result is preserved. Software remains the default and separately buildable.
The webmpv maintainers own the optional patch, rebases and qualification costs.
No claim of performance benefit follows from authorization or implementation.

Use mpv's decoder selection/filter seam. Admit only H.264 SDR avcC initially,
keep AAC in software, and return owned CPU I420/NV12 frames through mpv's existing
filter, subtitle, clock and software render path. Absent APIs, unsupported
configuration and decode errors recover through software. Compressed replay
starts at a retained keyframe, is bounded to 16 MiB / 256 packets, and suppresses
already-delivered output. Exhaustion falls back before discarding recovery data.

Bridge operations must have finite deadlines and generation identity. Copy packet
bytes before releasing native ownership; close all browser VideoFrames exactly
once, including reset/error paths. Bound outstanding browser decode inputs to
eight and copy buffers to one per active output. Report chosen decoder, fallback
reason, queue peaks and resource ownership in diagnostics.

Required checks: real B-frame playback, ASS/audio/seek preservation, drain/EOF,
unsupported/API-absent fallback, mid-GOP injected failure and keyframe replay,
seek/destroy during pending work, repeated lifecycles, and both software and
optional-artifact regressions. Full G1 requalification and independent builds
remain required before claiming release acceptance. Retain raw hashes/evidence.

G3 evaluates measured integrated copy-back cost after M4. M5 proceeds only when
retained frames offer a demonstrated benefit and can preserve CPU filters,
subtitle fidelity, download fallback and bounded frame lifetime. A decision to
defer M5 closes the evaluation gate, not the M5 implementation milestone.
