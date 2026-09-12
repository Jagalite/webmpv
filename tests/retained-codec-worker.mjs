import {test} from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFile} from 'node:fs/promises';
import {videoCodecConfig} from '../web/video-codec-config.js';
import {vp9PacketConfig} from '../web/video-codec-config.js';
test('Rejected Hybrid configuration retains diagnostic fields without binary initialization data',async()=>{
 const messages=[];
 const memory=new SharedArrayBuffer(80+8*1024*1024+16),h=new Int32Array(memory,0,16);
 const context=vm.createContext({self:{},videoCodecConfig,vp9PacketConfig,VideoDecoder:class{static async isConfigSupported(config){return {supported:false,config};}},Uint8Array,Int32Array,DataView,Atomics,performance,postMessage:m=>messages.push(m),shared:memory});
 const code=(await readFile('web/retained-decoder-worker.js','utf8')).replace(/^import .*\n/,'');
 vm.runInContext(code+'\nmemory=shared;pointer=0;header=new Int32Array(memory,0,16);view=new DataView(memory);',context);
 h[0]=5;h[2]=1;h[4]=7;h[5]=1920;h[6]=1080;h[13]=1;h[14]=110;h[15]=40;h[8]=10;
 new Uint8Array(memory,80,7).set([1,110,0,40,255,225,0]);
 await context.pump();
 assert.equal(h[3],-29);
 const error=messages.find(m=>m.error).error;
 for(const value of ['H.264 / AVC','avc1.6e0028','1920 × 1080','10-bit','110 / 40','7 bytes','no-preference','supported=false','without a specific rejection reason'])assert.ok(error.includes(value),value);
 const details=messages.find(m=>m.stats).stats.supportCheck;
 assert.equal(details.supported,false);assert.equal(details.requested.codec,'avc1.6e0028');assert.equal(details.requested.descriptionBytes,7);
 assert.equal(details.requested.description,undefined);assert.equal(details.recognized.description,undefined);
});
test('Deferred VP9 rejection reports profile and depth learned from the packet',async()=>{
 const messages=[];
 const memory=new SharedArrayBuffer(80+8*1024*1024+16),h=new Int32Array(memory,0,16);
 const context=vm.createContext({self:{},videoCodecConfig,vp9PacketConfig,VideoDecoder:class{static async isConfigSupported(config){return {supported:false,config};}},Uint8Array,Int32Array,DataView,Atomics,performance,postMessage:m=>messages.push(m),shared:memory});
 const code=(await readFile('web/retained-decoder-worker.js','utf8')).replace(/^import .*\n/,'');
 vm.runInContext(code+'\nmemory=shared;pointer=0;header=new Int32Array(memory,0,16);view=new DataView(memory);',context);
 h[0]=5;h[2]=1;h[4]=0;h[5]=640;h[6]=360;h[13]=4;h[14]=-1;h[15]=10;h[8]=0;
 await context.pump();assert.equal(h[3],0);
 h[0]=9;h[2]=2;h[4]=5;
 new Uint8Array(memory,80,5).set([0x92,0x49,0x83,0x42,0x80]);
 await context.pump();assert.equal(h[3],-29);
 const error=messages.find(m=>m.error).error;
 assert.match(error,/vp09\.02\.10\.12/);assert.match(error,/12-bit/);assert.match(error,/2 \/ 10/);
});
test('Invisible packets do not exhaust a fictitious one-packet/one-frame credit',async()=>{
 let packets=0,closed=0;const messages=[];
 class Decoder {
  static async isConfigSupported(){return {supported:true};}
  constructor(callbacks){this.callbacks=callbacks;this.decodeQueueSize=0;this.state='unconfigured';}
  configure(){this.state='configured';}addEventListener(){}close(){this.state='closed';}
  decode(){if(++packets===9)this.callbacks.output({visibleRect:{width:640,height:360},format:'I420',colorSpace:{},timestamp:9,duration:1,close(){closed++;}});}
 }
 const memory=new SharedArrayBuffer(80+8*1024*1024+16),h=new Int32Array(memory,0,16);
 const context=vm.createContext({self:{},videoCodecConfig,VideoDecoder:Decoder,EncodedVideoChunk:class{constructor(data){Object.assign(this,data);}},Uint8Array,Int32Array,DataView,Atomics,performance,postMessage:m=>messages.push(m),shared:memory});
 const code=(await readFile('web/retained-decoder-worker.js','utf8')).replace(/^import .*\n/,'');vm.runInContext(code+'\nmemory=shared;pointer=0;header=new Int32Array(memory,0,16);view=new DataView(memory);',context);
 let serial=0;const request=async op=>{h[0]=++serial*4+1;h[2]=op;await context.pump();assert.equal(h[0],serial*4+2);return h[3];};
 h[4]=0;h[5]=640;h[6]=360;h[13]=4;h[14]=0;h[15]=10;h[8]=8;assert.equal(await request(1),0);
 h[4]=1;h[7]=1;for(let i=0;i<9;i++)assert.equal(await request(2),0);
 assert.equal(await request(4),1);assert.equal(packets,9);assert.equal(closed,1);assert.equal(messages.filter(m=>m.retainedFrame).length,1);
});
