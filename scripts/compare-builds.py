#!/usr/bin/env python3
"""Compare independent container outputs, including their recorded build inputs."""
import hashlib,json,pathlib,sys
first,second=map(pathlib.Path,sys.argv[1:3])
output=pathlib.Path(sys.argv[3] if len(sys.argv)>3 else 'results/reproducibility.json')
def digest(file): return hashlib.sha256(file.read_bytes()).hexdigest()
manifests=[json.loads((folder/'build-manifest.json').read_text()) for folder in [first,second]]
result={'schema':1,'passed':True,'buildDirectories':[str(first),str(second)],'artifacts':{},'inputs':{},'toolchainImages':[json.loads((folder/'toolchain-image.json').read_text()) for folder in [first,second]]}
for name in ['player.wasm','player.mjs']:
    hashes=[digest(folder/name) for folder in [first,second]]
    equal=hashes[0]==hashes[1]
    result['artifacts'][name]={'sha256':hashes,'bytes':(first/name).stat().st_size,'equal':equal}
    result['passed'] &= equal
for key in ['sources','toolchainLock','patchesAndBindings','buildConfigurations','browserBindings','fixtures','tools']:
    equal=manifests[0][key]==manifests[1][key]
    result['inputs'][key]={'equal':equal}
    result['passed'] &= equal
for folder,manifest in zip([first,second],manifests):
    for name in ['player.wasm','player.mjs']:
        if manifest['artifacts']['web/engine/'+name]!=digest(folder/name):
            raise SystemExit(f'Artifact does not match its build manifest: {folder/name}')
output.parent.mkdir(parents=True,exist_ok=True)
output.write_text(json.dumps(result,indent=2)+'\n')
print('PASS: identical artifacts and build inputs' if result['passed'] else 'FAIL: build outputs or inputs differ')
raise SystemExit(0 if result['passed'] else 1)
