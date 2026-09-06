#include <mpv/client.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <math.h>
struct output { char *s; size_t n; int failed; };
static void put(struct output *o,const char *s) {
    size_t n=strlen(s);
    if(o->n+n>=65536) {o->failed=1;return;}
    memcpy(o->s+o->n,s,n);o->n+=n;o->s[o->n]=0;
}
static void quoted(struct output *o,const char *s) {
    put(o,"\"");
    for(const unsigned char *p=(const unsigned char *)s;*p;p++) {
        char tmp[8];
        if(*p=='"'||*p=='\\') {tmp[0]='\\';tmp[1]=*p;tmp[2]=0;}
        else if(*p<32) snprintf(tmp,sizeof(tmp),"\\u%04x",*p);
        else {tmp[0]=*p;tmp[1]=0;}
        put(o,tmp);
    }
    put(o,"\"");
}
static void node(struct output *o,mpv_node *v,int depth) {
    if(depth>16) {o->failed=1;return;}
    char tmp[64];
    switch(v->format) {
    case MPV_FORMAT_STRING: quoted(o,v->u.string);break;
    case MPV_FORMAT_FLAG: put(o,v->u.flag?"true":"false");break;
    case MPV_FORMAT_INT64: snprintf(tmp,sizeof(tmp),"%lld",(long long)v->u.int64);put(o,tmp);break;
    case MPV_FORMAT_DOUBLE:
        if(isfinite(v->u.double_)) {snprintf(tmp,sizeof(tmp),"%.17g",v->u.double_);put(o,tmp);}
        else put(o,"null");break;
    case MPV_FORMAT_NODE_ARRAY:
    case MPV_FORMAT_NODE_MAP: {
        int map=v->format==MPV_FORMAT_NODE_MAP;
        put(o,map?"{":"[");
        for(int n=0;n<v->u.list->num;n++) {
            if(n)put(o,",");
            if(map){quoted(o,v->u.list->keys[n]);put(o,":");}
            node(o,&v->u.list->values[n],depth+1);
        }
        put(o,map?"}":"]");break;
    }
    default:put(o,"null");
    }
}
char *web_node_json(mpv_node *v) {
    struct output o={.s=malloc(65536)};
    if(!o.s)return NULL;
    o.s[0]=0;node(&o,v,0);
    if(o.failed){free(o.s);return NULL;}
    return o.s;
}
