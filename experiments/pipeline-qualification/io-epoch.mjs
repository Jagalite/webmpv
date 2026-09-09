// Deterministic reproduction: an old epoch notification arrives after the next read starts.
import vm from 'node:vm';import {readFile,mkdir,writeFile} from 'node:fs/promises';import assert from 'node:assert/strict';
const out=`results/pipeline-qualification/io-epoch-${new Date().toISOString().replaceAll(':','-')}`;await mkdir(out,{recursive:true});
async function exercise(file){const pending=[],messages=[];let aborts=0;
 class Reader{constructor(){this.stats={};this.total=16n;}async open(){return {size:'16'};}read(){return new Promise((resolve,reject)=>{const p={done:false,resolve:b=>{p.done=true;resolve(b);},reject:()=>{p.done=true;reject(new DOMException('Old epoch','AbortError'));}};pending.push(p);});}beginEpoch(){for(const p of pending)if(!p.done){aborts++;p.reject();}}}
 const context=vm.createContext({self:{},RangeReader:Reader,postMessage:m=>messages.push(m),Uint8Array,Int32Array,DataView,TextDecoder,Atomics,DOMException,crypto:globalThis.crypto,setTimeout,clearTimeout,setInterval,clearInterval});
 const code=(await readFile(file,'utf8')).replace(/^import .*?;\n/,'');vm.runInContext(code+'\nstartPump=()=>{nativeEpoch=Atomics.load(header,3);};',context);const memory=new SharedArrayBuffer(300000),h=new Int32Array(memory,0,16);await context.self.onmessage({data:{type:'init',memory,pointer:0,options:{}}});
 h[1]=1;h[0]=9;h[4]=4;const old=context.pump();assert.equal(pending.length,1);
 // Native cancellation has finished and the next exact ticket is now active.
 h[3]=1;h[1]=2;h[0]=17;pending[0].resolve(new Uint8Array([9,9,9,9]));await old;
 const next=context.pump();assert.equal(pending.length,2);await context.self.onmessage({data:{type:'epoch'}});if(!pending[1].done)pending[1].resolve(new Uint8Array([1,2,3,4]));await next;
 return {file,state:h[0],result:h[5],bytes:[...new Uint8Array(memory,64,4)],aborts};
}
const baseline=await exercise('web/io-worker.js'),candidate=await exercise('experiments/pipeline-qualification/io-worker.js');assert.equal(baseline.state,19,'Baseline must reproduce aborted current request');assert.equal(candidate.state,18,'Candidate must complete the current request');assert.deepEqual(candidate.bytes,[1,2,3,4]);assert.equal(candidate.aborts,0);
await writeFile(out+'/result.json',JSON.stringify({baseline,candidate,passed:true},null,2)+'\n');console.log(out,baseline,candidate);
