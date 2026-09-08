"""Direct RGB presentation experiment; retain Canvas2D when WebGL2 is unavailable."""
from pathlib import Path
import json
out=Path('build/playback-performance/direct-upload');out.mkdir(parents=True,exist_ok=True)
s=Path('build/playback-performance/baseline/web/software-full-engine-worker.js').read_text()
helper=Path('experiments/playback-performance/rgb-upload.js').read_text()
helper=helper.replace('constructor() {\n    this.canvas=new OffscreenCanvas(1,1);\n    this.gl=this.canvas.getContext(\'webgl2\',{alpha:false,antialias:false,depth:false,stencil:false,preserveDrawingBuffer:true});', 'constructor(canvas,gl) {\n    this.canvas=canvas;this.gl=gl;this.width=0;this.height=0;')
helper=helper.replace('const gl=this.gl;if(!gl)', 'if(!gl)')
helper=helper.replace('const program=gl.createProgram();', 'const program=this.program=gl.createProgram();')
helper=helper.replace('draw(context,bytes,width,height)', 'draw(bytes,width,height)')
helper=helper.replace("if(gl.isContextLost())return false;", "if(gl.isContextLost())throw Error('Software presentation context lost');")
helper=helper.replace('if(this.canvas.width!==width||this.canvas.height!==height){\n      this.canvas.width=width;this.canvas.height=height;', 'if(this.width!==width||this.height!==height){\n      this.width=width;this.height=height;')
helper=helper.replace('gl.drawArrays(gl.TRIANGLES,0,3);context.drawImage(this.canvas,0,0);', 'gl.drawArrays(gl.TRIANGLES,0,3);')
helper=helper.replace('\n  draw(bytes', '\n  destroy(){this.gl.deleteTexture(this.texture);this.gl.deleteProgram(this.program);}\n  draw(bytes')
def replace(old,new):
    global s
    assert s.count(old)==1,old
    s=s.replace(old,new)
replace("      context = canvas.getContext('2d', {alpha:false});", """      const gl=canvas.getContext('webgl2',{alpha:false,antialias:false,depth:false,stencil:false,preserveDrawingBuffer:true});
      if(gl)uploader=new RGBUpload(canvas,gl);
      else context=canvas.getContext('2d',{alpha:false});""")
replace("      if(!frameImage||frameImage.width!==canvas.width||frameImage.height!==canvas.height)frameImage=new ImageData(canvas.width,canvas.height);\n      const bytes=frameImage.data;bytes.set(engine.HEAPU8.subarray(ptr,ptr+bytes.length));\n      for (let i = 3; i < bytes.length; i += 4) bytes[i] = 255;\n      context.putImageData(frameImage, 0, 0);", """      const bytes=engine.HEAPU8.subarray(ptr,ptr+canvas.width*canvas.height*4);
      if(uploader)uploader.draw(bytes,canvas.width,canvas.height);
      else{
       if(!frameImage||frameImage.width!==canvas.width||frameImage.height!==canvas.height)frameImage=new ImageData(canvas.width,canvas.height);
       frameImage.data.set(bytes);for(let i=3;i<frameImage.data.length;i+=4)frameImage.data[i]=255;
       context.putImageData(frameImage,0,0);
      }""")
replace('data:{rendered,renderMs,copyMs', "data:{presenter:uploader?'webgl2':'canvas2d',rendered,renderMs,copyMs")
replace('      engine?._web_destroy();', '      uploader?.destroy();uploader=null;\n      engine?._web_destroy();')
(out/'worker.js').write_text(helper+'\nlet uploader;\n'+s)
(out/'overrides.json').write_text(json.dumps({'web/software-full-engine-worker.js':str(out/'worker.js')},indent=2)+'\n')
