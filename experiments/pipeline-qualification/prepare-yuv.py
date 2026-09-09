import json,shlex,subprocess,os
from pathlib import Path
root=Path.cwd();out=root/'build/pipeline-qualification/yuv';out.mkdir(parents=True,exist_ok=True)
entry=next(e for e in json.loads(Path('build/obj-mpv/compile_commands.json').read_text()) if e['file'].endswith('/libmpv_sw.c'))
args=shlex.split(entry['command']);cmd=[];i=0
while i<len(args):
 a=args[i]
 if a in ('-MQ','-MF'):i+=2;continue
 if a=='-MD':i+=1;continue
 if a=='-o':cmd+=['-o',str(out/'yuv.o')];i+=2;continue
 if a=='-c':cmd+=['-c',str(root/'experiments/pipeline-qualification/yuv-backend.c')];i+=2;continue
 cmd.append(a);i+=1
cmd.insert(1,'-I'+str(root/'build/sources/mpv'))
subprocess.run(cmd,cwd=entry['directory'],env={**os.environ,'EM_CONFIG':str(root/'build/gap.emscripten')},check=True)
rgb=cmd.copy();rgb[rgb.index('-c')+1]=str(root/'build/sources/mpv/video/out/libmpv_sw.c');rgb[rgb.index('-o')+1]=str(out/'rgb.o');rgb.insert(1,'-Drender_backend_sw=render_backend_rgb');subprocess.run(rgb,cwd=entry['directory'],env={**os.environ,'EM_CONFIG':str(root/'build/gap.emscripten')},check=True)
s=Path('web/software-full-engine-worker.js').read_text()
def replace(a,b):
 global s
 assert s.count(a)==1,a
 s=s.replace(a,b)
replace("      context = canvas.getContext('2d', {alpha:false});","      installPresenter(canvas);")
replace("      if(!frameImage||frameImage.width!==canvas.width||frameImage.height!==canvas.height)frameImage=new ImageData(canvas.width,canvas.height);\n      const bytes=frameImage.data;bytes.set(engine.HEAPU8.subarray(ptr,ptr+bytes.length));\n      for (let i = 3; i < bytes.length; i += 4) bytes[i] = 255;\n      context.putImageData(frameImage, 0, 0);","      const bytes=new Uint8Array(); // Video is already uploaded inside the render callback.")
replace("      const createEngine=(await import('./engine-software-full/player.mjs')).default;","      const createEngine=(await import('/experiment/yuv-engine/player.mjs')).default;")
replace("      engine = await createEngine({printErr:message=>post({type:'log',message}),print:message=>post({type:'log',message})});","      engine = await createEngine({printErr:message=>post({type:'log',message}),print:message=>post({type:'log',message})});engine.failOutput=message=>{if(!closing){closing=true;post({type:'error',message});}};engine.drawYUV=d=>{try{uploader.draw(engine,d);}catch(e){engine.failOutput(String(e));}};engine.drawRGB=(...a)=>{try{uploader.drawRGB(engine,...a);}catch(e){engine.failOutput(String(e));}};")
replace("data:{pumpTicks:ticks,rendered", "data:{yuv:{...uploader.stats},pumpTicks:ticks,rendered")
replace("      engine?._web_destroy();", "      engine?._web_destroy();uploader?.destroy();post({type:'output',data:{kind:'yuv-cleanup',...uploader.stats}});")
replace("    } else if (data.type === 'timing' && engine) {", "    } else if(data.type==='experimental-context-loss'){const extension=uploader.gl.getExtension('WEBGL_lose_context');if(!extension)throw Error('Context loss test unavailable');extension.loseContext();setTimeout(()=>extension.restoreContext(),250);\n    } else if (data.type === 'timing' && engine) {")
s="import {YUVPresenter} from '/experiment/yuv.js';\nlet uploader;\nfunction installPresenter(canvas,prior){uploader=new YUVPresenter(canvas);if(prior)uploader.stats={...prior,liveTextures:4,contextRestores:(prior.contextRestores||0)+1};let wasPaused;uploader.onLost=()=>{wasPaused=paused;internalCommand(['set','pause','yes'],()=>{});post({type:'output',data:{kind:'gpu-context-lost'}});};uploader.onRestore=()=>{const old=uploader,stats={...old.stats};old.destroy(true);installPresenter(canvas,stats);internalCommand(['set','pause',wasPaused?'yes':'no'],()=>{});force=true;schedulePump(0);post({type:'output',data:{kind:'gpu-context-restored'}});};}\n"+s
(out/'worker.js').write_text(s)
(out/'compile-command.json').write_text(json.dumps(cmd,indent=2)+'\n')
