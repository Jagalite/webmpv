#!/usr/bin/env python3
"""Preserve an immutable JS baseline and remux a shared short benchmark sample."""
import argparse,hashlib,json,subprocess
from pathlib import Path
root=Path(__file__).resolve().parents[2]
parser=argparse.ArgumentParser();parser.add_argument('--ref',default='79c2daf');args=parser.parse_args()
base=root/'build/hybrid-performance/baseline';base.mkdir(parents=True,exist_ok=True)
files=['web/retained-video.js','web/filter-retained-engine-worker.js','web/generated/internal/wasm-player.js']
manifest={}
for file in files:
 data=subprocess.check_output(['git','show',f'{args.ref}:{file}'],cwd=root)
 dest=base/file;dest.parent.mkdir(parents=True,exist_ok=True);dest.write_bytes(data)
 manifest[file]=hashlib.sha256(data).hexdigest()
(base/'manifest.json').write_text(json.dumps(manifest,indent=2)+'\n')
subprocess.run(['ffmpeg','-hide_banner','-loglevel','error','-nostdin','-y','-i',str(root/'build/fixtures/front.mp4'),'-t','26','-map','0:v:0','-map','0:a:0','-c','copy','-movflags','+faststart',str(base.parent/'sample.mp4')],check=True)
