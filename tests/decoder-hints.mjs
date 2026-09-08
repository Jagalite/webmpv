import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFile} from 'node:fs/promises';
const source=await readFile(process.env.DECODER_WORKER||'build/playback-performance/decoder-hints/worker.js','utf8');
const AGAIN=-6,EOF=-541478725,IO=-29;
function setup(){
 const memory=new SharedArrayBuffer(80+8*1024*1024+1920*1080*3/2),header=new Int32Array(memory,0,16),view=new DataView(memory),messages=[];
 let instance,sequence=0,now=0,finishFlush;
 class Decoder{
  static async isConfigSupported(){return {supported:true};}
  constructor(callbacks){instance=this;this.callbacks=callbacks;this.state='unconfigured';}
  configure(){this.state='configured';}decode(){}flush(){return new Promise(resolve=>finishFlush=resolve);}close(){this.state='closed';}
 }
 const context={self:{},postMessage:message=>messages.push({message,hint:Atomics.load(header,13)}),setInterval:()=>{},performance:{now:()=>now},VideoDecoder:Decoder,EncodedVideoChunk:class{constructor(config){Object.assign(this,config);}},Int32Array,Uint8Array,DataView,Atomics:new Proxy(Atomics,{get:(target,key)=>key==='waitAsync'?undefined:target[key]})};
 vm.createContext(context);vm.runInContext(source,context);context.self.onmessage({data:{memory,pointer:0}});
 async function command(operation){header[2]=operation;const ticket=header[0]=++sequence*4+1;await context.pump();assert.equal(header[0],ticket+1);return header[3];}
 async function init(){header[4]=7;header[5]=16;header[6]=16;new Uint8Array(memory,80,7).set([1,100,0,31,255,0,0]);assert.equal(await command(1),0);}
 async function packet(){header[4]=1;header[7]=1;view.setFloat64(64,1000,true);view.setFloat64(72,33333,true);return command(2);}
 return {memory,header,view,messages,context,command,init,packet,decoder:()=>instance,advance:ms=>{now+=ms;},flush:async()=>{finishFlush();await Promise.resolve();}};
}
function frame(){return {format:'I420',visibleRect:{x:0,y:0,width:16,height:16},timestamp:1000,duration:33333,colorSpace:{},closed:0,close(){this.closed++;}};}
test('ready hints distinguish input capacity from waiting for decoder output',async()=>{
 const s=setup();await s.init();assert.equal(s.header[14],1);assert.equal(s.header[13],AGAIN);
 for(let i=0;i<8;i++)assert.equal(await s.packet(),0);
 assert.equal(s.header[13],0);assert.equal(await s.packet(),AGAIN);
 const f=frame();s.decoder().callbacks.output(f);assert.equal(s.header[13],1);
 assert.equal(s.messages.at(-1).hint,1,'readiness is published before wakeup');
 assert.equal(await s.command(4),1);assert.equal(s.header[13],AGAIN);assert.equal(f.closed,1);
 assert.equal(s.view.getFloat64(64,true),1000,'hint fields preserve timestamp ABI');
});
test('drain hints wait for flush and preserve queued frames before EOF',async()=>{
 const s=setup();await s.init();await s.packet();await s.command(3);assert.equal(s.header[13],0);
 const f=frame();s.decoder().callbacks.output(f);assert.equal(s.header[13],1);
 await s.flush();assert.equal(s.header[13],1,'queued output precedes EOF');
 assert.equal(await s.command(4),1);assert.equal(s.header[13],EOF);assert.equal(f.closed,1);
});
test('flush completion wakes a native reader that skipped an empty receive',async()=>{
 const s=setup();await s.init();await s.command(3);assert.equal(s.header[13],0);
 const at=s.messages.length;await s.flush();assert.equal(s.header[13],EOF);
 assert.ok(s.messages.slice(at).some(m=>m.message.wakeup&&m.hint===EOF));
});
test('reset rejects old-generation frames without changing current readiness',async()=>{
 const s=setup();await s.init();const old=s.decoder(),queued=frame();old.callbacks.output(queued);
 await s.command(6);assert.equal(queued.closed,1);assert.equal(s.header[13],AGAIN);
 const late=frame();old.callbacks.output(late);assert.equal(late.closed,1);assert.equal(s.header[13],AGAIN);
});
test('asynchronous decoder failure publishes an error before waking native',async()=>{
 const s=setup();await s.init();s.decoder().callbacks.error(Error('decode failed'));
 assert.equal(s.header[13],IO);assert.equal(s.messages.at(-1).hint,IO);assert.ok(s.messages.at(-1).message.wakeup);
});
test('watchdog still fires without further mailbox receive requests',async()=>{
 const s=setup();await s.init();for(let i=0;i<8;i++)await s.packet();assert.equal(s.header[13],0);
 s.advance(3001);await s.context.pump();assert.equal(s.header[13],IO);assert.ok(s.messages.at(-1).message.wakeup);
});
test('buffered output while paused does not trigger the empty-output watchdog',async()=>{
 const s=setup();await s.init();for(let i=0;i<8;i++)await s.packet();s.decoder().callbacks.output(frame());
 s.advance(30000);await s.context.pump();assert.equal(s.header[13],1);
});
test('queue overflow publishes failure and wakes the native reader',async()=>{
 const s=setup();await s.init();for(let i=0;i<8;i++)s.decoder().callbacks.output(frame());const extra=frame();s.decoder().callbacks.output(extra);
 assert.equal(extra.closed,1);assert.equal(s.header[13],IO);assert.ok(s.messages.at(-1).message.wakeup);
});
test('cancel closes frames and invalidates hints before native acknowledgment',async()=>{
 const s=setup();await s.init();const f=frame();s.decoder().callbacks.output(f);
 s.header[2]=4;s.header[0]=101;s.context.self.onmessage({data:{type:'cancel'}});
 assert.equal(s.header[0],102);assert.equal(s.header[3],IO);assert.equal(s.header[13],IO);assert.equal(f.closed,1);
});
