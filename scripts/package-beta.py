#!/usr/bin/env python3
"""Build an offline-installable beta candidate, without asserting release qualification."""
import argparse,gzip,hashlib,io,json,pathlib,subprocess,tarfile
root=pathlib.Path(__file__).resolve().parent.parent
p=argparse.ArgumentParser();p.add_argument('--output',type=pathlib.Path,default=root/'build/beta');p.add_argument('--yuv',action='store_true');args=p.parse_args()
files={}
def add(name):
 f=root/name
 if not f.is_file():raise SystemExit('Missing runtime asset: '+name)
 files[name]=f.read_bytes()
for f in sorted((root/'web/generated').rglob('*')):
 if f.is_file():add(str(f.relative_to(root)))
for name in ['audio-worklet.js','filter-retained-engine-worker.js','retained-decoder-worker.js','retained-video.js','subtitle-overlay.js','software-full-engine-worker.js','io-worker.js','range-reader.js','file-reader.js','resource-loader.js','vod-manifest.js','native-remux-player.js','native-remux-worker.js','native-remux-source-worker.js','source-probe.js','cheap-mp4-probe.js','video-codec-config.js','remux-packaging.js']:
 add('web/'+name)
engines={'remux':('engine-remux','remux'),'hybrid':('engine-hybrid','player'),'software':('engine-software-full','player')}
if args.yuv:engines['experimental-yuv']=('engine-software-yuv','player');add('web/yuv-presenter.js')
for folder,stem in engines.values():
 for ext in ['mjs','wasm']:add(f'web/{folder}/{stem}.{ext}')
for name in ['fixtures/DejaVuSans.ttf','fixtures/FONT-LICENSE.txt','sources.lock.json','toolchain.lock.json','docs/BETA.md']:add(name)
for f in sorted((root/'third_party').rglob('*')):
 if f.is_file():add(str(f.relative_to(root)))
files['index.js']=b"export * from './web/generated/index.js';\n"
files['index.d.ts']=b"export * from './web/generated/index.js';\n"
files['README.md']=files['docs/BETA.md']
package={'name':'webmpv','version':'0.3.0-beta.0','type':'module','main':'./index.js','types':'./index.d.ts','exports':{'.':{'types':'./index.d.ts','import':'./index.js'},'./release-manifest.json':'./release-manifest.json'},'description':'Browser media compatibility runtime: Native, Hybrid, Software'}
files['package.json']=(json.dumps(package,indent=2)+'\n').encode()
manifest={'schema':1,'version':package['version'],'status':'beta-candidate-not-production-qualified','sourceCommit':subprocess.check_output(['git','rev-parse','HEAD'],cwd=root,text=True).strip(),'dirtySource':bool(subprocess.check_output(['git','status','--porcelain'],cwd=root)),'publicModes':['native','hybrid','software'],'automaticOrder':['native-direct','native-remux','hybrid','software'],'engines':engines,'defaultSoftwarePresenter':'rgb','qualification':{'functional':'See repository results and clean-consumer results for exact hashes','performance':'Workload-specific; no universal performance claim','production':False,'experimentalYUV':'Seek endurance and sustained-movie qualification remain open'},'files':{n:{'bytes':len(b),'sha256':hashlib.sha256(b).hexdigest()}for n,b in sorted(files.items())}}
files['release-manifest.json']=(json.dumps(manifest,indent=2)+'\n').encode()
args.output.mkdir(parents=True,exist_ok=True);out=args.output/'webmpv-0.3.0-beta.0.tgz'
with out.open('wb')as f:
 with gzip.GzipFile(filename='',mode='wb',fileobj=f,mtime=0)as gz:
  with tarfile.open(fileobj=gz,mode='w',format=tarfile.PAX_FORMAT)as tar:
   for name,data in sorted(files.items()):
    info=tarfile.TarInfo('package/'+name);info.size=len(data);info.mode=0o644;info.mtime=0;tar.addfile(info,io.BytesIO(data))
(args.output/'release-manifest.json').write_bytes(files['release-manifest.json'])
print(out);print(hashlib.sha256(out.read_bytes()).hexdigest())
