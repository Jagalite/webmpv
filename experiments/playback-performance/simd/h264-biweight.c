// SPDX-License-Identifier: LGPL-2.1-or-later
// Bit-exact 8-bit H.264 weighted biprediction, keeping FFmpeg's other dispatch.
#include <wasm_simd128.h>
#include "libavcodec/h264dsp.h"

static inline v128_t weighted8(v128_t dst,v128_t src,v128_t weights,
                              v128_t offset,unsigned shift)
{
    const v128_t low=wasm_i16x8_shuffle(dst,src,0,8,1,9,2,10,3,11);
    const v128_t high=wasm_i16x8_shuffle(dst,src,4,12,5,13,6,14,7,15);
    const v128_t a=wasm_i32x4_shr(wasm_i32x4_add(wasm_i32x4_dot_i16x8(low,weights),offset),shift);
    const v128_t b=wasm_i32x4_shr(wasm_i32x4_add(wasm_i32x4_dot_i16x8(high,weights),offset),shift);
    return wasm_i16x8_narrow_i32x4(a,b);
}
static inline void biweight(uint8_t *dst,uint8_t *src,ptrdiff_t stride,int height,
                           int denominator,int weightd,int weights,int offset,int width)
{
    const int average=offset==0&&weightd==(1<<denominator)&&weights==weightd;
    const int adjusted=(int32_t)((uint32_t)((offset+1)|1)<<denominator);
    const v128_t voffset=wasm_i32x4_splat(adjusted);
    const v128_t vweights=wasm_i32x4_splat((uint16_t)weightd|((uint32_t)(uint16_t)weights<<16));
    for(int row=0;row<height;row++,dst+=stride,src+=stride){
        const v128_t a=width==16?wasm_v128_load(dst):wasm_v128_load64_zero(dst);
        const v128_t b=width==16?wasm_v128_load(src):wasm_v128_load64_zero(src);
        v128_t value;
        if(average){value=wasm_u8x16_avgr(a,b);}
        else{
            const v128_t low=weighted8(wasm_u16x8_extend_low_u8x16(a),wasm_u16x8_extend_low_u8x16(b),vweights,voffset,denominator+1);
            const v128_t high=width==16?weighted8(wasm_u16x8_extend_high_u8x16(a),wasm_u16x8_extend_high_u8x16(b),vweights,voffset,denominator+1):wasm_i16x8_splat(0);
            value=wasm_u8x16_narrow_i16x8(low,high);
        }
        if(width==16)wasm_v128_store(dst,value);else wasm_v128_store64_lane(dst,value,0);
    }
}
static void biweight16(uint8_t *d,uint8_t *s,ptrdiff_t stride,int h,int den,int wd,int ws,int offset)
{biweight(d,s,stride,h,den,wd,ws,offset,16);}
static void biweight8(uint8_t *d,uint8_t *s,ptrdiff_t stride,int h,int den,int wd,int ws,int offset)
{biweight(d,s,stride,h,den,wd,ws,offset,8);}
void __real_ff_h264dsp_init(H264DSPContext *context,int bit_depth,int chroma_format_idc);
void __wrap_ff_h264dsp_init(H264DSPContext *context,int bit_depth,int chroma_format_idc)
{
    __real_ff_h264dsp_init(context,bit_depth,chroma_format_idc);
    if(bit_depth==8){context->biweight_h264_pixels_tab[0]=biweight16;context->biweight_h264_pixels_tab[1]=biweight8;}
}
