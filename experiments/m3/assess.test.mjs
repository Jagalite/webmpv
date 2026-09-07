import {test} from 'node:test';
import assert from 'node:assert/strict';
import {assess} from './assess.mjs';
const manifest={packets:Array.from({length:960},(_,i)=>({pts:Math.round(i/30*1e6)}))};
function evidence(){
 const paths=['software','copyback','retained'];
 return {smoke:false,finished:'2026-09-07',errors:[],
  pixelComparisons:paths.slice(1).map(path=>({path,frames:Array.from({length:4},()=>({mae:0,p99:0}))})),
  seeks:paths.map(path=>({path,runs:[{firstPresentedPTS:17500000,firstPresentedMs:20,exactPTS:true}]})),
  measurements:paths.flatMap(path=>[0,1,2].map(pair=>({path,pair,passes:3,
   runs:Array.from({length:3},()=>({presented:960,timestamps:manifest.packets.map(p=>p.pts),elapsedMs:32000,
    latenessMs:Array(930).fill(0),lateFraction:0,firstPresentedMs:10})),
   foreground:true,visibility:[{state:'visible'}],samples:[{visibility:'visible'}],heapBytes:134217728,outstandingPeak:8,
   cpu:{percentOfOneCore:path==='software'?60:30,elapsedSeconds:95},
   memory:{medianRSSGrowthBytes:0,peakRSSBytes:500000000}})))};
}
test('qualifies complete matched evidence without authorizing G2',()=>{
 const result=assess(evidence(),manifest);assert.equal(result.copybackCandidate,true);assert.match(result.decision,/explicit user approval/);
});
test('smoke and partial repetitions cannot qualify',()=>{
 const r=evidence();r.smoke=true;assert.equal(assess(r,manifest).copybackCandidate,false);
 r.smoke=false;r.measurements.pop();assert.equal(assess(r,manifest).copybackCandidate,false);
});
test('missing or duplicate PTS rejects otherwise fast decoder',()=>{
 const r=evidence();r.measurements[3].runs[0].timestamps[5]=0;
 assert.equal(assess(r,manifest).copybackCandidate,false);
});
test('nonfinite CPU and insufficient measurement duration reject benefit',()=>{
 const r=evidence();r.measurements[3].cpu.percentOfOneCore=NaN;
 assert.equal(assess(r,manifest).copybackCandidate,false);
 r.measurements[3].cpu.percentOfOneCore=30;r.measurements[3].cpu.elapsedSeconds=20;
 assert.equal(assess(r,manifest).copybackCandidate,false);
});
test('retained pixel failure cannot qualify retained path or veto valid copyback',()=>{
 const r=evidence();r.pixelComparisons[1].frames[0].p99=25;
 const summary=assess(r,manifest);assert.equal(summary.quality.retained,false);assert.equal(summary.copybackCandidate,true);
 r.pixelComparisons[0].frames[0].p99=25;assert.equal(assess(r,manifest).copybackCandidate,false);
});
test('a noisy pair below 20 percent rejects a strong median',()=>{
 const r=evidence();r.measurements[3].cpu.percentOfOneCore=55;
 assert.equal(assess(r,manifest).copybackBenefitPassed,false);
});
test('memory growth, hidden output, and excessive queue ownership reject qualification',()=>{
 for(const mutate of [r=>{r.memory.medianRSSGrowthBytes=65*1048576;},
   r=>{r.foreground=false;},r=>{r.outstandingPeak=9;}]){
  const r=evidence();mutate(r.measurements[3]);assert.equal(assess(r,manifest).copybackCandidate,false);
 }
});
