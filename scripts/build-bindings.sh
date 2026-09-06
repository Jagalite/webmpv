#!/usr/bin/env bash
# Browser sidecars are assembled separately from the clean native compilation.
set -euo pipefail
cd "$(dirname "$0")/.."
OUTPUT=${1:-build/bindings}
mkdir -p "$OUTPUT/web/generated"
./node_modules/.bin/tsc --outDir "$OUTPUT/web/generated"
cp web/*.js web/*.html "$OUTPUT/web/"
python3 - "$OUTPUT" <<'PY'
import hashlib,json,pathlib,sys
folder=pathlib.Path(sys.argv[1])
result={'schema':1,'build':'TypeScript plus original browser sidecars',
        'inputs':{},'outputs':{}}
for name in ['package-lock.json','tsconfig.json','src/player.ts']:
    result['inputs'][name]=hashlib.sha256(pathlib.Path(name).read_bytes()).hexdigest()
for file in sorted((folder/'web').rglob('*')):
    if file.is_file():
        result['outputs'][str(file.relative_to(folder))]=hashlib.sha256(file.read_bytes()).hexdigest()
(folder/'manifest.json').write_text(json.dumps(result,indent=2)+'\n')
PY
