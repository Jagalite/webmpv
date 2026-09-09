import {SubtitleOverlay} from '/web/subtitle-overlay.js';
export class YUVPresenter {
 constructor(canvas){
  this.canvas=canvas;this.gl=canvas.getContext('webgl2',{alpha:false,antialias:false,depth:false,stencil:false,preserveDrawingBuffer:true});
  if(!this.gl)throw Error('WebGL2 unavailable');const gl=this.gl;
  this.stats={frames:0,videoUploads:0,videoUploadBytes:0,planeCopyBytes:0,subtitleUploads:0,subtitleUploadBytes:0,videoReadbacks:0,liveTextures:4,peakStagingBytes:0,drawMs:0,lastPts:0};
  const shader=(type,source)=>{const s=gl.createShader(type);gl.shaderSource(s,source);gl.compileShader(s);if(!gl.getShaderParameter(s,gl.COMPILE_STATUS))throw Error(gl.getShaderInfoLog(s));return s;};
  const vs=shader(gl.VERTEX_SHADER,`#version 300 es
  out vec2 uv;void main(){vec2 p=vec2((gl_VertexID<<1)&2,gl_VertexID&2);uv=vec2(p.x,1.-p.y);gl_Position=vec4(p*2.-1.,0,1);}`);
  const fs=shader(gl.FRAGMENT_SHADER,`#version 300 es
  precision highp float;in vec2 uv;out vec4 color;
  uniform sampler2D Y;uniform sampler2D U;uniform sampler2D V;uniform sampler2D overlay;
  uniform vec4 crop;uniform int is709;uniform int fullRange;uniform int overlayPass;
  void main(){if(overlayPass==1){color=texture(overlay,uv);return;}
   vec2 c=crop.xy+uv*crop.zw;
   float y=texture(Y,c).r,u=texture(U,c).r-128./255.,v=texture(V,c).r-128./255.;
   if(fullRange==0){y=(y-16./255.)*255./219.;u*=255./224.;v*=255./224.;}
   vec3 rgb=is709==1?vec3(y+1.5748*v,y-.187324*u-.468124*v,y+1.8556*u):vec3(y+1.402*v,y-.344136*u-.714136*v,y+1.772*u);
   color=vec4(rgb,1);}`);
  this.program=gl.createProgram();gl.attachShader(this.program,vs);gl.attachShader(this.program,fs);gl.linkProgram(this.program);gl.deleteShader(vs);gl.deleteShader(fs);
  if(!gl.getProgramParameter(this.program,gl.LINK_STATUS))throw Error(gl.getProgramInfoLog(this.program));gl.useProgram(this.program);
  this.loc=Object.fromEntries(['crop','is709','fullRange','overlayPass'].map(k=>[k,gl.getUniformLocation(this.program,k)]));
  this.textures=Array.from({length:4},(_,i)=>{const t=gl.createTexture();gl.activeTexture(gl.TEXTURE0+i);gl.bindTexture(gl.TEXTURE_2D,t);for(const p of [gl.TEXTURE_MIN_FILTER,gl.TEXTURE_MAG_FILTER])gl.texParameteri(gl.TEXTURE_2D,p,gl.LINEAR);for(const p of [gl.TEXTURE_WRAP_S,gl.TEXTURE_WRAP_T])gl.texParameteri(gl.TEXTURE_2D,p,gl.CLAMP_TO_EDGE);gl.uniform1i(gl.getUniformLocation(this.program,['Y','U','V','overlay'][i]),i);return t;});
  this.staging=[];this.sizes=[];this.subtitles=new SubtitleOverlay();this.overlay=new OffscreenCanvas(canvas.width,canvas.height);this.overlayContext=this.overlay.getContext('2d');
 }
 draw(engine,d){
  const begin=performance.now(),gl=this.gl;if(gl.isContextLost())throw Error('YUV graphics context lost');
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
  gl.uniform4f(this.loc.crop,d.src[0]/d.w,d.src[1]/d.h,d.src[2]/d.w,d.src[3]/d.h);gl.drawArrays(gl.TRIANGLES,0,3);
  const snapshot=this.subtitles.read(engine);
  if(this.lastSnapshot!==snapshot||this.overlay.width!==this.canvas.width||this.overlay.height!==this.canvas.height){
   this.overlay.width=this.canvas.width;this.overlay.height=this.canvas.height;this.subtitles.draw(this.overlayContext,snapshot);
   gl.activeTexture(gl.TEXTURE3);gl.bindTexture(gl.TEXTURE_2D,this.textures[3]);gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,gl.RGBA,gl.UNSIGNED_BYTE,this.overlay);
   this.stats.subtitleUploads++;this.stats.subtitleUploadBytes+=this.canvas.width*this.canvas.height*4;this.lastSnapshot=snapshot;
  }
  if(snapshot.parts.length){gl.viewport(0,0,this.canvas.width,this.canvas.height);gl.enable(gl.BLEND);gl.blendFunc(gl.SRC_ALPHA,gl.ONE_MINUS_SRC_ALPHA);gl.uniform1i(this.loc.overlayPass,1);gl.drawArrays(gl.TRIANGLES,0,3);}
  const error=gl.getError();if(error)throw Error(`YUV GL error ${error}`);
  this.stats.frames++;this.stats.lastPts=d.pts;this.stats.drawMs+=performance.now()-begin;
 }
 destroy(){for(const t of this.textures)this.gl.deleteTexture(t);this.gl.deleteProgram(this.program);this.stats.liveTextures=0;this.staging=[];this.subtitles.clear();}
}
