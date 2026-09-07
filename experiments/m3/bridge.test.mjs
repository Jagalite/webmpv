import {test} from 'node:test';
import assert from 'node:assert/strict';
import {validateReply} from '../../web/m3/packet-bridge.js';
const packet={offset:10,size:3,pts:100,dts:50,duration:33,key:true,sha256:'hash'};
const request={id:2,generation:3,index:4};
const valid=()=>({...request,packet:{...packet},data:new ArrayBuffer(3),copyMs:0.1});
test('accepts exact packet ownership and metadata',()=>assert.doesNotThrow(()=>validateReply(valid(),request,packet)));
for(const key of ['id','generation','index'])test(`rejects stale ${key}`,()=>{
 const reply=valid();reply[key]--;assert.throws(()=>validateReply(reply,request,packet),/mismatched/);
});
test('rejects truncated bytes and altered packet timing',()=>{
 const reply=valid();reply.data=new ArrayBuffer(2);assert.throws(()=>validateReply(reply,request,packet),/size/);
 const other=valid();other.packet.pts++;assert.throws(()=>validateReply(other,request,packet),/metadata/);
});
test('propagates producer errors and rejects invalid timing',()=>{
 const reply=valid();reply.error='producer failed';assert.throws(()=>validateReply(reply,request,packet),/producer failed/);
 const other=valid();other.copyMs=NaN;assert.throws(()=>validateReply(other,request,packet),/timing/);
});
