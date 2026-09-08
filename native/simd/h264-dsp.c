// SPDX-License-Identifier: LGPL-2.1-or-later
// Keep FFmpeg's initialization and specialize only the verified eight-bit slots.
#include "libavcodec/h264dsp.h"

void __real_ff_h264dsp_init(H264DSPContext *,int,int);
void webmpv_h264_biweight_init(H264DSPContext *);
void webmpv_h264_deblock_init(H264DSPContext *);

void __wrap_ff_h264dsp_init(H264DSPContext *context,int bit_depth,int chroma_format_idc)
{
    __real_ff_h264dsp_init(context,bit_depth,chroma_format_idc);
    if(bit_depth==8){
        webmpv_h264_biweight_init(context);
        webmpv_h264_deblock_init(context);
    }
}
