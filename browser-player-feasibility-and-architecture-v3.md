# Browser libmpv player: feasibility, architecture, and prototype

**Research date:** 2026-09-06. **Documentation revision:** 3, 2026-09-06.

**Status:** architecture decisions plus the existing HTTP transport spike; not a completed libmpv browser player. This revision changes documentation only. It does not implement a fork, decoder, renderer or audio backend. Earlier test artifacts retain their original scope; documentation-update validation is reported separately.

**Accepted direction: complete a usable software-only libmpv browser player first.** Use upstream mpv, FFmpeg and libass with our independently written browser platform layer. Do not import the incomplete libmpv-wasm port or its associated forks. WebCodecs decoder changes and retained-browser-frame integration are deferred until the software player passes **G1**, followed by a separate performance/maintenance decision at **G2**. Necessary browser-portability patches may still be needed in Phase 1; this is not a promise that unmodified upstream already runs in a browser.

**Companion documents in the bundle:** `docs/ADR-002-software-first-staged-webcodecs.md`, `docs/MILESTONES.md`, `docs/PERFORMANCE-VALIDATION.md` and `docs/IMPLEMENTATION-HANDOFF.md`. ADR-002 supersedes ADR-001's immediate decoder-fork/dual-frame commitment. Revision 3 milestone identifiers below supersede the revision 2 sequence.

## Executive decision

Deliver the software player as a complete first product milestone, not as a temporary WebCodecs scaffold. Keep mpv responsible for playback, demuxing, track selection, seeking, synchronization, filters and subtitle timing. Decode both video and audio through the FFmpeg libraries compiled into Wasm, and supply pixels/PCM to independently written browser outputs. Do not substitute a separate JavaScript player or require the browser to decode the original compressed media.

The first release contract is a **declared and tested software-support profile**, not universal FFmpeg coverage or desktop mpv parity. It must work with `VideoDecoder`, `AudioDecoder` and `VideoFrame` unavailable. In this phase, native `<video>`/MSE decoding cannot stand in for the software path during acceptance tests. Browser graphics, AudioWorklet, Fetch and the chosen threading/deployment facilities remain legitimate platform dependencies.

**Sequence:** M0 reproducible software build → M1 end-to-end software streaming → M2 qualification → **G1: standalone software-player acceptance**. Only after G1 may M3 evaluate browser-decoder performance. **G2** then decides whether to authorize a WebCodecs-specific mpv fork/patch series; M4 implements the copy-back backend if approved. Retained-frame work is a further conditional M5, not a Phase 1 prerequisite. A passing software player remains a valid deliverable even if all later decoder work is deferred or declined.

No server transcoding is required by this design. The origin must provide the required range behavior, representation stability and CORS/authentication. Codec independence does not bypass those access requirements or guarantee real-time playback of every format on every device. Hardware acceleration, desktop feature parity, universal codec support and reliable production streaming remain unverified.

## 0. Accepted decisions and upstream ownership

### Phase 1: upstream-first libmpv, without browser decoding

“Ground up” applies to our browser platform layer, ABI, TypeScript package, tests and build orchestration—not to reimplementing mpv, FFmpeg or libass. Existing ports are historical research only. No code, patches, scripts, configuration, toolchain forks or binaries from the incomplete libmpv-wasm port or its associated forks are implementation inputs. This provenance policy is not a legal clean-room certification.

Use a pinned upstream mpv checkout and public libmpv interfaces wherever they suffice. Keep the existing FFmpeg decoder selection and ordinary CPU-backed mpv images. Do not create `vd_webcodecs`, modify `mp_image` for opaque browser frames, build a browser-frame registry, or introduce WebCodecs fallback policy in Phase 1. A narrow private application ABI may leave room for later evolution without implementing speculative representations now.

**“Fork later” distinguishes scope, not Git mechanics.** Compilation, browser AO/VO registration, timing and genuinely necessary seek interruption may require small source patches even in the software-only phase. If so, track them explicitly as a baseline portability patch set with rationale, provenance and tests. Do not claim an unmodified-upstream build or zero maintenance unless demonstrated. Broader changes to decoder/filter/image internals are not preauthorized: a baseline blocker needs a documented design review rather than silently pulling future acceleration work forward. Upstream's stream callbacks, AO and VO seams explain this distinction. [S10, S11, S21, S37]

### Later: a separately approved WebCodecs-specific engine fork

The intended browser-decoder integration uses internal decoder selection/filter interfaces, not merely public TypeScript commands. That source change becomes justified only after G1 establishes the baseline and G2 approves a measured benefit and maintenance plan. The existing internal packet-input decoder interface and selection logic are candidate seams, not a reason to begin changing them during M0. [S12, S13, S35]

| Decision | Consequence for the current milestone |
|---|---|
| Software-only libmpv first | FFmpeg/Wasm handles both video and audio; no browser codec is required for the declared software profile |
| One playback authority | mpv owns demuxing, track selection, seeks, clocks, presentation decisions and subtitle timing |
| Independent, usable delivery | G1 can pass and the software player can be delivered without any WebCodecs implementation |
| Upstream-first implementation | Prefer public APIs; necessary browser-portability patches are isolated and documented, not hidden |
| No acceleration-driven core changes yet | Keep existing CPU images and software decoder behavior; defer browser decoder registration and opaque-frame negotiation |
| No incomplete-port reuse | Build against upstream libraries using original browser code and build definitions |
| Browser-independent software acceptance | Test with `VideoDecoder`, `AudioDecoder` and `VideoFrame` absent and no native compressed-media decode substitution |
| Explicit later investment decision | G1 authorizes evaluation, not a fork; G2 separately approves or rejects the WebCodecs integration |
| Retained frames remain conditional | Implement only after measured copy-back costs justify the extra image/renderer/lifetime changes |
| Preserve a software-only artifact | A later hybrid build must not remove the independently buildable and testable software baseline |

### Change surface and stage boundaries

Proposed filenames below are design choices, not implemented files in this archive.

| Component / seam | Phase 1 scope | Deferred scope |
|---|---|---|
| Build, C ABI and TypeScript control | Original pinned build, commands/events, source registration and asynchronous cleanup | Optional decoder policy only after approval |
| Public custom stream callbacks | Browser Fetch/range broker, bounded mailbox, terminal cancellation | Narrow seek-interrupt patch only if the actual baseline needs it, not as an acceleration feature |
| Audio output | Browser PCM output and timing feedback; FFmpeg audio decoding | `AudioDecoder` integration outside the planned initial extension |
| Video output | Existing CPU-backed image semantics, browser canvas/graphics output and libass composition | Opaque frame type, browser-frame registry, graphics import and negotiated download |
| Decoder wrapper | Existing FFmpeg video path, with build-only portability fixes if necessary | `vd_webcodecs`, codec worker, asynchronous browser decoder selection and fallback |
| `mp_image` / filter negotiation | Preserve ordinary CPU storage and supported CPU processing | Browser-frame references and retained/transfer/render lease protocol |
| HLS/DASH nested `io_open` | Separate software-only segmented-VOD workstream after G1 | Does not depend on WebCodecs; ABR and live remain distinct |

