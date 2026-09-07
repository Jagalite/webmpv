import {readFile,writeFile} from 'node:fs/promises';
import {pathToFileURL} from 'node:url';
import {createHash} from 'node:crypto';
const variants=['software','copyback-direct','copyback-bridge'];
const median=values=>{const a=[...values].sort((a,b)=>a-b);return a.length?a[Math.floor(a.length/2)]:null;};
const quantile=(values,p)=>{const a=[...values].sort((a,b)=>a-b);return a.length?a[Math.min(a.length-1,Math.ceil(p*a.length)-1)]:null;};

export function assess(result,manifest){
 const expected=manifest.packets.map(p=>p.pts).sort((a,b)=>a-b),frameCount=expected.length;
 const packetBytes=manifest.packets.reduce((n,p)=>n+p.size,0);
 const runs=result.measurements??[];
 const framePass=p=>p.presented===frameCount&&JSON.stringify(p.timestamps)===JSON.stringify(expected)&&p.elapsedMs>=31000&&
   p.latenessMs.length===expected.filter(x=>x>=1000000).length&&p.latenessMs.every(Number.isFinite)&&
   p.latenessMs.filter(x=>x>33.334).length/p.latenessMs.length<=.01;
 const complete=result.schema===2&&!result.smoke&&!result.failure&&Boolean(result.finished)&&runs.length===9&&
   variants.every(variant=>[0,1,2].every(pair=>runs.filter(r=>r.variant===variant&&r.pair===pair).length===1));
 const browserIsolation=complete&&new Set(runs.map(r=>r.browserPID)).size===9&&new Set(runs.map(r=>r.browserSequence)).size===9;
 const summary={complete,browserIsolation,variants:{},pairs:[],netBenefitPassed:false,candidate:false,
   decision:'Defer G2: incomplete or failing follow-up evidence',hardwareAcceleration:'unknown',energy:'not measured'};
 for(const variant of variants){
  const selected=runs.filter(r=>r.variant===variant);
  const quality=result.quality?.find(q=>q.variant===variant),seek=result.seeks?.find(q=>q.variant===variant);
  const comparison=result.pixelComparisons?.find(q=>q.variant===variant);
  const pixelPass=Boolean(quality&&quality.runs.length===1&&quality.runs[0].packetHashesVerified===frameCount&&
    (variant==='software'||comparison?.frames.length===4&&comparison.frames.every(f=>Number.isFinite(f.mae)&&Number.isFinite(f.p99)&&f.mae<=3&&f.p99<=16)));
  const seekPass=Boolean(seek&&seek.runs.length===1&&seek.runs[0].firstPresentedPTS===17500000&&seek.runs[0].exactPTS);
  const checks=selected.map(r=>({pair:r.pair,
   fixedWarmup:r.warmupPasses===1&&r.warmupRuns.length===1&&r.warmupRuns.every(p=>p.warmup&&p.presented===frameCount&&
     JSON.stringify(p.timestamps)===JSON.stringify(expected)&&p.elapsedMs>=31000),
   fullDelivery:r.passes===3&&r.runs.length===3&&r.runs.every(p=>!p.warmup&&framePass(p)),
   foreground:r.foreground&&r.samples.length>90&&r.samples.every(s=>s.visibility==='visible'&&s.focused),
   counters:Number.isFinite(r.cpu.percentOfOneCore)&&r.cpu.percentOfOneCore>0&&r.cpu.elapsedSeconds>=90&&r.cpu.processChanges.length===0,
   memory:Number.isFinite(r.memory.medianRSSGrowthBytes)&&r.memory.medianRSSGrowthBytes<=64*1048576&&r.heapBytes<=536870912,
   ownership:r.outstandingPeak>0&&r.outstandingPeak<=8,
   bridge:variant!=='copyback-bridge'||Boolean(r.bridge&&r.bridge.requests===frameCount*4&&r.bridge.replies===frameCount*4&&
     r.bridge.bytes===packetBytes*4&&r.bridge.errors===0&&r.bridge.peakPending===1&&r.runs.every(p=>p.bridgeRTT.length===frameCount&&p.bridgeRTT.every(x=>Number.isFinite(x)&&x>=0)))}));
  summary.variants[variant]={pixelPass,seekPass,checks,runtimePass:selected.length===3&&checks.every(c=>Object.entries(c).filter(([k])=>k!=='pair').every(([,v])=>v)),
   cpuPercent:selected.map(r=>r.cpu.percentOfOneCore),medianCPUPercent:median(selected.map(r=>r.cpu.percentOfOneCore)),
   rssGrowthMiB:selected.map(r=>r.memory.medianRSSGrowthBytes/1048576),
   peakRSSMiB:selected.length?Math.max(...selected.map(r=>r.memory.peakRSSBytes))/1048576:null,
   seekMs:seek?.runs[0].firstPresentedMs??null};
 }
 if(complete)for(let pair=0;pair<3;pair++){
  const get=variant=>runs.find(r=>r.variant===variant&&r.pair===pair).cpu.percentOfOneCore;
  const software=get('software'),direct=get('copyback-direct'),bridge=get('copyback-bridge');
  summary.pairs.push({pair,softwareCPU:software,directCPU:direct,bridgeCPU:bridge,
   directReduction:1-direct/software,netReduction:1-bridge/software,bridgeCPUIncrement:bridge-direct});
 }
 summary.medianNetReduction=median(summary.pairs.map(p=>p.netReduction));
 summary.medianBridgeCPUIncrement=median(summary.pairs.map(p=>p.bridgeCPUIncrement));
 summary.netBenefitPassed=complete&&summary.medianNetReduction>=.3&&summary.pairs.every(p=>p.netReduction>=.2);
 const bridgeRuns=runs.filter(r=>r.variant==='copyback-bridge').flatMap(r=>r.runs);
 const times=bridgeRuns.flatMap(r=>r.bridgeRTT);
 summary.bridge={requests:times.length,medianRoundTripMs:median(times),p95RoundTripMs:quantile(times,.95),p99RoundTripMs:quantile(times,.99),
  maximumRoundTripMs:times.length?Math.max(...times):null,
  meanProducerCopyMs:times.length?bridgeRuns.reduce((n,r)=>n+r.bridgeCopyMs,0)/times.length:null};
 summary.candidate=complete&&browserIsolation&&summary.netBenefitPassed&&result.errors.length===0&&
  variants.every(v=>summary.variants[v].runtimePass&&summary.variants[v].pixelPass&&summary.variants[v].seekPass);
 if(summary.candidate)summary.decision='Follow-up supports a scoped M4 prototype review; explicit G2 approval and accepted maintenance ownership still required';
 return summary;
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
 const file=process.argv[2];if(!file)throw Error('Usage: node experiments/m3/assess-v2.mjs RESULT.json');
 const result=JSON.parse(await readFile(file,'utf8')),manifest=JSON.parse(await readFile('results/m3/fixture.json','utf8'));
 const summary=assess(result,manifest),sha=b=>createHash('sha256').update(b).digest('hex');
 summary.evidence={resultFile:file,resultSha256:sha(await readFile(file)),assessmentCodeSha256:sha(await readFile(new URL(import.meta.url))),fixtureManifestSha256:sha(await readFile('results/m3/fixture.json'))};
 await writeFile(file.replace(/\.json$/,'.assessment.json'),JSON.stringify(summary,null,2)+'\n');console.log(JSON.stringify(summary,null,2));
}
