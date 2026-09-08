// Experimental VideoFrame presentation. mpv still selects frames and subtitles.
// External textures follow the retained VideoFrame lifetime:
// https://gpuweb.github.io/gpuweb/#gpuexternaltexture
class ExternalFramePresenter {
  static async create(canvas,onFailure){
    if(!navigator.gpu)return null;
    const adapter=await navigator.gpu.requestAdapter({powerPreference:'low-power'});
    if(!adapter)return null;
    const device=await adapter.requestDevice();
    const context=canvas.getContext('webgpu');
    if(!context){device.destroy();return null;}
    const presenter=new ExternalFramePresenter(canvas,context,device,onFailure);
    try{await presenter.initialize();return presenter;}catch(error){presenter.destroy();throw error;}
  }
  constructor(canvas,context,device,onFailure){
    Object.assign(this,{canvas,context,device,onFailure});
    this.tiles=new Map();this.lastFrame=null;this.lastSnapshot=null;this.failure=null;this.destroyed=false;
    this.stats={draws:0,videoImports:0,overlayUploads:0,overlayBytes:0,peakTiles:0};
    const fail=message=>{if(!this.destroyed&&!this.failure){this.failure=String(message);onFailure(this.failure);}};
    device.lost.then(info=>fail(`WebGPU device lost: ${info.message}`));
    device.addEventListener('uncapturederror',event=>fail(`WebGPU presentation error: ${event.error.message}`));
  }
  async initialize(){
    const d=this.device,format=navigator.gpu.getPreferredCanvasFormat();
    this.context.configure({device:d,format,alphaMode:'opaque',colorSpace:'srgb',usage:GPUTextureUsage.RENDER_ATTACHMENT|GPUTextureUsage.COPY_SRC});
    this.sampler=d.createSampler({magFilter:'linear',minFilter:'linear'});
    this.transform=d.createBuffer({size:16,usage:GPUBufferUsage.UNIFORM|GPUBufferUsage.COPY_DST});
    this.vertices=d.createBuffer({size:512*6*16,usage:GPUBufferUsage.VERTEX|GPUBufferUsage.COPY_DST});
    const video=d.createShaderModule({code:`
      struct Vertex { @builtin(position) position:vec4f, @location(0) uv:vec2f }
      @group(0) @binding(0) var sampleVideo:sampler;
      @group(0) @binding(1) var video:texture_external;
      @group(0) @binding(2) var<uniform> transform:vec4f;
      @vertex fn vs(@builtin(vertex_index) index:u32)->Vertex {
        let coordinates=array<vec2f,6>(vec2f(0,0),vec2f(1,0),vec2f(0,1),vec2f(0,1),vec2f(1,0),vec2f(1,1));
        let uv=coordinates[index];let q=uv-vec2f(0.5);
        var output:Vertex;output.position=vec4f(q.x*transform.xy+q.y*transform.zw,0,1);output.uv=uv;return output;
      }
      @fragment fn fs(input:Vertex)->@location(0) vec4f {
        return vec4f(textureSampleBaseClampToEdge(video,sampleVideo,input.uv).rgb,1.0);
      }`});
    const overlay=d.createShaderModule({code:`
      struct Vertex { @builtin(position) position:vec4f, @location(0) uv:vec2f }
      @group(0) @binding(0) var sampleTile:sampler;
      @group(0) @binding(1) var tile:texture_2d<f32>;
      @vertex fn vs(@location(0) position:vec2f,@location(1) uv:vec2f)->Vertex {
        var output:Vertex;output.position=vec4f(position,0,1);output.uv=uv;return output;
      }
      @fragment fn fs(input:Vertex)->@location(0) vec4f { return textureSample(tile,sampleTile,input.uv); }`});
    this.videoPipeline=await d.createRenderPipelineAsync({layout:'auto',vertex:{module:video,entryPoint:'vs'},fragment:{module:video,entryPoint:'fs',targets:[{format}]},primitive:{topology:'triangle-list'}});
    this.overlayPipeline=await d.createRenderPipelineAsync({layout:'auto',vertex:{module:overlay,entryPoint:'vs',buffers:[{arrayStride:16,attributes:[{shaderLocation:0,offset:0,format:'float32x2'},{shaderLocation:1,offset:8,format:'float32x2'}]}]},fragment:{module:overlay,entryPoint:'fs',targets:[{format,blend:{color:{srcFactor:'one',dstFactor:'one-minus-src-alpha',operation:'add'},alpha:{srcFactor:'one',dstFactor:'one-minus-src-alpha',operation:'add'}}}]},primitive:{topology:'triangle-list'}});
  }
  updateOverlay(snapshot){
    const {width,height}=this.canvas;
    if(this.lastSnapshot===snapshot&&this.overlayWidth===width&&this.overlayHeight===height)return;
    const parts=snapshot?.parts||[];if(parts.length>512)throw Error('WebGPU subtitle tile limit');
    const keep=new Set(parts.map(part=>part.tile));
    for(const [tile,record] of this.tiles)if(!keep.has(tile)){record.texture.destroy();this.tiles.delete(tile);}
    const vertices=new Float32Array(parts.length*6*4),points=[[0,0],[1,0],[0,1],[0,1],[1,0],[1,1]];
    this.overlayGroups=[];
    for(const [index,part] of parts.entries()){
      let record=this.tiles.get(part.tile);
      if(!record){
        const texture=this.device.createTexture({size:[part.tile.width,part.tile.height],format:'rgba8unorm',usage:GPUTextureUsage.TEXTURE_BINDING|GPUTextureUsage.COPY_DST|GPUTextureUsage.RENDER_ATTACHMENT});
        this.device.queue.copyExternalImageToTexture({source:part.tile},{texture,premultipliedAlpha:true,colorSpace:'srgb'},[part.tile.width,part.tile.height]);
        const group=this.device.createBindGroup({layout:this.overlayPipeline.getBindGroupLayout(0),entries:[{binding:0,resource:this.sampler},{binding:1,resource:texture.createView()}]});
        record={texture,group};this.tiles.set(part.tile,record);this.stats.overlayUploads++;this.stats.overlayBytes+=part.tile.width*part.tile.height*4;
      }
      this.overlayGroups.push(record.group);
      for(const [vertex,[u,v]] of points.entries())vertices.set([2*(part.x+u*part.dw)/width-1,1-2*(part.y+v*part.dh)/height,u,v],(index*6+vertex)*4);
    }
    if(vertices.length)this.device.queue.writeBuffer(this.vertices,0,vertices);
    this.stats.peakTiles=Math.max(this.stats.peakTiles,this.tiles.size);
    this.lastSnapshot=snapshot;this.overlayWidth=width;this.overlayHeight=height;
  }
  draw(frame,track,snapshot){
    if(this.destroyed||this.failure)throw Error(this.failure||'WebGPU presenter destroyed');
    const par=Number(track?.['demux-par']),width=Number.isFinite(par)&&par>0?frame.visibleRect.width*par:frame.displayWidth;
    const height=Number.isFinite(par)&&par>0?frame.visibleRect.height:frame.displayHeight;
    const angle=(((Number(track?.['demux-rotation'])||0)%360+360)%360)*Math.PI/180;
    const sin=Math.sin(angle),cos=Math.cos(angle),cw=this.canvas.width,ch=this.canvas.height;
    const scale=Math.min(cw/(width*Math.abs(cos)+height*Math.abs(sin)),ch/(width*Math.abs(sin)+height*Math.abs(cos)));
    this.device.queue.writeBuffer(this.transform,0,new Float32Array([2*cos*width*scale/cw,-2*sin*width*scale/ch,-2*sin*height*scale/cw,-2*cos*height*scale/ch]));
    if(this.lastFrame!==frame){
      const texture=this.device.importExternalTexture({source:frame,colorSpace:'srgb'});
      this.videoGroup=this.device.createBindGroup({layout:this.videoPipeline.getBindGroupLayout(0),entries:[{binding:0,resource:this.sampler},{binding:1,resource:texture},{binding:2,resource:{buffer:this.transform}}]});
      this.lastFrame=frame;this.stats.videoImports++;
    }
    this.updateOverlay(snapshot);
    const encoder=this.device.createCommandEncoder();
    const pass=encoder.beginRenderPass({colorAttachments:[{view:this.context.getCurrentTexture().createView(),loadOp:'clear',clearValue:[0,0,0,1],storeOp:'store'}]});
    pass.setPipeline(this.videoPipeline);pass.setBindGroup(0,this.videoGroup);pass.draw(6);
    if(this.overlayGroups.length){pass.setPipeline(this.overlayPipeline);pass.setVertexBuffer(0,this.vertices);for(const [index,group] of this.overlayGroups.entries()){pass.setBindGroup(0,group);pass.draw(6,1,index*6);}}
    pass.end();this.device.queue.submit([encoder.finish()]);this.stats.draws++;
  }
  destroy(){
    if(this.destroyed)return;this.destroyed=true;
    for(const record of this.tiles.values())record.texture.destroy();this.tiles.clear();
    this.transform?.destroy();this.vertices?.destroy();this.context.unconfigure();this.device.destroy();
    this.lastFrame=this.lastSnapshot=this.videoGroup=null;this.overlayGroups=[];
  }
}

export {ExternalFramePresenter};
