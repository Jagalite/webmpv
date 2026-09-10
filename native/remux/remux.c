// Experimental FFmpeg packet-only bridge. No decoders or encoders are linked.
#include <emscripten.h>
#include <libavformat/avformat.h>
#include <libavcodec/bsf.h>
#include <libavutil/avutil.h>
#include <libavutil/mem.h>
#include <stdio.h>
#include <errno.h>
#include <libavcodec/h264_parse.h>
#include <libavutil/intreadwrite.h>
#include <libavutil/pixdesc.h>
static H264ParamSets ps;
static int reorder,nal_size,is_avc,repair_dts,generic_video,hevc_video,mux_webm;
static int64_t pts_queue[17],last_dts[64];
static uint8_t config_nals[64][4096];static int config_sizes[64],config_count;
static char video_codec[96],audio_codec[32],failure[160];
static int reject(const char *reason){snprintf(failure,sizeof(failure),"%s",reason);return AVERROR_INVALIDDATA;}
EMSCRIPTEN_KEEPALIVE const char *rm_error(void){return failure;}
static int visit_nal(const uint8_t*p,int n,int record){
 if(n<=0)return 0;int type=hevc_video?(p[0]>>1)&63:p[0]&31;if(hevc_video?(type<32||type>34):(type!=7&&type!=8))return 0;
 if(record){if(config_count>=64||n>4096)return reject("AVC parameter budget exceeded");memcpy(config_nals[config_count],p,n);config_sizes[config_count++]=n;return 0;}
 for(int i=0;i<config_count;i++)if(config_sizes[i]==n&&!memcmp(p,config_nals[i],n))return 0;
 return reject("Selected AVC configuration changed; new initialization required");
}
static int scan_nals(const uint8_t*p,int n,int length_size,int record){
 if(length_size){for(int i=0;i<n;){if(n-i<length_size)return reject("Truncated AVC packet");unsigned len=0;for(int j=0;j<length_size;j++)len=(len<<8)|p[i++];if(len>(unsigned)(n-i))return reject("Invalid AVC packet framing");int r=visit_nal(p+i,len,record);if(r<0)return r;i+=len;}return 0;}
 int start=-1;for(int i=0;i<n;i++){int prefix=i+3<n&&p[i]==0&&p[i+1]==0&&p[i+2]==0&&p[i+3]==1?4:i+2<n&&p[i]==0&&p[i+1]==0&&p[i+2]==1?3:0;if(prefix){if(start>=0){int r=visit_nal(p+start,i-start,record);if(r<0)return r;}start=i+prefix;i+=prefix-1;}}
 return start>=0?visit_nal(p+start,n-start,record):0;
}
static int configure_video(AVCodecParameters*p){
 generic_video=p->codec_id!=AV_CODEC_ID_H264;hevc_video=p->codec_id==AV_CODEC_ID_HEVC;config_count=0;
 if(generic_video){
  int kind=p->codec_id==AV_CODEC_ID_HEVC?2:p->codec_id==AV_CODEC_ID_VP8?3:p->codec_id==AV_CODEC_ID_VP9?4:p->codec_id==AV_CODEC_ID_AV1?5:0;
  if(!kind)return reject("Video codec has no browser remux packet contract");
  if(p->extradata_size>65536)return reject("Video configuration budget exceeded");
  if(hevc_video){
   is_avc=p->extradata_size>=23&&p->extradata[0]==1;nal_size=is_avc?(p->extradata[21]&3)+1:0;
   if(is_avc){int at=23;for(int array=0;array<p->extradata[22];array++){
    if(at+3>p->extradata_size)return reject("Truncated hvcC");at++;int count=AV_RB16(p->extradata+at);at+=2;
    while(count--){if(at+2>p->extradata_size)return reject("Truncated hvcC");int n=AV_RB16(p->extradata+at);at+=2;if(at+n>p->extradata_size)return reject("Truncated hvcC");int r=visit_nal(p->extradata+at,n,1);if(r<0)return r;at+=n;}
   }}else{int r=scan_nals(p->extradata,p->extradata_size,0,1);if(r<0)return r;}
   if(!config_count)return reject("Missing HEVC parameter sets");
  }
  const AVPixFmtDescriptor *fmt=av_pix_fmt_desc_get(p->format);
  EM_ASM({Module.videoConfig=({kind:$0,description:HEAPU8.slice($1,$1+$2),width:$3,height:$4,profile:$5,level:$6,depth:$7});},kind,p->extradata,p->extradata_size,p->width,p->height,p->profile,p->level,fmt?fmt->comp[0].depth:8);
  snprintf(video_codec,sizeof(video_codec),"%s",avcodec_get_name(p->codec_id));return 0;
 }
 if(!p->extradata_size)return reject("Missing AVC configuration");
 ff_h264_ps_uninit(&ps);int r=ff_h264_decode_extradata(p->extradata,p->extradata_size,&ps,&is_avc,&nal_size,AV_EF_EXPLODE,NULL);if(r<0)return reject("Invalid AVC configuration");
 const SPS*s=NULL;for(int i=0;i<MAX_SPS_COUNT;i++)if(ps.sps_list[i]){s=ps.sps_list[i];break;}
 if(!s||!s->frame_mbs_only_flag)return reject("Interlaced AVC requires decoder handling");
 reorder=s->num_reorder_frames;if(reorder<0||reorder>16)return reject("AVC reorder budget exceeded");
 if(repair_dts&&!s->bitstream_restriction_flag)return reject("MKV lacks explicit AVC reorder bound");
 p->video_delay=reorder;
 config_count=0;
 if(is_avc){int i=6;for(int group=0;group<2;group++){if(group&&i>=p->extradata_size)return reject("Truncated avcC");int count=group?p->extradata[i++]:p->extradata[5]&31;while(count--){if(i+2>p->extradata_size)return reject("Truncated avcC");int n=AV_RB16(p->extradata+i);i+=2;if(i+n>p->extradata_size)return reject("Truncated avcC");r=visit_nal(p->extradata+i,n,1);if(r<0)return r;i+=n;}}}
 else {r=scan_nals(p->extradata,p->extradata_size,0,1);if(r<0)return r;}
 const uint8_t*header=NULL;for(int i=0;i<config_count;i++)if((config_nals[i][0]&31)==7&&config_sizes[i]>=4){header=config_nals[i];break;}
 if(!header)return reject("AVC SPS unavailable");snprintf(video_codec,sizeof(video_codec),"avc1.%02X%02X%02X",header[1],header[2],header[3]);return 0;
}
static int configure_aac(AVCodecParameters*p,const uint8_t*adts,int n){
 if(adts){
  if(n<7||adts[0]!=255||(adts[1]&0xf6)!=0xf0)return reject("Invalid AAC ADTS framing");
  int object=(adts[2]>>6)+1,freq=(adts[2]>>2)&15,channels=((adts[2]&1)<<2)|(adts[3]>>6);
  if(object!=2||freq>=13||channels<1||channels>7||(adts[6]&3))return reject("Unsupported AAC ADTS configuration");
  uint8_t asc[2]={(object<<3)|(freq>>1),((freq&1)<<7)|(channels<<3)};
  if(p->extradata_size&&(p->extradata_size<2||memcmp(p->extradata,asc,2)))return reject("Selected AAC configuration changed");
  if(!p->extradata_size){p->extradata=av_mallocz(2+AV_INPUT_BUFFER_PADDING_SIZE);if(!p->extradata)return AVERROR(ENOMEM);memcpy(p->extradata,asc,2);p->extradata_size=2;}
 }
 if(p->extradata_size<2)return reject("Missing AAC AudioSpecificConfig");
 int object=p->extradata[0]>>3,freq=((p->extradata[0]&7)<<1)|(p->extradata[1]>>7),channels=(p->extradata[1]>>3)&15;
 // Non-ADTS ASC profiles are copied verbatim. FFmpeg's parsed stream metadata
 // and source packet durations own SBR/PS rate and priming; do not rewrite them.
 if(!adts&&(object!=2||freq==15||channels==0)){
  if(object<1||object>=31||p->sample_rate<=0||p->ch_layout.nb_channels<=0)return reject("Incomplete AAC profile metadata");
  snprintf(audio_codec,sizeof(audio_codec),"mp4a.40.%d",object);return 0;
 }
 static const int rates[]={96000,88200,64000,48000,44100,32000,24000,22050,16000,12000,11025,8000,7350};
 if(object!=2||freq>=13||channels<1||channels>7)return reject("Unsupported AAC profile or channel layout");
 p->sample_rate=rates[freq];p->frame_size=1024;if(p->ch_layout.nb_channels!=(channels==7?8:channels)){av_channel_layout_uninit(&p->ch_layout);av_channel_layout_default(&p->ch_layout,channels==7?8:channels);}snprintf(audio_codec,sizeof(audio_codec),"mp4a.40.%d",object);return 0;
}

