// SPDX-License-Identifier: LGPL-2.1-or-later
// Eight-bit inter luma deblocking in both edge directions.
// Read only the six source samples required by FFmpeg, including at frame edges.
#include <wasm_simd128.h>
#include <string.h>
#include "libavcodec/h264dsp.h"

static inline v128_t clip16(v128_t value,v128_t bound)
{
    return wasm_i16x8_max(wasm_i16x8_neg(bound),wasm_i16x8_min(value,bound));
}
static inline v128_t close16(v128_t a,v128_t b,v128_t threshold)
{
    return wasm_i16x8_lt(wasm_i16x8_abs(wasm_i16x8_sub(a,b)),threshold);
}
static inline void store8(uint8_t *dst,v128_t value)
{
    wasm_v128_store64_lane(dst,wasm_u8x16_narrow_i16x8(value,wasm_i16x8_splat(0)),0);
}
static void filter_vertical(uint8_t *pix,ptrdiff_t stride,int alpha,int beta,int8_t *tc0)
{
    if(alpha<=0||beta<=0)return;
    const v128_t one=wasm_i16x8_splat(1),a=wasm_i16x8_splat(alpha),b=wasm_i16x8_splat(beta);
    for(int half=0;half<2;half++){
        const int t0=tc0[half*2],t1=tc0[half*2+1];if(t0<0&&t1<0)continue;
        uint8_t *q=pix+half*8;
        const v128_t bound=wasm_i16x8_make(t0,t0,t0,t0,t1,t1,t1,t1);
        const v128_t p1=wasm_u16x8_load8x8(q-2*stride),p0=wasm_u16x8_load8x8(q-stride);
        const v128_t q0=wasm_u16x8_load8x8(q),q1=wasm_u16x8_load8x8(q+stride);
        const v128_t mask=wasm_v128_and(wasm_i16x8_ge(bound,wasm_i16x8_splat(0)),
            wasm_v128_and(close16(p0,q0,a),wasm_v128_and(close16(p1,p0,b),close16(q1,q0,b))));
        if(!wasm_v128_any_true(mask))continue;
        const v128_t p2=wasm_u16x8_load8x8(q-3*stride),q2=wasm_u16x8_load8x8(q+2*stride);
        const v128_t ap=close16(p2,p0,b),aq=close16(q2,q0,b);
        const v128_t average=wasm_i16x8_shr(wasm_i16x8_add(wasm_i16x8_add(p0,q0),one),1);
        const v128_t dp=clip16(wasm_i16x8_sub(wasm_i16x8_shr(wasm_i16x8_add(p2,average),1),p1),bound);
        const v128_t dq=clip16(wasm_i16x8_sub(wasm_i16x8_shr(wasm_i16x8_add(q2,average),1),q1),bound);
        const v128_t tc=wasm_i16x8_add(bound,wasm_i16x8_add(wasm_v128_and(ap,one),wasm_v128_and(aq,one)));
        const v128_t raw=wasm_i16x8_add(wasm_i16x8_add(wasm_i16x8_shl(wasm_i16x8_sub(q0,p0),2),wasm_i16x8_sub(p1,q1)),wasm_i16x8_splat(4));
        const v128_t delta=clip16(wasm_i16x8_shr(raw,3),tc);
        store8(q-2*stride,wasm_v128_bitselect(wasm_i16x8_add(p1,dp),p1,wasm_v128_and(mask,ap)));
        store8(q+stride,wasm_v128_bitselect(wasm_i16x8_add(q1,dq),q1,wasm_v128_and(mask,aq)));
        store8(q-stride,wasm_v128_bitselect(wasm_i16x8_add(p0,delta),p0,mask));
        store8(q,wasm_v128_bitselect(wasm_i16x8_sub(q0,delta),q0,mask));
    }
}

