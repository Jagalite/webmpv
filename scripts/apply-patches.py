#!/usr/bin/env python3
"""Replay the complete patch series against locked sources before updating files.

Later patches may overlap earlier hunks. Comparing complete replayed files makes
repeated runs idempotent without relying on reversing individual overlapping hunks.
Only original or known intermediate contents may be replaced.
"""
from pathlib import Path
import hashlib,json,subprocess,tarfile,tempfile
root=Path(__file__).resolve().parent.parent
locked={item['name']:item for item in json.loads((root/'sources.lock.json').read_text())['sources']}
updates=[]
for component,folder in [('mpv',root/'patches'),('ffmpeg',root/'patches/ffmpeg')]:
    patches=sorted(folder.glob('*.patch'))
    paths=set()
    for patch in patches:
        for line in patch.read_text().splitlines():
            if line.startswith('+++ b/'):
                name=line[6:].split('\t')[0]
                if Path(name).is_absolute() or '..' in Path(name).parts:
                    raise SystemExit('Unsafe patch path: '+name)
                paths.add(name)
    archive=root/'build/downloads'/f'{component}.tar.gz'
    if hashlib.sha256(archive.read_bytes()).hexdigest()!=locked[component]['sha256']:
        raise SystemExit('Source archive hash mismatch: '+component)
    with tempfile.TemporaryDirectory(prefix='patch-replay-',dir=root/'build') as temp:
        stage=Path(temp)
        with tarfile.open(archive) as tar:
            members={m.name.split('/',1)[1]:m for m in tar.getmembers() if '/' in m.name and m.isfile()}
            for name in paths:
                target=stage/name;target.parent.mkdir(parents=True,exist_ok=True)
                if name in members:target.write_bytes(tar.extractfile(members[name]).read())
        def content(name):
            p=stage/name
            return p.read_bytes() if p.exists() else None
        known={name:{content(name)} for name in paths}
        for patch in patches:
            run=subprocess.run(['patch','--batch','--forward','-p1','-i',str(patch)],cwd=stage,capture_output=True,text=True)
            if run.returncode:raise SystemExit(f'Patch does not match pinned series: {patch.name}\n{run.stdout}{run.stderr}')
            for name in paths:known[name].add(content(name))
        for name in paths:
            target=root/'build/sources'/component/name
            current=target.read_bytes() if target.exists() else None
            if current not in known[name]:raise SystemExit('Unrecognized source edits; refusing to overwrite: '+str(target))
            final=content(name)
            if current!=final:updates.append((target,final))
for name in ['ao_browser.c','audio_bridge.h']:
    target=root/'build/sources/mpv/audio/out'/name
    data=(root/'native'/name).read_bytes()
    if not target.exists() or target.read_bytes()!=data:updates.append((target,data))
for target,data in updates:
    target.parent.mkdir(parents=True,exist_ok=True)
    if data is None:raise SystemExit('Patch deletion requires explicit handling: '+str(target))
    target.write_bytes(data)
print(f'Verified complete locked patch series; updated {len(updates)} source files')
