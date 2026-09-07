import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFile} from 'node:fs/promises';
const source=await readFile(new URL('../web/browser-decoder-worker.js',import.meta.url),'utf8');
function setup(){
 const memory=new SharedArrayBuffer(80+8*1024*1024+1920*1080*3/2),header=new Int32Array(memory,0,16),view=new DataView(memory),messages=[];
 let instance,sequence=0;
 class Decoder{
  static async isConfigSupported(){return {supported:true};}
  constructor(callbacks){instance=this;this.callbacks=callbacks;this.state='unconfigured';}
  configure(){this.state='configured';} decode(){} async flush(){} close(){this.state='closed';}
 }
 const context={self:{},postMessage:m=>messages.push(m),setInterval:()=>{},performance,VideoDecoder:Decoder,EncodedVideoChunk:class{constructor(config){Object.assign(this,config);}},Int32Array,Uint8Array,DataView,Atomics:new Proxy(Atomics,{get:(target,key)=>key==='waitAsync'?undefined:target[key]})};
 vm.createContext(context);vm.runInContext(source,context);context.self.onmessage({data:{memory,pointer:0}});
 function begin(operation){header[2]=operation;header[0]=++sequence*4+1;return header[0];}
 async function command(operation){const ticket=begin(operation);await context.pump();assert.equal(header[0],ticket+1);return header[3];}
 async function init(){header[4]=7;header[5]=16;header[6]=16;new Uint8Array(memory,80,7).set([1,100,0,31,255,0,0]);assert.equal(await command(1),0);}
 return {memory,header,view,messages,context,begin,command,init,decoder:()=>instance};
}
function frame(copy=async bytes=>bytes.fill(42)){
 return {format:'I420',codedWidth:16,codedHeight:16,visibleRect:{x:0,y:0,width:16,height:16},timestamp:1234,duration:33333,colorSpace:{primaries:'bt709',transfer:'bt709',matrix:'bt709',fullRange:false},closed:0,copyTo:copy,close(){this.closed++;}};
}
test('eight pending inputs apply backpressure before the ninth packet',async()=>{
 const s=setup();await s.init();s.header[4]=1;s.header[7]=1;s.view.setFloat64(64,0,true);s.view.setFloat64(72,0,true);
 for(let i=0;i<8;i++)assert.equal(await s.command(2),0);
 assert.equal(await s.command(2),-6);
 assert.equal(s.messages.at(-1).stats.peakOutstanding,8);
});
test('copy-back preserves timestamp/color and closes its source exactly once',async()=>{
 const s=setup();await s.init();const f=frame();s.decoder().callbacks.output(f);
 assert.equal(await s.command(4),1);assert.equal(f.closed,1);assert.equal(s.view.getFloat64(64,true),1234);
 assert.equal(s.header[9],1);assert.equal(new Uint8Array(s.memory,80+8*1024*1024,1)[0],42);
 await s.command(5);assert.equal(f.closed,1);
});
test('stale copy completion cannot publish into a replacement request',async()=>{
 const s=setup();await s.init();let complete;const f=frame(()=>new Promise(resolve=>complete=resolve));s.decoder().callbacks.output(f);
 s.begin(4);const pending=s.context.pump();const next=s.begin(6);complete();await pending;
 assert.equal(s.header[0],next);assert.equal(f.closed,1);await s.context.pump();assert.equal(s.header[0],next+1);
});
test('reset closes queued frames and rejects late generation output',async()=>{
 const s=setup();await s.init();const old=s.decoder(),queued=frame();old.callbacks.output(queued);await s.command(6);assert.equal(queued.closed,1);
 const late=frame();old.callbacks.output(late);assert.equal(late.closed,1);assert.equal(await s.command(4),-6);
});
test('EOF waits for queued output; close releases each remaining frame',async()=>{
 const s=setup();await s.init();const a=frame(),b=frame();s.decoder().callbacks.output(a);s.decoder().callbacks.output(b);
 assert.equal(await s.command(3),0);assert.equal(await s.command(4),1);assert.equal(await s.command(4),1);assert.equal(await s.command(4),-541478725);
 await s.command(5);assert.equal(a.closed,1);assert.equal(b.closed,1);
});

test('close preempts an unfinished copy and closes its frame immediately',async()=>{
 const s=setup();await s.init();let complete;const f=frame(()=>new Promise(resolve=>complete=resolve));s.decoder().callbacks.output(f);
 s.begin(4);const pending=s.context.pump();const next=s.begin(5);await s.context.pump();
 assert.equal(s.header[0],next+1);assert.equal(f.closed,1);complete();await pending;assert.equal(f.closed,1);
});

test('a request published immediately after acknowledgment runs without another notification',async()=>{
 const memory=new SharedArrayBuffer(80),header=new Int32Array(memory,0,16),waited=[];
 let nextTask,published=false;
 header[0]=5;header[2]=5;
 class Channel{
  constructor(){this.port1={};this.port2={postMessage:()=>{nextTask=()=>this.port1.onmessage();}};}
 }
 const context={self:{},MessageChannel:Channel,performance,Int32Array,Uint8Array,DataView,
  postMessage:message=>{if(message.stats&&!published){published=true;header[0]=9;}},
  Atomics:new Proxy(Atomics,{get:(target,key)=>key==='waitAsync'?(_header,_index,value)=>{
   waited.push(value);return {async:true,value:new Promise(()=>{})};
  }:target[key]})};
 vm.createContext(context);vm.runInContext(source,context);
 context.self.onmessage({data:{memory,pointer:0}});
 assert.equal(header[0],9);assert.deepEqual(waited,[]);
 assert.equal(typeof nextTask,'function');nextTask();
 await new Promise(resolve=>setImmediate(resolve));
 assert.equal(header[0],10);assert.deepEqual(waited,[10]);
});
