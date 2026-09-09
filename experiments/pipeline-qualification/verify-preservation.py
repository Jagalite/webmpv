"""Verify both pre-existing artifact sets without modifying their manifests."""
import hashlib,json
from pathlib import Path
from datetime import datetime,timezone
out=Path('results/pipeline-qualification')
result={'checkedAt':datetime.now(timezone.utc).isoformat(),'sets':[]}
for name in ['results/pipeline-separation/preservation-before.json','results/pipeline-qualification/preservation-before.json']:
    original=json.loads(Path(name).read_text()); mismatches=[]
    for path,expected in original.items():
        p=Path(path)
        actual=None
        if p.is_file():
            with p.open('rb') as stream:actual=hashlib.file_digest(stream,'sha256').hexdigest()
        if actual!=expected:mismatches.append({'path':path,'expected':expected,'actual':actual})
    result['sets'].append({'manifest':name,'files':len(original),'mismatches':mismatches})
result['passed']=all(not s['mismatches'] for s in result['sets'])
(out/'preservation-check.json').write_text(json.dumps(result,indent=2)+'\n')
print(json.dumps(result,indent=2))
raise SystemExit(0 if result['passed'] else 1)
