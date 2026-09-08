// SPDX-License-Identifier: LGPL-2.1-or-later
// Wasm SIMD specialization of FFmpeg's 8-bit, eight-pixel H.264 chroma interpolation.
// Other widths and bit depths retain FFmpeg's selected implementations.
#include <wasm_simd128.h>
#include "libavcodec/h264chroma.h"

static inline void store_chroma(uint8_t *dst, v128_t value, int average)
{
    value=wasm_u8x16_narrow_i16x8(value,wasm_i16x8_splat(0));
    if(average)value=wasm_u8x16_avgr(value,wasm_v128_load64_zero(dst));
    wasm_v128_store64_lane(dst,value,0);
}

static inline void chroma8(uint8_t *dst,const uint8_t *src,ptrdiff_t stride,
                          int height,int x,int y,int average)
{
    const int a=(8-x)*(8-y),b=x*(8-y),c=(8-x)*y,d=x*y;
    const v128_t va=wasm_i16x8_splat(a),round=wasm_i16x8_splat(32);
    if(d){
        const v128_t vb=wasm_i16x8_splat(b),vc=wasm_i16x8_splat(c),vd=wasm_i16x8_splat(d);
        for(int row=0;row<height;row++,src+=stride,dst+=stride){
            const v128_t top=wasm_i16x8_add(wasm_i16x8_mul(wasm_u16x8_load8x8(src),va),wasm_i16x8_mul(wasm_u16x8_load8x8(src+1),vb));
            const v128_t bottom=wasm_i16x8_add(wasm_i16x8_mul(wasm_u16x8_load8x8(src+stride),vc),wasm_i16x8_mul(wasm_u16x8_load8x8(src+stride+1),vd));
            const v128_t value=wasm_u16x8_shr(wasm_i16x8_add(wasm_i16x8_add(top,bottom),round),6);
            store_chroma(dst,value,average);
        }
    }else if(b+c){
        const v128_t weight=wasm_i16x8_splat(b+c);
        const ptrdiff_t step=c?stride:1;
        for(int row=0;row<height;row++,src+=stride,dst+=stride){
            const v128_t sum=wasm_i16x8_add(wasm_i16x8_mul(wasm_u16x8_load8x8(src),va),wasm_i16x8_mul(wasm_u16x8_load8x8(src+step),weight));
            store_chroma(dst,wasm_u16x8_shr(wasm_i16x8_add(sum,round),6),average);
        }
    }else{
        for(int row=0;row<height;row++,src+=stride,dst+=stride){
            v128_t value=wasm_v128_load64_zero(src);
            if(average)value=wasm_u8x16_avgr(value,wasm_v128_load64_zero(dst));
            wasm_v128_store64_lane(dst,value,0);
        }
    }
}
static void put_chroma8(uint8_t *dst,const uint8_t *src,ptrdiff_t stride,int h,int x,int y)
{chroma8(dst,src,stride,h,x,y,0);}
static void avg_chroma8(uint8_t *dst,const uint8_t *src,ptrdiff_t stride,int h,int x,int y)
{chroma8(dst,src,stride,h,x,y,1);}

void __real_ff_h264chroma_init(H264ChromaContext *context,int bit_depth);
void __wrap_ff_h264chroma_init(H264ChromaContext *context,int bit_depth)
{
    __real_ff_h264chroma_init(context,bit_depth);
    if(bit_depth==8){
        context->put_h264_chroma_pixels_tab[0]=put_chroma8;
        context->avg_h264_chroma_pixels_tab[0]=avg_chroma8;
    }
}