static int configure_audio(AVCodecParameters *p){
 if(p->codec_id==AV_CODEC_ID_AAC)return configure_aac(p,NULL,0);
 const char *codec=p->codec_id==AV_CODEC_ID_MP3?"mp3":p->codec_id==AV_CODEC_ID_OPUS?"opus":p->codec_id==AV_CODEC_ID_VORBIS?"vorbis":p->codec_id==AV_CODEC_ID_FLAC?"flac":p->codec_id==AV_CODEC_ID_AC3?"ac-3":p->codec_id==AV_CODEC_ID_EAC3?"ec-3":NULL;
 if(!codec)return reject("Audio codec has no browser MP4 packet contract");
 if(p->codec_id==AV_CODEC_ID_FLAC){
  if(p->extradata_size!=34)return reject("Missing FLAC STREAMINFO");
  p->bits_per_raw_sample=(((p->extradata[12]&1)<<4)|(p->extradata[13]>>4))+1;
 }
 snprintf(audio_codec,sizeof(audio_codec),"%s",codec);return 0;
}

static AVFormatContext *in, *out;
static AVIOContext *input_io, *output_io;
static AVBSFContext *audio_bsf;
static AVPacket *packet;
static AVPacket *prefetch[256];static int prefetched,prefetch_at;
static void clear_prefetch(void){for(int i=0;i<prefetched;i++)av_packet_free(&prefetch[i]);prefetched=prefetch_at=0;}
static int video=-1,audio=-1,map[64],eof,is_ts,video_started;
static int64_t position,total,aac_anchor,aac_count;
static double fragment_start,origin;
static int idr(const AVPacket*q){
 if(generic_video)return !!(q->flags&AV_PKT_FLAG_KEY);
 const uint8_t*p=q->data;int n=q->size;
 if(is_avc){for(int i=0;i<n;){if(n-i<nal_size)return 0;unsigned size=0;for(int j=0;j<nal_size;j++)size=(size<<8)|p[i++];if(size>(unsigned)(n-i))return 0;if(size&&(p[i]&31)==5)return 1;i+=size;}}
 else for(int i=0;i+3<n;i++)if(!p[i]&&!p[i+1]&&p[i+2]==1&&(p[i+3]&31)==5)return 1;
 return 0;
}
static int repair_audio(AVPacket*q,int strict){
 if(!strict&&q->pts!=AV_NOPTS_VALUE){aac_anchor=q->pts;aac_count=0;}
 AVStream*src=in->streams[audio];
 if(aac_anchor==AV_NOPTS_VALUE){if(q->pts==AV_NOPTS_VALUE)return reject("Missing initial AAC timestamp");aac_anchor=q->pts;}
 int64_t expected=aac_anchor+av_rescale_q(aac_count*1024,(AVRational){1,src->codecpar->sample_rate},src->time_base);
 if(q->pts==AV_NOPTS_VALUE)q->pts=expected;
 else if(llabs(q->pts-expected)>av_rescale_q(2,(AVRational){1,1000},src->time_base))return reject("AAC timeline discontinuity");
 q->dts=q->pts;q->duration=av_rescale_q(1024,(AVRational){1,src->codecpar->sample_rate},src->time_base);aac_count++;return 0;
}
// TS demux timestamp seeks can land after the desired IDR. Find and verify an
// IDR at or before the target, with bounded backward retries and packet scanning.
static int seek_ts(double target){
 for(int back=2;back<=32;back*=2){
  clear_prefetch();aac_anchor=AV_NOPTS_VALUE;aac_count=0;double point=target>back?target-back:0;
  int r=point>0?av_seek_frame(in,video,(int64_t)((point+origin)/av_q2d(in->streams[video]->time_base)),AVSEEK_FLAG_BACKWARD):av_seek_frame(in,-1,0,AVSEEK_FLAG_BYTE|AVSEEK_FLAG_BACKWARD);
  if(r<0)return reject("Source seek failed or discontinuous timeline");avformat_flush(in);
  r=configure_aac(in->streams[audio]->codecpar,NULL,0);if(r<0)return r;
  int bytes=0,found=0;
  for(int count=0;count<4096;count++){
   AVPacket*q=av_packet_alloc();r=av_read_frame(in,q);if(r<0){av_packet_free(&q);break;}bytes+=q->size;
   if(bytes>16*1024*1024){av_packet_free(&q);return reject("TS random-access scan budget exceeded");}
   if(q->stream_index==audio&&(aac_anchor!=AV_NOPTS_VALUE||q->pts!=AV_NOPTS_VALUE)){r=repair_audio(q,0);if(r<0){av_packet_free(&q);return r;}}
   if(q->stream_index==video&&idr(q)){
    double at=q->pts*av_q2d(in->streams[video]->time_base)-origin;found=1;
    if(q->pts!=AV_NOPTS_VALUE&&at<=target+.001){prefetch[0]=q;prefetched=1;return 0;}
    av_packet_free(&q);break;
   }
   av_packet_free(&q);
  }
  if(!point&&!found)break;
 }
 return reject("No preceding IDR within the bounded TS seek window");
}


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
EMSCRIPTEN_KEEPALIVE void rm_close(void){clear_prefetch();ff_h264_ps_uninit(&ps);close_output();if(in)avformat_close_input(&in);if(input_io){av_freep(&input_io->buffer);avio_context_free(&input_io);}av_packet_free(&packet);}
static int open_input(double size){
 rm_close();failure[0]=0;av_max_alloc(16*1024*1024);total=(int64_t)size;position=0;
 input_io=avio_alloc_context(av_malloc(65536),65536,0,NULL,read_cb,NULL,seek_cb);
 if(!input_io)return AVERROR(ENOMEM);
 in=avformat_alloc_context();in->pb=input_io;in->flags|=AVFMT_FLAG_CUSTOM_IO;
 in->probesize=1024*1024;in->max_analyze_duration=1000000;in->max_index_size=4*1024*1024;
 int ret=avformat_open_input(&in,NULL,NULL,NULL);if(ret<0)return ret;
 if(in->nb_streams>64)return AVERROR(EINVAL);
 ret=avformat_find_stream_info(in,NULL);if(ret<0)return ret;
 return 0;
}
EMSCRIPTEN_KEEPALIVE int rm_probe(double size){
 int r=open_input(size);if(r<0)return r;
 EM_ASM({Module.tracks=[];});
 // TS often lacks AAC extradata until an actual ADTS packet is inspected.
 if(strstr(in->iformat->name,"mpegts")){
  AVPacket *q=av_packet_alloc();int bytes=0;
  for(int n=0;q&&n<256;n++){
   int status=av_read_frame(in,q);if(status<0)break;bytes+=q->size;
   AVCodecParameters *p=in->streams[q->stream_index]->codecpar;
   if(p->codec_id==AV_CODEC_ID_AAC&&!p->extradata_size){configure_aac(p,q->data,q->size);av_packet_unref(q);break;}
   av_packet_unref(q);if(bytes>2*1024*1024)break;
  }
  av_packet_free(&q);
 }
 int ids[3]={0};
 for(unsigned i=0;i<in->nb_streams;i++){
  AVStream *st=in->streams[i];AVCodecParameters *p=st->codecpar;
  int type=p->codec_type==AVMEDIA_TYPE_VIDEO?0:p->codec_type==AVMEDIA_TYPE_AUDIO?1:p->codec_type==AVMEDIA_TYPE_SUBTITLE?2:-1;
  if(type<0)continue;
  int aac_object=p->codec_id==AV_CODEC_ID_AAC&&p->extradata_size>0?p->extradata[0]>>3:0;
  EM_ASM({Module.tracks.push({id:String($0),index:$1,type:['video','audio','sub'][$2],codec:UTF8ToString($3),default:!!$4,forced:!!$5,channels:$6,aacObject:$7,attachedPicture:!!$8});},
   ++ids[type],i,type,avcodec_get_name(p->codec_id),!!(st->disposition&AV_DISPOSITION_DEFAULT),!!(st->disposition&AV_DISPOSITION_FORCED),p->ch_layout.nb_channels,aac_object,!!(st->disposition&AV_DISPOSITION_ATTACHED_PIC));
 }
 return 0;
}
EMSCRIPTEN_KEEPALIVE int rm_open(double size,int selected_video,int selected_audio){
 int ret=open_input(size);if(ret<0)return ret;
 video=av_find_best_stream(in,AVMEDIA_TYPE_VIDEO,-1,-1,NULL,0);
 audio=av_find_best_stream(in,AVMEDIA_TYPE_AUDIO,-1,-1,NULL,0);
 if(video<0)for(unsigned i=0;i<in->nb_streams;i++)if(in->streams[i]->codecpar->codec_type==AVMEDIA_TYPE_VIDEO){video=i;break;}
 if(audio<0)for(unsigned i=0;i<in->nb_streams;i++)if(in->streams[i]->codecpar->codec_type==AVMEDIA_TYPE_AUDIO){audio=i;break;}
 if(selected_video>=0)video=selected_video;if(selected_audio>=0)audio=selected_audio;
 if((video<0&&audio<0)||(video>=0&&video>=in->nb_streams)||(audio>=0&&audio>=in->nb_streams))return reject("Invalid selected tracks");
 // Browser packet contracts are checked separately from FFmpeg demux availability.
 repair_dts=video>=0&&strstr(in->iformat->name,"matroska")!=NULL&&in->streams[video]->codecpar->codec_id==AV_CODEC_ID_H264;is_ts=strstr(in->iformat->name,"mpegts")!=NULL;
 int r;
 if(video>=0&&in->streams[video]->codecpar->codec_id==AV_CODEC_ID_VP9){
  int found=0,bytes=0;
  for(int i=0;i<256;i++){
   AVPacket*q=av_packet_alloc();r=av_read_frame(in,q);if(r<0){av_packet_free(&q);return r;}prefetch[prefetched++]=q;bytes+=q->size;if(bytes>2*1024*1024)return reject("VP9 configuration probe budget exceeded");
   if(q->stream_index!=video)continue;
   AVCodecParameters *p=in->streams[video]->codecpar;
   p->profile=EM_ASM_INT({Module.vp9=Module.parseVP9(HEAPU8.slice($0,$0+$1));return Module.vp9.profile;},q->data,q->size);
   char fmt[32];EM_ASM({const s=Module.vp9.pixelFormat;for(let i=0;i<s.length;i++)HEAPU8[$0+i]=s.charCodeAt(i);HEAPU8[$0+s.length]=0;},fmt);p->format=av_get_pix_fmt(fmt);
   p->color_range=EM_ASM_INT({return Module.vp9.fullRange?2:1;});found=1;break;
  }
  if(!found)return reject("VP9 key configuration unavailable");
 }
 generic_video=hevc_video=0;video_codec[0]=0;if(video>=0){r=configure_video(in->streams[video]->codecpar);if(r<0)return r;}
 AVCodecParameters*ap=audio>=0?in->streams[audio]->codecpar:NULL;audio_codec[0]=0;
 mux_webm=(video>=0&&in->streams[video]->codecpar->codec_id==AV_CODEC_ID_VP8)||(ap&&ap->codec_id==AV_CODEC_ID_VORBIS)||(video<0&&ap&&ap->codec_id==AV_CODEC_ID_OPUS);
 EM_ASM({Module.container=$0?'webm':'mp4';},mux_webm);
 if(is_ts&&(video<0||generic_video||!ap||ap->codec_id!=AV_CODEC_ID_AAC))return reject("TS timestamp repair currently requires AVC and AAC");
 if(is_ts){
  int bytes=0,found=0;
  for(int i=0;i<256;i++){AVPacket*q=av_packet_alloc();r=av_read_frame(in,q);if(r<0){av_packet_free(&q);return r;}prefetch[prefetched++]=q;bytes+=q->size;if(bytes>2*1024*1024)return reject("AAC probe budget exceeded");if(q->stream_index==audio){r=configure_aac(ap,q->data,q->size);if(r<0)return r;found=1;break;}}
  if(!found)return reject("AAC configuration probe exhausted");
 }else if(ap){r=configure_audio(ap);if(r<0)return r;}
 origin=in->start_time==AV_NOPTS_VALUE?0:in->start_time/(double)AV_TIME_BASE;
 if(repair_dts){
  int seen_v=0,seen_a=audio<0,bytes=0;double first=1e30;
  for(int i=0;i<256;i++){AVPacket*q=av_packet_alloc();r=av_read_frame(in,q);if(r<0){av_packet_free(&q);return r;}prefetch[prefetched++]=q;bytes+=q->size;if(bytes>2*1024*1024)return reject("Timeline probe budget exceeded");
   if((q->stream_index==video||q->stream_index==audio)&&q->pts!=AV_NOPTS_VALUE){double t=q->pts*av_q2d(in->streams[q->stream_index]->time_base);if(t<first)first=t;if(q->stream_index==video)seen_v=1;else seen_a=1;}if(seen_v&&seen_a)break;
  }
  if(!seen_v||!seen_a)return reject("Selected timeline origin unavailable");origin=first;
 }
 for(unsigned i=0;i<in->nb_streams;i++){
  AVCodecParameters *par=in->streams[i]->codecpar;
  if(par->codec_type!=AVMEDIA_TYPE_VIDEO&&par->codec_type!=AVMEDIA_TYPE_AUDIO)continue;
  EM_ASM({Module.tracks.push({id:String($0+1),type:$1?'video':'audio',codec:UTF8ToString($2),selected:!!$3});},i,par->codec_type==AVMEDIA_TYPE_VIDEO,avcodec_get_name(par->codec_id),(int)i==video||(int)i==audio);
 }
 packet=av_packet_alloc();return 0;
}
EMSCRIPTEN_KEEPALIVE double rm_duration(void){return in&&in->duration!=AV_NOPTS_VALUE?in->duration/(double)AV_TIME_BASE:0;}
EMSCRIPTEN_KEEPALIVE const char *rm_video_codec(void){return video_codec;}
EMSCRIPTEN_KEEPALIVE const char *rm_audio_codec(void){return audio_codec;}
EMSCRIPTEN_KEEPALIVE int rm_set_container(int webm){
 if(!in||out||(webm!=0&&webm!=1))return reject("Invalid mux selection state");
 enum AVCodecID v=video>=0?in->streams[video]->codecpar->codec_id:AV_CODEC_ID_NONE;
 enum AVCodecID a=audio>=0?in->streams[audio]->codecpar->codec_id:AV_CODEC_ID_NONE;
 if(webm){
  if(v!=AV_CODEC_ID_NONE&&v!=AV_CODEC_ID_VP8&&v!=AV_CODEC_ID_VP9&&v!=AV_CODEC_ID_AV1)return reject("Video incompatible with WebM");
  if(a!=AV_CODEC_ID_NONE&&a!=AV_CODEC_ID_OPUS&&a!=AV_CODEC_ID_VORBIS)return reject("Audio incompatible with WebM");
 }else if(v==AV_CODEC_ID_VP8||a==AV_CODEC_ID_VORBIS)return reject("Selected codecs incompatible with MP4");
 mux_webm=webm;return 0;
}
EMSCRIPTEN_KEEPALIVE int rm_start(double target){
 int seek_stream=video>=0?video:audio;
 close_output();eof=0;video_started=0;fragment_start=-1;aac_anchor=AV_NOPTS_VALUE;aac_count=0;for(int i=0;i<17;i++)pts_queue[i]=AV_NOPTS_VALUE;for(int i=0;i<64;i++)last_dts[i]=AV_NOPTS_VALUE;
 if(target>0){if(is_ts){int r=seek_ts(target);if(r<0)return r;}else{clear_prefetch();int r=av_seek_frame(in,seek_stream,(int64_t)((target+origin)/av_q2d(in->streams[seek_stream]->time_base)),AVSEEK_FLAG_BACKWARD);if(r<0)return reject("Source seek failed or discontinuous timeline");avformat_flush(in);}}
 else if(position>0&&target<0){int r=av_seek_frame(in,seek_stream,(int64_t)(origin/av_q2d(in->streams[seek_stream]->time_base)),AVSEEK_FLAG_BACKWARD);if(r<0)return reject("Source seek failed or discontinuous timeline");avformat_flush(in);}
 int r=audio>=0?configure_audio(in->streams[audio]->codecpar):0;if(r<0)return r;
 r=avformat_alloc_output_context2(&out,NULL,mux_webm?"webm":"mp4",NULL);if(r<0)return r;
 output_io=avio_alloc_context(av_malloc(65536),65536,1,NULL,NULL,write_cb,NULL);if(!output_io)return AVERROR(ENOMEM);
 out->pb=output_io;out->flags|=AVFMT_FLAG_CUSTOM_IO;out->avoid_negative_ts=AVFMT_AVOID_NEG_TS_DISABLED;out->strict_std_compliance=FF_COMPLIANCE_EXPERIMENTAL;
 // Stable track UIDs avoid FFmpeg's clock-jitter entropy fallback in filesystem-free
 // Wasm. Each seek installs a new MediaSource; these IDs need no global uniqueness.
 if(mux_webm)out->flags|=AVFMT_FLAG_BITEXACT;
 // WebM writes audio block timestamps with CodecDelay added, then the decoder
 // subtracts that delay. Interleave on those coded timestamps so MSE sees ordered
 // blocks without removing priming or changing the decoded A/V timeline.
 if(mux_webm&&video>=0&&audio>=0){
  AVCodecParameters *ap=in->streams[audio]->codecpar;
  if(ap->initial_padding&&ap->sample_rate>0)out->audio_preload=-1000*av_rescale_q(ap->initial_padding,(AVRational){1,ap->sample_rate},(AVRational){1,1000});
 }
 for(int i=0;i<64;i++)map[i]=-1;
 for(unsigned i=0;i<in->nb_streams;i++){
  if((int)i!=video&&(int)i!=audio)continue;
  AVStream *s=avformat_new_stream(out,NULL);map[i]=s->index;
  avcodec_parameters_copy(s->codecpar,in->streams[i]->codecpar);s->codecpar->codec_tag=0;s->time_base=in->streams[i]->time_base;
  // Codec parameter coded side data (rotation/color) is copied by avcodec_parameters_copy.
  s->sample_aspect_ratio=in->streams[i]->sample_aspect_ratio;
  s->avg_frame_rate=in->streams[i]->avg_frame_rate;s->r_frame_rate=in->streams[i]->r_frame_rate;
  if((int)i==audio&&strstr(in->iformat->name,"mpegts")){
   r=av_bsf_alloc(av_bsf_get_by_name("aac_adtstoasc"),&audio_bsf);if(r<0)return r;
   avcodec_parameters_copy(audio_bsf->par_in,s->codecpar);audio_bsf->time_base_in=s->time_base;
   r=av_bsf_init(audio_bsf);if(r<0)return r;avcodec_parameters_copy(s->codecpar,audio_bsf->par_out);
  }
 }
 AVDictionary *opts=NULL;
 if(mux_webm){
  av_dict_set(&opts,"live","1",0);av_dict_set(&opts,"cluster_time_limit",video>=0?"2147483647":"500",0);av_dict_set(&opts,"cluster_size_limit","8388608",0);av_dict_set(&opts,"write_crc32","0",0);
 }else{av_dict_set(&opts,"movflags","empty_moov+default_base_moof+frag_custom+frag_discont",0);av_dict_set(&opts,"use_editlist","0",0);}
 r=avformat_write_header(out,&opts);av_dict_free(&opts);avio_flush(output_io);return r;
}
EMSCRIPTEN_KEEPALIVE int rm_step(void){
 if(eof)return 0;
 for(int count=0;count<20000;count++){
  int r;if(prefetch_at<prefetched){av_packet_move_ref(packet,prefetch[prefetch_at++]);r=0;}else r=av_read_frame(in,packet);
  if(r==AVERROR_EOF){int t=av_write_trailer(out);if(t<0)return t;avio_flush(output_io);eof=1;return 0;}
  if(r<0)return r;
  int idx=packet->stream_index;
  if(idx>=64||map[idx]<0){av_packet_unref(packet);continue;}
  if(idx==audio&&audio_bsf){r=configure_aac(in->streams[audio]->codecpar,packet->data,packet->size);if(r<0)return r;r=av_bsf_send_packet(audio_bsf,packet);if(r<0)return r;r=av_bsf_receive_packet(audio_bsf,packet);if(r<0)return r;}
  AVStream *src=in->streams[idx],*dst=out->streams[map[idx]];
  if(idx==audio&&audio_bsf){r=repair_audio(packet,1);if(r<0)return r;}
  if(packet->pts==AV_NOPTS_VALUE)return reject("Missing selected packet PTS");
  if(idx==video){
   if(src->codecpar->codec_id==AV_CODEC_ID_VP9&&(packet->flags&AV_PKT_FLAG_KEY)){
    int same=EM_ASM_INT({const next=Module.parseVP9(HEAPU8.slice($0,$0+$1));return next.profile===Module.vp9.profile&&next.pixelFormat===Module.vp9.pixelFormat&&next.fullRange===Module.vp9.fullRange;},packet->data,packet->size);
    if(!same)return reject("Selected VP9 configuration changed; new initialization required");
   }
   if(!video_started&&!idr(packet))return reject("Selected video must begin at an IDR");video_started=1;
   size_t extra_size=0;uint8_t *extra=av_packet_get_side_data(packet,AV_PKT_DATA_NEW_EXTRADATA,&extra_size);
   if(extra&&(extra_size!=src->codecpar->extradata_size||memcmp(extra,src->codecpar->extradata,extra_size)))return reject("Selected video configuration changed; new initialization required");
   if(!generic_video||hevc_video){r=scan_nals(packet->data,packet->size,is_avc?nal_size:0,0);if(r<0)return r;}
   if(repair_dts){
    if(pts_queue[0]==AV_NOPTS_VALUE){if(packet->duration<=0)return reject("Missing initial MKV packet duration");for(int j=0;j<reorder;j++)pts_queue[j]=packet->pts-(reorder-j)*packet->duration;}
    pts_queue[reorder]=packet->pts;for(int j=reorder;j>0&&pts_queue[j]<pts_queue[j-1];j--){int64_t t=pts_queue[j];pts_queue[j]=pts_queue[j-1];pts_queue[j-1]=t;}
    packet->dts=pts_queue[0];for(int j=0;j<reorder;j++)pts_queue[j]=pts_queue[j+1];
   }
  }
  if(packet->dts==AV_NOPTS_VALUE)return reject("Missing selected packet DTS");
  if(last_dts[idx]!=AV_NOPTS_VALUE&&packet->dts<=last_dts[idx])return reject("Selected timeline discontinuity");last_dts[idx]=packet->dts;
  if(((idx==video&&idr(packet))||(video<0&&idx==audio))&&packet->pts!=AV_NOPTS_VALUE)note_rap(packet->pts*av_q2d(src->time_base)-origin);
  double time=packet->dts==AV_NOPTS_VALUE?0:packet->dts*av_q2d(src->time_base)-origin;
  if(fragment_start<0)fragment_start=time;
  // Preserve the source timeline, including PTS-DTS reordering and A/V offsets.
  // One-second positive mux bias permits negative decoder preroll in tfdt.
  // The media element retains this bias; the public API subtracts it. Reject deeper preroll.
  int64_t shift=(int64_t)((origin-1.0)/av_q2d(src->time_base));
  if(packet->pts!=AV_NOPTS_VALUE)packet->pts-=shift;
  if(packet->dts!=AV_NOPTS_VALUE)packet->dts-=shift;
  if(packet->dts<0)return AVERROR(ERANGE);
  av_packet_rescale_ts(packet,src->time_base,dst->time_base);packet->stream_index=map[idx];packet->pos=-1;
  r=av_interleaved_write_frame(out,packet);if(r<0)return r;
  if(idx==(video>=0?video:audio)&&time-fragment_start>=0.5){
   if(!mux_webm)av_interleaved_write_frame(out,NULL);
   // Do not cut a video WebM cluster immediately after its first keyframe.
   // Let the muxer close clusters before the following boundary/keyframe.
   r=mux_webm&&video>=0?0:av_write_frame(out,NULL);
   avio_flush(output_io);fragment_start=time;return r<0?r:1;
  }
 }
 return AVERROR(EOVERFLOW);
}
