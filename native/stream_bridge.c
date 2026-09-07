#include "stream_bridge.h"
#include <mpv/stream_cb.h>
#include <emscripten.h>
#include <emscripten/threading.h>
#include <stdlib.h>
#include <string.h>
#include <stddef.h>
#include <pthread.h>
#include <libavformat/avformat.h>
#include <libavutil/mem.h>
#include <errno.h>
#include <stdio.h>
struct web_io_mailbox web_io;
_Static_assert(offsetof(struct web_io_mailbox,data)==64,"IO mailbox ABI");
_Static_assert(offsetof(struct web_io_mailbox,resource)==262208,"Resource mailbox ABI");
_Static_assert(offsetof(struct web_io_mailbox,url)==262232,"Resource URL mailbox ABI");
struct source {int session,resource;int64_t position,total,start,end;};
static pthread_mutex_t mailbox_lock=PTHREAD_MUTEX_INITIALIZER;
static int root_resource;
static char root_url[4096];
EMSCRIPTEN_KEEPALIVE void web_io_root(int id,const char *url){root_resource=id;snprintf(root_url,sizeof(root_url),"%s",url?url:"");}
const char *web_resource_url(void){return root_resource?root_url:NULL;}
static void wake(void){emscripten_futex_wake((void*)&web_io.state,100);}
EMSCRIPTEN_KEEPALIVE uintptr_t web_io_ptr(void){return (uintptr_t)&web_io;}
EMSCRIPTEN_KEEPALIVE void web_io_configure(int session,int64_t size){
    atomic_store(&web_io.cancelled,0);atomic_store(&web_io.interrupt,0);
    atomic_store(&web_io.state,0);atomic_store(&web_io.session,session);
    web_io.total=size;wake();
}
EMSCRIPTEN_KEEPALIVE int web_io_interrupt(int serial){
    if((atomic_load(&web_io.state)&7)!=1||atomic_load(&web_io.serial)!=serial)return 0;
    atomic_fetch_add(&web_io.epoch,1);atomic_store(&web_io.interrupt,1);wake();return 1;
}
EMSCRIPTEN_KEEPALIVE void web_io_cancel(void){atomic_store(&web_io.cancelled,1);wake();}
static int transact(int operation){
    atomic_store(&web_io.reserved,operation);
    int ticket=(atomic_fetch_add(&web_io.serial,1)+1)*8+1;
    atomic_store(&web_io.state,ticket);wake();
    while(atomic_load(&web_io.state)==ticket){
        if(atomic_load(&web_io.cancelled)||atomic_exchange(&web_io.interrupt,0)){
            atomic_fetch_add(&web_io.interruptions,1);atomic_store(&web_io.state,0);wake();return -1;
        }
        emscripten_futex_wait((void*)&web_io.state,ticket,100);
    }
    int result=atomic_load(&web_io.state)==ticket+1?atomic_load(&web_io.result):-1;
    atomic_store(&web_io.state,0);wake();return result;
}
static int64_t read_locked(void *cookie,char *buffer,uint64_t capacity){
    struct source *source=cookie;
    if(atomic_load(&web_io.cancelled)||source->session!=atomic_load(&web_io.session))return -1;
    if(atomic_exchange(&web_io.interrupt,0)){atomic_fetch_add(&web_io.interruptions,1);return -1;}
    if(source->position>=source->total)return 0;
    if(capacity>WEB_IO_CAPACITY)capacity=WEB_IO_CAPACITY;
    atomic_store(&web_io.capacity,capacity);web_io.offset=source->position;
    web_io.resource=source->resource;atomic_fetch_add(&web_io.reads,1);
    if(source->end>=0&&source->position>=source->end)return 0;
    int result=transact(source->resource?2:0);
    if(result<0||result>(int)capacity)result=-1;
    if(result>0){memcpy(buffer,web_io.data,result);source->position+=result;}
    atomic_store(&web_io.state,0);wake();return result;
}
static int64_t read_data(void *cookie,char *buffer,uint64_t capacity){
    pthread_mutex_lock(&mailbox_lock);int64_t r=read_locked(cookie,buffer,capacity);
    pthread_mutex_unlock(&mailbox_lock);return r;
}
static int64_t seek_data(void *cookie,int64_t position){
    struct source *source=cookie;
    if(position<source->start||atomic_load(&web_io.cancelled))return MPV_ERROR_GENERIC;
    atomic_store(&web_io.interrupt,0);atomic_fetch_add(&web_io.seeks,1);
    source->position=position;return position;
}
static int64_t size_data(void *cookie){return ((struct source*)cookie)->total;}
static void cancel_data(void *cookie){web_io_cancel();}
static void close_data(void *cookie){
    struct source *source=cookie;
    if(source->resource&&!atomic_load(&web_io.cancelled)&&source->session==atomic_load(&web_io.session)){
        pthread_mutex_lock(&mailbox_lock);web_io.resource=source->resource;transact(3);pthread_mutex_unlock(&mailbox_lock);
    }
    free(cookie);
}
static int open_data(void *unused,char *uri,mpv_stream_cb_info *info){
    if(strcmp(uri,"brange://source")||web_io.total<=0)return MPV_ERROR_LOADING_FAILED;
    struct source *source=calloc(1,sizeof(*source));if(!source)return MPV_ERROR_NOMEM;
    source->session=atomic_load(&web_io.session);source->total=web_io.total;source->resource=root_resource;source->end=-1;
    *info=(mpv_stream_cb_info){.cookie=source,.read_fn=read_data,.seek_fn=seek_data,.size_fn=size_data,.cancel_fn=cancel_data,.close_fn=close_data};return 0;
}
int web_register_stream(mpv_handle *player){return mpv_stream_cb_add_ro(player,"brange",NULL,open_data);}

