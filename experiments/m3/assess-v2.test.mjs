import {test} from 'node:test';
import assert from 'node:assert/strict';
import {assess} from './assess-v2.mjs';
const manifest={packets:Array.from({length:960},(_,i)=>({pts:Math.round(i/30*1e6),size:100}))};
function evidence(){
 const variants=['software','copyback-direct','copyback-bridge'];
 const pass=warmup=>({warmup,presented:960,timestamps:manifest.packets.map(p=>p.pts),elapsedMs:32000,latenessMs:Array(930).fill(0),bridgeRTT:Array(960).fill(.2),bridgeCopyMs:9.6});
 return {schema:2,finished:'2026-09-07',errors:[],
  quality:variants.map(variant=>({variant,runs:[{packetHashesVerified:960}]})),
  pixelComparisons:variants.slice(1).map(variant=>({variant,frames:Array.from({length:4},()=>({mae:0,p99:0}))})),
  seeks:variants.map(variant=>({variant,runs:[{firstPresentedPTS:17500000,exactPTS:true,firstPresentedMs:20}]})),
  measurements:variants.flatMap((variant,index)=>[0,1,2].map(pair=>({variant,pair,browserPID:index*3+pair+1,browserSequence:index*3+pair+1,
   warmupPasses:1,warmupRuns:[pass(true)],passes:3,runs:Array.from({length:3},()=>pass(false)),foreground:true,
   samples:Array.from({length:95},()=>({visibility:'visible',focused:true})),
   cpu:{percentOfOneCore:variant==='software'?60:30,elapsedSeconds:95,processChanges:[]},
   memory:{medianRSSGrowthBytes:0,peakRSSBytes:800*1048576},heapBytes:128*1048576,outstandingPeak:8,
   bridge:variant==='copyback-bridge'?{requests:3840,replies:3840,bytes:384000,errors:0,peakPending:1}:null})))};
}
test('passes complete isolated bridged evidence without authorizing M4',()=>{
 const r=assess(evidence(),manifest);assert.equal(r.candidate,true);assert.match(r.decision,/explicit G2 approval/);
});
test('smoke, reused browser and missing warmup cannot qualify',()=>{
 for(const mutate of [r=>{r.smoke=true;},r=>{r.measurements[1].browserPID=r.measurements[0].browserPID;},r=>{r.measurements[0].warmupRuns=[];}]){
  const r=evidence();mutate(r);assert.equal(assess(r,manifest).candidate,false);
 }
});
test('bridge throughput and packet identity are required',()=>{
 for(const mutate of [r=>{r.measurements[6].bridge.replies--;},r=>{r.measurements[6].bridge.bytes--;},r=>{r.quality[2].runs[0].packetHashesVerified--;}]){
  const r=evidence();mutate(r);assert.equal(assess(r,manifest).candidate,false);
 }
});
test('net benefit must survive the bridge, regardless of direct copy-back speed',()=>{
 const r=evidence();r.measurements[6].cpu.percentOfOneCore=59;
 assert.equal(assess(r,manifest).candidate,false);
});
test('resource, focus, process churn and frame failures remain disqualifying',()=>{
 for(const mutate of [r=>{r.memory.medianRSSGrowthBytes=65*1048576;},r=>{r.samples[2].focused=false;},
 r=>{r.cpu.processChanges.push({kind:'removed'});},r=>{r.runs[0].timestamps[1]=0;}]){
  const r=evidence();mutate(r.measurements[6]);assert.equal(assess(r,manifest).candidate,false);
 }
});
