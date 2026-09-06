#include "stream_bridge.h"
#include <mpv/stream_cb.h>
#include <emscripten.h>
#include <emscripten/threading.h>
#include <stdlib.h>
#include <string.h>
#include <stddef.h>
struct web_io_mailbox web_io;
_Static_assert(offsetof(struct web_io_mailbox,data)==64,"IO mailbox ABI");
struct source {int session;int64_t position,total;};
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
static int64_t read_data(void *cookie,char *buffer,uint64_t capacity){
    struct source *source=cookie;
    if(atomic_load(&web_io.cancelled)||source->session!=atomic_load(&web_io.session))return -1;
    if(atomic_exchange(&web_io.interrupt,0)){atomic_fetch_add(&web_io.interruptions,1);return -1;}
    if(source->position>=source->total)return 0;
    if(capacity>WEB_IO_CAPACITY)capacity=WEB_IO_CAPACITY;
    atomic_store(&web_io.capacity,capacity);web_io.offset=source->position;
    int ticket=(atomic_fetch_add(&web_io.serial,1)+1)*8+1;atomic_fetch_add(&web_io.reads,1);
    atomic_store(&web_io.state,ticket);wake();
    while(atomic_load(&web_io.state)==ticket){
        if(atomic_load(&web_io.cancelled)||atomic_exchange(&web_io.interrupt,0)){
            atomic_fetch_add(&web_io.interruptions,1);atomic_store(&web_io.state,0);wake();return -1;
        }
        emscripten_futex_wait((void*)&web_io.state,ticket,100);
    }
    int result=atomic_load(&web_io.result);
    if(atomic_load(&web_io.state)!=ticket+1||result<0||result>(int)capacity)result=-1;
    if(result>0){memcpy(buffer,web_io.data,result);source->position+=result;}
    atomic_store(&web_io.state,0);wake();return result;
}
static int64_t seek_data(void *cookie,int64_t position){
    struct source *source=cookie;
    if(position<0||atomic_load(&web_io.cancelled))return MPV_ERROR_GENERIC;
    atomic_store(&web_io.interrupt,0);atomic_fetch_add(&web_io.seeks,1);
    source->position=position;return position;
}
static int64_t size_data(void *cookie){return ((struct source*)cookie)->total;}
static void cancel_data(void *cookie){web_io_cancel();}
static void close_data(void *cookie){free(cookie);}
static int open_data(void *unused,char *uri,mpv_stream_cb_info *info){
    if(strcmp(uri,"brange://source")||web_io.total<=0)return MPV_ERROR_LOADING_FAILED;
    struct source *source=calloc(1,sizeof(*source));if(!source)return MPV_ERROR_NOMEM;
    source->session=atomic_load(&web_io.session);source->total=web_io.total;
    *info=(mpv_stream_cb_info){.cookie=source,.read_fn=read_data,.seek_fn=seek_data,.size_fn=size_data,.cancel_fn=cancel_data,.close_fn=close_data};return 0;
}
int web_register_stream(mpv_handle *player){return mpv_stream_cb_add_ro(player,"brange",NULL,open_data);}
