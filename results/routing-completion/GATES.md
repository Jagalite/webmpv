# Frozen gates for the first implementation increments

Stage 0, before connecting the new reader or changing remux output:

- Existing automatic-selection, remux, API and codec suites must pass. Record final
  source/binary hashes and exact run paths. Do not serve an incomplete binary build.
- Local reader: single flight, read slices <=262144 bytes, no retained read cache,
  no full-File ArrayBuffer/WasmFS write, no stale result after an epoch change, no
  outstanding workers or reads after destruction. A transient stream chunk can
  coexist with the bounded output allocation and is accounted separately.
- Large-file functionality: open <=25 s, each tested seek <=10 s and source position
  within 150 ms. These are failure deadlines, not a performance improvement claim.
- Selection: original source-track identity, volume/rate/play intent and subtitle
  requirements survive fallback. Source permission/identity failures remain terminal.
- New remux: no decoders/encoders, no silent channel/quality changes, valid source-time
  seek recovery, bounded output (8 MiB per batch), bounded queues and worker cleanup.
- Unit and short browser gates are not release qualification. Final promotion also
  needs repeated matched trials and one-hour playback: proposed A/V absolute error
  p95 <=150 ms, no >80 ms drift from the settled initial offset; no sustained memory
  growth beyond declared media/decoder budgets, <=64 MiB residual process growth
  after warmup, and no correctness failures. Record platform variability before
  accepting any CPU/latency benefit. These long-run gates are not yet measured.
- Valid sparse MP4 files with free boxes test 64-bit offsets and lack of whole-file
  allocation. They do not substitute for long-duration/high-bitrate media memory or
  seek-performance qualification. Include a real large movie separately.
