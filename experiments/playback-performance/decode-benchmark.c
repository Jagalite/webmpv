// Isolated software decoding measurement and optional full decoded-pixel checksum.
#include <emscripten/emscripten.h>
#include <libavformat/avformat.h>
#include <libavcodec/avcodec.h>
#include <libavutil/imgutils.h>
#include <libavutil/md5.h>
#include <libavutil/mem.h>
#include <stdio.h>

static int consume(AVCodecContext *decoder,AVFrame *frame,struct AVMD5 *md5,
                   unsigned char **pixels,unsigned *capacity,int *frames)
{
    int result;
    while((result=avcodec_receive_frame(decoder,frame))>=0){
        if(frame->width<1||frame->height<1||(int64_t)frame->width*frame->height>2073600)return AVERROR(EINVAL);
        if(md5){
            const int size=av_image_get_buffer_size(frame->format,frame->width,frame->height,1);
            if(size<0)return size;
            av_fast_malloc(pixels,capacity,size);if(!*pixels)return AVERROR(ENOMEM);
            const int copied=av_image_copy_to_buffer(*pixels,*capacity,(const uint8_t *const *)frame->data,frame->linesize,frame->format,frame->width,frame->height,1);
            if(copied<0)return copied;
            av_md5_update(md5,*pixels,copied);
        }
        (*frames)++;av_frame_unref(frame);
    }
    return result==AVERROR(EAGAIN)||result==AVERROR_EOF?0:result;
}

EMSCRIPTEN_KEEPALIVE int decode_benchmark(const char *path,int threads,int verify)
{
    AVFormatContext *format=NULL;AVCodecContext *decoder=NULL;
    AVPacket *packet=av_packet_alloc();AVFrame *frame=av_frame_alloc();
    struct AVMD5 *md5=verify?av_md5_alloc():NULL;
    unsigned char *pixels=NULL;unsigned capacity=0;int frames=0,result=0;
    av_log_set_level(AV_LOG_ERROR);av_max_alloc(32*1024*1024);
    if(!packet||!frame||(verify&&!md5)){result=AVERROR(ENOMEM);goto done;}
    if(md5)av_md5_init(md5);
    if((result=avformat_open_input(&format,path,NULL,NULL))<0)goto done;
    if((result=avformat_find_stream_info(format,NULL))<0)goto done;
    int stream=av_find_best_stream(format,AVMEDIA_TYPE_VIDEO,-1,-1,NULL,0);
    if(stream<0){result=stream;goto done;}
    const AVCodec *codec=avcodec_find_decoder(format->streams[stream]->codecpar->codec_id);
    decoder=avcodec_alloc_context3(codec);if(!decoder){result=AVERROR(ENOMEM);goto done;}
    if((result=avcodec_parameters_to_context(decoder,format->streams[stream]->codecpar))<0)goto done;
    decoder->thread_count=threads;decoder->max_pixels=2073600;
    if((result=avcodec_open2(decoder,codec,NULL))<0)goto done;
    const double start=emscripten_get_now();
    while((result=av_read_frame(format,packet))>=0){
        if(packet->stream_index==stream){
            result=avcodec_send_packet(decoder,packet);
            if(result>=0)result=consume(decoder,frame,md5,&pixels,&capacity,&frames);
        }
        av_packet_unref(packet);if(result<0)goto done;
    }
    if(result!=AVERROR_EOF)goto done;
    if((result=avcodec_send_packet(decoder,NULL))<0)goto done;
    if((result=consume(decoder,frame,md5,&pixels,&capacity,&frames))<0)goto done;
    const double milliseconds=emscripten_get_now()-start;
    unsigned char digest[16]={0};if(md5)av_md5_final(md5,digest);
    char checksum[33];for(int n=0;n<16;n++)snprintf(checksum+n*2,3,"%02x",digest[n]);
    printf("{\"frames\":%d,\"milliseconds\":%.3f,\"verified\":%s,\"pixelMD5\":\"%s\",\"threads\":%d,\"codec\":\"%s\"}\n",frames,milliseconds,verify?"true":"false",checksum,threads,codec->name);
 done:
    if(result<0){char message[AV_ERROR_MAX_STRING_SIZE];av_strerror(result,message,sizeof(message));fprintf(stderr,"Decode failure: %s\n",message);}
    av_free(pixels);av_free(md5);av_frame_free(&frame);av_packet_free(&packet);avcodec_free_context(&decoder);avformat_close_input(&format);
    return result;
}
