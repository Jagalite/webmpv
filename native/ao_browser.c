// Original browser push AO. mpv retains ownership of decoding and synchronization.
#include "audio/format.h"
#include "audio/chmap.h"
#include "audio/out/internal.h"
#include "audio_bridge.h"
#include <string.h>

struct web_audio_ring web_audio;
static void reset(struct ao *ao)
{
    atomic_fetch_add(&web_audio.epoch, 1); // odd: reset in progress
    atomic_store(&web_audio.running, 0);
    atomic_store(&web_audio.written, 0);
    atomic_store(&web_audio.consumed, 0);
    atomic_fetch_add(&web_audio.epoch, 1);
}
static uint32_t consumed(void)
{
    uint32_t epoch=atomic_load(&web_audio.epoch);
    return atomic_load(&web_audio.feedback_epoch)==epoch ? atomic_load(&web_audio.consumed) : 0;
}
static int init(struct ao *ao)
{
    ao->format = AF_FORMAT_FLOAT;
    ao->samplerate = atomic_load(&web_audio.rate);
    if (ao->samplerate < 8000 || ao->samplerate > 192000) return -1;
    mp_chmap_from_channels(&ao->channels, 2);
    ao->device_buffer = WEB_AUDIO_CAPACITY;
    reset(ao);
    return 0;
}
static void start(struct ao *ao) { atomic_store(&web_audio.running, 1); }
static bool pause_audio(struct ao *ao, bool paused)
{
    atomic_store(&web_audio.running, !paused);
    return true;
}
static bool write_audio(struct ao *ao, void **data, int samples)
{
    uint32_t w = atomic_load(&web_audio.written);
    uint32_t r = consumed();
    uint32_t queued=w-r;
    if (samples < 0 || queued > WEB_AUDIO_CAPACITY || (uint32_t)samples > WEB_AUDIO_CAPACITY - queued) return false;
    float *src = data[0];
    for (int n=0; n<samples; n++) {
        unsigned at = ((w+n) % WEB_AUDIO_CAPACITY)*2;
        web_audio.pcm[at] = src[n*2];
        web_audio.pcm[at+1] = src[n*2+1];
    }
    atomic_store(&web_audio.written, w+samples);
    return true;
}
static void state(struct ao *ao, struct mp_pcm_state *s)
{
    uint32_t queued = atomic_load(&web_audio.written)-consumed();
    if (queued > WEB_AUDIO_CAPACITY) queued = WEB_AUDIO_CAPACITY;
    s->queued_samples = queued;
    s->free_samples = (WEB_AUDIO_CAPACITY-queued)/128*128;
    s->delay = queued/(double)ao->samplerate + atomic_load(&web_audio.latency_us)/1e6;
    s->playing = atomic_load(&web_audio.running) && atomic_load(&web_audio.context_running) && queued > 0;
}
const struct ao_driver audio_out_browser = {
    .name="browser", .description="Browser AudioWorklet PCM output",
    .init=init, .uninit=reset, .reset=reset, .start=start,
    .set_pause=pause_audio, .write=write_audio, .get_state=state,
};
