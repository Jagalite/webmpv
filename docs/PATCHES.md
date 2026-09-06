# Baseline portability patch inventory

Owner: webmpv maintainers. Inputs are the upstream archives in sources.lock.json.
No incomplete libmpv-wasm port, associated fork, wrapper, SDK or build recipe is
an implementation input.

## 0001: browser audio registration

Adds the original `native/ao_browser.c` to mpv's build and AO driver table. The
public libmpv API has a software render output but no public registration API
for a PCM output driver. This is the narrow baseline AO seam authorized by the
architecture; it does not alter decoders, images, filters or scheduler ownership.

The AO requests Float32 stereo at AudioContext's actual rate. mpv performs
decoding, conversion, buffering and synchronization. The browser worklet's
consumption count plus reported output latency supplies the AO's total delay.
Context suspension and worklet silence do not consume media samples. The queue
is bounded at 8192 frames, and resets use an epoch/acknowledgement handshake.

Validation: the real browser tests must observe actual nonzero output from the
worklet through a connected analyser, pause/seek behavior and native destruction.
The analyser proves browser graph output, not physical loudspeaker response.

## FFmpeg 0001: minimal H.264 SEI link dependency

The n7.1.1 H.264 SEI cleanup calls `ff_aom_uninit_film_grain_params`, but its
Makefile includes `aom_film_grain.o` only for HEVC. A minimal H.264-only build
therefore compiled successfully but failed at final link with that unresolved
symbol. Add the already-upstream helper object to H.264 SEI's build list. This
changes build dependency selection only, not decoding or image semantics.
Validation: final Wasm link and H.264 B-frame fixture playback.

## Build configuration choices

Stock Emscripten 4.0.14, threading and SIMD enabled across native libraries.
Its upstream WasmFS in-memory backend handles the small local fixture and fonts.
This lets mpv pthreads perform local file operations without synchronously
proxying each read back to the rendering/control worker. This uses the stock SDK,
not the excluded port's filesystem or toolchain fork.
The no-main library runtime stays alive between exported calls (`EXIT_RUNTIME=0`);
mpv is explicitly destroyed before its owning worker is terminated. An assertion
build caught automatic runtime shutdown destroying WasmFS between commands when
`EXIT_RUNTIME=1` was used. This is a link setting, not an SDK patch.
zlib uses its configure build with explicit CHOST to avoid native macOS libtool.
libplacebo is an upstream mpv dependency built without GPU backends; video uses
the existing libmpv software render API. Its public Vulkan stubs require headers
even with Vulkan disabled, so the exact upstream Vulkan-Headers submodule
revision is locked and populated by the build script. Fontconfig is replaced by an explicit
bundled font directory and attached fixture font. Libraries' optional native
backends, scripts, programs and network protocols are disabled.

Any additional portability patches discovered during the build are listed here
with their rationale before M0 is marked complete.

## 0002: browser attachment retention budget

The Emscripten-only check in `demuxer_add_attachment` bounds mpv's retained
attachments to 32 entries, 4 MiB per entry and 16 MiB aggregate. Over-budget
attachments are omitted with an error log; their font fidelity is unsupported.
Native builds are unchanged. The host also sets a 32 MiB libavutil allocation
limit and explicit probing/stream limits. The guard does not prevent FFmpeg's
initial attachment parse allocation; the allocation and total Wasm heap limits
cover that stage. Normal attached-font fixtures must still render correctly.

## M1 public stream bridge

`native/stream_bridge.c` registers mpv's public stream callbacks. A synchronous
read waits on a bounded shared mailbox; an independent browser worker owns Fetch.
Ticketed state prevents stale responses committing into a newer read. Terminal
close and recoverable seek interruption are separate. On mpv's public seek event,
the host interrupts only the captured old pending read after mpv has flushed its
demux/decoder/AO queues. The stalled actual-demux test verifies this boundary;
no internal demux seek patch was necessary.
