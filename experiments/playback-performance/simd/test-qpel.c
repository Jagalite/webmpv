#include <stdint.h>
#include <stdio.h>
#include <string.h>
#include <emscripten/emscripten.h>
#include "libavcodec/h264qpel.h"
void __real_ff_h264qpel_init(H264QpelContext *,int);
static uint8_t source[8192],saved[8192],expected[8192],actual[8192];
int main(void)
{
    H264QpelContext reference={0},candidate={0};
    __real_ff_h264qpel_init(&reference,8);ff_h264qpel_init(&candidate,8);
    const int strides[]={32,47,64,95,128,-32,-47,-64,-95,-128};
    uint32_t seed=0x741923ac;unsigned cases=0;
    for(int pattern=0;pattern<32;pattern++){
        for(int i=0;i<8192;i++){
            seed=seed*1664525u+1013904223u;
            source[i]=pattern==0?0:pattern==1?255:pattern==2?(i&1?255:0):pattern==3?(i%7?0:255):seed>>24;
        }
        memcpy(saved,source,sizeof(source));
        for(int size=0;size<2;size++)for(int average=0;average<2;average++)for(int position=0;position<16;position++)for(int s=0;s<10;s++)for(int offset=0;offset<16;offset++){
            for(int i=0;i<8192;i++)expected[i]=actual[i]=(uint8_t)(i*37+pattern*11+position);
            const qpel_mc_func a=average?reference.avg_h264_qpel_pixels_tab[size][position]:reference.put_h264_qpel_pixels_tab[size][position];
            const qpel_mc_func b=average?candidate.avg_h264_qpel_pixels_tab[size][position]:candidate.put_h264_qpel_pixels_tab[size][position];
            if(a==b)return 1;
            a(expected+4096+offset,source+4096+offset,strides[s]);b(actual+4096+offset,source+4096+offset,strides[s]);
            if(memcmp(expected,actual,sizeof(actual))||memcmp(source,saved,sizeof(source))){
                fprintf(stderr,"Mismatch size=%d average=%d position=%d stride=%d offset=%d pattern=%d\n",16>>size,average,position,strides[s],offset,pattern);
                for(int i=0;i<8192;i++)if(expected[i]!=actual[i]){fprintf(stderr,"byte=%d expected=%u actual=%u\n",i,expected[i],actual[i]);break;}return 1;
            }
            cases++;
        }
    }
    for(int size=2;size<4;size++)for(int p=0;p<16;p++)if(reference.put_h264_qpel_pixels_tab[size][p]!=candidate.put_h264_qpel_pixels_tab[size][p]||reference.avg_h264_qpel_pixels_tab[size][p]!=candidate.avg_h264_qpel_pixels_tab[size][p])return 1;
    const int depths[]={0,9,10,12,14,16};
    for(int n=0;n<6;n++){
        H264QpelContext a={0},b={0};__real_ff_h264qpel_init(&a,depths[n]);ff_h264qpel_init(&b,depths[n]);
        if(memcmp(&a,&b,sizeof(a))){fprintf(stderr,"Changed other bit-depth dispatch\n");return 1;}
    }
    printf("{\"differentialCases\":%u,\"guardBytesCompared\":8192,\"sourceUnchanged\":true,\"otherDispatchPreserved\":true}\n",cases);
    const int positions[]={0,2,8,10,5};
    for(int size=0;size<2;size++)for(int p=0;p<5;p++)for(int trial=0;trial<4;trial++){
        const int optimized=trial==1||trial==2,iterations=200000;const qpel_mc_func function=(optimized?candidate:reference).put_h264_qpel_pixels_tab[size][positions[p]];
        const double start=emscripten_get_now();for(int i=0;i<iterations;i++)function(actual+4096,source+4096,64);
        printf("{\"size\":%d,\"position\":%d,\"optimized\":%s,\"iterations\":%d,\"milliseconds\":%.3f}\n",16>>size,positions[p],optimized?"true":"false",iterations,emscripten_get_now()-start);
    }
    return 0;
}