// Called exclusively from mpv's nested AVIO seam, on its demux pthread.
static int avio_read_resource(void *cookie,uint8_t *buffer,int size){
    int n=read_data(cookie,(char*)buffer,size);return n>0?n:n==0?AVERROR_EOF:AVERROR(EIO);
}
static int64_t avio_seek_resource(void *cookie,int64_t offset,int whence){
    struct source *source=cookie;
    if(whence==AVSEEK_SIZE)return source->total;
    whence &= ~AVSEEK_FORCE;
    int64_t base=whence==SEEK_SET?0:whence==SEEK_CUR?source->position:whence==SEEK_END?source->total:-1;
    if(base<0||(offset>0&&base>INT64_MAX-offset)||(offset<0&&offset< -base))return AVERROR(EINVAL);
    int64_t position=base+offset;
    if(position<source->start||(source->end>=0&&position>source->end))return AVERROR(EINVAL);
    source->position=position;return position;
}
int web_resource_avio_open(AVFormatContext *s,AVIOContext **pb,const char *url,int flags,AVDictionary **options){
    if(!root_resource||flags!=AVIO_FLAG_READ||strlen(url)>=sizeof(web_io.url)||atomic_load(&web_io.cancelled))return AVERROR(EACCES);
    struct source *source=calloc(1,sizeof(*source));if(!source)return AVERROR(ENOMEM);
    source->session=atomic_load(&web_io.session);source->start=-1;source->end=-1;
    AVDictionaryEntry *start=options?av_dict_get(*options,"offset",NULL,0):NULL;
    AVDictionaryEntry *end=options?av_dict_get(*options,"end_offset",NULL,0):NULL;
    if(start||end){
        char *tail;
        errno=0;source->start=start?strtoll(start->value,&tail,10):0;
        if(start&&(errno||tail==start->value||*tail||source->start<0)){free(source);return AVERROR(EINVAL);}
        errno=0;source->end=end?strtoll(end->value,&tail,10):-1;
        if(!end||errno||tail==end->value||*tail||source->end<=source->start){free(source);return AVERROR(EINVAL);}
    }
    pthread_mutex_lock(&mailbox_lock);
    snprintf(web_io.url,sizeof(web_io.url),"%s",url);
    web_io.range_start=source->start;web_io.range_end=source->end;
    int id=transact(1);source->total=web_io.total;
    pthread_mutex_unlock(&mailbox_lock);
    if(id<=0){free(source);return AVERROR(EIO);}
    source->resource=id;source->position=source->start=source->start<0?0:source->start;
    unsigned char *buffer=av_malloc(32768);
    *pb=buffer?avio_alloc_context(buffer,32768,0,source,avio_read_resource,NULL,avio_seek_resource):NULL;
    if(!*pb){av_free(buffer);close_data(source);return AVERROR(ENOMEM);}
    (*pb)->pos=source->position;(*pb)->seekable=AVIO_SEEKABLE_NORMAL;
    return 0;
}
int web_resource_avio_close(AVFormatContext *s,AVIOContext *pb){
    close_data(pb->opaque);av_freep(&pb->buffer);avio_context_free(&pb);return 0;
}
