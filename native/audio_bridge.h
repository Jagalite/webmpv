#ifndef WEBMPV_AUDIO_BRIDGE_H
#define WEBMPV_AUDIO_BRIDGE_H
#include <stdatomic.h>
#include <stdint.h>
#include <stddef.h>
#define WEB_AUDIO_CAPACITY 8192
// One instance per Wasm module. Float32 interleaved, up to eight channels; counters are frame counts.
struct web_audio_ring {
    _Atomic uint32_t written, consumed, running, epoch;
    _Atomic uint32_t rate, latency_us, context_running, feedback_epoch;
    float pcm[WEB_AUDIO_CAPACITY * 8];
};
_Static_assert(offsetof(struct web_audio_ring, pcm) == 32, "Browser PCM ABI header must be 32 bytes");
extern struct web_audio_ring web_audio;
extern unsigned web_audio_channels;
int web_audio_configure(int channels);
#endif
