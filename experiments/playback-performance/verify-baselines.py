"""Verify preserved comparison/release bytes without changing active engines."""
import hashlib,json,sys
from pathlib import Path
root=Path(__file__).resolve().parents[2]
def digest(path):
    with path.open('rb') as stream:return hashlib.file_digest(stream,'sha256').hexdigest()
report={'snapshots':{},'historicalArtifacts':{},'activeDevelopmentArtifacts':{},'passed':False}
for name in ['baseline','accepted-artifacts']:
    folder=root/'build/playback-performance'/name
    manifest=json.loads((folder/'manifest.json').read_text())
    checked={}
    for original,expected in manifest.items():
        actual=digest(folder/original)
        assert actual==expected,(name,original,actual,expected)
        checked[original]=actual
    report['snapshots'][name]=checked
original=report['snapshots']['accepted-artifacts']
for path in ['web/engine/player.mjs','web/engine/player.wasm','web/engine-m4/player.mjs','web/engine-m4/player.wasm']:
    actual=digest(root/path);assert actual==original[path],path;report['historicalArtifacts'][path]=actual
archive='build/releases/webmpv-software-0.2.0.tar.gz'
expected='b512d5bfffda77ec80a00a26893df0ce8dc9c840ed90d45f03ed6872bef4c58b'
actual=digest(root/archive);assert actual==expected,archive;report['historicalArtifacts'][archive]=actual
for engine in ['engine-software-full','engine-retained-subs']:
    for extension in ['mjs','wasm']:
        path=f'web/{engine}/player.{extension}'
        report['activeDevelopmentArtifacts'][path]={'sha256':digest(root/path),'originalSha256':original[path]}
report['passed']=True
output=root/(sys.argv[1] if len(sys.argv)>1 else 'results/playback-performance/baseline-preservation-final.json')
output.write_text(json.dumps(report,indent=2)+'\n')
print(json.dumps({'passed':True,'snapshotFiles':sum(map(len,report['snapshots'].values())),'historicalArtifacts':len(report['historicalArtifacts']),'output':str(output.relative_to(root))}))
