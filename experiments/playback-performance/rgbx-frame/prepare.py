"""Isolate raw RGBX VideoFrame upload from the maintained Software pipeline."""
from pathlib import Path
import json
out=Path('build/playback-performance/rgbx-frame');out.mkdir(exist_ok=True)
s=Path('web/software-full-engine-worker.js').read_text()
helper=Path('experiments/playback-performance/rgbx-frame/uploader.js').read_text().replace('export class','class')
old="""      if(!frameImage||frameImage.width!==canvas.width||frameImage.height!==canvas.height)frameImage=new ImageData(canvas.width,canvas.height);
      const bytes=frameImage.data;bytes.set(engine.HEAPU8.subarray(ptr,ptr+bytes.length));
      for (let i = 3; i < bytes.length; i += 4) bytes[i] = 255;
      context.putImageData(frameImage, 0, 0);"""
new="""      const bytes=engine.HEAPU8.subarray(ptr,ptr+canvas.width*canvas.height*4);
      if(!frameUploader.draw(context,bytes,canvas.width,canvas.height)){
        if(!frameImage||frameImage.width!==canvas.width||frameImage.height!==canvas.height)frameImage=new ImageData(canvas.width,canvas.height);
        frameImage.data.set(bytes);for(let i=3;i<frameImage.data.length;i+=4)frameImage.data[i]=255;
        context.putImageData(frameImage,0,0);
      }"""
assert s.count(old)==1;s=s.replace(old,new)
old="      context = canvas.getContext('2d', {alpha:false});";assert s.count(old)==1;s=s.replace(old,old+'\n      frameUploader=new RGBXFrameUploader();')
old='data:{pumpTicks:ticks,rendered';assert s.count(old)==1;s=s.replace(old,"data:{presenter:frameUploader.active?'videoframe-rgbx':'canvas2d',rgbUpload:{...frameUploader.stats},pumpTicks:ticks,rendered")
(out/'worker.js').write_text(helper+'\nlet frameUploader;\n'+s)
base={p:p for p in ['web/software-full-engine-worker.js','web/generated/internal/wasm-player.js','web/engine-software-full/player.mjs','web/engine-software-full/player.wasm']}
(out/'baseline-overrides.json').write_text(json.dumps(base,indent=2)+'\n')
(out/'candidate-overrides.json').write_text(json.dumps({**base,'web/software-full-engine-worker.js':str(out/'worker.js')},indent=2)+'\n')
