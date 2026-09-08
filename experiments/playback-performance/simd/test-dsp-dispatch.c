#include <stdio.h>
#include <string.h>
#include "libavcodec/h264dsp.h"
void __real_ff_h264dsp_init(H264DSPContext *,int,int);
int main(void)
{
    const int depths[]={8,9,10,12,14};unsigned cases=0;
    for(int depth=0;depth<5;depth++)for(int chroma=0;chroma<4;chroma++){
        H264DSPContext reference={0},candidate={0};
        __real_ff_h264dsp_init(&reference,depths[depth],chroma);
        ff_h264dsp_init(&candidate,depths[depth],chroma);
        if(depths[depth]==8){
#define REPLACED(member) do {if(reference.member==candidate.member)return 1;candidate.member=reference.member;} while(0)
            REPLACED(biweight_h264_pixels_tab[0]);REPLACED(biweight_h264_pixels_tab[1]);
            REPLACED(h264_v_loop_filter_luma);REPLACED(h264_h_loop_filter_luma);
#undef REPLACED
        }
        if(memcmp(&reference,&candidate,sizeof(reference)))return 1;
        cases++;
    }
    printf("{\"dispatchCases\":%u,\"onlyExpectedSlotsChanged\":true}\n",cases);
    return 0;
}
