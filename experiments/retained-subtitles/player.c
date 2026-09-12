#include <emscripten.h>
#include <mpv/client.h>
#include <mpv/render.h>
#include <stdatomic.h>
#include <libavutil/mem.h>
#include <stdlib.h>
#include <stdio.h>
#include <stdint.h>
#include "audio_bridge.h"
#include "stream_bridge.h"

static mpv_handle *player;
static mpv_render_context *renderer;
static _Atomic int render_pending;
static unsigned char *pixels;
static int width, height;
static int experiment_skip_render;
static double selected_pts=-1,selected_target;
static int selected_serial,selected_redraw;
void web_experiment_frame(double pts,int64_t target_ns,int redraw) {
    selected_pts=pts; selected_target=(double)target_ns/1000; selected_redraw=redraw; selected_serial++;
}
EMSCRIPTEN_KEEPALIVE double web_selected_pts(void) { return selected_pts; }
EMSCRIPTEN_KEEPALIVE int web_selected_serial(void) { return selected_serial; }
EMSCRIPTEN_KEEPALIVE int web_selected_redraw(void) { return selected_redraw; }
EMSCRIPTEN_KEEPALIVE double web_selected_delay(void) { return selected_target>0?(selected_target-mpv_get_time_us(player))/1000:0; }
EMSCRIPTEN_KEEPALIVE void web_experiment_skip_render(int value) { experiment_skip_render=value; }
static void render_wakeup(void *ctx) { atomic_store(&render_pending, 1); }

