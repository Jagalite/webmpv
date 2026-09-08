// Experimental bounded subtitle bitmap export. Video pixels never enter this buffer.
#include <emscripten.h>
#include <stdint.h>
#include <stddef.h>
#include <string.h>
#include "mpv_talloc.h"
#include "sub/osd.h"
#define PARTS 512
#define BYTES (2*1024*1024)
struct tile { int x,y,w,h,dw,dh,format; uint32_t color; int offset; };
static struct { int serial,count,bytes,status,width,height,renders,updates; struct tile tiles[PARTS]; unsigned char data[BYTES]; } output;
static int64_t last_change=-1;
static int last_w,last_h;
_Static_assert(sizeof(struct tile)==36,"subtitle descriptor ABI");
EMSCRIPTEN_KEEPALIVE uintptr_t web_subtitle_ptr(void){return (uintptr_t)&output;}
void web_subtitle_size(int w,int h){output.width=w;output.height=h;}
void web_subtitle_render(struct osd_state *osd,double pts){
 output.renders++;
 if(!osd){if(output.count){output.serial++;output.count=output.bytes=0;}return;}
 struct mp_osd_res res={.w=output.width,.h=output.height,.display_par=1};
 bool formats[SUBBITMAP_COUNT]={[SUBBITMAP_LIBASS]=true,[SUBBITMAP_BGRA]=true};
 struct sub_bitmap_list *list=osd_render(osd,res,pts,OSD_DRAW_SUB_ONLY,formats);
 if(list->change_id==last_change&&last_w==res.w&&last_h==res.h){talloc_free(list);return;}
 last_change=list->change_id;last_w=res.w;last_h=res.h;
 output.serial++;output.updates++;output.count=output.bytes=output.status=0;
 for(int n=0;n<list->num_items;n++){
  struct sub_bitmaps *imgs=list->items[n];
  for(int i=0;i<imgs->num_parts;i++){
   struct sub_bitmap *p=&imgs->parts[i];int bpp=imgs->format==SUBBITMAP_LIBASS?1:4;
   if(p->w<=0||p->h<=0)continue;
   size_t size=(size_t)p->w*p->h*bpp;
   if(output.count>=PARTS||size>BYTES-output.bytes||p->stride<p->w*bpp||!p->bitmap){output.status=-1;output.count=output.bytes=0;goto done;}
   struct tile *tile=&output.tiles[output.count++];
   *tile=(struct tile){p->x,p->y,p->w,p->h,p->dw,p->dh,imgs->format,p->libass.color,output.bytes};
   for(int y=0;y<p->h;y++)memcpy(output.data+output.bytes+y*p->w*bpp,(unsigned char *)p->bitmap+y*p->stride,p->w*bpp);
   output.bytes+=size;
  }
 }
 done:talloc_free(list);
}
