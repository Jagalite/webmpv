import {readFile,writeFile} from 'node:fs/promises';
import {pathToFileURL} from 'node:url';
import {createHash} from 'node:crypto';

export const median = values => {
  const sorted=[...values].sort((a,b)=>a-b),n=sorted.length;
  return n ? (sorted[Math.floor((n-1)/2)]+sorted[Math.floor(n/2)])/2 : null;
};
const paths=['software','copyback','retained'];
export function assess(result,manifest) {
  const expected=manifest.packets.map(p=>p.pts).sort((a,b)=>a-b);
  const ordered=a=>JSON.stringify(a)===JSON.stringify(expected);
  const runs=result.measurements??[];
  const complete=!result.smoke&&!result.failure&&Boolean(result.finished)&&runs.length===9&&paths.every(path=>
    [0,1,2].every(pair=>runs.filter(r=>r.path===path&&r.pair===pair).length===1));
  const quality=Object.fromEntries(paths.map(path=>{
    if(path==='software')return [path,true];
    const comparison=result.pixelComparisons?.find(c=>c.path===path);
    return [path,Boolean(comparison&&comparison.frames.length===4&&comparison.frames.every(f=>
      Number.isFinite(f.mae)&&Number.isFinite(f.p99)&&f.mae<=3&&f.p99<=16))];
  }));
  const summary={complete,quality,paths:{},pairs:[],copybackCandidate:false,
    decision:'Defer G2: incomplete or failing evidence',hardwareAcceleration:'unknown',energy:'not measured'};
  for(const path of paths){
    const selected=runs.filter(r=>r.path===path);
    const valid=selected.length===3&&selected.every(r=>r.passes===3&&r.runs.length===3&&
      r.runs.every(p=>p.presented===expected.length&&ordered(p.timestamps)&&p.elapsedMs>=31000&&
        p.latenessMs.length===expected.filter(pts=>pts>=1000000).length&&
        p.latenessMs.every(Number.isFinite)&&p.latenessMs.filter(x=>x>33.334).length/p.latenessMs.length<=.01)&&
      r.foreground&&r.visibility.every(v=>v.state==='visible')&&r.samples.every(s=>s.visibility==='visible')&&
      r.heapBytes<=536870912&&r.outstandingPeak<=8&&r.outstandingPeak>0&&
      Number.isFinite(r.cpu.percentOfOneCore)&&r.cpu.percentOfOneCore>0&&r.cpu.elapsedSeconds>=90&&
      Number.isFinite(r.memory.medianRSSGrowthBytes)&&r.memory.medianRSSGrowthBytes<=64*1048576);
    const seek=result.seeks?.find(r=>r.path===path);
    const seekPass=Boolean(seek&&seek.runs.length===1&&seek.runs[0].firstPresentedPTS===17500000&&seek.runs[0].exactPTS);
    summary.paths[path]={runtimePassed:valid,seekPassed:seekPass,pixelPassed:quality[path],
      medianCPUPercentOfOneCore:median(selected.map(r=>r.cpu.percentOfOneCore)),
      cpuRange:selected.map(r=>r.cpu.percentOfOneCore),
      startupMs:selected.flatMap(r=>r.runs.map(p=>p.firstPresentedMs)),
      seekMs:seek?.runs[0].firstPresentedMs??null,
      maximumRSSBytes:selected.length?Math.max(...selected.map(r=>r.memory.peakRSSBytes)):null,
      rssGrowthBytes:selected.map(r=>r.memory.medianRSSGrowthBytes),
      lateFractions:selected.flatMap(r=>r.runs.map(p=>p.lateFraction))};
  }
  if(complete)for(let pair=0;pair<3;pair++){
    const row={pair};
    const software=runs.find(r=>r.path==='software'&&r.pair===pair).cpu.percentOfOneCore;
    for(const path of ['copyback','retained'])row[path]=1-runs.find(r=>r.path===path&&r.pair===pair).cpu.percentOfOneCore/software;
    summary.pairs.push(row);
  }
  summary.copybackMedianReduction=median(summary.pairs.map(p=>p.copyback));
  summary.copybackBenefitPassed=complete&&summary.copybackMedianReduction>=.3&&summary.pairs.every(p=>p.copyback>=.2);
  summary.copybackCandidate=complete&&summary.copybackBenefitPassed&&result.errors.length===0&&
    ['software','copyback'].every(path=>summary.paths[path].runtimePassed&&summary.paths[path].pixelPassed&&summary.paths[path].seekPassed);
  if(summary.copybackCandidate)summary.decision='Evidence supports reviewing a scoped M4 prototype; G2 still needs explicit user approval and an accepted maintenance owner';
  return summary;
}

if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
 const file=process.argv[2];if(!file)throw Error('Usage: node experiments/m3/assess.mjs RESULT.json');
 const result=JSON.parse(await readFile(file,'utf8'));
 const manifest=JSON.parse(await readFile('results/m3/fixture.json','utf8'));
 const summary=assess(result,manifest);
 const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
 summary.evidence={resultFile:file,resultSha256:sha(await readFile(file)),
   assessmentCodeSha256:sha(await readFile(new URL(import.meta.url))),
   fixtureManifestSha256:sha(await readFile('results/m3/fixture.json'))};
 await writeFile(file.replace(/\.json$/,'.assessment.json'),JSON.stringify(summary,null,2)+'\n');
 console.log(JSON.stringify(summary,null,2));
}
