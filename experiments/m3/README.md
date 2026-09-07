# M3 standalone decoder comparison

Read [the predeclared contract](../../docs/M3-BENCHMARK.md) and
[the integration review](../../docs/M3-INTEGRATION-REVIEW.md). This harness is
isolated from production mpv and the accepted M2 archive.

From the repository root:

```sh
npm ci
bash experiments/m3/build.sh
python3 experiments/m3/make-fixture.py
node scripts/serve.mjs
```

The build requires the existing stock Emscripten 4.0.14 installation under
`build/emsdk-4.0.14` (or `WEBMPV_SDK`) and the hash-locked FFmpeg archive in
`build/downloads/ffmpeg.tar.gz`. A separate configuration, cache and source tree
are used under `build/m3`. The existing FFmpeg dependency patch is applied; the
build does not invoke or overwrite the production linker or release manifests.
Fixture generation requires native FFmpeg with libx264 and ffprobe. Generation
records the exact tool version, command, media hash and every demuxed packet.
Generated media and engine files stay ignored; provenance stays in `results/m3`.

In another terminal:

```sh
node --test experiments/m3/assess.test.mjs
node experiments/m3/run.mjs --smoke
node experiments/m3/run.mjs
node experiments/m3/assess.mjs results/m3/measurement-TIMESTAMP/result.json
```

Chrome must be installed. Runs use a separate visible Chrome instance and local
process CPU/RSS collection. Keep the test window visible and avoid competing
builds or benchmarks. A full run takes about 15 minutes; smoke runs use one
32-second pass per path and cannot qualify. Each invocation creates a new result
directory, preserving earlier failures. `RESULT_DIR` overrides that location and
must name an unused directory. `BENCH_URL` overrides the complete index URL.
The range/media server and the production engine are not required by M3.

Quality/seek checks precede paced playback. Copy-back pixel failure stops the
performance suite. A retained-path pixel failure leaves that path diagnostic;
it cannot support a retained-frame quality/benefit claim. Assessment recomputes
completeness, timestamps, delivery, memory and benefit gates rather than treating
a timing result or the runner's `passed` field as authorization.

Output includes a source/runtime hash manifest, timestamp traces, sampled RGB
values, stage timings, raw per-process CPU samples, RSS, visibility, warm-reset
startup/seek timings and a screenshot. CPU percentage is relative to one core.
The timed output is Canvas submission, not measured physical display delivery.
A shared browser process family is used across rotated paths; memory and caches
may carry between runs and are reported. Browser hardware selection and energy
are unknown. No audio, ASS, network, mpv scheduling or software recovery is
implemented in this experiment.

## Follow-up with process isolation and a per-packet bridge

The original runner and worker remain unchanged for historical reproducibility.
The follow-up uses the same native engine and corpus:

```sh
node --test experiments/m3/bridge.test.mjs experiments/m3/assess-v2.test.mjs
node experiments/m3/run-v2.mjs
node experiments/m3/assess-v2.mjs results/m3/followup-measurement-TIMESTAMP/result.json
```

Read the [follow-up contract](../../docs/M3-FOLLOWUP-CONTRACT.md) first. Each of
nine runs gets a new Chrome process, a fixed 32-second warm-up and 96 seconds of
measurement. The three variants are software, direct copy-back and copy-back
through a packet producer worker. `--smoke` shortens measured playback to one
pass and cannot qualify. Each invocation requires an unused result directory.
The full run takes about 20 minutes. Keep the page visible and focused.

The producer reads access units from the real shared Wasm heap and sends each
owned buffer over MessageChannel. The bridge validates generation/request IDs
and metadata, records copy/round-trip costs and bounds requests to one in flight.
Before timing, every path verifies all packet hashes and sampled output pixels.
Its producer is a JavaScript stand-in for a packet-owning thread, not an mpv
filter implementation. This is a measured transport candidate for a future
integration; native pin wakeup, mutable packet lifetime, cancellation/fallback
and full-player A/V correctness remain outside this experiment.

The [completed follow-up evidence](../../docs/validation/M3-followup.md) records
all passing resource checks and the failed net CPU-benefit gate.
