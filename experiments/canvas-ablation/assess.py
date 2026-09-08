"""Recompute CPU comparisons and audit saved ablation samples."""
import json,sys,statistics,hashlib
from pathlib import Path
folder=Path(sys.argv[1]); r=json.loads((folder/'result.json').read_text())
assert r['passed'] and r['runtimeUnchanged'] and not r['smoke']
assert r['hashes']==r['hashesAfter']
raw=[json.loads(s) for s in (folder/'raw.jsonl').read_text().splitlines()]
assert [(t['round'],t['variant']) for t in r['trials']]==[(i,v) for i,order in enumerate(r['protocol']['orders']) for v in order]
assert len(r['trials'])==6
for t in r['trials']:
 samples=[{k:v for k,v in s.items() if k not in ('round','variant')} for s in raw if s['round']==t['round'] and s['variant']==t['variant']]
 assert samples==t['samples']
 assert all(s['foreground']['matched'] for s in samples)
 s=[x for x in samples if x['phase']=='measurement'];elapsed=(s[-1]['at']-s[0]['at'])/1000;assert elapsed>=60
 cpu=0
 for a,b in zip(s,s[1:]):
  pa={p['id']:p['cpuTime'] for p in a['processes']};pb={p['id']:p['cpuTime'] for p in b['processes']};assert pa.keys()==pb.keys()
  cpu+=sum(max(0,pb[p]-pa[p]) for p in pa)
 assert abs(cpu/elapsed*100-t['summary']['cpuPercentOfOneCore'])<1e-9
 a,b=s[0]['state'],s[-1]['state']; da,db=a['diagnostics'],b['diagnostics']
 frames=b['rendered']-a['rendered']; decoded=db['decoderStats']['frames']-da['decoderStats']['frames']
 assert frames>=elapsed*29 and abs(decoded-frames)<=12
 assert elapsed*.97<=b['position']-a['position']<=elapsed*1.03
 assert b['audio']['mediaFrames']-a['audio']['mediaFrames']>=elapsed*b['audio']['sampleRate']*.95
 assert db['canvasSubmissions']-da['canvasSubmissions']==(0 if t['variant']=='bypass' else frames)
 if t['variant']=='bypass': assert db['copyMs']==da['copyMs']
 assert all(x['state']['diagnostics']['decoder']=='webcodecs' and not x['state']['errors'] for x in samples)
 assert statistics.median(x['totalRSS'] for x in s)==t['summary']['medianRSSBytes']
 assert t['passed'] and t['cleanup']['retainedWorkers']==0 and t['originAfterCleanup']['active']==0
 assert t['retainedBrowserPIDs']==[]
pairs=[]
for i in range(3):
 ts={t['variant']:t['summary'] for t in r['trials'] if t['round']==i}
 pairs.append({'round':i+1,'fullCPU':ts['full']['cpuPercentOfOneCore'],'bypassCPU':ts['bypass']['cpuPercentOfOneCore'],'savings':1-ts['bypass']['cpuPercentOfOneCore']/ts['full']['cpuPercentOfOneCore']})
a={'verified':True,'pairs':pairs,'medianPairedSavings':statistics.median(p['savings'] for p in pairs),'resultSha256':hashlib.sha256((folder/'result.json').read_bytes()).hexdigest(),'rawSha256':hashlib.sha256((folder/'raw.jsonl').read_bytes()).hexdigest()}
(folder/'assessment.json').write_text(json.dumps(a,indent=2)+'\n');print(json.dumps(a,indent=2))
