// SPDX-License-Identifier: LGPL-2.1-or-later
// Wasm SIMD H.264 luma interpolation, preserving FFmpeg rounding and clipping.
#include <wasm_simd128.h>
#include "libavcodec/h264qpel.h"

static inline v128_t tap16(v128_t a,v128_t b,v128_t c,v128_t d,v128_t e,v128_t f)
{
    return wasm_i16x8_sub(wasm_i16x8_add(wasm_i16x8_add(a,f),
        wasm_i16x8_mul(wasm_i16x8_add(c,d),wasm_i16x8_splat(20))),
        wasm_i16x8_mul(wasm_i16x8_add(b,e),wasm_i16x8_splat(5)));
}
static inline v128_t horizontal(const uint8_t *s)
{
    return tap16(wasm_u16x8_load8x8(s-2),wasm_u16x8_load8x8(s-1),
        wasm_u16x8_load8x8(s),wasm_u16x8_load8x8(s+1),
        wasm_u16x8_load8x8(s+2),wasm_u16x8_load8x8(s+3));
}
static inline v128_t vertical(const uint8_t *s,ptrdiff_t stride)
{
    return tap16(wasm_u16x8_load8x8(s-2*stride),wasm_u16x8_load8x8(s-stride),
        wasm_u16x8_load8x8(s),wasm_u16x8_load8x8(s+stride),
        wasm_u16x8_load8x8(s+2*stride),wasm_u16x8_load8x8(s+3*stride));
}
static inline v128_t half(v128_t value)
{
    value=wasm_i16x8_shr(wasm_i16x8_add(value,wasm_i16x8_splat(16)),5);
    return wasm_u8x16_narrow_i16x8(value,wasm_i16x8_splat(0));
}
static inline v128_t diagonal4(v128_t outer,v128_t negative,v128_t positive,int high)
{
    const v128_t a=high?wasm_i32x4_extend_high_i16x8(outer):wasm_i32x4_extend_low_i16x8(outer);
    const v128_t b=high?wasm_i32x4_extend_high_i16x8(negative):wasm_i32x4_extend_low_i16x8(negative);
    const v128_t c=high?wasm_i32x4_extend_high_i16x8(positive):wasm_i32x4_extend_low_i16x8(positive);
    const v128_t sum=wasm_i32x4_sub(wasm_i32x4_add(a,wasm_i32x4_mul(c,wasm_i32x4_splat(20))),wasm_i32x4_mul(b,wasm_i32x4_splat(5)));
    return wasm_i32x4_shr(wasm_i32x4_add(sum,wasm_i32x4_splat(512)),10);
}
static inline v128_t diagonal(const v128_t *t)
{
    // Horizontal results lie in [-2550,10710], so these pair sums fit int16.
    const v128_t a=wasm_i16x8_add(t[0],t[5]),b=wasm_i16x8_add(t[1],t[4]),c=wasm_i16x8_add(t[2],t[3]);
    const v128_t value=wasm_i16x8_narrow_i32x4(diagonal4(a,b,c,0),diagonal4(a,b,c,1));
    return wasm_u8x16_narrow_i16x8(value,wasm_i16x8_splat(0));
}
static inline void qpel(uint8_t *dst,const uint8_t *src,ptrdiff_t stride,int size,int x,int y,int average)
{
    if(size==16&&!x&&!y){
        for(int row=0;row<16;row++){
            v128_t value=wasm_v128_load(src+row*stride);
            if(average)value=wasm_u8x16_avgr(value,wasm_v128_load(dst+row*stride));
            wasm_v128_store(dst+row*stride,value);
        }
        return;
    }
    for(int column=0;column<size;column+=8){
        v128_t temporary[21];
        if((x==2&&y)||(y==2&&x))for(int row=0;row<size+5;row++)temporary[row]=horizontal(src+(row-2)*stride+column);
        for(int row=0;row<size;row++){
            const uint8_t *s=src+row*stride+column;uint8_t *d=dst+row*stride+column;v128_t value;
            if(!y){
                if(!x)value=wasm_v128_load64_zero(s);
                else{value=half(horizontal(s));if(x!=2)value=wasm_u8x16_avgr(value,wasm_v128_load64_zero(s+(x==3)));}
            }else if(!x){
                value=half(vertical(s,stride));if(y!=2)value=wasm_u8x16_avgr(value,wasm_v128_load64_zero(s+(y==3?stride:0)));
            }else if(y==2){
                value=diagonal(temporary+row);if(x!=2)value=wasm_u8x16_avgr(value,half(vertical(s+(x==3),stride)));
            }else if(x==2){
                value=wasm_u8x16_avgr(diagonal(temporary+row),half(horizontal(s+(y==3?stride:0))));
            }else{
                value=wasm_u8x16_avgr(half(horizontal(s+(y==3?stride:0))),half(vertical(s+(x==3),stride)));
            }
            if(average)value=wasm_u8x16_avgr(value,wasm_v128_load64_zero(d));
            wasm_v128_store64_lane(d,value,0);
        }
    }
}
#define POSITION(S,X,Y) \
static void put##S##_##X##Y(uint8_t *d,const uint8_t *s,ptrdiff_t stride){qpel(d,s,stride,S,X,Y,0);} \
static void avg##S##_##X##Y(uint8_t *d,const uint8_t *s,ptrdiff_t stride){qpel(d,s,stride,S,X,Y,1);}
#define ROW(S,Y) POSITION(S,0,Y) POSITION(S,1,Y) POSITION(S,2,Y) POSITION(S,3,Y)
#define SIZE(S) ROW(S,0) ROW(S,1) ROW(S,2) ROW(S,3)
SIZE(8) SIZE(16)
#define ENTRIES(P,S) P##S##_00,P##S##_10,P##S##_20,P##S##_30,P##S##_01,P##S##_11,P##S##_21,P##S##_31,P##S##_02,P##S##_12,P##S##_22,P##S##_32,P##S##_03,P##S##_13,P##S##_23,P##S##_33
static const qpel_mc_func put[2][16]={{ENTRIES(put,16)},{ENTRIES(put,8)}};
static const qpel_mc_func avg[2][16]={{ENTRIES(avg,16)},{ENTRIES(avg,8)}};
void __real_ff_h264qpel_init(H264QpelContext *,int);
void __wrap_ff_h264qpel_init(H264QpelContext *context,int bit_depth)
{
    __real_ff_h264qpel_init(context,bit_depth);
    if(bit_depth==8)for(int size=0;size<2;size++)for(int position=0;position<16;position++){
        context->put_h264_qpel_pixels_tab[size][position]=put[size][position];
        context->avg_h264_qpel_pixels_tab[size][position]=avg[size][position];
    }
}
