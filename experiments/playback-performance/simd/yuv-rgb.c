// SPDX-License-Identifier: LGPL-2.1-or-later
// Exact reconstruction of FFmpeg 7.1's 32-bit color lookup tables, four pixels
// at a time. Reuse the actual chroma table offsets, including their rounding.
#include <wasm_simd128.h>
#include "libswscale/swscale_internal.h"

SwsFunc __real_ff_yuv2rgb_get_func_ptr(SwsContext *context);
static inline v128_t channel(v128_t y,v128_t bias)
{
    v128_t value=wasm_i32x4_shr(wasm_i32x4_add(y,bias),16);
    return wasm_i32x4_min(wasm_i32x4_max(value,wasm_i32x4_splat(0)),wasm_i32x4_splat(255));
}
static inline v128_t pixels(const uint8_t *source,v128_t cy,v128_t r,v128_t g,v128_t b,int bgr)
{
    const v128_t y=wasm_i32x4_mul(wasm_u32x4_extend_low_u16x8(wasm_u16x8_extend_low_u8x16(wasm_v128_load32_zero(source))),cy);
    const v128_t red=channel(y,r),green=channel(y,g),blue=channel(y,b);
    return wasm_v128_or(wasm_i32x4_splat((int32_t)0xff000000u),
        wasm_v128_or(wasm_i32x4_shl(green,8),wasm_v128_or(bgr?blue:red,wasm_i32x4_shl(bgr?red:blue,16))));
}
static inline v128_t bias(int first,int second,v128_t cy,v128_t origin)
{
    return wasm_i32x4_add(wasm_i32x4_mul(wasm_i32x4_make(first,first,second,second),cy),origin);
}
static int convert(SwsContext *c,const uint8_t *src[],int srcStride[],int sliceY,int sliceH,uint8_t *dst[],int dstStride[])
{
    // Retain the original slice handling for unusual callers.
    if((sliceY|sliceH)&1)return __real_ff_yuv2rgb_get_func_ptr(c)(c,src,srcStride,sliceY,sliceH,dst,dstStride);
    const int cy=c->srcRange?65536:(65536*255)/219;
    const int origin=-(384<<16)-YUVRGB_TABLE_LUMA_HEADROOM*cy-(c->srcRange?0:16<<16)+0x8000;
    const int plane=1024+2*YUVRGB_TABLE_LUMA_HEADROOM,bgr=c->dstFormat==AV_PIX_FMT_BGRA;
    const v128_t vcy=wasm_i32x4_splat(cy),vorigin=wasm_i32x4_splat(origin);
    const uint8_t *table=c->yuvTable;
    for(int y=0;y<sliceH;y+=2){
        const uint8_t *luma=src[0]+y*srcStride[0],*u=src[1]+(y/2)*srcStride[1],*v=src[2]+(y/2)*srcStride[2];
        uint8_t *output=dst[0]+(y+sliceY)*dstStride[0];
        for(int x=0;x<c->dstW;x+=4){
            const int u0=u[x/2]+YUVRGB_TABLE_HEADROOM,u1=u[x/2+1]+YUVRGB_TABLE_HEADROOM;
            const int v0=v[x/2]+YUVRGB_TABLE_HEADROOM,v1=v[x/2+1]+YUVRGB_TABLE_HEADROOM;
            const v128_t r=bias((c->table_rV[v0]-table)/4,(c->table_rV[v1]-table)/4,vcy,vorigin);
            const v128_t g=bias((c->table_gU[u0]-table+c->table_gV[v0])/4-plane,(c->table_gU[u1]-table+c->table_gV[v1])/4-plane,vcy,vorigin);
            const v128_t b=bias((c->table_bU[u0]-table)/4-2*plane,(c->table_bU[u1]-table)/4-2*plane,vcy,vorigin);
            wasm_v128_store(output+4*x,pixels(luma+x,vcy,r,g,b,bgr));
            wasm_v128_store(output+dstStride[0]+4*x,pixels(luma+srcStride[0]+x,vcy,r,g,b,bgr));
        }
    }
    return sliceH;
}
SwsFunc __wrap_ff_yuv2rgb_get_func_ptr(SwsContext *c)
{
    SwsFunc original=__real_ff_yuv2rgb_get_func_ptr(c);
    if(original&&(c->srcFormat==AV_PIX_FMT_YUV420P||c->srcFormat==AV_PIX_FMT_YUVJ420P)&&
       (c->dstFormat==AV_PIX_FMT_RGBA||c->dstFormat==AV_PIX_FMT_BGRA)&&
       c->contrast==65536&&c->brightness==0&&!(c->dstW&7)&&!(c->dstH&1))return convert;
    return original;
}
