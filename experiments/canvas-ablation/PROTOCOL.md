# Canvas output ablation

Compare the full WebCodecs copy-back mpv path against that same path skipping
only ImageData allocation/copy, alpha fill and putImageData submission. Use
isolated generated experimental bindings; production runtime remains unchanged.
Both arms use the same experimental worker and native binaries. The bypass is
not a usable player: frames are rendered and acknowledged but not displayed.
Keep mpv software rendering, frame acknowledgement, decode, audio and pacing.

Use the prior three-way fixture, origin shaping, dimensions, fresh Chrome,
foreground guard, 30-second warmup and at least 60-second measurement. Run three
pairs in full/bypass, bypass/full, full/bypass order. A short headless smoke is
not performance evidence. No concurrent builds or tests during measurements.

Require >=29 rendered frames/sec, decoded/rendered counts within 12 frames,
audio progress >=95% of the AudioContext sample rate, playback progress within 3%, <=1% drops,
no fallback, stable process membership, bounded decoder queues and clean teardown.
Full must submit every acknowledged frame; bypass must submit zero and accrue
zero Canvas-stage time. Save CPU, RSS, decoding, rendering, audio and foreground
samples plus hashes before/after. Report each pair and median paired CPU savings.

A consistent CPU decrease supports the causal cost of the removed output stage,
including its downstream browser work. It does not isolate individual copies,
prove hardware use, explain all native-browser differences or qualify an M5 path.
Wall timings are not CPU timings. Preserve failures without relaxing this contract.
