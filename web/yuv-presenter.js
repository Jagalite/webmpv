import {SubtitleOverlay} from './subtitle-overlay.js';
export class YUVPresenter {
 constructor(canvas){
  this.canvas=canvas;this.gl=canvas.getContext('webgl2',{alpha:false,antialias:false,depth:false,stencil:false,preserveDrawingBuffer:true});
  if(!this.gl)throw Error('WebGL2 unavailable');const gl=this.gl;
  this.lossHandler=e=>{e.preventDefault();this.lost=true;this.onLost?.();};this.restoreHandler=()=>this.onRestore?.();canvas.addEventListener('webglcontextlost',this.lossHandler);canvas.addEventListener('webglcontextrestored',this.restoreHandler);
  this.stats={fallbackFrames:0,rgbCopyBytes:0,frames:0,videoUploads:0,videoUploadBytes:0,planeCopyBytes:0,subtitleUploads:0,subtitleUploadBytes:0,videoReadbacks:0,liveTextures:4,peakStagingBytes:0,drawMs:0,lastPts:0};
  const shader=(type,source)=>{const s=gl.createShader(type);gl.shaderSource(s,source);gl.compileShader(s);if(!gl.getShaderParameter(s,gl.COMPILE_STATUS))throw Error(gl.getShaderInfoLog(s));return s;};
  const vs=shader(gl.VERTEX_SHADER,`#version 300 es
  out vec2 uv;void main(){vec2 p=vec2((gl_VertexID<<1)&2,gl_VertexID&2);uv=vec2(p.x,1.-p.y);gl_Position=vec4(p*2.-1.,0,1);}`);
  const fs=shader(gl.FRAGMENT_SHADER,`#version 300 es
  precision highp float;in vec2 uv;out vec4 color;
  uniform sampler2D Y;uniform sampler2D U;uniform sampler2D V;uniform sampler2D overlay;
  uniform vec4 crop;uniform int rotation;uniform int is709;uniform int fullRange;uniform int overlayPass;
  void main(){if(overlayPass!=0){color=texture(overlay,uv);if(overlayPass==2)color.a=1.;return;}
   vec2 c=crop.xy+uv*crop.zw;
   if(rotation==90)c=vec2(c.y,1.-c.x);else if(rotation==180)c=1.-c;else if(rotation==270)c=vec2(1.-c.y,c.x);
   float y=texture(Y,c).r,u=texture(U,c).r-128./255.,v=texture(V,c).r-128./255.;
   if(fullRange==0){y=(y-16./255.)*255./219.;u*=255./224.;v*=255./224.;}
   vec3 rgb=is709==1?vec3(y+1.5748*v,y-.187324*u-.468124*v,y+1.8556*u):vec3(y+1.402*v,y-.344136*u-.714136*v,y+1.772*u);
   color=vec4(rgb,1);}`);
  this.program=gl.createProgram();gl.attachShader(this.program,vs);gl.attachShader(this.program,fs);gl.linkProgram(this.program);gl.deleteShader(vs);gl.deleteShader(fs);
  if(!gl.getProgramParameter(this.program,gl.LINK_STATUS))throw Error(gl.getProgramInfoLog(this.program));gl.useProgram(this.program);
  this.loc=Object.fromEntries(['crop','rotation','is709','fullRange','overlayPass'].map(k=>[k,gl.getUniformLocation(this.program,k)]));
  this.textures=Array.from({length:4},(_,i)=>{const t=gl.createTexture();gl.activeTexture(gl.TEXTURE0+i);gl.bindTexture(gl.TEXTURE_2D,t);for(const p of [gl.TEXTURE_MIN_FILTER,gl.TEXTURE_MAG_FILTER])gl.texParameteri(gl.TEXTURE_2D,p,gl.LINEAR);for(const p of [gl.TEXTURE_WRAP_S,gl.TEXTURE_WRAP_T])gl.texParameteri(gl.TEXTURE_2D,p,gl.CLAMP_TO_EDGE);gl.uniform1i(gl.getUniformLocation(this.program,['Y','U','V','overlay'][i]),i);return t;});
  this.staging=[];this.sizes=[];this.subtitles=new SubtitleOverlay();this.overlay=new OffscreenCanvas(canvas.width,canvas.height);this.overlayContext=this.overlay.getContext('2d');
 }
 draw(engine,d){
  const begin=performance.now(),gl=this.gl;if(this.lost||gl.isContextLost())return;
  gl.useProgram(this.program);gl.disable(gl.BLEND);gl.pixelStorei(gl.UNPACK_ALIGNMENT,1);
  for(let i=0;i<3;i++){
   const w=i?Math.ceil(d.w/2):d.w,h=i?Math.ceil(d.h/2):d.h;
   if(this.staging[i]?.length!==w*h)this.staging[i]=new Uint8Array(w*h);
   const bytes=this.staging[i];for(let row=0;row<h;row++)bytes.set(engine.HEAPU8.subarray(d.planes[i]+row*d.strides[i],d.planes[i]+row*d.strides[i]+w),row*w);
   this.stats.planeCopyBytes+=bytes.length;gl.activeTexture(gl.TEXTURE0+i);gl.bindTexture(gl.TEXTURE_2D,this.textures[i]);
   if(this.sizes[i]!==`${w}x${h}`){gl.texImage2D(gl.TEXTURE_2D,0,gl.R8,w,h,0,gl.RED,gl.UNSIGNED_BYTE,null);this.sizes[i]=`${w}x${h}`;}
   gl.texSubImage2D(gl.TEXTURE_2D,0,0,0,w,h,gl.RED,gl.UNSIGNED_BYTE,bytes);this.stats.videoUploads++;this.stats.videoUploadBytes+=bytes.length;
  }
  this.stats.peakStagingBytes=Math.max(this.stats.peakStagingBytes,this.staging.reduce((s,b)=>s+b.length,0));
  gl.viewport(0,0,this.canvas.width,this.canvas.height);gl.clearColor(0,0,0,1);gl.clear(gl.COLOR_BUFFER_BIT);
  const [x,y,w,h]=d.dst;gl.viewport(x,this.canvas.height-y-h,w,h);gl.uniform1i(this.loc.overlayPass,0);gl.uniform1i(this.loc.is709,d.system);gl.uniform1i(this.loc.fullRange,d.full);
  const rotated=d.rotate%180!==0,rw=rotated?d.h:d.w,rh=rotated?d.w:d.h;gl.uniform1i(this.loc.rotation,d.rotate);gl.uniform4f(this.loc.crop,d.src[0]/rw,d.src[1]/rh,d.src[2]/rw,d.src[3]/rh);gl.drawArrays(gl.TRIANGLES,0,3);
  const snapshot=this.subtitles.read(engine);
  const shape=`${this.canvas.width}x${this.canvas.height}`;
  gl.activeTexture(gl.TEXTURE3);gl.bindTexture(gl.TEXTURE_2D,this.textures[3]);
  if(this.overlayShape!==shape){gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,this.canvas.width,this.canvas.height,0,gl.RGBA,gl.UNSIGNED_BYTE,null);this.overlayShape=shape;this.lastSnapshot=null;this.lastBounds=null;}
  if(this.lastSnapshot!==snapshot){
   const bounds=parts=>parts.length?[Math.max(0,Math.floor(Math.min(...parts.map(p=>p.x)))),Math.max(0,Math.floor(Math.min(...parts.map(p=>p.y)))),Math.min(this.canvas.width,Math.ceil(Math.max(...parts.map(p=>p.x+p.dw)))),Math.min(this.canvas.height,Math.ceil(Math.max(...parts.map(p=>p.y+p.dh))))]:null;
   const current=bounds(snapshot.parts),both=[current,this.lastBounds].filter(Boolean);
   if(both.length){const x=Math.min(...both.map(b=>b[0])),y=Math.min(...both.map(b=>b[1])),w=Math.max(...both.map(b=>b[2]))-x,h=Math.max(...both.map(b=>b[3]))-y;
    if(w>0&&h>0){this.overlay.width=w;this.overlay.height=h;this.overlayContext.setTransform(1,0,0,1,-x,-y);this.subtitles.draw(this.overlayContext,snapshot);gl.texSubImage2D(gl.TEXTURE_2D,0,x,y,gl.RGBA,gl.UNSIGNED_BYTE,this.overlay);this.stats.subtitleUploads++;this.stats.subtitleUploadBytes+=w*h*4;}
   }
   this.lastSnapshot=snapshot;this.lastBounds=current;
  }
  if(snapshot.parts.length){gl.viewport(0,0,this.canvas.width,this.canvas.height);gl.enable(gl.BLEND);gl.blendFunc(gl.SRC_ALPHA,gl.ONE_MINUS_SRC_ALPHA);gl.uniform1i(this.loc.overlayPass,1);gl.drawArrays(gl.TRIANGLES,0,3);}
  const error=gl.getError();if(error)throw Error(`YUV GL error ${error}`);
  this.stats.frames++;this.stats.lastPts=d.pts;this.stats.drawMs+=performance.now()-begin;
 }
 drawRGB(engine,ptr,w,h,stride,pts){
  const gl=this.gl;if(this.lost||gl.isContextLost())return;
  if(this.rgb?.length!==w*h*4)this.rgb=new Uint8Array(w*h*4);
  for(let row=0;row<h;row++)this.rgb.set(engine.HEAPU8.subarray(ptr+row*stride,ptr+row*stride+w*4),row*w*4);
  gl.useProgram(this.program);gl.disable(gl.BLEND);gl.viewport(0,0,w,h);gl.activeTexture(gl.TEXTURE3);gl.bindTexture(gl.TEXTURE_2D,this.textures[3]);
  if(this.overlayShape!==`rgb:${w}x${h}`){gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,w,h,0,gl.RGBA,gl.UNSIGNED_BYTE,null);this.overlayShape=`rgb:${w}x${h}`;}
  gl.texSubImage2D(gl.TEXTURE_2D,0,0,0,w,h,gl.RGBA,gl.UNSIGNED_BYTE,this.rgb);gl.uniform1i(this.loc.overlayPass,2);gl.drawArrays(gl.TRIANGLES,0,3);
  this.stats.frames++;this.stats.fallbackFrames++;this.stats.rgbCopyBytes+=this.rgb.length;this.stats.videoUploads++;this.stats.videoUploadBytes+=this.rgb.length;this.stats.lastPts=pts;
 }
 destroy(contextReset=false){this.canvas.removeEventListener('webglcontextlost',this.lossHandler);this.canvas.removeEventListener('webglcontextrestored',this.restoreHandler);if(!contextReset){for(const t of this.textures)this.gl.deleteTexture(t);this.gl.deleteProgram(this.program);}this.textures=[];this.program=null;this.stats.liveTextures=0;this.staging=[];this.rgb=null;this.subtitles.clear();}
}
