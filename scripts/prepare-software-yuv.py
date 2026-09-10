import json,shlex,subprocess,os
from pathlib import Path
root=Path.cwd();out=root/'build/software-yuv';out.mkdir(parents=True,exist_ok=True)
entry=next(e for e in json.loads(Path('build/obj-mpv/compile_commands.json').read_text()) if e['file'].endswith('/libmpv_sw.c'))
args=shlex.split(entry['command']);cmd=[];i=0
while i<len(args):
 a=args[i]
 if a in ('-MQ','-MF'):i+=2;continue
 if a=='-MD':i+=1;continue
 if a=='-o':cmd+=['-o',str(out/'yuv.o')];i+=2;continue
 if a=='-c':cmd+=['-c',str(root/'native/yuv-backend.c')];i+=2;continue
 cmd.append(a);i+=1
cmd.insert(1,'-I'+str(root/'build/sources/mpv'))
subprocess.run(cmd,cwd=entry['directory'],env={**os.environ,'EM_CONFIG':str(root/'build/gap.emscripten')},check=True)
rgb=cmd.copy();rgb[rgb.index('-c')+1]=str(root/'build/sources/mpv/video/out/libmpv_sw.c');rgb[rgb.index('-o')+1]=str(out/'rgb.o');rgb.insert(1,'-Drender_backend_sw=render_backend_rgb');subprocess.run(rgb,cwd=entry['directory'],env={**os.environ,'EM_CONFIG':str(root/'build/gap.emscripten')},check=True)
