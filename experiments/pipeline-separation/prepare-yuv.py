import json,shlex,subprocess,os
from pathlib import Path
root=Path.cwd();out=root/'build/pipeline-separation/yuv';out.mkdir(parents=True,exist_ok=True)
entry=next(e for e in json.loads(Path('build/obj-mpv/compile_commands.json').read_text()) if e['file'].endswith('/libmpv_sw.c'))
args=shlex.split(entry['command']);cmd=[];i=0
while i<len(args):
 a=args[i]
 if a in ('-MQ','-MF'):i+=2;continue
 if a=='-MD':i+=1;continue
 if a=='-o':cmd+=['-o',str(out/'yuv.o')];i+=2;continue
 if a=='-c':cmd+=['-c',str(root/'experiments/pipeline-separation/yuv-backend.c')];i+=2;continue
 cmd.append(a);i+=1
cmd.insert(1,'-I'+str(root/'build/sources/mpv'))
subprocess.run(cmd,cwd=entry['directory'],env={**os.environ,'EM_CONFIG':str(root/'build/gap.emscripten')},check=True)
s=Path('web/software-full-engine-worker.js').read_text()
def replace(a,b):
 global s
 assert s.count(a)==1,a
 s=s.replace(a,b)
replace("      context = canvas.getContext('2d', {alpha:false});","      uploader=new YUVPresenter(canvas);")
replace("      if(!frameImage||frameImage.width!==canvas.width||frameImage.height!==canvas.height)frameImage=new ImageData(canvas.width,canvas.height);\n      const bytes=frameImage.data;bytes.set(engine.HEAPU8.subarray(ptr,ptr+bytes.length));\n      for (let i = 3; i < bytes.length; i += 4) bytes[i] = 255;\n      context.putImageData(frameImage, 0, 0);","      const bytes=new Uint8Array(); // Video is already uploaded inside the render callback.")
replace("      const createEngine=(await import('./engine-software-full/player.mjs')).default;","      const createEngine=(await import('/experiment/yuv-engine/player.mjs')).default;")
replace("      engine = await createEngine({printErr:message=>post({type:'log',message}),print:message=>post({type:'log',message})});","      engine = await createEngine({printErr:message=>post({type:'log',message}),print:message=>post({type:'log',message})});engine.drawYUV=d=>uploader.draw(engine,d);")
replace("data:{pumpTicks:ticks,rendered", "data:{yuv:{...uploader.stats},pumpTicks:ticks,rendered")
replace("      engine?._web_destroy();", "      engine?._web_destroy();uploader?.destroy();post({type:'output',data:{kind:'yuv-cleanup',...uploader.stats}});")
s="import {YUVPresenter} from '/experiment/yuv.js';\nlet uploader;\n"+s
(out/'worker.js').write_text(s)
(out/'compile-command.json').write_text(json.dumps(cmd,indent=2)+'\n')
