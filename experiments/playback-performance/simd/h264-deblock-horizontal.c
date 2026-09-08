// SPDX-License-Identifier: LGPL-2.1-or-later
// Experimental eight-bit luma deblocking across a vertical block boundary.
#include <wasm_simd128.h>
#include "libavcodec/h264dsp.h"

static inline v128_t clip16(v128_t value,v128_t bound)
{
    return wasm_i16x8_max(wasm_i16x8_neg(bound),wasm_i16x8_min(value,bound));
}
static inline v128_t close16(v128_t a,v128_t b,v128_t threshold)
{
    return wasm_i16x8_lt(wasm_i16x8_abs(wasm_i16x8_sub(a,b)),threshold);
}
static inline v128_t gather8(const uint8_t *s,ptrdiff_t stride)
{
    return wasm_i16x8_make(s[0],s[stride],s[2*stride],s[3*stride],s[4*stride],s[5*stride],s[6*stride],s[7*stride]);
}
static inline void scatter8(uint8_t *dst,ptrdiff_t stride,v128_t value)
{
    value=wasm_u8x16_narrow_i16x8(value,wasm_i16x8_splat(0));
    dst[0]=wasm_u8x16_extract_lane(value,0);dst[stride]=wasm_u8x16_extract_lane(value,1);
    dst[2*stride]=wasm_u8x16_extract_lane(value,2);dst[3*stride]=wasm_u8x16_extract_lane(value,3);
    dst[4*stride]=wasm_u8x16_extract_lane(value,4);dst[5*stride]=wasm_u8x16_extract_lane(value,5);
    dst[6*stride]=wasm_u8x16_extract_lane(value,6);dst[7*stride]=wasm_u8x16_extract_lane(value,7);
}
static void filter_horizontal(uint8_t *pix,ptrdiff_t stride,int alpha,int beta,int8_t *tc0)
{
    if(alpha<=0||beta<=0)return;
    const v128_t one=wasm_i16x8_splat(1),a=wasm_i16x8_splat(alpha),b=wasm_i16x8_splat(beta);
    for(int half=0;half<2;half++){
        const int t0=tc0[half*2],t1=tc0[half*2+1];if(t0<0&&t1<0)continue;
        uint8_t *q=pix+half*8*stride;
        const v128_t bound=wasm_i16x8_make(t0,t0,t0,t0,t1,t1,t1,t1);
        const v128_t p1=gather8(q-2,stride),p0=gather8(q-1,stride);
        const v128_t q0=gather8(q,stride),q1=gather8(q+1,stride);
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
        scatter8(q-2,stride,wasm_v128_bitselect(wasm_i16x8_add(p1,dp),p1,wasm_v128_and(mask,ap)));
        scatter8(q+1,stride,wasm_v128_bitselect(wasm_i16x8_add(q1,dq),q1,wasm_v128_and(mask,aq)));
        scatter8(q-1,stride,wasm_v128_bitselect(wasm_i16x8_add(p0,delta),p0,mask));
        scatter8(q,stride,wasm_v128_bitselect(wasm_i16x8_sub(q0,delta),q0,mask));
    }
}
void __real_ff_h264dsp_init(H264DSPContext *,int,int);
void __wrap_ff_h264dsp_init(H264DSPContext *context,int bit_depth,int chroma_format_idc)
{
    __real_ff_h264dsp_init(context,bit_depth,chroma_format_idc);
    if(bit_depth==8)context->h264_h_loop_filter_luma=filter_horizontal;
}
