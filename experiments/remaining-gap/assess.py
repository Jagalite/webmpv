"""Audit raw samples and recompute paired remaining-gap costs."""
import hashlib,json,statistics,sys
from pathlib import Path
folder=Path(sys.argv[1]);r=json.loads((folder/'result.json').read_text())
assert r['passed'] and r['performanceEligible'] and not r['smoke'] and r['runtimeUnchanged']
assert r['hashes']==r['hashesAfter']
raw=[json.loads(s) for s in (folder/'raw.jsonl').read_text().splitlines()]
assert [(t['round'],t['variant']) for t in r['trials']]==[(i,v) for i,order in enumerate(r['protocol']['orders']) for v in order]
count=1 if r.get('screen') else 3
assert len(r['trials'])==count*4
for t in r['trials']:
 samples=[{k:v for k,v in s.items() if k not in ('round','variant')} for s in raw if s['round']==t['round'] and s['variant']==t['variant']]
 assert samples==t['samples'] and all(s['foreground']['matched'] for s in samples)
 s=[x for x in samples if x['phase']=='measurement'];elapsed=(s[-1]['at']-s[0]['at'])/1000;assert elapsed>=60
 cpu=0
 for a,b in zip(s,s[1:]):
  pa={p['id']:p['cpuTime'] for p in a['processes']};pb={p['id']:p['cpuTime'] for p in b['processes']};assert pa.keys()==pb.keys()
  cpu+=sum(max(0,pb[p]-pa[p]) for p in pa)
 assert abs(cpu/elapsed*100-t['summary']['cpuPercentOfOneCore'])<1e-9
 a,b=s[0]['state'],s[-1]['state'];frames=b['rendered']-a['rendered'];drops=b['dropped']-a['dropped']
 assert frames>=elapsed*29 and drops/(frames+drops)<=.01
 assert elapsed*.97<=b['position']-a['position']<=elapsed*1.03
 assert all(not x['state']['errors'] for x in samples)
 if t['variant']!='native':
  da,db=a['diagnostics'],b['diagnostics'];decoded=db['decoderStats']['frames']-da['decoderStats']['frames'];assert abs(decoded-frames)<=12
  assert b['audio']['mediaFrames']-a['audio']['mediaFrames']>=elapsed*b['audio']['sampleRate']*.95
  assert db['canvasSubmissions']==da['canvasSubmissions']==0 and db['copyMs']==da['copyMs']==0
  copies=db['decoderStats'].get('pixelCopies',0)-da['decoderStats'].get('pixelCopies',0)
  placeholders=db['decoderStats'].get('placeholderFrames',0)-da['decoderStats'].get('placeholderFrames',0)
  assert copies==(0 if t['variant']=='nocopy-skip' else decoded)
  assert placeholders==(decoded if t['variant']=='nocopy-skip' else 0)
  assert all(x['state']['diagnostics']['decoder']=='webcodecs' for x in samples)
  assert all((x['state']['diagnostics']['decoderStats']['actualWidth'],x['state']['diagnostics']['decoderStats']['actualHeight'])==(1920,1080) for x in samples)
 assert statistics.median(x['totalRSS'] for x in s)==t['summary']['medianRSSBytes']
 assert t['passed'] and t['cleanup']['retainedWorkers']==0 and t['originAfterCleanup']['active']==0 and t['retainedBrowserPIDs']==[]
rounds=[]
for i in range(count):
 cpu={t['variant']:t['summary']['cpuPercentOfOneCore'] for t in r['trials'] if t['round']==i}
 rounds.append({'round':i+1,'cpu':cpu,'renderRemovedCPUPoints':cpu['copy-render']-cpu['copy-skip'],'pixelReturnRemovedCPUPoints':cpu['copy-skip']-cpu['nocopy-skip'],'residualCPUPointsVsNative':cpu['nocopy-skip']-cpu['native']})
summary={v:statistics.median(t['summary']['cpuPercentOfOneCore'] for t in r['trials'] if t['variant']==v) for v in r['protocol']['orders'][0]}
a={'verified':True,'replicated':count==3,'scope':'single-round screen' if count==1 else 'three-round comparison','rounds':rounds,'medianCPU':summary,'resultSha256':hashlib.sha256((folder/'result.json').read_bytes()).hexdigest(),'rawSha256':hashlib.sha256((folder/'raw.jsonl').read_bytes()).hexdigest()}
(folder/'assessment.json').write_text(json.dumps(a,indent=2)+'\n');print(json.dumps(a,indent=2))