Any necessary baseline patches are versioned from day one, but the later WebCodecs branch/patch series is created only after G2. Record source revision, rationale, test and owner for every change. A later browser frame/VO integration can be substantial because those interfaces are internal. Isolating files helps; it does not guarantee a small maintenance burden. [S36, S37]

Upstreaming suitable patches is desirable, not a delivery dependency. Keep upstream-update CI, source/patch manifests and security-update work for the baseline independently of any future acceleration branch.

## 1. Evidence and existing implementations

### libmpv-wasm — historical reference only

The inspected `brianhvo02/libmpv-wasm` main tree was `95881d698f77a54db9b2512d07d069994ceafc54`. Its wrapper implements mpv initialization, an SDL3/OpenGL render context, mpv event/property forwarding, tracks, and TypeScript-facing control. Its CMake configuration links mpv, SDL3, libbluray, OpenAL and a custom external filesystem; it enables pthreads, OffscreenCanvas, embind and generated TypeScript declarations. This is substantive implementation, not just a proposal. It is not evidence that every advertised format or subtitle works in current browsers. [S1–S3]

The README recorded in the original inspection lists loading URLs/OpenSSL integration as unfinished. Conversely, OPFS browsing and lifting the file-loading 4 GB limit are crossed off. It would be inaccurate to recycle those old items as universal current limitations. The stream-protocol question (#10, opened December 25, 2024) remains open without comments; the subtitle-display report (#13, opened September 12, 2025) also remains open without comments. These establish reported, unverified gaps—not a reproduced failure for all media, and not proof that every possible fork lacks a fix. The inspected open PR list was dependency maintenance, not evidence of an integrated network/WebCodecs implementation. [S1, S4, S5]

The inspected wrapper requests a **2 GiB initial Wasm memory** and **20 pthread workers**. Its module exposes internal Emscripten `PThread` state, and its C++ player/render handles are globals. These are reasons to redesign packaging, instance ownership and resource limits, not reasons to reject mpv. `-sINITIAL_MEMORY=2GB` is a configured heap size, not a measurement of resident memory. [S2, S3]

The dependency build lives on `mpv-build`'s **emscripten** branch (`34d1b9e6cba946c3e8dec8b9a3e32eec6bb3fd2b`), not its ordinary default branch. Its Dockerfile uses `emsdk:latest`, activates `tot`, and replaces the SDK's Emscripten directory with `brianhvo02/emscripten`'s `wasmfs` branch. Its update script follows moving upstream branches by default. Therefore reproducing this port involves a toolchain fork as well as application code. A fresh `npm run build` is not a reproducibility guarantee. [S6–S9]

**Revision 2 supersedes the former reuse recommendation.** Consult the observations above only to understand risks and test cases. Write the browser bindings, networking, rendering, audio, build recipes and portability changes independently against upstream APIs/source. Do not reuse selected patches or reproduce the reference port as the bootstrap milestone. Its global state, private-runtime access, resource defaults and Blu-ray/UI coupling are explicitly outside our chosen foundation. Port issue states above are retained historical inspection findings, not newly executed playback tests.

### Upstream mpv and FFmpeg

Current mpv exposes read-only stream callbacks with open/read/seek/size/close and cancellation. Reads have blocking semantics; a zero return means final EOF, not “await more network data.” Callbacks must not re-enter the same mpv instance. Cancellation is called from another thread and must not block. Its implementation connects cancellation to the stream cancellation tree. This is a good direct-file I/O seam, but **does not itself establish non-terminal, per-seek interruption**. [S10, S11]

The decoder interface is internal: `mp_decoder_fns` creates a filter taking `MP_FRAME_PACKET` input. The inspected decoder wrapper enumerates and selects the FFmpeg video driver; a new backend requires deliberate registration/selection changes. Public libmpv commands/properties are not the decoded-frame injection interface needed here. [S12, S13]

mpv's filter contract supports asynchronous waiting with polling/wakeups, but ordinary filter/pin operations are not generally thread-safe. This is a viable design seam for browser callbacks, not proof that our integration already works. [S35]

FFmpeg's current HLS demuxer explicitly detects custom I/O and disables incompatible HTTP-persistent handling; it also adjusts HTTP-multiple autodetection. An assertion that custom I/O invariably fails there would be outdated. Both HLS and DASH source code open nested resources through `io_open`, so the browser integration must cover those calls, not just the initial manifest. Current source should be used to minimize patches, but the selected pinned version must contain the inspected handling. [S18, S19]

### Alternatives worth controlled comparison

libmedia has actual Fetch I/O source implementing HTTP options, credentials, range-related logic and abort controllers. Its documented architecture uses TypeScript demuxing and independently loaded Wasm codecs alongside WebCodecs. This is a relevant comparison because asynchronous browser I/O is native to its architecture. No equivalent reliability, ASS fidelity or performance benchmark was run here. Its license headers/dependency graph need their own audit before reuse. [S25, S26]

libav.js plus its WebCodecs conversion bridge is a lower-level alternative and a source of codec-configuration conversion ideas. It does not make mpv's scheduler/subtitle behavior appear automatically. Native `<video>`/MSE with hls.js or Shaka is the appropriate comparison for browser-supported codecs and adaptive streams. Transmuxing compatible compressed packets is distinct from transcoding; however, a native decoder pipeline cannot promise arbitrary codec coverage. Treat these alternatives as benchmark candidates, not automatic replacements. [S27–S30]

## 2. Ownership and threading by phase

### Phase 1 software-only pipeline

```text
Host application / TypeScript API
        | commands, events, authorization
        v
Nonblocking control / rendering host
        |
        v
mpv core + FFmpeg demux / software decode threads
  |        |
  |        +-- CPU-backed images --> mpv scheduling + libass/OSD
  |                                              |
  |                                              v
  |                                      Canvas / graphics output
  |
  +-- synchronous stream callbacks
        | bounded shared mailbox
        v
Nonblocking browser I/O worker: Fetch + bounded range cache

mpv / FFmpeg audio decode + filters/resampling
        --> browser AO --> fixed PCM ring --> AudioWorklet
                                               |
                      output/sample timing feedback --> AO --> mpv
```

There is **no browser codec worker, `VideoFrame` registry, WebCodecs probe or opaque-frame mapper** in this milestone. The software renderer takes decoded CPU pixels directly; it must not use `new VideoFrame(...)` as a hidden mandatory dependency.

A blocked demux pthread must not own the JavaScript event loop that completes its Fetch operation. Use an asynchronous I/O worker and a bounded mailbox/credit protocol. A read posts `{stream, generation, requestId, offset:i64, capacity}`; the demux thread waits on shared state while the I/O worker completes or rejects the read and notifies it. The UI thread never uses a blocking wait or synchronous worker join.

Use session and playback generations to invalidate obsolete network work, software decoder output, queued PCM and presentation. Define capacity, cancellation and cleanup for every baseline queue. Bound CPU images, fonts, PCM and network blocks independently. Keep one player per isolated engine/module initially and account for aggregate resources before claiming multi-instance support.

### Conditional extension after G1 and G2

An approved M4 adds a nonblocking browser codec worker and a `vd_webcodecs` filter with configuring, running, draining, resetting, failed and closed states. Submission yields control; browser output is queued, and a permitted wakeup schedules work on the mpv-owned thread. Only that thread mutates filter pins. Capability and pixel-copy promises must not block the event loop that completes them. [S35]

M4 can return CPU-backed images to the existing pipeline. A separately justified M5 may co-locate browser decoding and rendering, or transfer references to a dedicated renderer. That introduces a frame registry, configuration generations, non-reused frame tokens and bounded render/transfer leases. Keep those requirements as future design notes until the milestone is approved; they are not M0 deliverables.

## 3. Direct-file networking

### Request and representation contract

Use `brange://opaque-resource-id` internally. Credentials and signed URLs live in the browser broker, not in mpv log-visible URLs. On first read, request a small range and inspect the actual response; `Accept-Ranges` alone is not proof. Require coherent `206`/`Content-Range`, identity byte representation and a stable total length for the seekable VOD tier. A strong ETag plus `If-Range` protects against joining bytes from different versions. Without a readable validator, require an explicit immutable/version-addressed asset contract; do not silently assume it. [S20]

Reject a `200` that ignores the range or indicates a changed `If-Range` representation; do not accidentally read an entire large file. Parse `416` as EOF only when the reported total and requested position justify it. Treat truncated bodies, retryable HTTP statuses and idle timeouts separately from EOF. Resume at the exact remaining byte in the same validated block, with a retry count and elapsed-time deadline.

The included reader implements one active read at a time, bounded read sizes, a block LRU, range/length validation, strong ETag checking, bounded retries with jitter/Retry-After, idle watchdogs, explicit epochs, close, credentials and a one-time 401 authorization refresh. It does not implement parallel prefetch, arbitrary redirects, all authentication protocols, or a player-wide memory manager. It intentionally rejects concurrent calls instead of accumulating an unbounded queue. A production broker can allow a small credit-controlled parallel window while preserving the same invariants.

### Cancellation is two separate mechanisms

**Stream lifetime cancellation** is terminal and releases a blocked callback on close/destroy. **Seek supersession** discards obsolete transport work without declaring the source permanently dead. Phase 1 needs an explicit seek epoch through transport, demux, software decoder/packet queues, PCM and presentation. A later browser decoder must join the same protocol.

Before claiming public callbacks alone are enough, stall an actual mpv demux read and issue a seek. Check whether the seek can run and whether a read error is treated as recoverable at a seek boundary. If not, add a narrow internal seek-interrupt mechanism at the demux/AVIO boundary; consume the newest pending seek, clear transient I/O state, and do not route that interruption as final EOF. Never return zero just to unblock the caller. The prototype's `beginEpoch()` tests only the HTTP layer; it is not proof of mpv behavior.

### Backpressure and budgets

A proposed desktop SDR profile starts with a 16 MiB HTTP cache, at most two 256 KiB range bodies, a 32 MiB forward demux budget plus 8 MiB backward budget, roughly 100–250 ms PCM, and a codec-aware decoded-frame/surface budget. These are tunable acceptance settings, not measurements or universal correct defaults. mpv has separately configurable decoded queues, so bounding HTTP alone is insufficient. [S13]

Stop prefetching when downstream credit is exhausted. Avoid whole-file MEMFS/OPFS materialization. Small metadata and fonts may be cached separately with explicit limits. A remote file exceeding 4 GiB does not require a 4 GiB heap: offsets remain 64-bit, while each read is small. The implementation uses `bigint` for offsets and bounded `number` lengths. Decoder-internal reference surfaces and browser networking/GPU allocations are not completely observable; constrain supported resolution/profile and measure process memory as well as application counters.

### Authentication, CORS and security

Support caller-supplied credentials, request headers and asynchronous signed-URL renewal, with an origin allowlist applied to each resource. A 403 may need a host-specific refresh policy; the prototype does not automatically reinterpret every 403 as expiration. Reject redirects by default in the spike; production redirect support needs an explicit policy that does not leak authorization across origins.

The origin should allow the application origin and expose `Content-Range`, `ETag`, `Accept-Ranges`, `Retry-After` and relevant representation metadata. Requests with Authorization/If-Range need appropriate preflight responses. Credentialed CORS requires explicit origin approval rather than wildcard credentials. Browser JavaScript cannot repair a remote server's absent CORS permission. A controlled byte-preserving proxy is an optional deployment remedy, not required transcoding.

Disable mpv's automatic local config/scripts and unrestricted protocol loading for untrusted media. Limit probing, metadata, attachments, fonts, frame dimensions and packet sizes. Allowlist manifest/key/font/subtitle origins and redact credentials from telemetry. Parser fuzzing and lifecycle timeouts remain necessary even with Wasm memory isolation.

### Container constraints

MP4 with a front index should start from prefix reads; tail `moov` requires reading the tail and then returning to media. MKV with usable Cues should seek through its index. Missing/sparse indexes or long keyframe intervals can require scanning or extra decode; no range implementation guarantees fast exact seeks on every file. Expose seekability as a measured capability and fail or degrade explicitly when the configured scan budget is exceeded.

## 4. Deferred WebCodecs integration — not Phase 1 scope

**Authorization:** this section is retained design research, not the current implementation backlog. Finish M0–M2 and pass G1 first. M3 may then measure candidate browser paths without changing production mpv decoder internals. Only G2 approval starts the M4 decoder fork. M5 retained-frame implementation has its own performance/maintenance gate. None of this section is required for G1 or for a useful software-only delivery.

### Selection and configuration

Create a codec adapter per supported format/profile. Derive the full WebCodecs codec string, coded dimensions, color information and codec initialization data from demuxed codec parameters. Probe the **actual** configuration with `isConfigSupported`, then initialize and test decode. Browser capability is per codec/profile/platform/session; successful probing is not proof of future successful decoding. `hardwareAcceleration` is a preference, not evidence that hardware was chosen. Report the backend as WebCodecs and hardware status as unknown unless independently measured. [S14, S17]

For H.264, the presence of an AVC decoder configuration record means length-prefixed AVC input; without it, the registry specifies Annex B. The configuration record is the box payload, not the complete MP4 box. Do not indiscriminately run an Annex-B conversion. HEVC has a corresponding configuration/bitstream distinction. Validate NAL length sizes, parameter-set changes, proper random-access points and packet access-unit boundaries. Use separate codec-specific handling for VP9/AV1 and audio initialization rather than a guessed generic extradata rule. [S15, S16]

### Packet order, timestamps and queue progress

Send compressed packets in demux/decode order. Convert presentation timestamps to integer microseconds with rational rescaling and preserve the media timeline, including valid negative timestamps and start offsets. Do not substitute DTS for PTS on reordered video or sort input packets by presentation time. Preserve duration, color, crop, aspect and rotation metadata outside the chunk when needed.

A production pump must submit enough packets for a decoder to produce reordered output. It must **not** wait for output after every input packet: an initial B-frame delay can deadlock that design. Bound outstanding work by codec-aware packet credits plus output-frame/surface budget. `decodeQueueSize` alone is not a complete memory accounting mechanism. WebCodecs defines output in presentation order; a subsequent asynchronous `copyTo` stage must preserve that order using output sequence numbers. Retaining frames indefinitely can stall the decoder, so ownership is part of flow control. [S14, S17]

The provided VP8 diagnostic deliberately uses one in-flight packet and a no-reordering fixture. Its comments explicitly prohibit treating that pump as the production reordered-video implementation.

### Frame path A: CPU-backed correctness and compatibility

Copy `VideoFrame` pixels into a bounded CPU frame buffer, adapt the supported layout/strides to `mp_image`, restore metadata and pass the frame through normal mpv processing and rendering. Size allocations with actual frame layout and format; handle null/unsupported format or failed readback as a capability/fallback decision. Close the `VideoFrame` after the copy completes, including all errors and stale epochs.

This path keeps the normal pixel-backed pipeline but can incur browser-frame readback, staging/Wasm copies and renderer upload. Those are possible stages, not a claim that every implementation necessarily uses all of them. Test copying directly into a correctly sized, reserved Wasm destination where supported; keep it valid until the asynchronous operation settles and do not reuse it during reset. Otherwise use a bounded staging pool. Encoded-packet submission has its own storage/lifetime costs and must not be described as guaranteed zero-copy merely because the source is a typed-array view. [S14, S17]

Copy-back may still be worthwhile if decoder savings outweigh its extra work. Desktop mpv documents copy-back modes, while warning that they are often less efficient than direct modes. That is architectural precedent, not a browser performance result. [S39]

### Frame path B: conditional retained-browser-frame experiment (M5)

Do not specify or implement a production opaque-image ABI during M0. After the software player and the approved copy-back backend are correct, compare measured copy-back costs with the potential retained-frame benefit. Authorize M5 only if the additional image/filter/renderer/lifetime work has a documented purpose and maintenance owner. At that point, design the opaque contract: mpv retains, drops and repeats a reference while the browser owns the frame. CPU pixel access is not intrinsically needed for those scheduling decisions.

Use a refcounted native bridge record rather than encoding a JS object as a native address. Its metadata includes timing, layout/display information, session/configuration generations and a non-reused frame token. Registry ownership plus bounded presentation/transfer leases keep the browser frame alive. A final native unref queues release; actual close waits until the renderer has safely submitted all uses and no redraw/repeat lease remains. Define release semantics for each graphics API and test them. Do not add a per-frame global GPU wait merely as a substitute for correct ownership.

This needs image-format, filter-negotiation, renderer and lifetime integration. A JavaScript VideoFrame is not automatically a libmpv OpenGL texture. CPU filters must negotiate a download or a qualified CPU path; fail explicitly when a requested operation cannot be preserved. Keep every path behind mpv's scheduler, with libass/OSD composited at the chosen media time. [S36, S37]

A worker boundary does not inherently copy decoded pixels: WebCodecs transfer moves the resource reference, while serialization/clone creates another reference. Track every resulting owner and close it explicitly. [S14] WebGL/canvas consumption is an integration option; WebGPU external textures are another, not a baseline browser requirement. External-texture import can avoid an internal copy but does not guarantee it, and closing a source VideoFrame expires its external texture. [S17, S38]

The contract is **no mandatory application-level video-pixel readback into Wasm**, not universal zero-copy, GPU residency or verified hardware decoding. Subtitle bitmap uploads, browser-internal conversions and software-frame uploads remain possible.

### Frame-path policy and observability

Phase 1 has only the `wasm` video path; its diagnostics must report that truthfully and must not run browser-decoder probes to open a file. After a hybrid extension is approved, treat decoder choice and frame representation as related but separate decisions. Any automatic policy uses a qualified configuration table and conservative fallback, not a costly benchmark on every file open. Key qualification by engine build, browser/device test profile, codec configuration, resolution/format, renderer and requested filters. Invalidate evidence when those change.

Expose the active path (`wasm`, `webcodecs-copy`, `webcodecs-opaque`), selected renderer, fallback reason and confidence of timing/memory evidence. Add diagnostics for explicit readback count/bytes, staging/Wasm-copy bytes, uploads where observable, frame-registry high-water marks, outstanding leases and oldest retained frame. Unknown driver/browser traffic must remain unknown rather than be reported as zero. A working probe or faster isolated decoder does not qualify an automatic default.

Renderer incompatibility can justify moving from opaque to copy-back without permanently rejecting WebCodecs. Decoder failure requires the separate random-access recovery below. State transitions must not oscillate, bypass epoch checks, silently remove requested filters, or reset clocks outside mpv's coordinated control.

### Flush, reset and fallback

At true end-of-stream, drain with `flush()` before signaling decoder EOF. A seek/reset is different: discard pending output and start with suitable random-access initialization. Do not flush on each HTTP block, segment boundary or packet batch. VideoDecoder's flush semantics require a key chunk for subsequent decoding, so casual batching can break a continuous GOP. Reconfiguration must consider codec-description changes as well as resolution. [S14, S31]

On configuration/runtime failure, mark that configuration's WebCodecs path failed for this session, advance the playback epoch, reset audio/video/subtitle timing, re-seek to a prior random-access point and resume with FFmpeg software decoding. Decode and discard preroll to the desired presentation timestamp. Do not feed an arbitrary current delta packet into a fresh software decoder, and do not switch oscillatingly between backends. Keep a bounded GOP cache when affordable; otherwise use the original media's range-seek path. Lack of a seekable random-access point must produce a controlled limitation rather than a pretend seamless fallback.

Keep audio on FFmpeg throughout Phase 1 and the proposed M4/M5 video extension. `AudioDecoder` is not part of those accepted milestones. Any separately approved future audio-decoder backend would have to re-enter mpv's audio-frame/filter path and preserve codec delay, skip samples, seek preroll, sample rate/channel layout and gapless trimming exactly once.

## 5. Audio, synchronization and subtitles

Implement our own browser AO; the incomplete port's OpenAL shim is not part of this build or its timing assumptions. Current mpv push-AO state includes queued samples, free capacity, playing state and **total delay including queued samples**. A fixed Float32 PCM ring is a natural bridge: mpv writes; an AudioWorklet consumes; the worklet publishes sample counters and underrun state. It never blocks, decodes, fetches, or performs unbounded allocation in `process()`. Read the actual output quantum length rather than hard-coding it. [S21]

Negotiate the AudioContext sample rate and channel layout, letting mpv/FFmpeg resample where necessary. Use a separate fixed SAB for PCM to avoid growth-sensitive views into the main Wasm heap. Mapping media sample position to AudioContext render position must distinguish real PCM from inserted silence. Context suspension/autoplay denial is not elapsed media time; underrun should not falsely advance mpv's audible-media position. Pause, seek and rate changes reset or remap the appropriate counters.

Where available, use `getOutputTimestamp()` to map AudioContext output positions to the performance clock and relate queued media sample positions to that output mapping. Otherwise use reported latency with a declared confidence/uncertainty. Do not blindly add baseLatency, outputLatency and a timestamp-derived total: that can double count. The Web Audio specification explicitly cautions that `currentTime - getOutputTimestamp().contextTime` is not a reliable output-latency estimate. Normalize worker/performance/Wasm clock origins before comparing them. [S22]

mpv remains the single synchronization authority. The browser decoder completion callback is not the presentation clock. The renderer should obey mpv-selected presentation timing and report actual presentation/swap observations where available. Browser display scheduling, background throttling and device latency still need measurement; merely calling `requestAnimationFrame` is not equivalent to desktop presentation feedback.

Retain libass, FreeType, HarfBuzz and FriBidi behavior, fonts and embedded attachments. Fontconfig may be retained or replaced with explicit bundled/injected font discovery; browser system font discovery is not a substitute. Qualify the subtitle timebase on the software path first, including delay, playback speed, seeks and rebuffering. Any later decoder path must preserve that same behavior. ASS animation/karaoke/vector drawing, shaping, borders, fonts, resize/DPR and blending require reference screenshots. Do not translate ASS to plain DOM text and call it preserved behavior. The historical subtitle report informs the regression suite, but its cause is not established.

Only in an approved M5 retained-frame path, composite mpv/libass output over the browser video surface using separately bounded subtitle bitmap uploads; subtitle rendering alone must not force a full video-frame readback. Preserve draw coordinates, crop/display transform, alpha/color handling, draw order and the same media clock. Verify screenshots against the CPU reference at identical timestamps, including pause/redraw and animated ASS. This is a design requirement, not a demonstrated rendering result.

## 6. HLS, DASH and optional live

**Independent software workstream S1:** after G1, finite HLS/DASH VOD can be implemented using the software player whether or not G2 ever approves WebCodecs. It is not part of the initial direct-file acceptance gate and must not be held behind the acceleration work. A release claiming segmented VOD must pass its own S1 tests. ABR and live are separately authorized extensions.

Direct-file random-access support is not HLS/DASH support. Add a resource loader used by FFmpeg's nested `io_open`/close callbacks, preserving base URL, allowed protocols, origin/auth policy, request purposes and cancellation. Prefer public AVIO/custom-I/O seams plus a narrow `demux_lavf` integration patch before inventing a private FFmpeg URLProtocol plugin.

HLS manifests and ordinary media segments need bounded streaming GETs, not an unconditional “every response must be 206” policy. Honor byte ranges where the playlist requests them. DASH needs initialization/media resources, representation indexes, segment timelines and period handling. Parse/fetch within size and count limits; do not concatenate unrelated resources into an imaginary normal file. A top-level `brange://id` must not destroy relative-URL resolution. [S18, S19]

Start with finite, fixed-representation, unencrypted VOD: HLS TS and fMP4; DASH fragmented MP4. Test alternate audio/subtitles, discontinuities, timestamp offsets, gaps and retries. Adaptive rendition selection, bandwidth estimation and switching are separate features—FFmpeg demux availability is not proof of a production browser ABR policy. AES-128 key loading can be a later authenticated resource type; DRM/EME is outside the raw-frame baseline.

Live is optional and separately gated: playlist/MPD reload, sliding windows, expired segments, bounded latency catch-up, discontinuity handling, clock mapping and reconnect behavior. Low-latency HLS/DASH adds parts/chunks and blocking reload policies. Raw RTMP requires a browser-compatible transport/gateway rather than assuming FFmpeg's socket code can open native TCP from the page. None of these live capabilities was tested here.

## 7. Compilation, API and cleanup

### Build graph and adaptation

Create a software-only build target, without browser-codec modules or runtime probes, using original build definitions for a stock pinned Emscripten SDK and upstream dependency snapshots: compression/font libraries, libass and shaping libraries; FFmpeg avformat/avcodec/avutil/swresample/swscale plus selected filters; mpv and any libplacebo requirements of the chosen source version. Resolve actual optional/mandatory dependencies from that version's upstream build system. Do not bootstrap by reproducing libmpv-wasm or importing its SDK fork, filesystem patches, wrapper, SDL/OpenAL choices or build configuration. Add an upstream library only when our own backend demonstrably needs it. Blu-ray/libudfread are outside the initial direct-file milestone.

Write and test upstream cross-build configuration rather than copying port recipes. Use Emscripten's documented compiler/build integration and the selected upstream build files to determine the actual flags, feature switches and library ordering. Disable incompatible native assembly where necessary; enabling Wasm SIMD does not establish equivalent optimized codec kernels or throughput. Compiler flags below are requirements to validate, not an already working native build command. [S40]

Apply `-pthread` at compile and link across all participating native objects. Use a modularized browser/worker build, required exported C ABI functions, Wasm BigInt for 64-bit boundaries, and only required runtime exports. Test a SIMD build with `-msimd128` and relevant codec implementations. Configure an explicit heap ceiling and modest measured initial memory rather than inheriting 2 GiB. Growth requires refreshing JS typed views; audio/shared protocol structures should avoid unstable view ownership. Pre-create only the worker pool needed by measured mpv/decode workloads. [S23]

A threaded browser build requires secure context and cross-origin isolation, normally COOP `same-origin` and COEP `require-corp` plus suitable resource CORS/CORP. A single-thread fallback for this blocking/threaded port is a separate engineering/build target, not a runtime flag. A native-video fallback can be offered for compatible media where isolation cannot be deployed, but it must declare its narrower feature contract. [S23, S24]

No engine build was executed in the original investigation: emcc was absent, and no pinned upstream engine/toolchain build was materialized. This documentation revision does not change that status. The plan is not a tested lockfile or copy-paste-complete production build. First build gate: a clean container builds declared upstream snapshots with only demonstrated baseline portability patches, exports a version/options/provenance manifest and opens a small local fixture through FFmpeg software decoding before network integration. Record an empty patch list only if the build really needs no source changes.

### Public and private interfaces

`src/player-api.ts` is a design-only interface for open/play/pause/seek, tracks, subtitles, rate, volume, sizing, capabilities, typed events and asynchronous destruction. It separates source authorization from engine commands. Track IDs are strings to avoid unsafe numeric conversion. Backend and hardware-verification status are distinct. The working `RangeReader` is the only implemented TypeScript engine-side component. The declaration and generated files remain unchanged. They may name future browser-decoder options, but those are neither implemented nor Phase 1 requirements. The initial product implements the software subset, reports the actual `wasm` path and returns typed unsupported results for explicit browser-decoder requests rather than silently substituting another decoder. Section 4 diagnostics are conditional future interface work.

Use a narrow private ABI such as create/destroy, command submission with request ID, property observation, event drain, stream registration, and diagnostics. Drain mpv events after wakeup and copy event/property payloads before the next mpv event invalidates them. Resolve command promises from asynchronous replies. Do not export direct pointers or Emscripten `PThread.pthreads` as the consumer API. Framework adapters should be optional packages rather than engine dependencies.

### Destruction protocol

Stop accepting new operations, increment epochs and reject pending command promises. Abort network operations and notify blocked native callbacks before joining or terminating anything. Stop PCM consumption and detach AudioWorklet nodes while the audio-owning context is still controllable. Stop presentation callbacks; free the render context on its owning thread according to libmpv's lifetime requirements. In Phase 1, release software frames and native decoders; no browser-frame release protocol is needed. Only a later hybrid build must also close browser decoders and retained frames after outstanding ownership acknowledgments. Let mpv close streams and terminate its core while cookies/callbacks still exist. Only then release shared memory, audio context, event listeners, proxy queues and workers.

Make this idempotent and test destruction during open, auth, blocked read, seek, decode copy, playback and rebuffering. A worker termination watchdog is emergency containment, not proof of graceful cleanup. Context loss/recovery, tab suspension and multiple instances require their own tests.

## 8. Prototype: original evidence and revision scope

The original archive contains a reusable TypeScript range reader, local adversarial HTTP server, **20 passing Node integration tests**, a synthetic 30-second 640×360 VP8 IVF fixture, browser diagnostic UI, worker/OffscreenCanvas decoder path, and a browser automation script. Revision 3 preserves all runtime source, compiled modules, fixtures and existing result files byte-for-byte relative to revision 2. It adds documentation and a separate packaging-validation record only. No engine build, transport rerun, browser test or performance benchmark was executed for this milestone update; prior results retain their original scope.

A measured transport run obtained 1 KiB requested data after fetching 16 KiB from a synthetic **8,589,934,765-byte** resource. After 100 distant/repeated read-position changes, the configured cache stayed at or below 65,536 bytes; observed peak explicitly tracked buffers were 82,020 bytes. Reader-owned cache and active allocations returned to zero on close. These figures exclude caller-retained output, runtime allocator overhead and browser/native/decoder memory. The roughly 20 ms local transport time is not a video startup result or internet performance estimate. See `results/transport-metrics.json` and `results/node-tests.tap`.

The browser run was attempted with installed Chromium 144 on Linux but navigation failed with `ERR_BLOCKED_BY_ADMINISTRATOR`. The managed policy was not changed. **Browser CORS, canvas decoding and playback are unverified in this session.** The supplied browser harness is code to run, not a passing result. No libmpv/Wasm engine, AudioWorklet AO, sustained A/V sync, ASS rendering, HLS/DASH, fallback or hardware acceleration was executed. This is recorded in `results/browser-results.json`.

The browser diagnostic's seek index is generated specifically for the synthetic IVF fixture. It is not a server-side indexing requirement of the proposed player and is not a general MP4/MKV demuxer. It checks first draw before full media transfer, four indexed positions, frame closing and some actual cross-origin transport cases once run in a permitted browser. It is intentionally not offered as a general-purpose browser video player. Although this historical diagnostic calls WebCodecs, it is not the Phase 1 player or an exception to the software-only milestone; keep it outside the product's baseline dependency graph.

## 9. Milestones, approval gates and validation

### Phase 1 — complete software-only libmpv player

**M0: original build and local software playback.** Pin upstream mpv/FFmpeg/libass, the stock SDK and actual build dependencies. Implement control/events and basic browser audio/video outputs. Keep CPU-backed frames and existing FFmpeg decoding. Open a local SDR fixture with audio and ASS and destroy the instance cleanly. Record every necessary portability patch, license/provenance input and build flag. Do not add a browser codec worker, decoder-selection fork or opaque image contract. Choose and record the initial codec/container/device/browser profile and resource budgets before qualification.

**M1: end-to-end software direct-file streaming.** Connect the bounded authenticated range broker through the stream bridge; establish seek supersession during a stalled demux read; finish PCM output/clock feedback, CPU rendering and subtitle composition. Implement TypeScript open/play/pause/seek, tracks, volume/rate, sizing, diagnostics and asynchronous destroy for the declared profile. Demonstrate actual audio/video startup before full media download. A transport spike or local-file-only demo does not complete M1.

**M2: software qualification and usable baseline delivery.** Pass the Phase 1 matrix below using only FFmpeg decoding, including real browser execution, prolonged sync, memory, track/subtitle and failure-recovery tests. Validate all declared software-profile fixtures with `VideoDecoder`, `AudioDecoder` and `VideoFrame` unavailable. Exercise at least one software-supported configuration not supported by browser decoding on a recorded test device, when identified; do not invent such a capability result. Save exact software decode/output support and performance boundaries. Produce a versioned baseline artifact, integration example, source/build/patch manifest, raw results and supported-profile table.

### G1 — standalone software-player acceptance (hard milestone boundary)

G1 passes only when the product is independently useful and every required Phase 1 test passes on the predeclared reference profile. A proposed minimum reference workload is 1080p30 SDR H.264/AAC MP4 plus a declared MKV/multiple-track/ASS corpus, with the matrix's network and timing conditions. Broader codecs, resolutions and browsers are qualified separately, not claimed by inference. At M0, freeze exact fixtures and devices; changing the scope later requires a recorded decision, not silently lowering the bar.

Required evidence includes bounded streaming/recovery, successful distant and repeated media seeks, audible output with credible timing feedback, ASS and track behavior, stable resources over a 60-minute run and 100 player lifecycles, and a working software-only build. No unreported failing test may be marked not applicable merely to enable WebCodecs work. A native playback fallback does not count as a software baseline pass.

**Go:** tag the accepted software baseline. It can be delivered immediately. Authorize evaluation of an optional extension, not automatic implementation. **No-go:** fix the software port, explicitly revise its target contract, or revisit the engine choice. Do not bypass a blocked G1 by adding browser decoding and calling the baseline complete.

### Phase 2 — optional, evidence-gated browser decoding

**M3: evaluate WebCodecs after G1, without a production decoder fork.** Use identical demuxed packets and matched output conditions in a small benchmark harness to compare the accepted software path with browser decoding plus copy-back and, where practical, retained-frame presentation. Include worker/message/copy overhead. A standalone harness does not prove mpv integration, sync or fallback. Record supported configurations, CPU/energy where measurable, sustained frame delivery, memory, startup/seek effects and uncertainty. Estimate the required internal changes and maintenance ownership. External benchmarks are context, not acceptance evidence.

**G2: approve, defer or reject the WebCodecs-specific mpv fork.** A passing G1 is necessary but insufficient. Approve only for a predeclared useful benefit on a relevant target workload and a reviewed patch/test/maintenance budget. An example proposed investment threshold is a reproducible roughly 30% CPU or energy reduction at equivalent playback quality, or a meaningful additional device/workload tier; choose the actual metric and threshold before measuring. It must exceed noise and never substitute for correctness. If deferred/rejected, continue delivering the software player and independent features. Record the decision explicitly.

**M4: approved WebCodecs copy-back integration.** Only after G2, create the dedicated decoder branch/patch series on the accepted baseline. Implement `vd_webcodecs`, configuration adapters, asynchronous filter coordination, packet/PTS correctness, bounded ownership, EOF/reset and random-access recovery into software decoding. Feed ordinary CPU-backed mpv images to the already qualified renderer. Preserve a separately buildable software-only artifact and rerun G1 regressions. No change to the default decoder is implied by initial implementation success.

**M5: retained-browser-frame integration only if justified.** After M4, review actual readback/copy costs. A documented **G3** decision authorizes additional image/filter/VO changes only when retained frames address a measured limitation or valuable efficiency opportunity. Then specify the opaque contract, implement bounded frame/render/transfer leases, explicit CPU-filter downloads and separate ASS composition. Compare all three complete pipelines, repeat correctness tests and qualify defaults per configuration. A slow or incompatible optimized path is not selected simply because it exists.

### Independent workstreams

**S1: segmented VOD after G1.** Route nested resources and qualify fixed HLS/DASH VOD with software decoding. S1 does not require M3, G2, M4 or M5. Live, low-latency modes, ABR, DRM, HDR and desktop-feature parity are separately scoped; they are not implied by “complete software player.”

```text
M0 → M1 → M2 → G1: usable software-only release
                 ├── continue software maintenance / S1 segmented VOD
                 └── optional M3 measurements → G2 decision
                                              ├── defer/reject: keep software product
                                              └── approve: M4 copy-back fork
                                                           → G3 decision → optional M5
```

### Phase 1 validation matrix — required before G1

Targets are proposed, not achieved results. Unless a row states otherwise, use indexed 1 GiB+ SDR media, two-second GOPs, 5 Mbps media, 10 Mbps controlled delivery and 80 ms RTT. Record device/browser/build, artifact-cache state, output configuration and power state. See `docs/MILESTONES.md` for release evidence and sign-off rules.

| Test | Software-only acceptance target | Evidence now |
|---|---|---|
| No browser codec dependency | Declared software corpus opens/streams/plays/seeks with `VideoDecoder`, `AudioDecoder`, `VideoFrame` unavailable; no native decode substitution | Not run |
| Local decode and output | FFmpeg video/audio, CPU renderer and audible PCM; no browser-codec probe required to open | Not run |
| Startup before full download | First audible PCM and displayed frame ≤3 s with warm engine; <4 MiB and <1% media fetched; cold artifact startup reported separately | Small-range transport only |
| Tail-index MP4 | Tail metadata fetched without a whole-file pass; first playback follows metadata retrieval | Not run |
| Distant seek | Jump to 90%; correct target presentation ≤2 s and ≤8 MiB additional media for declared fixture | Byte offsets >4 GiB tested; media seek not run |
| Repeated seek storm | 100 seeks at 5/s; latest generation only, no stale video/PCM, no deadlock | Reader position changes/abort only; not a player test |
| Interrupted/slow network | Resume exact bytes or rebuffer visibly; five-second outage recovers within declared retries; no false EOF or frozen UI | Standalone transport failure tests only |
| Authentication and CORS | Real-browser headers/cookies/signed-URL refresh; explicit 403/redirect/origin policy and no leaked credentials | Node tests only; browser not run |
| Bounded memory | Every application queue within M0 cap; process memory plateaus over 60 min and 100 seeks; renderer/native resources observed | Reader counters only |
| Multiple tracks | Switch at least two audio tracks and subtitle tracks during play, pause and seeks with no stale output | Not run |
| ASS | Fonts/attachments, karaoke, vectors, shaping, overlap, resize/DPR and pause/redraw match declared reference tolerance | Not run |
| A/V sync | 60 min: p95 absolute error ≤40 ms, max ≤80 ms outside predeclared discontinuities; independent flash/click observation | Not run |
| Sustained software delivery | Predeclared 1080p30 reference: ≤1% late/dropped frames during normal 10-minute playback; no progressive lag; report CPU/thermal state | Proposed target, not measured |
| B-frames and VFR | Correct PTS order; no deadlock, fabricated CFR timing or lost final reordered frames | Not run |
| API and cleanup | TypeScript controls, errors and track events; 100 create/open/play/destroy cycles, including failure states, with no retained workers/AO nodes/frames | Reader lifecycle tests only |
| Build/provenance | Original upstream build and any documented portability patches; no incomplete-port inputs; manifests and repeat-build evidence | Not run |
| Browser/device profiles | All promised Phase 1 profiles execute the suite; unsupported combinations documented, not called qualified | Original Chromium attempt blocked; none qualified |

### Deferred tests — not G1 prerequisites

| Stage | Additional qualification |
|---|---|
| M3 / G2 | Matched performance experiments and written decoder-fork cost/benefit decision; hardware status remains unknown without independent evidence |
| M4 | Browser decoder config/packet correctness, reordered output, drain/reset, unsupported/runtime failure and keyframe/preroll software recovery; all G1 regressions still pass |
| G3 / M5 | Bounded opaque ownership and render leases, pause/redraw/transfer/reset cleanup; no application full-video readback in qualified no-CPU-filter runs; explicit CPU filtering; three-path performance and fidelity |
| S1 | Fixed HLS/DASH TS/fMP4, init/byte-range resources, audio/subtitles, auth, discontinuities, nested cancellation and retry using software decoding |

Only publish support for tested profiles. Missing indexes, long GOPs, high bit depths/resolutions, multichannel output, protected content, background playback and live require explicit contracts and their own tests.

## 10. Performance, licensing and maintenance findings

### Performance

There is no measured decode throughput, real-time resolution limit, power consumption or hardware-acceleration result in this work. Wasm codec performance depends on codec/profile/content, threading, SIMD implementation and device. Measure the full path: fetch→demux→decode→readback/copy→filter→subtitle→upload→present. A browser-provided decoder can still be software; hardware decode plus costly readback can lose its practical advantage.

Phase 1 measures only the actual FFmpeg/Wasm player, its supported real-time workloads and resource use; browser decoding is not needed to establish its usefulness. After G1, M3 can compare that baseline with candidate browser paths. Only if G2/G3 approve the work do later integrated comparisons require software, WebCodecs copy-back and retained-frame pipelines. Copy-back may save more decode work than its transfer costs, but that is unproven for this project. A retained-frame design can avoid explicit readback without proving browser-internal zero-copy. [S14, S38, S39]

The calculation below is resolution × bytes per pixel × frame rate using decimal MB. It is one raw-payload pass, not measured DRAM/bus traffic, process memory or actual decoder output layout.

| Illustrative raw representation | MB per frame | MB/s at 60 fps |
|---|---:|---:|
| 1920×1080, 8-bit YUV 4:2:0 | 3.1104 | 186.624 |
| 3840×2160, 8-bit YUV 4:2:0 | 12.4416 | 746.496 |
| 3840×2160, 8-bit RGBA | 33.1776 | 1990.656 |

For contrast, an assumed 20 Mbit/s compressed stream is 2.5 MB/s. This motivates prioritizing decoded-pixel movement over tiny control messages; it does not predict throughput, codec complexity, thermal behavior or hardware use. Padding, reference surfaces, conversions and additional passes are excluded.

Use `docs/PERFORMANCE-VALIDATION.md` for the comparative protocol, measurement definitions and decision rules. Benchmark cold engine startup separately from warm-media startup, normal playback separately from stress tests, and report unknown hardware/memory observations honestly. Do not add overlapping asynchronous stage durations as though they were a single serial latency.

G1 evaluates the software player's value and feasibility independently of browser decoding. G2 evaluates the incremental value of a WebCodecs-specific fork; failure to justify that extension does not invalidate the accepted software product. Compare alternative engines only with their actual format, subtitle and maintenance contracts stated. Engine/font download and initialization are separate from warm-media startup. The software player promises its tested real-time profile, not arbitrary 4K playback or all upstream FFmpeg capabilities.

### Licensing

The incomplete port's GPL-3.0-or-later declaration is historical context only: its code is excluded from our chosen implementation. That exclusion does not remove the obligations of the upstream libraries we actually ship. Upstream mpv defaults to GPLv2+ and documents an LGPL configuration excluding GPL-only code, while warning that the configuration option is not itself a license grant. FFmpeg's enabled components also determine redistribution conditions. Audit the actual patched and linked artifact, not our TypeScript package license or a repository badge. [S32–S34]

Before shipping, obtain a qualified license review for JS/Wasm integration, static-link relinking requirements, corresponding source, modifications/build scripts, notices, fonts/shaders and patent exposure in relevant jurisdictions. Browser decoding does not itself establish a patent license for separately distributed Wasm codecs. Do not enable encoders such as x264/x265 merely for playback. The included spike contains original source and a synthetic fixture, not libmpv/FFmpeg binaries; its licensing is not the licensing of a future engine distribution.

### Reproducibility and maintenance

Create a complete upstream-source/SDK/container-digest lock, compiler/build-tool pins, npm lock and codec/font/shader asset hashes. Start with a stock pinned Emscripten SDK; the reference port's toolchain fork is explicitly excluded. Any change to the SDK requires our own minimal failing example, patch rationale and maintenance record. Do not fabricate a lock for a build that has not run.

Record enabled demuxers/decoders/protocols, flags, exports, source provenance, license/SBOM data and our mpv patch revision. Rebuild twice in clean containers and compare hashes, investigating path/timestamp nondeterminism rather than asserting reproducibility from a Dockerfile. The supplied spike is not a complete native-engine lock.

Keep the Phase 1 portability, I/O/seek, audio, CPU-video output and binding patches independent of later decoder-selection and opaque-image changes. Retain an accepted software-only tag/build. A G2-approved acceleration branch and G3-approved image/renderer work have separate patch inventories and owners. Maintain deterministic media fixtures, desktop-reference tests, browser CI and upstream update/rebase jobs. Public API bindings should stay narrow; private decoder/filter changes will require more rebase attention. Prioritize security updates to parsers/codecs/fonts and reproduce upstream regressions before declaring them browser-port failures.

## Source register

The original investigation and revision 2 source inspection are dated 2026-09-06. Revision 3, also dated 2026-09-06, updates project decisions and milestone dependencies only; it does not claim a new upstream inspection or new benchmark. Source references and historical port findings are retained from revision 2. Default-branch/specification links can change and are not a coherent pinned build. The two explicit port snapshots are research references only. This register is not a transitive source lock.

[S35–S40] are the additional references for revision 2.

- [S1] libmpv-wasm README: https://github.com/brianhvo02/libmpv-wasm/blob/95881d698f77a54db9b2512d07d069994ceafc54/README.md
- [S2] libmpv-wasm CMake: https://github.com/brianhvo02/libmpv-wasm/blob/95881d698f77a54db9b2512d07d069994ceafc54/CMakeLists.txt
- [S3] C++ wrapper / TypeScript wrapper: https://github.com/brianhvo02/libmpv-wasm/blob/main/src/libmpv/libmpv.cpp and https://github.com/brianhvo02/libmpv-wasm/blob/main/src/MpvPlayer.ts
- [S4] Streaming issue: https://github.com/brianhvo02/libmpv-wasm/issues/10
- [S5] Subtitle issue: https://github.com/brianhvo02/libmpv-wasm/issues/13
- [S6] Build Dockerfile: https://github.com/brianhvo02/mpv-build/blob/34d1b9e6cba946c3e8dec8b9a3e32eec6bb3fd2b/Dockerfile
- [S7] Dependency update script: https://github.com/brianhvo02/mpv-build/blob/34d1b9e6cba946c3e8dec8b9a3e32eec6bb3fd2b/update
- [S8] mpv cross configuration: https://github.com/brianhvo02/mpv-build/blob/emscripten/scripts/mpv-config
- [S9] FFmpeg cross configuration: https://github.com/brianhvo02/mpv-build/blob/emscripten/scripts/ffmpeg-config
- [S10] mpv custom stream API: https://github.com/mpv-player/mpv/blob/master/include/mpv/stream_cb.h (fetched blob 9ae6f31a16847d9a695886a78bc1b7a2c9942a27)
- [S11] mpv custom stream implementation: https://github.com/mpv-player/mpv/blob/master/stream/stream_cb.c (fetched blob 27e04a90b75a3b21ef5d705310fa4eeda1a25da5)
- [S12] Decoder interface: https://github.com/mpv-player/mpv/blob/master/filters/f_decoder_wrapper.h (fetched blob b39d3f5f2a90dc65187084a0c4c4563102b215e1)
- [S13] Decoder queue/wrapper source: https://github.com/mpv-player/mpv/blob/master/filters/f_decoder_wrapper.c
- [S14] WebCodecs specification: https://www.w3.org/TR/webcodecs/
- [S15] AVC codec registration: https://www.w3.org/TR/webcodecs-avc-codec-registration/
- [S16] HEVC codec registration: https://www.w3.org/TR/webcodecs-hevc-codec-registration/
- [S17] Chrome WebCodecs guidance: https://developer.chrome.com/docs/web-platform/best-practices/webcodecs
- [S18] FFmpeg HLS source: https://ffmpeg.org/doxygen/trunk/hls_8c_source.html
- [S19] FFmpeg DASH source: https://ffmpeg.org/doxygen/trunk/dashdec_8c_source.html
- [S20] HTTP semantics and range validation: https://www.rfc-editor.org/rfc/rfc9110.html
- [S21] mpv audio output interface: https://github.com/mpv-player/mpv/blob/master/audio/out/internal.h (fetched blob 85fa7775759cebb321cb53a3cf441cbbc6d96625)
- [S22] Web Audio specification: https://www.w3.org/TR/webaudio/
- [S23] Emscripten pthreads: https://emscripten.org/docs/porting/pthreads.html
- [S24] Emscripten networking: https://emscripten.org/docs/porting/networking.html
- [S25] libmedia README: https://github.com/zhaohappy/libmedia/blob/master/README.md
- [S26] libmedia Fetch loader: https://github.com/zhaohappy/libmedia/blob/master/packages/avnetwork/src/ioLoader/FetchIOLoader.ts (fetched blob eba40214a9fea1049aca31414314da8733c5f292)
- [S27] libav.js: https://github.com/Yahweasel/libav.js
- [S28] libav.js WebCodecs bridge: https://github.com/Yahweasel/libavjs-webcodecs-bridge
- [S29] hls.js: https://github.com/video-dev/hls.js
- [S30] Shaka Player: https://github.com/shaka-project/shaka-player
- [S31] VideoDecoder flush: https://developer.mozilla.org/en-US/docs/Web/API/VideoDecoder/flush
- [S32] libmpv-wasm package license: https://github.com/brianhvo02/libmpv-wasm/blob/main/package.json
- [S33] mpv Copyright: https://github.com/mpv-player/mpv/blob/master/Copyright
- [S34] FFmpeg license/legal guidance: https://ffmpeg.org/legal.html

- [S35] mpv asynchronous filter and thread-safety contract: https://raw.githubusercontent.com/mpv-player/mpv/master/filters/filter.h
- [S36] mpv image representation / ownership interface: https://raw.githubusercontent.com/mpv-player/mpv/master/video/mp_image.h
- [S37] mpv video-output / presentation interface: https://raw.githubusercontent.com/mpv-player/mpv/master/video/out/vo.h
- [S38] WebGPU specification, external textures and lifetime: https://gpuweb.github.io/gpuweb/#external-texture
- [S39] mpv manual, hardware decoding and copy-back tradeoffs: https://mpv.io/manual/master/#options-hwdec
- [S40] Emscripten upstream build integration: https://emscripten.org/docs/compiling/Building-Projects.html
