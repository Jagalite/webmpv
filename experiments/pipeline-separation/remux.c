// Experimental FFmpeg packet-only bridge. No decoders or encoders are linked.
#include <emscripten.h>
#include <libavformat/avformat.h>
#include <libavcodec/bsf.h>
#include <libavutil/avutil.h>
#include <libavutil/mem.h>
#include <stdio.h>
#include <errno.h>

static AVFormatContext *in, *out;
static AVIOContext *input_io, *output_io;
static AVBSFContext *audio_bsf;
static AVPacket *packet;
static int video=-1,audio=-1,map[64],eof;
static int64_t position,total;
static double fragment_start,origin;

EM_JS(int, source_read, (uint8_t *dst, int count, double offset), {
 const h=new Int32Array(Module.io,0,16),v=new DataView(Module.io);
 if(Atomics.load(h,4))return -1;
 v.setFloat64(32,offset,true);Atomics.store(h,2,count);Atomics.store(h,0,1);Atomics.notify(h,0);
 while(Atomics.load(h,0)===1){if(Atomics.load(h,4))return -1;Atomics.wait(h,0,1,100);}
 const n=Atomics.load(h,3);if(Atomics.load(h,0)!==2||n<0||n>count)return -1;
 HEAPU8.set(new Uint8Array(Module.io,64,n),dst);Atomics.store(h,0,0);return n;
});
EM_JS(void, emit_bytes, (uint8_t *ptr,int length), {
 Module.emit(HEAPU8.slice(ptr,ptr+length));
});
EM_JS(void, note_rap, (double pts), {Module.raps.push(pts);});
static int read_cb(void *opaque,uint8_t *dst,int n){
 if(position>=total)return AVERROR_EOF;
 n=FFMIN(n,262144);n=FFMIN(n,total-position);
 int r=source_read(dst,n,(double)position);if(r<0)return AVERROR_EXIT;
 position+=r;return r?r:AVERROR_EOF;
}
static int64_t seek_cb(void *opaque,int64_t offset,int whence){
 if(whence==AVSEEK_SIZE)return total;whence&=~AVSEEK_FORCE;
 int64_t base=whence==SEEK_SET?0:whence==SEEK_CUR?position:whence==SEEK_END?total:-1;
 if(base<0||offset < -base||offset>total-base)return AVERROR(EINVAL);
 return position=base+offset;
}
static int write_cb(void *opaque,const uint8_t *src,int n){emit_bytes((uint8_t*)src,n);return n;}
static void close_output(void){
 if(out){out->pb=NULL;avformat_free_context(out);out=NULL;}
 if(output_io){av_freep(&output_io->buffer);avio_context_free(&output_io);}
 av_bsf_free(&audio_bsf);
}
EMSCRIPTEN_KEEPALIVE void rm_close(void){close_output();if(in)avformat_close_input(&in);if(input_io){av_freep(&input_io->buffer);avio_context_free(&input_io);}av_packet_free(&packet);}
EMSCRIPTEN_KEEPALIVE int rm_open(double size){
 rm_close();av_max_alloc(16*1024*1024);total=(int64_t)size;position=0;
 input_io=avio_alloc_context(av_malloc(65536),65536,0,NULL,read_cb,NULL,seek_cb);
 if(!input_io)return AVERROR(ENOMEM);
 in=avformat_alloc_context();in->pb=input_io;in->flags|=AVFMT_FLAG_CUSTOM_IO;
 in->probesize=1024*1024;in->max_analyze_duration=1000000;in->max_index_size=4*1024*1024;
 int ret=avformat_open_input(&in,NULL,NULL,NULL);if(ret<0)return ret;
 if(in->nb_streams>64)return AVERROR(EINVAL);
 ret=avformat_find_stream_info(in,NULL);if(ret<0)return ret;
 video=av_find_best_stream(in,AVMEDIA_TYPE_VIDEO,-1,-1,NULL,0);
 audio=av_find_best_stream(in,AVMEDIA_TYPE_AUDIO,-1,-1,NULL,0);
 if(video<0||audio<0)return AVERROR(EINVAL);
 // Narrow positive admission, rather than pretending every FFmpeg format is MSE-ready.
 if(in->streams[video]->codecpar->codec_id!=AV_CODEC_ID_H264||in->streams[audio]->codecpar->codec_id!=AV_CODEC_ID_AAC)return AVERROR(ENOSYS);
 origin=in->start_time==AV_NOPTS_VALUE?0:in->start_time/(double)AV_TIME_BASE;
 packet=av_packet_alloc();return 0;
}
EMSCRIPTEN_KEEPALIVE double rm_duration(void){return in&&in->duration!=AV_NOPTS_VALUE?in->duration/(double)AV_TIME_BASE:0;}
EMSCRIPTEN_KEEPALIVE const char *rm_video_codec(void){
 static char codec[64];AVCodecParameters *p=in->streams[video]->codecpar;
 if(p->extradata_size>=4&&p->extradata[0]==1)snprintf(codec,sizeof(codec),"avc1.%02X%02X%02X",p->extradata[1],p->extradata[2],p->extradata[3]);
 else snprintf(codec,sizeof(codec),"avc1.640028"); // TS fixture only; recorded experimental limit.
 return codec;
}
EMSCRIPTEN_KEEPALIVE const char *rm_audio_codec(void){return "mp4a.40.2";}
EMSCRIPTEN_KEEPALIVE int rm_start(double target){
 close_output();eof=0;fragment_start=-1;
 if(target>0){int r=av_seek_frame(in,video,(int64_t)((target+origin)/av_q2d(in->streams[video]->time_base)),AVSEEK_FLAG_BACKWARD);if(r<0)return r;avformat_flush(in);}
 else if(position>0&&target<0){int r=av_seek_frame(in,video,(int64_t)(origin/av_q2d(in->streams[video]->time_base)),AVSEEK_FLAG_BACKWARD);if(r<0)return r;avformat_flush(in);}
 int r=avformat_alloc_output_context2(&out,NULL,"mp4",NULL);if(r<0)return r;
 output_io=avio_alloc_context(av_malloc(65536),65536,1,NULL,NULL,write_cb,NULL);if(!output_io)return AVERROR(ENOMEM);
 out->pb=output_io;out->flags|=AVFMT_FLAG_CUSTOM_IO;out->avoid_negative_ts=AVFMT_AVOID_NEG_TS_DISABLED;
 for(int i=0;i<64;i++)map[i]=-1;
 for(unsigned i=0;i<in->nb_streams;i++){
  if((int)i!=video&&(int)i!=audio)continue;
  AVStream *s=avformat_new_stream(out,NULL);map[i]=s->index;
  avcodec_parameters_copy(s->codecpar,in->streams[i]->codecpar);s->codecpar->codec_tag=0;s->time_base=in->streams[i]->time_base;
  // Codec parameter coded side data (rotation/color) is copied by avcodec_parameters_copy.
  s->sample_aspect_ratio=in->streams[i]->sample_aspect_ratio;
  if((int)i==audio&&strstr(in->iformat->name,"mpegts")){
   r=av_bsf_alloc(av_bsf_get_by_name("aac_adtstoasc"),&audio_bsf);if(r<0)return r;
   avcodec_parameters_copy(audio_bsf->par_in,s->codecpar);audio_bsf->time_base_in=s->time_base;
   r=av_bsf_init(audio_bsf);if(r<0)return r;avcodec_parameters_copy(s->codecpar,audio_bsf->par_out);
  }
 }
 AVDictionary *opts=NULL;
 av_dict_set(&opts,"movflags","empty_moov+default_base_moof+frag_custom+frag_discont",0);
 av_dict_set(&opts,"use_editlist","0",0);
 r=avformat_write_header(out,&opts);av_dict_free(&opts);avio_flush(output_io);return r;
}
EMSCRIPTEN_KEEPALIVE int rm_step(void){
 if(eof)return 0;
 for(int count=0;count<20000;count++){
  int r=av_read_frame(in,packet);
  if(r==AVERROR_EOF){av_write_trailer(out);avio_flush(output_io);eof=1;return 0;}
  if(r<0)return r;
  int idx=packet->stream_index;
  if(idx>=64||map[idx]<0){av_packet_unref(packet);continue;}
  if(idx==audio&&audio_bsf){r=av_bsf_send_packet(audio_bsf,packet);if(r<0)return r;r=av_bsf_receive_packet(audio_bsf,packet);if(r<0)return r;}
  AVStream *src=in->streams[idx],*dst=out->streams[map[idx]];
  if(idx==video&&(packet->flags&AV_PKT_FLAG_KEY)&&packet->pts!=AV_NOPTS_VALUE)note_rap(packet->pts*av_q2d(src->time_base)-origin);
  double time=packet->dts==AV_NOPTS_VALUE?0:packet->dts*av_q2d(src->time_base)-origin;
  if(fragment_start<0)fragment_start=time;
  // Preserve the source timeline, including PTS-DTS reordering and A/V offsets.
  // One-second positive mux bias permits negative decoder preroll in tfdt.
  // MSE timestampOffset=-1 restores the source timeline. Reject deeper preroll.
  int64_t shift=(int64_t)((origin-1.0)/av_q2d(src->time_base));
  if(packet->pts!=AV_NOPTS_VALUE)packet->pts-=shift;
  if(packet->dts!=AV_NOPTS_VALUE)packet->dts-=shift;
  if(packet->dts<0)return AVERROR(ERANGE);
  av_packet_rescale_ts(packet,src->time_base,dst->time_base);packet->stream_index=map[idx];packet->pos=-1;
  r=av_interleaved_write_frame(out,packet);if(r<0)return r;
  if(idx==video&&time-fragment_start>=0.5){av_interleaved_write_frame(out,NULL);r=av_write_frame(out,NULL);avio_flush(output_io);fragment_start=time;return r<0?r:1;}
 }
 return AVERROR(EOVERFLOW);
}
