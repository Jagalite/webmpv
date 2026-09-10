import {test} from 'node:test';import assert from 'node:assert/strict';
import {LocalFileReader} from '../web/file-reader.js';
test('64-bit local slices stay bounded and never materialize the complete file',async()=>{
 const calls=[],size=2**32+1000;
 const file={size,arrayBuffer(){throw Error('Whole file read');},slice(a,b){calls.push([a,b]);return new Blob([Uint8Array.from({length:b-a},(_,i)=>(a+i)%251)]);}};
 const r=new LocalFileReader(file);assert.equal((await r.open()).size,String(size));
 const offset=2**32+101;const bytes=await r.read(BigInt(offset),100);
 assert.equal(bytes[0],offset%251);assert.deepEqual(calls,[[offset,offset+100]]);
 assert.equal((await r.read(BigInt(size-10),100)).length,10);assert.equal((await r.read(BigInt(size),1)).length,0);
 assert.equal(r.stats.peakActiveBytes,100);assert.equal(r.stats.cacheBytes,0);
 r.close();await assert.rejects(()=>r.read(0n,1),/closed/);
});
test('epoch cancellation releases a blocked read and permits the next bounded read',async()=>{
 let started;const seen=new Promise(r=>started=r);let first=true,canceled=0;
 const file={size:1000,slice(a,b){if(!first)return new Blob([new Uint8Array(b-a)]);first=false;return {stream:()=>new ReadableStream({pull(){started();},cancel(){canceled++;}})};}};
 const r=new LocalFileReader(file),pending=r.read(0n,100);await seen;
 await assert.rejects(()=>r.read(0n,1),/Concurrent/);r.beginEpoch();await assert.rejects(pending,{name:'AbortError'});
 assert.equal(canceled,1);assert.equal((await r.read(10n,100)).length,100);assert.equal(r.stats.activeBytes,0);r.close();
});
test('destroy cancels reads; truncated and oversized sources fail explicitly',async()=>{
 let start;const seen=new Promise(r=>start=r);
 const r=new LocalFileReader({size:5,slice(){return {stream:()=>new ReadableStream({pull(){start();}})};}});
 const work=r.read(0n,5);await seen;r.close();await assert.rejects(work,{name:'AbortError'});
 for(const bytes of [4,6]){const q=new LocalFileReader({size:5,slice:()=>new Blob([new Uint8Array(bytes)])});await assert.rejects(()=>q.read(0n,5),/truncated|exceeds/);q.close();}
});
test('an epoch change during asynchronous reader cleanup cannot publish old bytes',async()=>{
 let cleanup,done;const entered=new Promise(r=>cleanup=r),finish=new Promise(r=>done=r);let reads=0;
 const reader={read:async()=>++reads===1?{value:new Uint8Array(5),done:false}:{done:true},cancel:()=>{cleanup();return finish;},releaseLock(){}};
 const r=new LocalFileReader({size:5,slice:()=>({stream:()=>({getReader:()=>reader})})});
 const pending=r.read(0n,5);await entered;r.beginEpoch();done();await assert.rejects(pending,{name:'AbortError'});assert.equal(r.stats.discardedBytes,5);r.close();
});
