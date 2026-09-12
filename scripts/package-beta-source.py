#!/usr/bin/env python3
"""Package matching preferred source and build materials beside a release binary."""
import argparse, gzip, hashlib, io, json, pathlib, subprocess, tarfile
root=pathlib.Path(__file__).resolve().parent.parent
p=argparse.ArgumentParser();p.add_argument('--output',type=pathlib.Path,required=True);p.add_argument('--tag',required=True);args=p.parse_args()
build=json.loads((root/'build/beta-build.json').read_text());sdk=pathlib.Path(build['sdk'])
files={}
# Only tracked, reviewed source; omit historical test output and its media metadata.
for name in subprocess.check_output(['git','ls-files','-z'],cwd=root).decode().split('\0'):
 if name and not name.startswith('results/') and (root/name).is_file():files['webmpv/'+name]=root/name
for item in json.loads((root/'sources.lock.json').read_text())['sources']:
 files['webmpv/build/downloads/'+item['name']+'.tar.gz']=root/'build/downloads'/(item['name']+'.tar.gz')
# Include the SDK's preferred source, notably the runtime libraries linked into Wasm.
for path in sorted((sdk/'upstream/emscripten').rglob('*')):
 rel=path.relative_to(sdk/'upstream/emscripten')
 if any(part in ['cache','__pycache__','.git','node_modules']for part in rel.parts):continue
 if path.is_file():files['toolchain/emscripten/'+str(rel)]=path
for name in build['configurations']:
 files['build-materials/'+name]=root/name
for name in ['build/beta-build.json','build/beta-build-start.json','build/clean-build.log']:
 if not (root/name).is_file():raise SystemExit('Missing release build material: '+name)
 files['build-materials/'+name]=root/name
version=json.loads((root/'package.json').read_text())['version'];args.output.mkdir(parents=True,exist_ok=True)
out=args.output/f'webmpv-{version}-source.tar.gz';hashes={}
with out.open('wb')as dest,gzip.GzipFile(filename='',mode='wb',fileobj=dest,mtime=0)as gz,tarfile.open(fileobj=gz,mode='w|',format=tarfile.PAX_FORMAT)as tar:
 for name,file in sorted(files.items()):
  data=file.read_bytes();hashes[name]=hashlib.sha256(data).hexdigest();info=tarfile.TarInfo(name);info.size=len(data);info.mode=0o755 if file.stat().st_mode&0o111 else 0o644;info.mtime=0;tar.addfile(info,io.BytesIO(data))
 record={'sourceTag':args.tag,'sourceCommit':subprocess.check_output(['git','rev-parse','HEAD'],cwd=root,text=True).strip(),'files':hashes}
 data=(json.dumps(record,indent=2)+'\n').encode();info=tarfile.TarInfo('source-manifest.json');info.size=len(data);info.mode=0o644;info.mtime=0;tar.addfile(info,io.BytesIO(data))
print(out)
