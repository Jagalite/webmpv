// Experimental replacement of mpv's private render_backend_sw symbol.
// Uses the existing libmpv scheduler/lock; image pointers never escape this call.
#include <emscripten.h>
#include "video/out/libmpv.h"
#include "sub/osd.h"
#include "video/mp_image.h"

struct priv {struct mp_rect src,dst;struct mp_osd_res osd_rc;struct osd_state *osd;};
extern void web_subtitle_size(int,int);
extern void web_subtitle_render(struct osd_state*,double);
EM_JS(void, draw_yuv,(int w,int h,int y,int u,int v,int ys,int us,int vs,int system,int full,int sx,int sy,int sw,int sh,int dx,int dy,int dw,int dh,double pts),{
 Module.drawYUV({w,h,planes:[y,u,v],strides:[ys,us,vs],system,full,src:[sx,sy,sw,sh],dst:[dx,dy,dw,dh],pts});
});
EM_JS(void, fail_yuv,(void),{throw Error('Experimental YUV output accepts only unrotated SDR 8-bit YUV420P with BT.601/709 color');});
static int init(struct render_backend *ctx,mpv_render_param *params){
 char *api=get_mpv_render_param(params,MPV_RENDER_PARAM_API_TYPE,NULL);
 if(!api||strcmp(api,MPV_RENDER_API_TYPE_SW))return MPV_ERROR_NOT_IMPLEMENTED;
 ctx->priv=talloc_zero(NULL,struct priv);return 0;
}
static bool check_format(struct render_backend *ctx,int fmt){return !(mp_imgfmt_get_desc(fmt).flags&MP_IMGFLAG_HWACCEL);}
static void reconfig(struct render_backend *ctx,struct mp_image_params *p){}
static void reset(struct render_backend *ctx){}
static void update_external(struct render_backend *ctx,struct vo *vo){((struct priv*)ctx->priv)->osd=vo?vo->osd:NULL;}
static void resize(struct render_backend *ctx,struct mp_rect *src,struct mp_rect *dst,struct mp_osd_res *osd){struct priv*p=ctx->priv;p->src=*src;p->dst=*dst;p->osd_rc=*osd;}
static int target(struct render_backend *ctx,mpv_render_param *params,int*w,int*h){int*s=get_mpv_render_param(params,MPV_RENDER_PARAM_SW_SIZE,NULL);if(!s)return MPV_ERROR_INVALID_PARAMETER;*w=s[0];*h=s[1];return 0;}
static int render(struct render_backend *ctx,mpv_render_param *params,struct vo_frame *frame){
 struct priv*p=ctx->priv;struct mp_image*i=frame->current;if(!i)return 0;
 int sys=i->params.repr.sys;
 if(i->imgfmt!=IMGFMT_420P||i->params.rotate||
   (sys!=PL_COLOR_SYSTEM_BT_601&&sys!=PL_COLOR_SYSTEM_BT_709)||
   i->params.color.transfer==PL_COLOR_TRC_PQ||i->params.color.transfer==PL_COLOR_TRC_HLG){fail_yuv();return MPV_ERROR_UNSUPPORTED;}
 web_subtitle_size(p->osd_rc.w,p->osd_rc.h);web_subtitle_render(p->osd,i->pts);
 draw_yuv(i->w,i->h,(intptr_t)i->planes[0],(intptr_t)i->planes[1],(intptr_t)i->planes[2],i->stride[0],i->stride[1],i->stride[2],sys==PL_COLOR_SYSTEM_BT_709,i->params.repr.levels==PL_COLOR_LEVELS_FULL,
 p->src.x0,p->src.y0,mp_rect_w(p->src),mp_rect_h(p->src),p->dst.x0,p->dst.y0,mp_rect_w(p->dst),mp_rect_h(p->dst),i->pts);
 return 0;
}
static void destroy(struct render_backend *ctx){}
const struct render_backend_fns render_backend_sw={.init=init,.check_format=check_format,.reconfig=reconfig,.reset=reset,.update_external=update_external,.resize=resize,.get_target_size=target,.render=render,.destroy=destroy};
