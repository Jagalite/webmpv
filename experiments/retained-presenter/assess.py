"""Recompute the two-arm screen and audit retained-frame ownership/timing."""
import json,hashlib,statistics,sys
from pathlib import Path
folder=Path(sys.argv[1]);r=json.loads((folder/'result.json').read_text())
assert r['passed'] and not r['smoke'] and r['runtimeUnchanged']
assert r['hashes']==r['hashesAfter']
assert [t['variant'] for t in r['trials']]==['native','retained']
raw=[json.loads(line) for line in (folder/'raw.jsonl').read_text().splitlines()]
for t in r['trials']:
 samples=[{k:v for k,v in s.items() if k not in ('variant','round')} for s in raw if s['variant']==t['variant']]
 assert samples==t['samples'] and all(s['foreground']['matched'] for s in samples)
 s=[x for x in samples if x['phase']=='measurement'];span=(s[-1]['at']-s[0]['at'])/1000;assert span>=60
 cpu=0
 for a,b in zip(s,s[1:]):
  pa={p['id']:p['cpuTime'] for p in a['processes']};pb={p['id']:p['cpuTime'] for p in b['processes']};assert pa.keys()==pb.keys()
  cpu+=sum(max(0,pb[p]-pa[p]) for p in pa)
 assert abs(cpu/span*100-t['summary']['cpuPercentOfOneCore'])<1e-9
 assert statistics.median(x['totalRSS'] for x in s)==t['summary']['medianRSSBytes']
 a,b=s[0]['state'],s[-1]['state'];frames=b['rendered']-a['rendered'];drops=b['dropped']-a['dropped']
 assert frames>=span*29 and drops/(frames+drops)<=.01
 assert span*.97<=b['position']-a['position']<=span*1.03
 assert all(not x['state']['errors'] for x in samples)
 if t['variant']=='retained':
  da,db=a['diagnostics'],b['diagnostics'];p=db['presentation']
  decoded=db['decoderStats']['frames']-da['decoderStats']['frames'];assert abs(decoded-frames)<=12
  assert abs(p['drawn']-da['presentation']['drawn']-frames)<=12
  assert b['audio']['mediaFrames']-a['audio']['mediaFrames']>=span*b['audio']['sampleRate']*.95
  assert db['decoderStats'].get('pixelCopies',0)==0 and db['decoderStats']['copyMs']==0 and p['pixelChecks']==[]
  assert all(x['state']['diagnostics']['decoder']=='webcodecs' for x in samples)
  assert all(x['state']['diagnostics']['presentation']['peakRetained']<=16 and x['state']['diagnostics']['presentation']['missing']==0 for x in samples)
  assert all((x['state']['diagnostics']['decoderStats']['actualWidth'],x['state']['diagnostics']['decoderStats']['actualHeight'])==(1920,1080) for x in samples)
  late=sorted(p['lateMs']);assert late[int(len(late)*.95)]<=33 and max(late)<=100
  assert all(b>a for a,b in zip(p['pts'],p['pts'][1:]))
  c=t['cleanup']['presentation'];assert c['received']==c['closed']==t['cleanup']['decoderStats']['transferredFrames']
  assert c['retained']==c['pending']==0
 assert t['passed'] and t['cleanup']['retainedWorkers']==0 and t['originAfterCleanup']['active']==0 and t['retainedBrowserPIDs']==[]
t=r['trials'][1];samples=[s for s in t['samples'] if s['phase']=='measurement']
firstPTS=samples[0]['state']['diagnostics']['presentation']['pts'][-1];observed={}
for sample in samples:
 p=sample['state']['diagnostics']['presentation']
 observed.update({pts:late for pts,late in zip(p['pts'],p['lateMs']) if pts>firstPTS})
late=sorted(observed.values());assert len(late)==t['summary']['presentationDraws']
timing={'frames':len(late),'submissionLatenessP95Ms':late[int(len(late)*.95)],'submissionLatenessMaxMs':max(late),'scope':'deduplicated observed Canvas submissions during measurement; not physical output latency'}
cpu={t['variant']:t['summary']['cpuPercentOfOneCore'] for t in r['trials']}
a={'verified':True,'timing':timing,'replicated':False,'cpu':cpu,'retainedMultipleOfNative':cpu['retained']/cpu['native'],'scope':'single native versus retained-frame presenter screen; no subtitle/filter/seek qualification','resultSha256':hashlib.sha256((folder/'result.json').read_bytes()).hexdigest(),'rawSha256':hashlib.sha256((folder/'raw.jsonl').read_bytes()).hexdigest()}
(folder/'assessment.json').write_text(json.dumps(a,indent=2)+'\n');print(json.dumps(a,indent=2))