static inline v128_t gather8(const uint8_t *s,ptrdiff_t stride)
{
    return wasm_i16x8_make(s[0],s[stride],s[2*stride],s[3*stride],s[4*stride],s[5*stride],s[6*stride],s[7*stride]);
}
static inline uint32_t read4(const uint8_t *s)
{
    uint32_t word;memcpy(&word,s,sizeof(word));return word;
}
static inline v128_t load_rows(const uint8_t *s,ptrdiff_t stride)
{
    return wasm_i32x4_make(read4(s),read4(s+stride),read4(s+2*stride),read4(s+3*stride));
}
static inline void store_rows(uint8_t *s,ptrdiff_t stride,v128_t p1,v128_t p0,v128_t q0,v128_t q1)
{
    const v128_t zero=wasm_i16x8_splat(0);
    p1=wasm_u8x16_narrow_i16x8(p1,zero);p0=wasm_u8x16_narrow_i16x8(p0,zero);
    q0=wasm_u8x16_narrow_i16x8(q0,zero);q1=wasm_u8x16_narrow_i16x8(q1,zero);
    const v128_t p=wasm_i8x16_shuffle(p1,p0,0,16,1,17,2,18,3,19,4,20,5,21,6,22,7,23);
    const v128_t q=wasm_i8x16_shuffle(q0,q1,0,16,1,17,2,18,3,19,4,20,5,21,6,22,7,23);
    const v128_t low=wasm_i16x8_shuffle(p,q,0,8,1,9,2,10,3,11);
    const v128_t high=wasm_i16x8_shuffle(p,q,4,12,5,13,6,14,7,15);
    wasm_v128_store32_lane(s,low,0);wasm_v128_store32_lane(s+stride,low,1);
    wasm_v128_store32_lane(s+2*stride,low,2);wasm_v128_store32_lane(s+3*stride,low,3);
    wasm_v128_store32_lane(s+4*stride,high,0);wasm_v128_store32_lane(s+5*stride,high,1);
    wasm_v128_store32_lane(s+6*stride,high,2);wasm_v128_store32_lane(s+7*stride,high,3);
}
static void filter_horizontal(uint8_t *pix,ptrdiff_t stride,int alpha,int beta,int8_t *tc0)
{
    if(alpha<=0||beta<=0)return;
    const v128_t one=wasm_i16x8_splat(1),a=wasm_i16x8_splat(alpha),b=wasm_i16x8_splat(beta);
    for(int half=0;half<2;half++){
        const int t0=tc0[half*2],t1=tc0[half*2+1];if(t0<0&&t1<0)continue;
        uint8_t *q=pix+half*8*stride;
        const v128_t bound=wasm_i16x8_make(t0,t0,t0,t0,t1,t1,t1,t1);
        const v128_t low=load_rows(q-2,stride),high=load_rows(q+4*stride-2,stride);
        const v128_t p1=wasm_u16x8_extend_low_u8x16(wasm_i8x16_shuffle(low,high,0,4,8,12,16,20,24,28,0,0,0,0,0,0,0,0));
        const v128_t p0=wasm_u16x8_extend_low_u8x16(wasm_i8x16_shuffle(low,high,1,5,9,13,17,21,25,29,0,0,0,0,0,0,0,0));
        const v128_t q0=wasm_u16x8_extend_low_u8x16(wasm_i8x16_shuffle(low,high,2,6,10,14,18,22,26,30,0,0,0,0,0,0,0,0));
        const v128_t q1=wasm_u16x8_extend_low_u8x16(wasm_i8x16_shuffle(low,high,3,7,11,15,19,23,27,31,0,0,0,0,0,0,0,0));
        const v128_t mask=wasm_v128_and(wasm_i16x8_ge(bound,wasm_i16x8_splat(0)),
            wasm_v128_and(close16(p0,q0,a),wasm_v128_and(close16(p1,p0,b),close16(q1,q0,b))));
        if(!wasm_v128_any_true(mask))continue;
        const v128_t p2=gather8(q-3,stride),q2=gather8(q+2,stride);
        const v128_t ap=close16(p2,p0,b),aq=close16(q2,q0,b);
        const v128_t average=wasm_i16x8_shr(wasm_i16x8_add(wasm_i16x8_add(p0,q0),one),1);
        const v128_t dp=clip16(wasm_i16x8_sub(wasm_i16x8_shr(wasm_i16x8_add(p2,average),1),p1),bound);
        const v128_t dq=clip16(wasm_i16x8_sub(wasm_i16x8_shr(wasm_i16x8_add(q2,average),1),q1),bound);
        const v128_t tc=wasm_i16x8_add(bound,wasm_i16x8_add(wasm_v128_and(ap,one),wasm_v128_and(aq,one)));
        const v128_t raw=wasm_i16x8_add(wasm_i16x8_add(wasm_i16x8_shl(wasm_i16x8_sub(q0,p0),2),wasm_i16x8_sub(p1,q1)),wasm_i16x8_splat(4));
        const v128_t delta=clip16(wasm_i16x8_shr(raw,3),tc);
        store_rows(q-2,stride,
            wasm_v128_bitselect(wasm_i16x8_add(p1,dp),p1,wasm_v128_and(mask,ap)),
            wasm_v128_bitselect(wasm_i16x8_add(p0,delta),p0,mask),
            wasm_v128_bitselect(wasm_i16x8_sub(q0,delta),q0,mask),
            wasm_v128_bitselect(wasm_i16x8_add(q1,dq),q1,wasm_v128_and(mask,aq)));
    }
}
void webmpv_h264_deblock_init(H264DSPContext *context)
{
    context->h264_v_loop_filter_luma=filter_vertical;
    context->h264_h_loop_filter_luma=filter_horizontal;
}
