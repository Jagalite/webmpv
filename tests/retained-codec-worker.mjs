import {test} from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFile} from 'node:fs/promises';
import {videoCodecConfig} from '../web/video-codec-config.js';
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
