#!/usr/bin/env python3
"""Summarize measured trials without treating failed screens as CPU comparisons."""
import json,statistics,sys
from pathlib import Path
source=Path(sys.argv[1])
if source.suffix=='.log':source=Path(source.read_text().splitlines()[0])/'result.json'
elif source.is_dir():source=source/'result.json'
data=json.loads(source.read_text())
report={'source':str(source),'scope':data['scope'],'input':data.get('input'),'mode':data['mode'],'allChecksPassed':data.get('passed',False),'groups':{}}
for variant in dict.fromkeys(data['order']):
 trials=[trial for trial in data['trials'] if trial['variant']==variant]
 valid=[trial for trial in trials if trial.get('passed')]
 summary={'trials':len(trials),'passed':len(valid),'failures':[trial.get('error','incomplete') for trial in trials if not trial.get('passed')]}
 if valid:
  for key in ['cpuPercent','pausedCpuPercent','rssMean','renderMs','copyMs']:
   values=[trial['summary'][key] for trial in valid]
   summary[key]={'mean':statistics.mean(values),'median':statistics.median(values),'min':min(values),'max':max(values)}
  summary['measuredSeconds']=sum(trial['summary']['elapsed'] for trial in valid)
  summary['frames']=sum(trial['summary']['frames'] for trial in valid)
  summary['dropOrErrorDelta']=sum(trial['summary']['dropOrErrorDelta'] for trial in valid)
  summary['rawSeekPixelHashes']=sorted(set(trial['rawPixelSha256'] for trial in valid if trial.get('rawPixelSha256')))
 report['groups'][variant]=summary
if report['allChecksPassed'] and all(name in report['groups'] for name in ['baseline','candidate']):
 base=report['groups']['baseline'];candidate=report['groups']['candidate']
 report['comparison']={'cpuReductionPercent':100*(1-candidate['cpuPercent']['mean']/base['cpuPercent']['mean']),'minimumTrialsPerVariant':min(base['passed'],candidate['passed']),'sameRawSeekPixels':base['rawSeekPixelHashes']==candidate['rawSeekPixelHashes'],'interpretation':'Observed whole-browser CPU means on this host; no foreground qualification or universal speedup guarantee.'}
else:report['comparison']=None
output=source.parent/'assessment.json';output.write_text(json.dumps(report,indent=2)+'\n');print(json.dumps(report,indent=2))
