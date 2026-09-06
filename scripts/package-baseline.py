#!/usr/bin/env python3
"""Assemble a deterministic baseline archive only after qualification passes."""
import argparse,gzip,hashlib,io,json,pathlib,tarfile

root=pathlib.Path(__file__).resolve().parent.parent
parser=argparse.ArgumentParser()
parser.add_argument('--engine',type=pathlib.Path,default=root/'web/engine')
parser.add_argument('--output',type=pathlib.Path,default=root/'build/releases')
args=parser.parse_args()
version=json.loads((root/'package.json').read_text())['version']
evidence=['results/m1/browser.json','results/m2/functional.json',
          'results/m2/supplemental.json','results/m2/m0-regression/m0-browser.json',
          'results/m2/reproducibility.json','results/m2/bindings-reproducibility.json',
          'results/m2/long.json']
for name in evidence:
    if not json.loads((root/name).read_text()).get('passed'):
        raise SystemExit(f'Qualification has not passed: {name}')
long=json.loads((root/'results/m2/long.json').read_text())
if long['elapsedSeconds']<3600:
    raise SystemExit('A full 60-minute run is required')
for name,expected in long['artifactHashes'].items():
    file=args.engine/pathlib.Path(name).name if name.startswith('web/engine/') else root/name
    if hashlib.sha256(file.read_bytes()).hexdigest()!=expected:
        raise SystemExit(f'Qualified runtime changed: {name}')
files={}
for folder in ['web','src','native','scripts','patches','fixtures','docs','third_party','results','tests']:
    for file in sorted((root/folder).rglob('*')):
        if file.is_file() and '__pycache__' not in file.parts:
            name=str(file.relative_to(root))
            if name.startswith('results/release-'):
                continue
            files[name]=args.engine/file.name if name.startswith('web/engine/') else file
for name in ['README.md','Dockerfile','sources.lock.json','toolchain.lock.json',
             'package.json','package-lock.json','tsconfig.json',
             'browser-player-feasibility-and-architecture-v3.md']:
    files[name]=root/name
manifest={'schema':1,'version':version,'status':'M2/G1 accepted software baseline',
          'files':{name:{'bytes':file.stat().st_size,'sha256':hashlib.sha256(file.read_bytes()).hexdigest()}
                   for name,file in sorted(files.items())}}
encoded=(json.dumps(manifest,indent=2)+'\n').encode()
args.output.mkdir(parents=True,exist_ok=True)
archive=args.output/f'webmpv-software-{version}.tar.gz'
with archive.open('wb') as raw,gzip.GzipFile(filename='',mode='wb',fileobj=raw,mtime=0) as zipped,tarfile.open(fileobj=zipped,mode='w|') as tar:
    for name,file in sorted(files.items()):
        data=file.read_bytes();info=tarfile.TarInfo(f'webmpv-{version}/{name}')
        info.size=len(data);info.mode=0o755 if name.startswith('scripts/') and file.suffix in ['.sh','.py'] else 0o644
        info.mtime=1740000000;tar.addfile(info,io.BytesIO(data))
    info=tarfile.TarInfo(f'webmpv-{version}/release-manifest.json');info.size=len(encoded);info.mode=0o644;info.mtime=1740000000
    tar.addfile(info,io.BytesIO(encoded))
summary={'archive':str(archive.relative_to(root) if archive.is_relative_to(root) else archive),
         'bytes':archive.stat().st_size,'sha256':hashlib.sha256(archive.read_bytes()).hexdigest(),'version':version}
(args.output/'release-manifest.json').write_bytes(encoded)
(args.output/'release-summary.json').write_text(json.dumps(summary,indent=2)+'\n')
print(json.dumps(summary))
