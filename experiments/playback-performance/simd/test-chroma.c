// Differential checks against the actual bundled FFmpeg kernel, including guards.
#include <stdint.h>
#include <stdio.h>
#include <string.h>
#include <emscripten/emscripten.h>
#include "libavcodec/h264chroma.h"
void __real_ff_h264chroma_init(H264ChromaContext *,int);
static uint8_t source[4096],expected[4096],actual[4096];
static uint32_t random_state=0x29137482;
static uint8_t random_byte(void){random_state=random_state*1664525u+1013904223u;return random_state>>24;}
int main(void){
 H264ChromaContext reference,candidate;
 __real_ff_h264chroma_init(&reference,8);ff_h264chroma_init(&candidate,8);
 if(reference.put_h264_chroma_pixels_tab[0]==candidate.put_h264_chroma_pixels_tab[0]||reference.avg_h264_chroma_pixels_tab[0]==candidate.avg_h264_chroma_pixels_tab[0])return 1;
 unsigned cases=0;const int strides[]={9,16,31,64,-31,-64};
 for(int seed=0;seed<3;seed++){
  for(int n=0;n<4096;n++)source[n]=random_byte();
  for(int average=0;average<2;average++)for(int x=0;x<8;x++)for(int y=0;y<8;y++)for(int h=0;h<=17;h++)for(int s=0;s<6;s++)for(int offset=0;offset<16;offset++){
   for(int n=0;n<4096;n++)expected[n]=actual[n]=(uint8_t)(n*13+seed*37);
   const int start=2048+offset;
   h264_chroma_mc_func a=average?reference.avg_h264_chroma_pixels_tab[0]:reference.put_h264_chroma_pixels_tab[0];
   h264_chroma_mc_func b=average?candidate.avg_h264_chroma_pixels_tab[0]:candidate.put_h264_chroma_pixels_tab[0];
   a(expected+start,source+start,strides[s],h,x,y);b(actual+start,source+start,strides[s],h,x,y);
   if(memcmp(expected,actual,sizeof(actual))){fprintf(stderr,"Mismatch avg=%d x=%d y=%d h=%d stride=%d offset=%d\n",average,x,y,h,strides[s],offset);return 1;}cases++;
  }
 }
 for(int depth=9;depth<=16;depth++){
  __real_ff_h264chroma_init(&reference,depth);ff_h264chroma_init(&candidate,depth);
  if(memcmp(&reference,&candidate,sizeof(reference))){fprintf(stderr,"Changed higher-bit-depth dispatch\n");return 1;}
 }
 __real_ff_h264chroma_init(&reference,8);ff_h264chroma_init(&candidate,8);
 for(int i=1;i<4;i++)if(reference.put_h264_chroma_pixels_tab[i]!=candidate.put_h264_chroma_pixels_tab[i]||reference.avg_h264_chroma_pixels_tab[i]!=candidate.avg_h264_chroma_pixels_tab[i])return 1;
 printf("{\"differentialCases\":%u,\"guardBytesCompared\":4096,\"otherDispatchPreserved\":true}\n",cases);
 const int iterations=1000000;
 for(int trial=0;trial<4;trial++){
  const int optimized=trial==1||trial==2;h264_chroma_mc_func function=(optimized?candidate:reference).put_h264_chroma_pixels_tab[0];
  double start=emscripten_get_now();for(int n=0;n<iterations;n++)function(actual,source,64,8,n&7,(n>>3)&7);
  double milliseconds=emscripten_get_now()-start;
  unsigned checksum=0;for(int n=0;n<4096;n++)checksum+=actual[n];
  printf("{\"optimized\":%s,\"iterations\":%d,\"milliseconds\":%.3f,\"checksum\":%u}\n",optimized?"true":"false",iterations,milliseconds,checksum);
 }
 return 0;
}
