// mpv browser decoder with copy-back or retained-frame output.
// Browser transport does not own playback time.
#include <emscripten.h>
#include <emscripten/threading.h>
#include <stddef.h>
#include <string.h>
#include <math.h>
#include <pthread.h>
#include <libavcodec/avcodec.h>
#include <libavutil/pixdesc.h>
#include "mpv_talloc.h"
#include "common/av_common.h"
#include "common/codecs.h"
#include "common/msg.h"
#include "demux/packet.h"
#include "demux/stheader.h"
#include "filters/f_decoder_wrapper.h"
#include "filters/filter_internal.h"
#include "video/mp_image.h"
#include "browser_decoder_bridge.h"

struct browser_decoder_mailbox web_decoder;
static _Atomic int enabled;
static pthread_mutex_t owner_lock=PTHREAD_MUTEX_INITIALIZER;
static struct mp_filter *owner;
EMSCRIPTEN_KEEPALIVE void web_decoder_wakeup(void) {
    pthread_mutex_lock(&owner_lock);
    if(owner)mp_filter_wakeup(owner);
    pthread_mutex_unlock(&owner_lock);
}
_Static_assert(offsetof(struct browser_decoder_mailbox, timestamp)==64,"decoder ABI");
_Static_assert(offsetof(struct browser_decoder_mailbox, packet)==80,"decoder ABI");
EMSCRIPTEN_KEEPALIVE uintptr_t web_decoder_ptr(void) { return (uintptr_t)&web_decoder; }
EMSCRIPTEN_KEEPALIVE void web_decoder_enable(int value) { atomic_store(&enabled,value); }
int web_decoder_enabled(void) { return atomic_load(&enabled); }
static int request(int operation) {
    web_decoder.operation=operation;
    int ticket=++web_decoder.serial*4+1;
    atomic_store(&web_decoder.state,ticket);
    emscripten_futex_wake(&web_decoder.state,1);
    double deadline=emscripten_get_now()+5000;
    while(atomic_load(&web_decoder.state)==ticket) {
        if(emscripten_get_now()>deadline) {
            atomic_store(&web_decoder.state,0);
            return AVERROR(ETIMEDOUT);
        }
        emscripten_futex_wait(&web_decoder.state,ticket,20);
    }
    int result=atomic_load(&web_decoder.state)==ticket+1?web_decoder.result:AVERROR(EIO);
    atomic_store(&web_decoder.state,0);
    return result;
}
struct browser_priv {
    struct mp_decoder public;
    struct lavc_state state;
    AVCodecContext *software;
    AVPacket *packet;
    AVFrame *frame;
    AVRational timebase;
    AVPacket *replay[256];
    int count, replay_at, bytes;
    bool browser, replaying, drained, software_open, software_failed;
    bool retained_only, submitted_keyframe;
    int64_t delivered, recovery_target;
};
static void clear_replay(struct browser_priv *p) {
    for(int i=0;i<p->count;i++)av_packet_free(&p->replay[i]);
    p->count=p->replay_at=p->bytes=0;p->replaying=false;
}
static void fallback(struct mp_filter *f) {
    struct browser_priv *p=f->priv;
    if(!p->browser)return;
    if(p->retained_only){
        // This renderer consumes browser-owned VideoFrames. Software AVFrames
        // cannot satisfy that contract; the public API owns explicit mode changes.
        MP_ERR(f,"Retained browser decode failed. Reopen in software mode.\n");
        request(5);p->browser=false;p->software_failed=true;
        mp_filter_internal_mark_failed(f);return;
    }
    MP_WARN(f,"Browser decode failed or reached its bound; replaying in software.\n");
    request(5);p->browser=false;p->replaying=true;p->replay_at=0;p->recovery_target=p->delivered;
    if(!p->software_open){
        if(avcodec_open2(p->software,avcodec_find_decoder(p->software->codec_id),NULL)<0){
            p->software_failed=true;mp_filter_internal_mark_failed(f);return;
        }
        p->software_open=true;
    }
    avcodec_flush_buffers(p->software);
}
static int send(struct mp_filter *f,struct demux_packet *packet) {
    struct browser_priv *p=f->priv;
    if(p->software_failed)return AVERROR_EOF;
    if(p->replaying)return AVERROR(EAGAIN);
    mp_set_av_packet(p->packet,packet,&p->timebase);
    if(!p->browser)return avcodec_send_packet(p->software,packet?p->packet:NULL);
    if(!packet){p->drained=true;return request(3);}
    // Byte-oriented demuxers can return dependent preroll packets after a seek.
    // They cannot initialize a fresh browser decoder; wait for random access.
    if(!p->submitted_keyframe&&!(p->packet->flags&AV_PKT_FLAG_KEY))return 0;
    size_t extra_size=0;
    uint8_t *extra=av_packet_get_side_data(p->packet,AV_PKT_DATA_NEW_EXTRADATA,&extra_size);
    if(p->packet->size>WEB_DEC_PACKET_MAX ||
       (!p->retained_only&&(p->count>=256||p->bytes+p->packet->size>16*1024*1024)) ||
       p->packet->pts==AV_NOPTS_VALUE ||
       (extra&&(extra_size!=(size_t)p->software->extradata_size||memcmp(extra,p->software->extradata,extra_size)))) {
        fallback(f);return AVERROR(EAGAIN);
    }
    AVPacket *copy=p->retained_only?NULL:av_packet_clone(p->packet);
    if(!p->retained_only&&!copy){fallback(f);return AVERROR(EAGAIN);}
    web_decoder.size=p->packet->size;web_decoder.key=!!(p->packet->flags&AV_PKT_FLAG_KEY);
    web_decoder.timestamp=av_rescale_q(p->packet->pts,p->timebase,(AVRational){1,1000000});
    web_decoder.duration=p->packet->duration>0?av_rescale_q(p->packet->duration,p->timebase,(AVRational){1,1000000}):0;
    memcpy(web_decoder.packet,p->packet->data,p->packet->size);
    int result=request(2);
    if(result==AVERROR(EAGAIN)){av_packet_free(&copy);return result;}
    // Retain even a rejected submission: recovery must not omit that packet.
    if(copy){p->replay[p->count++]=copy;p->bytes+=copy->size;}
    if(result>=0)p->submitted_keyframe=true;
    if(result<0)fallback(f);
    return 0;
}
static int receive(struct mp_filter *f,struct mp_frame *out) {
    struct browser_priv *p=f->priv;
    int result;
    if(p->software_failed)return AVERROR_EOF;
    if(p->browser) {
        result=request(4);
        if(result<0&&result!=AVERROR(EAGAIN)&&result!=AVERROR_EOF){fallback(f);return 0;}
        if(result<=0)return result;
        AVFrame *frame=p->frame;
        frame->format=AV_PIX_FMT_YUV420P;
        frame->width=web_decoder.width;frame->height=web_decoder.height;
        if(frame->width<1||frame->height<1||frame->width>1920||frame->height>1080||
           (frame->width&1)||(frame->height&1)||av_frame_get_buffer(frame,32)<0){fallback(f);return 0;}
        int w=frame->width,h=frame->height,at=w*h;
        for(int y=0;y<h;y++)memcpy(frame->data[0]+y*frame->linesize[0],web_decoder.frame+y*w,w);
        for(int plane=1;plane<3;plane++){
            for(int y=0;y<h/2;y++){
                unsigned char *dst=frame->data[plane]+y*frame->linesize[plane];
                if(web_decoder.format==1){
                    const unsigned char *uv=web_decoder.frame+w*h+y*w;
                    for(int x=0;x<w/2;x++)dst[x]=uv[2*x+plane-1];
                }else memcpy(dst,web_decoder.frame+at+y*w/2,w/2);
            }
            at+=w*h/4;
        }
        frame->pts=av_rescale_q((int64_t)web_decoder.timestamp,(AVRational){1,1000000},p->timebase);
        frame->duration=av_rescale_q((int64_t)web_decoder.duration,(AVRational){1,1000000},p->timebase);
        frame->sample_aspect_ratio=p->software->sample_aspect_ratio;
        frame->color_primaries=web_decoder.primaries;frame->color_trc=web_decoder.transfer;
        frame->colorspace=web_decoder.matrix;frame->color_range=web_decoder.full_range?AVCOL_RANGE_JPEG:AVCOL_RANGE_MPEG;
    } else {
        result=avcodec_receive_frame(p->software,p->frame);
        if(result==AVERROR(EAGAIN)&&p->replaying){
            if(p->replay_at<p->count){
                int code=avcodec_send_packet(p->software,p->replay[p->replay_at]);
                if(code>=0)p->replay_at++;else if(code!=AVERROR(EAGAIN))return code;
                return 0;
            }
            bool drain=p->drained;clear_replay(p);
            if(drain)avcodec_send_packet(p->software,NULL);
            return 0;
        }
        if(result<0)return result;
        if(p->recovery_target!=AV_NOPTS_VALUE&&p->frame->pts!=AV_NOPTS_VALUE){
            if(p->frame->pts<=p->recovery_target){av_frame_unref(p->frame);return 0;}
            p->recovery_target=AV_NOPTS_VALUE;
        }
    }
    struct mp_image *image=mp_image_from_av_frame(p->frame);
    if(!image){av_frame_unref(p->frame);return AVERROR(ENOMEM);}
    image->pts=mp_pts_from_av(p->frame->pts,&p->timebase);
    image->pkt_duration=mp_pts_from_av(p->frame->duration,&p->timebase);
    p->delivered=p->frame->pts;
    av_frame_unref(p->frame);
    // Keep the most recent *delivered* keyframe and later packets, including
    // queued B frames. Submission alone is insufficient to prune recovery data.
    if(p->browser&&!p->retained_only){
        int cut=0;
        for(int i=1;i<p->count;i++)if((p->replay[i]->flags&AV_PKT_FLAG_KEY)&&p->replay[i]->pts<=p->delivered)cut=i;
        for(int i=0;i<cut;i++){p->bytes-=p->replay[i]->size;av_packet_free(&p->replay[i]);}
        if(cut){memmove(p->replay,p->replay+cut,(p->count-cut)*sizeof(p->replay[0]));p->count-=cut;}
    }
    *out=MAKE_FRAME(MP_FRAME_VIDEO,image);return 0;
}
static void process(struct mp_filter *f){struct browser_priv *p=f->priv;lavc_process(f,&p->state,send,receive);}
static void reset(struct mp_filter *f){
    struct browser_priv *p=f->priv;clear_replay(p);if(p->software_open)avcodec_flush_buffers(p->software);
    p->delivered=p->recovery_target=AV_NOPTS_VALUE;p->drained=false;p->submitted_keyframe=false;p->state=(struct lavc_state){0};
    if(p->browser&&request(6)<0)fallback(f);
}
static void destroy(struct mp_filter *f){
    pthread_mutex_lock(&owner_lock);if(owner==f)owner=NULL;pthread_mutex_unlock(&owner_lock);
    struct browser_priv *p=f->priv;if(p->browser)request(5);
    clear_replay(p);avcodec_free_context(&p->software);mp_free_av_packet(&p->packet);av_frame_free(&p->frame);
}
static const struct mp_filter_info info={.name="vd_browser",.priv_size=sizeof(struct browser_priv),.process=process,.reset=reset,.destroy=destroy};
static struct mp_decoder *create(struct mp_filter *parent,struct mp_codec_params *codec,const char *name){
    if(!web_decoder_enabled()||!codec->codec)return NULL;
    int kind=!strcmp(codec->codec,"h264")?1:!strcmp(codec->codec,"hevc")?2:!strcmp(codec->codec,"vp8")?3:!strcmp(codec->codec,"vp9")?4:!strcmp(codec->codec,"av1")?5:0;
    if(!kind)return NULL;
    // Legacy copy-back clients retain their original H.264-only ABI.
    if(atomic_load(&enabled)!=2&&kind!=1)return NULL;
    struct mp_filter *f=mp_filter_create(parent,&info);if(!f)return NULL;
    struct browser_priv *p=f->priv;p->public.f=f;p->delivered=p->recovery_target=AV_NOPTS_VALUE;
    p->retained_only=atomic_load(&enabled)==2;
    const AVCodec *decoder=avcodec_find_decoder(mp_codec_to_av_codec_id(codec->codec));
    p->software=avcodec_alloc_context3(decoder);p->packet=av_packet_alloc();p->frame=av_frame_alloc();
    if(!p->software||!p->packet||!p->frame||mp_set_avctx_codec_headers(p->software,codec)<0)goto fail;
    p->timebase=mp_get_codec_timebase(codec);p->software->pkt_timebase=p->timebase;p->software->thread_count=2;p->software->max_pixels=1920*1080;
    // Open the software codec only on recovery; eager decoder threads add
    // startup work to every successful browser configuration.
    int size=p->software->extradata_size;
    if(size<0||size>65536)goto fail;
    if(!p->retained_only&&(size<7||p->software->extradata[0]!=1))goto fail;
    web_decoder.reserved[0]=kind;web_decoder.reserved[1]=p->software->profile;web_decoder.reserved[2]=p->software->level;
    const AVPixFmtDescriptor *format=av_pix_fmt_desc_get(p->software->pix_fmt);
    web_decoder.format=format?format->comp[0].depth:p->software->bits_per_raw_sample;
    web_decoder.size=size;web_decoder.width=p->software->width;web_decoder.height=p->software->height;
    memcpy(web_decoder.packet,p->software->extradata,size);
    if(request(1)<0)goto fail;
    p->browser=true;mp_filter_add_pin(f,MP_PIN_IN,"in");mp_filter_add_pin(f,MP_PIN_OUT,"out");
    pthread_mutex_lock(&owner_lock);owner=f;pthread_mutex_unlock(&owner_lock);
    MP_INFO(f,"Using browser %s decoder.\n",p->retained_only?"retained-frame":"copy-back");return &p->public;
fail:
    talloc_free(f);return NULL;
}
const struct mp_decoder_fns vd_browser={.create=create};
