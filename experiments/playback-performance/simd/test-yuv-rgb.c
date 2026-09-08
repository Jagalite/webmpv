#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <emscripten/emscripten.h>
#include "libswscale/swscale.h"
#include "libswscale/swscale_internal.h"
SwsFunc __real_ff_yuv2rgb_get_func_ptr(SwsContext *);
SwsFunc __wrap_ff_yuv2rgb_get_func_ptr(SwsContext *);
static uint32_t seed=0x83a9146c;
static uint8_t random_byte(void){seed=seed*1664525u+1013904223u;return seed>>24;}
int main(void)
{
    const int width=512,height=8,size=(width*4+64)*(height+4);
    uint8_t *source[4]={malloc(width*height+64),malloc(width*height/4+64),malloc(width*height/4+64),NULL};
    uint8_t *reference=malloc(size),*candidate=malloc(size);
    int srcStride[4]={width,width/2,width/2,0},dstStride[4]={width*4+64,0,0,0};
    uint8_t *dstReference[4]={reference+32,NULL,NULL,NULL},*dstCandidate[4]={candidate+32,NULL,NULL,NULL};
    unsigned long long compared=0;int contexts=0;
    const int spaces[]={SWS_CS_ITU709,SWS_CS_ITU601,SWS_CS_SMPTE240M,SWS_CS_FCC,SWS_CS_BT2020};
    for(int bgr=0;bgr<2;bgr++)for(int range=0;range<2;range++)for(int space=0;space<5;space++){
        SwsContext *c=sws_getContext(width,height,AV_PIX_FMT_YUV420P,width,height,bgr?AV_PIX_FMT_BGRA:AV_PIX_FMT_RGBA,SWS_BILINEAR,NULL,NULL,NULL);
        if(!c||sws_setColorspaceDetails(c,sws_getCoefficients(spaces[space]),range,sws_getCoefficients(spaces[space]),1,0,65536,65536)<0)return 1;
        SwsFunc scalar=__real_ff_yuv2rgb_get_func_ptr(c),simd=__wrap_ff_yuv2rgb_get_func_ptr(c);
        if(!scalar||scalar==simd){fprintf(stderr,"Optimized dispatch not selected\n");return 1;}
        // Every possible Y/U/V combination, with both rows and RGBA/BGRA checked.
        for(int u=0;u<256;u++)for(int v=0;v<256;v++){
            for(int x=0;x<width*height;x++)source[0][x]=(uint8_t)(x/2);
            memset(source[1],u,width*height/4);memset(source[2],v,width*height/4);
            memset(reference,0xa7,size);memset(candidate,0xa7,size);
            scalar(c,(const uint8_t **)source,srcStride,0,height,dstReference,dstStride);
            simd(c,(const uint8_t **)source,srcStride,0,height,dstCandidate,dstStride);
            if(memcmp(reference,candidate,size)){
                for(int n=0;n<size;n++)if(reference[n]!=candidate[n]){fprintf(stderr,"Mismatch bgr=%d range=%d space=%d u=%d v=%d byte=%d expected=%d actual=%d\n",bgr,range,spaces[space],u,v,n,reference[n],candidate[n]);break;}return 1;
            }
            compared+=(unsigned long long)width*height;
        }
        contexts++;sws_freeContext(c);
    }
    printf("{\"contexts\":%d,\"pixelsCompared\":%llu,\"allYUVTriples\":true,\"guardBytesPreserved\":true}\n",contexts,compared);
    // A separate steady-state microbenchmark uses spatially changing chroma.
    SwsContext *c=sws_getContext(width,height,AV_PIX_FMT_YUV420P,width,height,AV_PIX_FMT_RGBA,SWS_BILINEAR,NULL,NULL,NULL);
    sws_setColorspaceDetails(c,sws_getCoefficients(SWS_CS_ITU709),0,sws_getCoefficients(SWS_CS_ITU709),1,0,65536,65536);
    for(int p=0;p<3;p++)for(int x=0;x<(p?width*height/4:width*height);x++)source[p][x]=random_byte();
    for(int trial=0;trial<4;trial++){
        const int optimized=trial==1||trial==2;
        SwsFunc function=optimized?__wrap_ff_yuv2rgb_get_func_ptr(c):__real_ff_yuv2rgb_get_func_ptr(c);
        double start=emscripten_get_now();for(int n=0;n<20000;n++)function(c,(const uint8_t **)source,srcStride,0,height,dstCandidate,dstStride);
        printf("{\"optimized\":%s,\"pixels\":%d,\"milliseconds\":%.3f}\n",optimized?"true":"false",20000*width*height,emscripten_get_now()-start);
    }
    sws_freeContext(c);for(int p=0;p<3;p++)free(source[p]);free(reference);free(candidate);return 0;
}