EMSCRIPTEN_KEEPALIVE uintptr_t web_audio_ptr(void) { return (uintptr_t)&web_audio; }
static int decode_pixels = 3840 * 2160;
static size_t allocation_limit = 128 * 1024 * 1024;
EMSCRIPTEN_KEEPALIVE int web_configure(int pixels, int allocation) {
    if (player || pixels < 1 || pixels > 3840*2160 || allocation < 32*1024*1024 || allocation > 256*1024*1024) return -1;
    decode_pixels = pixels; allocation_limit = allocation; return 0;
}
EMSCRIPTEN_KEEPALIVE int web_create(int rate)
{
    if (player) return MPV_ERROR_INVALID_PARAMETER;
    av_max_alloc(allocation_limit);
    char decoder_options[96];
    snprintf(decoder_options,sizeof(decoder_options),"max_pixels=%d",decode_pixels);
    atomic_store(&web_audio.rate,rate);
    player = mpv_create();
    if (!player) return MPV_ERROR_NOMEM;
    struct {const char *k,*v;} options[] = {
        // Scripting and ytdl are disabled at build time (their options do not exist).
        {"config","no"},
        {"terminal","no"}, {"input-default-bindings","no"}, {"input-vo-keyboard","no"},
        {"vo","libmpv"}, {"ao","browser"}, {"hwdec","no"},
        {"video-timing-offset","0"},
        {"sws-fast","yes"}, {"sws-scaler","bilinear"},
        {"vd-lavc-threads","2"}, {"ad-lavc-threads","1"},
        {"vd-lavc-o",decoder_options},
        {"idle","yes"}, {"keep-open","yes"}, {"pause","yes"},
        {"audio-buffer","0.1"}, {"demuxer-max-bytes","33554432"},
        {"demuxer-max-back-bytes","8388608"}, {"cache","no"},
        {"demuxer-lavf-probesize","1048576"},
        {"demuxer-lavf-analyzeduration","1"},
        {"demuxer-lavf-o","max_streams=64,max_probe_packets=64"},
        {"osd-level","0"}, {"sub-fonts-dir","/fonts"},
        {"sub-font","DejaVu Sans"}, {"osd-font","DejaVu Sans"},
        {"sub-ass-override","no"}, {"access-references","no"},
    };
    for (unsigned n=0;n<sizeof(options)/sizeof(options[0]);n++) {
        int ret=mpv_set_option_string(player,options[n].k,options[n].v);
        if (ret<0) { mpv_terminate_destroy(player); player=NULL; return ret; }
    }
    int ret=mpv_initialize(player);
    if (ret<0) { mpv_terminate_destroy(player); player=NULL; return ret; }
    ret=web_register_stream(player);
    if(ret<0){mpv_terminate_destroy(player);player=NULL;return ret;}
    mpv_request_log_messages(player,"warn");
    const char *props[]={"time-pos","duration","pause","eof-reached","track-list","audio-codec-name","video-codec","volume","speed","paused-for-cache","cache-buffering-state","demuxer-cache-state","decoder-frame-drop-count","frame-drop-count","avsync","video-params"};
    for(unsigned n=0;n<sizeof(props)/sizeof(props[0]);n++)
        mpv_observe_property(player,n+1,props[n],MPV_FORMAT_NODE);
    mpv_render_param params[]={{MPV_RENDER_PARAM_API_TYPE,MPV_RENDER_API_TYPE_SW},{0}};
    ret=mpv_render_context_create(&renderer,player,params);
    if (ret<0) { mpv_terminate_destroy(player); player=NULL; return ret; }
    mpv_render_context_set_update_callback(renderer,render_wakeup,NULL);
    return 0;
}
EMSCRIPTEN_KEEPALIVE int web_command_args(uint32_t id,const char *a,const char *b,const char *c,const char *d)
{
    const char *args[]={a,b,c,d,NULL};
    return player?mpv_command_async(player,id,args):MPV_ERROR_UNINITIALIZED;
}
EMSCRIPTEN_KEEPALIVE int web_add_subtitle(uint32_t id, const char *path,
                                              const char *title, const char *lang, int select)
{
    const char *args[]={"sub-add",path,select?"select":"auto",title,lang,NULL};
    return player?mpv_command_async(player,id,args):MPV_ERROR_UNINITIALIZED;
}
EMSCRIPTEN_KEEPALIVE char *web_event(void)
{
    if(!player) return NULL;
    mpv_event *ev=mpv_wait_event(player,0);
    if(ev->event_id==MPV_EVENT_NONE) return NULL;
    mpv_node node={0};
    if(mpv_event_to_node(&node,ev)<0) return NULL;
    // event-to-node owns copies; convert before the next wait invalidates ev.
    extern char *web_node_json(mpv_node *node);
    char *json=web_node_json(&node);
    mpv_free_node_contents(&node);
    return json;
}
EMSCRIPTEN_KEEPALIVE uintptr_t web_render(int w,int h,int force)
{
    extern void web_subtitle_size(int w,int h);
    web_subtitle_size(w,h);
    if(!renderer || w<1 || h<1 || w>1920 || h>1080) return 0;
    if(!force && !atomic_exchange(&render_pending,0)) return 0;
    uint64_t updates=mpv_render_context_update(renderer);
    if(!force && !(updates&MPV_RENDER_UPDATE_FRAME)) return 0;
    if(experiment_skip_render) {
        int skip=1,block=0;
        mpv_render_param params[]={{MPV_RENDER_PARAM_SKIP_RENDERING,&skip},{MPV_RENDER_PARAM_BLOCK_FOR_TARGET_TIME,&block},{0}};
        return mpv_render_context_render(renderer,params)<0?0:1;
    }
    if(w!=width || h!=height) {
        void *next=NULL;
        if(posix_memalign(&next,64,(size_t)w*h*4)) return 0;
        free(pixels);
        pixels=next; width=w; height=h;
    }
    int size[]={w,h}, block=0;
    size_t stride=(size_t)w*4;
    mpv_render_param params[]={
        {MPV_RENDER_PARAM_SW_SIZE,size}, {MPV_RENDER_PARAM_SW_FORMAT,"rgb0"},
        {MPV_RENDER_PARAM_SW_STRIDE,&stride}, {MPV_RENDER_PARAM_SW_POINTER,pixels},
        {MPV_RENDER_PARAM_BLOCK_FOR_TARGET_TIME,&block}, {0},
    };
    if(mpv_render_context_render(renderer,params)<0) return 0;
    return (uintptr_t)pixels;
}
EMSCRIPTEN_KEEPALIVE void web_presented(void)
{
    if(renderer) mpv_render_context_report_swap(renderer);
}
EMSCRIPTEN_KEEPALIVE void web_destroy(void)
{
    if(renderer) {mpv_render_context_free(renderer);renderer=NULL;}
    if(player) {mpv_terminate_destroy(player);player=NULL;}
    free(pixels);pixels=NULL;width=height=0;
}
