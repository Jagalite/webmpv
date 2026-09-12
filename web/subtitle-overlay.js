// Decode bounded mpv A8/color or premultiplied BGRA tiles into cached browser surfaces.
export class SubtitleOverlay {
 constructor(){this.serial=-1;this.snapshot={parts:[]};this.stats={updates:0,bytes:0,peakBytes:0,parts:0,renders:0};}
 read(engine){
  const ptr=engine._web_subtitle_ptr(),h=new Int32Array(engine.HEAPU8.buffer,ptr,8);
  this.stats.renders=h[6];if(h[3])throw Error('Subtitle bitmap budget exceeded');
  if(this.serial===h[0])return this.snapshot;
  if(h[1]<0||h[1]>512||h[2]<0||h[2]>2*1024*1024)throw Error('Invalid subtitle packet');
  const parts=[];
  for(let i=0;i<h[1];i++){
   const d=new Int32Array(engine.HEAPU8.buffer,ptr+32+i*36,9),[x,y,w,height,dw,dh,format,color,offset]=d;
   const bpp=format===1?1:4,size=w*height*bpp;
   if(![1,2].includes(format)||w<=0||height<=0||dw<=0||dh<=0||offset<0||offset+size>h[2])throw Error('Invalid subtitle tile');
   const input=new Uint8Array(engine.HEAPU8.buffer,ptr+32+512*36+offset,size),image=new ImageData(w,height),rgba=image.data;
   for(let j=0;j<w*height;j++){
    if(format===1){rgba[j*4]=color>>>24;rgba[j*4+1]=(color>>>16)&255;rgba[j*4+2]=(color>>>8)&255;rgba[j*4+3]=Math.round(input[j]*(255-(color&255))/255);}
    else{const a=input[j*4+3];rgba[j*4]=a?Math.min(255,Math.round(input[j*4+2]*255/a)):0;rgba[j*4+1]=a?Math.min(255,Math.round(input[j*4+1]*255/a)):0;rgba[j*4+2]=a?Math.min(255,Math.round(input[j*4]*255/a)):0;rgba[j*4+3]=a;}
   }
   const tile=new OffscreenCanvas(w,height);tile.getContext('2d').putImageData(image,0,0);parts.push({tile,x,y,dw,dh});
  }
  this.serial=h[0];this.stats.updates++;this.stats.bytes+=h[2];this.stats.peakBytes=Math.max(this.stats.peakBytes,h[2]);this.stats.parts=h[1];
  return this.snapshot={parts};
 }
 draw(context,snapshot){for(const p of snapshot.parts)context.drawImage(p.tile,p.x,p.y,p.dw,p.dh);}
 clear(){this.serial=-1;this.snapshot={parts:[]};this.stats.parts=0;}
}
