#!/usr/bin/env python3
"""Configure an installed Emscripten 4.0.14 SDK with a fresh per-checkout cache."""
import argparse, json, pathlib, shutil, subprocess
root=pathlib.Path(__file__).resolve().parent.parent
p=argparse.ArgumentParser();p.add_argument('--sdk',required=True,type=pathlib.Path);args=p.parse_args()
sdk=args.sdk.resolve()
version=(sdk/'upstream/emscripten/emscripten-version.txt').read_text().strip().strip('"')
if version!='4.0.14':raise SystemExit('Expected Emscripten 4.0.14, found '+version)
node=next(iter(sorted((sdk/'node').glob('*/bin/node'))),None)
if node is None:raise SystemExit('Install the SDK node tool with emsdk install 4.0.14')
config={'NODE_JS':str(node),'LLVM_ROOT':str(sdk/'upstream/bin'),'BINARYEN_ROOT':str(sdk/'upstream'),'EMSCRIPTEN_ROOT':str(sdk/'upstream/emscripten'),'CACHE':str(root/'build/cache')}
(root/'build').mkdir(exist_ok=True)
(root/'build/beta.emscripten').write_text(''.join(f'{k} = {v!r}\n' for k,v in config.items()))
(root/'build/beta-toolchain.json').write_text(json.dumps({'sdk':str(sdk),'emscripten':version,'config':config},indent=2)+'\n')
print(root/'build/beta.emscripten')
