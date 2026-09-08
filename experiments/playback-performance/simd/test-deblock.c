#include <stdint.h>
#include <stdio.h>
#include <string.h>
#include <emscripten/emscripten.h>
#include "libavcodec/h264dsp.h"
void __real_ff_h264dsp_init(H264DSPContext *,int,int);
static uint8_t source[4096],expected[4096],actual[4096];
int main(void)
{
    H264DSPContext reference={0},candidate={0};__real_ff_h264dsp_init(&reference,8,1);ff_h264dsp_init(&candidate,8,1);
    if(reference.h264_v_loop_filter_luma==candidate.h264_v_loop_filter_luma)return 1;
    const int limits[]={0,1,2,4,8,16,32,64,128,255},strides[]={16,31,64,-16,-31,-64},offsets[]={0,1,7,15};
    const int8_t bounds[][4]={{-1,-1,-1,-1},{0,0,0,0},{1,1,1,1},{25,25,25,25},{-1,0,1,25},{25,1,0,-1},{127,0,-128,7},{2,9,17,3}};
    uint32_t seed=0x179428ac;unsigned cases=0;
    for(int pattern=0;pattern<32;pattern++){
        for(int i=0;i<4096;i++){seed=seed*1664525u+1013904223u;source[i]=pattern==0?0:pattern==1?255:pattern==2?(i&1?255:0):pattern<16?120+(seed>>24)%17:seed>>24;}
        for(int a=0;a<10;a++)for(int b=0;b<10;b++)for(int t=0;t<8;t++)for(int s=0;s<6;s++)for(int o=0;o<4;o++){
            memcpy(expected,source,sizeof(source));memcpy(actual,source,sizeof(source));int8_t tc[4];memcpy(tc,bounds[t],sizeof(tc));
            reference.h264_v_loop_filter_luma(expected+2048+offsets[o],strides[s],limits[a],limits[b],tc);
            candidate.h264_v_loop_filter_luma(actual+2048+offsets[o],strides[s],limits[a],limits[b],tc);
            if(memcmp(expected,actual,sizeof(actual))||memcmp(tc,bounds[t],sizeof(tc))){fprintf(stderr,"Mismatch pattern=%d alpha=%d beta=%d tc=%d stride=%d offset=%d\n",pattern,limits[a],limits[b],t,strides[s],offsets[o]);for(int i=0;i<4096;i++)if(actual[i]!=expected[i]){fprintf(stderr,"byte=%d expected=%u actual=%u\n",i,expected[i],actual[i]);break;}return 1;}cases++;
        }
    }
    candidate.h264_v_loop_filter_luma=reference.h264_v_loop_filter_luma;if(memcmp(&candidate,&reference,sizeof(candidate)))return 1;
    const int depths[]={9,10,12,14};for(int d=0;d<4;d++)for(int chroma=0;chroma<4;chroma++){H264DSPContext a={0},b={0};__real_ff_h264dsp_init(&a,depths[d],chroma);ff_h264dsp_init(&b,depths[d],chroma);if(memcmp(&a,&b,sizeof(a)))return 1;}
    ff_h264dsp_init(&candidate,8,1);printf("{\"differentialCases\":%u,\"guardBytesCompared\":4096,\"otherDispatchPreserved\":true}\n",cases);
    for(int mode=0;mode<3;mode++)for(int trial=0;trial<4;trial++){
        const int optimized=trial==1||trial==2,iterations=1000000;int8_t tc[4];for(int i=0;i<4;i++)tc[i]=mode==2?-1:25;
        for(int i=0;i<4096;i++)actual[i]=mode==0?120+i%7:(uint8_t)(i*37);
        const double start=emscripten_get_now();for(int n=0;n<iterations;n++)(optimized?candidate:reference).h264_v_loop_filter_luma(actual+2048,64,mode==1?1:32,18,tc);
        printf("{\"mode\":%d,\"optimized\":%s,\"iterations\":%d,\"milliseconds\":%.3f}\n",mode,optimized?"true":"false",iterations,emscripten_get_now()-start);
    }
    return 0;
}
