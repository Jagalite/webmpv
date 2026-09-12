#!/usr/bin/env python3
"""Build an offline-installable beta candidate, without asserting release qualification."""
import argparse,gzip,hashlib,io,json,pathlib,subprocess,tarfile
root=pathlib.Path(__file__).resolve().parent.parent
p=argparse.ArgumentParser();p.add_argument('--output',type=pathlib.Path,default=root/'build/beta');p.add_argument('--yuv',action='store_true');p.add_argument('--release-tag');args=p.parse_args()
project=json.loads((root/'package.json').read_text())
source_commit=subprocess.check_output(['git','rev-parse','HEAD'],cwd=root,text=True).strip()
dirty=bool(subprocess.check_output(['git','status','--porcelain'],cwd=root))
build=None;source_archive=None
if args.release_tag:
 if dirty:raise SystemExit('Release packaging requires a clean source checkout')
 if subprocess.check_output(['git','rev-parse',f'refs/tags/{args.release_tag}^{{commit}}'],cwd=root,text=True).strip()!=source_commit:raise SystemExit('Release tag must identify HEAD')
 if project.get('license') not in ['MIT','GPL-2.0-or-later'] or not (root/'LICENSE').is_file():raise SystemExit('Select and include the original-code license before release')
 if args.yuv:raise SystemExit('The clean beta release record covers only the three standard engines')
 build=json.loads((root/'build/beta-build.json').read_text())
 if not build['clean']:raise SystemExit('Release requires a completed clean engine build')
 sdk=pathlib.Path(build['sdk'])
 for name,digest in build['sdkSources'].items():
  if hashlib.sha256((sdk/'upstream/emscripten'/name).read_bytes()).hexdigest()!=digest:raise SystemExit('SDK source changed: '+name)
 for tool in build['sharedTools'].values():
  if hashlib.sha256(pathlib.Path(tool['path']).read_bytes()).hexdigest()!=tool['sha256']:raise SystemExit('Build tool changed: '+tool['path'])
 for group in ['inputs','configurations','artifacts']:
  for name,expected in build[group].items():
   digest=expected['sha256'] if isinstance(expected,dict) else expected
   if hashlib.sha256((root/name).read_bytes()).hexdigest()!=digest:raise SystemExit('Build record mismatch: '+name)
 for item in json.loads((root/'sources.lock.json').read_text())['sources']:
  if hashlib.sha256((root/'build/downloads'/(item['name']+'.tar.gz')).read_bytes()).hexdigest()!=item['sha256']:raise SystemExit('Source archive mismatch: '+item['name'])
 subprocess.run(['python3',str(root/'scripts/package-beta-source.py'),'--output',str(args.output),'--tag',args.release_tag],check=True)
 source_path=args.output/f"webmpv-{project['version']}-source.tar.gz"
 source_archive={'filename':source_path.name,'sha256':hashlib.sha256(source_path.read_bytes()).hexdigest(),'bytes':source_path.stat().st_size}

files={}
def add(name):
 f=root/name
 if not f.is_file():raise SystemExit('Missing runtime asset: '+name)
 files[name]=f.read_bytes()
for f in sorted((root/'web/generated').rglob('*')):
 if f.is_file():add(str(f.relative_to(root)))
for name in ['audio-worklet.js','filter-retained-engine-worker.js','retained-decoder-worker.js','retained-video.js','subtitle-overlay.js','software-full-engine-worker.js','io-worker.js','range-reader.js','file-reader.js','resource-loader.js','vod-manifest.js','streaming-manifest.js','segmented-subtitles.js','native-remux-player.js','native-remux-worker.js','native-remux-source-worker.js','source-probe.js','cheap-mp4-probe.js','video-codec-config.js','remux-packaging.js']:
 add('web/'+name)
engines={'remux':('engine-remux','remux'),'hybrid':('engine-hybrid','player'),'software':('engine-software-full','player')}
if args.yuv:engines['experimental-yuv']=('engine-software-yuv','player');add('web/yuv-presenter.js')
for folder,stem in engines.values():
 for ext in ['mjs','wasm']:add(f'web/{folder}/{stem}.{ext}')
for name in ['fixtures/DejaVuSans.ttf','fixtures/FONT-LICENSE.txt','sources.lock.json','toolchain.lock.json','docs/BETA.md','docs/COMPATIBILITY-EXPANSION.md','docs/LICENSING.md','docs/RELEASE.md']:add(name)
if (root/'LICENSE').is_file():add('LICENSE')
if build:files['engine-build.json']=(json.dumps(build,indent=2)+'\n').encode()
for f in sorted((root/'third_party').rglob('*')):
 if f.is_file():add(str(f.relative_to(root)))
files['index.js']=b"export * from './web/generated/index.js';\n"
files['index.d.ts']=b"export * from './web/generated/index.js';\n"
files['README.md']=files['docs/BETA.md']
for name in ['RELEASE.md','LICENSING.md','COMPATIBILITY-EXPANSION.md']:
 files['README.md']=files['README.md'].replace((']('+name+')').encode(),('](docs/'+name+')').encode())
package={'name':'webmpv','version':project['version'],'license':('GPL-2.0-or-later' if project.get('license') in ['MIT','GPL-2.0-or-later'] else 'UNLICENSED'),'webmpvOriginalCodeLicense':project.get('license','UNLICENSED'),'type':'module','main':'./index.js','types':'./index.d.ts','exports':{'.':{'types':'./index.d.ts','import':'./index.js'},'./release-manifest.json':'./release-manifest.json'},'description':'Browser media compatibility runtime: Native, Hybrid, Software'}
files['package.json']=(json.dumps(package,indent=2)+'\n').encode()
manifest={'schema':1,'version':package['version'],'status':'beta-candidate-not-production-qualified','sourceCommit':source_commit,'dirtySource':dirty,'sourceTag':args.release_tag,'sourceArchive':source_archive,'engineBuildRecord':'engine-build.json' if build else None,'publicModes':['native','hybrid','software'],'automaticOrder':['native-direct','native-remux','hybrid','software'],'engines':engines,'defaultSoftwarePresenter':'rgb','qualification':{'functional':'See repository results and clean-consumer results for exact hashes','performance':'Workload-specific; no universal performance claim','production':False,'experimentalYUV':'Seek endurance and sustained-movie qualification remain open'},'files':{n:{'bytes':len(b),'sha256':hashlib.sha256(b).hexdigest()}for n,b in sorted(files.items())}}
files['release-manifest.json']=(json.dumps(manifest,indent=2)+'\n').encode()
args.output.mkdir(parents=True,exist_ok=True);out=args.output/f"webmpv-{package['version']}.tgz"
with out.open('wb')as f:
 with gzip.GzipFile(filename='',mode='wb',fileobj=f,mtime=0)as gz:
  with tarfile.open(fileobj=gz,mode='w',format=tarfile.PAX_FORMAT)as tar:
   for name,data in sorted(files.items()):
    info=tarfile.TarInfo('package/'+name);info.size=len(data);info.mode=0o644;info.mtime=0;tar.addfile(info,io.BytesIO(data))
(args.output/'release-manifest.json').write_bytes(files['release-manifest.json'])
digest=hashlib.sha256(out.read_bytes()).hexdigest()
lines=[f'{digest}  {out.name}']
if source_archive:lines.append(f"{source_archive['sha256']}  {source_archive['filename']}")
(args.output/'SHA256SUMS').write_text('\n'.join(lines)+'\n')
print(out);print(digest)
