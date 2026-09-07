# M3 integration and maintenance review

This is a source-grounded cost estimate, not an implementation authorization.
The owner remains the webmpv maintainers; a named reviewer and maintenance budget
must be accepted at G2. No excluded libmpv-wasm port is an implementation input.

## Existing authority and proposed extension

The pinned mpv v0.40.0 `filters/f_decoder_wrapper.c:reinit_decoder` owns decoder
selection. Its video branch selects `vd_lavc` directly, and
`video_decoder_list` enumerates that driver's decoders. A browser decoder cannot
be registered through the public TypeScript commands or public libmpv API.
The smallest candidate M4 change is an optional decoder driver at this existing
selection seam, with explicit capability checks and software fallback selection.

`video/decode/vd_lavc.c` demonstrates the existing executor contract:
`mp_filter_info` owns process/reset/destroy; `create` registers input and output
pins; `lavc_process` feeds compressed packets and receives decoded images.
A WebCodecs driver would preserve those filter owners, copy the packet data and
PTS into a bounded browser bridge, and publish ordinary CPU-backed `mp_image`
objects when asynchronous browser output arrives. `filters/filter.h` provides
the pin/backpressure and wakeup mechanism; browser callbacks must schedule work
through it, never mutate filter state from an unrelated thread.

The consumed output contract is `video/mp_image.h`: format, dimensions, planes,
strides, timestamps and reference-counted buffers. M4 can supply I420/NV12 CPU
planes and preserve the current filters, libass composition and libmpv software
renderer. The current `native/player.c:web_render` then delivers CPU pixels to
`web/engine-worker.js` and its Canvas. The benchmark measures a representative
copy-back/scaler/Canvas path, not this integrated chain, and does not prove an
end-to-end mpv speedup. It transfers the corpus once; the future per-packet
pthread/browser bridge remains unmeasured.

## Required patch and test budget

| Area | Proposed work | Validation needed before delivery |
|---|---|---|
| Decoder selection/build | Optional driver registration and source build gate; retain a separately buildable software artifact | Browser API absent, unsupported codec, rejected configuration, native build unchanged |
| Packet/configuration bridge | avcC and length-prefixed H.264 access units, bounded packet ownership, timestamp mapping | B-frame reordering, unusual timebases, missing PTS, configuration changes, malformed packets |
| Async filter/output | Bounded queues, owned frame/copy buffers, wakeup, I420/NV12 strides and color metadata | EOF drain, backpressure, hidden/suspended tab, pool exhaustion and late callbacks |
| Reset and destruction | Generation invalidation across source/seek changes; close every browser frame once | Seek/destroy during decode and copyTo, decoder errors, 100 lifecycle loops |
| Software recovery | Re-enter at a valid prior keyframe, replay preroll and suppress pre-target output | Mid-GOP failure, no usable keyframe, seek during fallback, continuous A/V/ASS state |
| Release/rebase | Native/browser manifests, optional artifact, patch inventory and upstream rebase checks | Full G1 functional/seek/ASS/audio/hour suites on both artifacts and a clean rebuild |

Planning estimate: roughly 3–6 engineer-weeks for a narrow H.264 copy-back
prototype plus qualification and review, with substantial uncertainty around
thread ownership and recovery. This is judgment from the seams above, not a
measured delivery commitment. Budget an explicit owner for each mpv/FFmpeg and
browser update, and one rebase/qualification cycle per upstream refresh; M3 has
not measured that recurring cost. Do not promise a line-count limit in advance.

Retained-frame M5 would additionally change image lifetime/format assumptions,
VO/filter download behavior and ASS composition. A direct Canvas draw in M3
proves none of those contracts. Treat its benchmark as a separate upper-bound
opportunity, subject to its own pixel-equivalence result and later G3 decision.

## Decision policy

The experiment can recommend approving a scoped M4 prototype only if copy-back
passes the predeclared benefit and correctness gates. Otherwise recommend defer
with the exact failed gate. In either case G2 requires the user's explicit
choice on the measured benefit, ownership and maintenance budget. M3 never
changes the default decoder or authorizes M5.

## Follow-up bridge and proposed G2 scope

The follow-up measures a separate packet producer reading the real shared Wasm
heap and sending a copied access unit over MessageChannel. The receiving worker
validates identity/generation and supplies the bytes to WebCodecs. Its cost is
included in a fresh-browser comparison after a fixed warm-up. This replaces an
unmeasured transport assumption with a concrete candidate measurement; it does
not implement the native filter hook.

One lifetime constraint is visible in the pinned source: `lavc_process` in
`filters/f_decoder_wrapper.c` returns a consumed packet to the demux packet pool
after `send` returns. A new asynchronous driver must copy or retain its packet
before that return. It cannot hand a raw pointer to a later browser callback.
The follow-up uses an immutable corpus and therefore does not exercise mutable
packet recycling. Existing `vd_lavc.c:receive_frame` fallback/requeue behavior is
internal to that driver; adding a new driver does not automatically inherit it.
These are explicit M4 implementation and test obligations.

If the follow-up gates pass, the proposed approval is a narrow H.264 SDR 8-bit
copy-back prototype through the existing decoder/filter seam, with bounded
ownership, I420/NV12 color metadata, drain/reset and keyframe/preroll software
recovery. Keep the software artifact separately buildable, preserve software as
the shipping default during evaluation, and require the full G1 suite before
claiming integrated qualification. AAC remains on the existing software path.
Retained frames, new codecs, HDR, live/ABR and S1 are outside that approval.

The 3–6 engineer-week estimate remains a planning range, not a commitment.
Proposed maintenance ownership stays with the existing webmpv maintainers:
review each upstream mpv/FFmpeg rebase, browser behavior change and qualification
failure, and own the decision to disable or retire the optional backend. No
named maintainer has accepted this future budget in the session. G2 must approve
that ownership and the scope above before production decoder changes begin.
