#!/usr/bin/env python3
"""Record the actual linked beta configuration and reject changed build inputs."""
import argparse, datetime, hashlib, json, os, pathlib, platform, re, shutil, subprocess
root=pathlib.Path(__file__).resolve().parent.parent
p=argparse.ArgumentParser();p.add_argument('phase',choices=['start','finish']);p.add_argument('--clean',action='store_true');args=p.parse_args()
def sha(p):
 h=hashlib.sha256()
 with p.open('rb')as f:
  for b in iter(lambda:f.read(1048576),b''):h.update(b)
 return h.hexdigest()
def inputs():
 paths=[]
 for name in ['native','patches','scripts']:
  paths.extend((root/name).rglob('*'))
 paths.extend((root/'experiments/retained-subtitles').glob('*.c'))
 paths.extend(root/p for p in ['experiments/retained-subtitles/compile-hook.py','experiments/software-full/build.sh','experiments/software-full/inventory.py','sources.lock.json','package-lock.json','toolchain.lock.json'])
 return {str(p.relative_to(root)):sha(p)for p in sorted(paths)if p.is_file()and '__pycache__'not in p.parts}
def sdk_sources(sdk):
 base=sdk/'upstream/emscripten'
 return {str(p.relative_to(base)):sha(p)for p in sorted(base.rglob('*'))if p.is_file()and not any(n in ['cache','__pycache__','.git','node_modules']for n in p.relative_to(base).parts)}
record=root/'build/beta-build-start.json'
if args.phase=='start':
 if args.clean:
  stale=[str(p.relative_to(root))for pattern in ['build/obj-*','build/prefix*','build/cache','build/sources','build/native-remux','web/engine','web/engine-*']for p in root.glob(pattern)if p.is_dir()]
  if stale:raise SystemExit('Clean build requires absent output/source/cache directories: '+', '.join(stale))
 record.write_text(json.dumps({'started':datetime.datetime.now(datetime.timezone.utc).isoformat(),'clean':args.clean,'inputs':inputs(),'sdkSources':sdk_sources(pathlib.Path(os.environ.get('WEBMPV_SDK',root/'build/emsdk-4.0.14')).resolve())},indent=2)+'\n')
else:
 start=json.loads(record.read_text())
 if start['inputs']!=inputs():raise SystemExit('Build inputs changed while building')
 configs=['build/obj-mpv/config.h','build/obj-mpv/meson-info/intro-buildoptions.json','build/obj-ffmpeg/config.h','build/obj-software-full-ffmpeg/config.h','build/obj-software-full-ffmpeg/config_components.h','build/obj-software-full-ffmpeg/ffbuild/config.mak','build/obj-software-full-ffmpeg/configure-request','build/native-remux/ffmpeg/config.h','build/native-remux/ffmpeg/config_components.h','build/native-remux/ffmpeg/ffbuild/config.mak','build/retained-subs/compile-command.json','build/beta.emscripten']
 def license_at(file,gpl):
  text=(root/file).read_text()
  for name,value in [('GPL',gpl),('VERSION3',0),('NONFREE',0)]:
   if not re.search(rf'^#define CONFIG_{name} {value}$',text,re.M):raise SystemExit(f'Unexpected license configuration: {file}: {name}')
  return re.search(r'^#define FFMPEG_LICENSE "(.*)"$',text,re.M)[1]
 full=license_at('build/obj-software-full-ffmpeg/config.h',1);remux=license_at('build/native-remux/ffmpeg/config.h',0)
 opts=json.loads((root/'build/obj-mpv/meson-info/intro-buildoptions.json').read_text())
 if not next(o['value']for o in opts if o['name']=='gpl'):raise SystemExit('Expected GPL mpv build')
 artifacts={}
 for folder,stem in [('engine-hybrid','player'),('engine-software-full','player'),('engine-remux','remux')]:
  for ext in ['wasm','mjs']:
   p=root/'web'/folder/(stem+'.'+ext);artifacts[str(p.relative_to(root))]={'bytes':p.stat().st_size,'sha256':sha(p)}
 tools={}
 for name,cmd in [('node',['node','--version']),('python',['python3','--version']),('meson',['meson','--version']),('ninja',['ninja','--version']),('cmake',['cmake','--version']),('pkg-config',['pkg-config','--version']),('make',['make','--version'])]:
  exe=pathlib.Path(shutil.which(cmd[0])).resolve();tools[name]={'version':subprocess.check_output(cmd,text=True).splitlines()[0],'path':str(exe),'sha256':sha(exe)}
 sdk=pathlib.Path(os.environ['WEBMPV_SDK']).resolve()
 for rel in ['upstream/bin/clang','upstream/bin/wasm-ld','upstream/bin/wasm-opt','upstream/emscripten/emcc.py','upstream/emscripten/emscripten-version.txt']:
  tools[rel]={'path':str(sdk/rel),'sha256':sha(sdk/rel)}
 if start['sdkSources']!=sdk_sources(sdk):raise SystemExit('SDK source changed while building')
 source_archives={}
 for item in json.loads((root/'sources.lock.json').read_text())['sources']:
  actual=sha(root/'build/downloads'/(item['name']+'.tar.gz'))
  if actual!=item['sha256']:raise SystemExit('Source archive changed: '+item['name'])
  source_archives[item['name']]=actual
 data={**start,'finished':datetime.datetime.now(datetime.timezone.utc).isoformat(),'host':platform.platform(),'sharedTools':tools,'sdk':str(sdk),'historicalLinuxToolchainLockAppliesToHost':False,'sources':source_archives,'configurations':{n:sha(root/n)for n in configs},'licenses':{'hybrid':'GPL-2.0-or-later','software':'GPL-2.0-or-later','remuxFFmpegLibrary':'LGPL-2.1-or-later','remuxWrapper':json.loads((root/'package.json').read_text()).get('license','UNLICENSED'),'fullFFmpeg':full,'remuxFFmpeg':remux,'mpvGPL':True},'artifacts':artifacts}
 (root/'build/beta-build.json').write_text(json.dumps(data,indent=2)+'\n')
 print(root/'build/beta-build.json')
