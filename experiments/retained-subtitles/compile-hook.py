import json,os,shlex,subprocess
from pathlib import Path
root=Path.cwd();(root/'build/retained-subs').mkdir(exist_ok=True)
entry=next(e for e in json.load(open('build/obj-mpv/compile_commands.json')) if e['file'].endswith('/vo_libmpv.c'))
args=shlex.split(entry['command']);out=[];i=0
while i<len(args):
 a=args[i]
 if a in ('-MQ','-MF'):i+=2;continue
 if a=='-MD':i+=1;continue
 if a=='-o':out += ['-o',str(root/'build/retained-subs/vo_libmpv.o')];i+=2;continue
 if a=='-c':out += ['-c',str(root/'experiments/retained-subtitles/vo_libmpv.c')];i+=2;continue
 out.append(a);i+=1
out.insert(1,'-I'+str(root/'build/sources/mpv/video/out'))
(root/'build/retained-subs/compile-command.json').write_text(json.dumps(out,indent=2)+'\n')
env=dict(os.environ,EM_CONFIG=os.environ.get('WEBMPV_EM_CONFIG',str(root/'build/gap.emscripten')))
subprocess.run(out,cwd=entry['directory'],env=env,check=True)
