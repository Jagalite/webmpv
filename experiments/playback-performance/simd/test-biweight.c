#include <stdint.h>
#include <stdio.h>
#include <string.h>
#include <emscripten/emscripten.h>
#include "libavcodec/h264dsp.h"
void __real_ff_h264dsp_init(H264DSPContext *,int,int);
static uint8_t source[4096],expected[4096],actual[4096];
int main(void){
 H264DSPContext reference={0},candidate={0};
 __real_ff_h264dsp_init(&reference,8,1);ff_h264dsp_init(&candidate,8,1);
 if(reference.biweight_h264_pixels_tab[0]==candidate.biweight_h264_pixels_tab[0])return 1;
 const int weights[]={-128,-127,-64,-1,0,1,2,31,32,63,64,127,128};
 const int offsets[]={-256,-255,-128,-127,-1,0,1,127,254};
 const int heights[]={0,1,2,4,8,16},strides[]={16,31,64,-64},positions[]={0,1,7};
 uint32_t seed=0x9ac74162;for(int n=0;n<4096;n++){seed=seed*1664525u+1013904223u;source[n]=seed>>24;}
 unsigned cases=0;
 for(int width=0;width<2;width++)for(int denominator=0;denominator<8;denominator++)for(int wd=0;wd<13;wd++)for(int ws=0;ws<13;ws++)for(int o=0;o<9;o++)for(int h=0;h<6;h++)for(int s=0;s<4;s++)for(int p=0;p<3;p++){
  for(int n=0;n<4096;n++)expected[n]=actual[n]=(uint8_t)(n*37+wd*11+ws*19);
  int at=2048+positions[p];
  reference.biweight_h264_pixels_tab[width](expected+at,source+at,strides[s],heights[h],denominator,weights[wd],weights[ws],offsets[o]);
  candidate.biweight_h264_pixels_tab[width](actual+at,source+at,strides[s],heights[h],denominator,weights[wd],weights[ws],offsets[o]);
  if(memcmp(expected,actual,sizeof(actual))){fprintf(stderr,"Mismatch width=%d denominator=%d wd=%d ws=%d offset=%d h=%d stride=%d at=%d\n",width,denominator,weights[wd],weights[ws],offsets[o],heights[h],strides[s],at);return 1;}cases++;
 }
 const int depths[]={9,10,12,14};
 for(int d=0;d<4;d++)for(int chroma=0;chroma<=3;chroma++){
  const int depth=depths[d];
  memset(&reference,0,sizeof(reference));memset(&candidate,0,sizeof(candidate));__real_ff_h264dsp_init(&reference,depth,chroma);ff_h264dsp_init(&candidate,depth,chroma);
  if(memcmp(&reference,&candidate,sizeof(reference))){fprintf(stderr,"Changed non-8-bit dispatch\n");return 1;}
 }
 __real_ff_h264dsp_init(&reference,8,1);ff_h264dsp_init(&candidate,8,1);
 for(int i=0;i<4;i++)if(reference.weight_h264_pixels_tab[i]!=candidate.weight_h264_pixels_tab[i]||(i>=2&&reference.biweight_h264_pixels_tab[i]!=candidate.biweight_h264_pixels_tab[i]))return 1;
 printf("{\"differentialCases\":%u,\"guardBytesCompared\":4096,\"otherDispatchPreserved\":true}\n",cases);
 for(int average=0;average<2;average++)for(int trial=0;trial<4;trial++){
  int optimized=trial==1||trial==2;h264_biweight_func function=(optimized?candidate:reference).biweight_h264_pixels_tab[0];
  const int iterations=1000000;double start=emscripten_get_now();
  for(int n=0;n<iterations;n++)function(actual,source,64,16,5,average?32:20,average?32:44,0);
  printf("{\"optimized\":%s,\"average\":%s,\"iterations\":%d,\"milliseconds\":%.3f}\n",optimized?"true":"false",average?"true":"false",iterations,emscripten_get_now()-start);
 }
 return 0;
}
