import {test} from 'node:test';
import assert from 'node:assert/strict';
import {RangeReader} from '../web/range-reader.js';
let sequence=0;
async function setup(mode='normal',extra={}){const id=`node-${Date.now()}-${++sequence}`;await fetch(`http://127.0.0.1:4180/control?id=${id}`,{method:'POST',body:JSON.stringify({mode,...extra})});return {id,url:`http://127.0.0.1:4180/media/large?id=${id}`};}
test('64-bit positions and bounded LRU',async()=>{const {url}=await setup();const reader=new RangeReader({url,cacheBytes:65536,blockBytes:16384});try{await reader.open();assert.equal(reader.total,8589934765n);for(let i=0;i<100;i++){const off=4294967296n+BigInt(i*73001);const bytes=await reader.read(off,1000);assert.equal(bytes[0],Number(off%251n));assert.ok(reader.stats.cacheBytes<=65536);}assert.ok(reader.stats.peakActiveBytes<=16384);}finally{reader.close();}assert.equal(reader.stats.cacheBytes,0);});
test('unaligned misses start at the requested byte and inner reads reuse the bounded window',async()=>{
 const {url,id}=await setup(),r=new RangeReader({url,blockBytes:16384,cacheBytes:32768});
 try{
  await r.open();const offset=4294970001n;
  assert.equal((await r.read(offset,1000))[0],Number(offset%251n));
  const requests=r.stats.requests;
  const inner=await r.read(offset+9000n,1000);
  assert.equal(inner[0],Number((offset+9000n)%251n));assert.equal(r.stats.requests,requests);
  const edge=await r.read(offset+16380n,1000);assert.equal(edge.length,4);
  assert.equal((await r.read(offset+16384n,1000))[0],Number((offset+16384n)%251n));
  const state=await fetch(`http://127.0.0.1:4180/control?id=${id}`).then(response=>response.json());
  assert.deepEqual(state.ranges.slice(1),[{start:Number(offset),end:Number(offset)+16383},{start:Number(offset)+16384,end:Number(offset)+32767}]);
  assert.ok(r.stats.peakCacheBytes<=32768);assert.ok(r.stats.peakActiveBytes<=16384);
 }finally{r.close();}
});
for(const mode of ['ignore-range','bad-range','encoded','forbidden'])test(`reject ${mode}`,async()=>{const {url}=await setup(mode);const r=new RangeReader({url});await assert.rejects(r.open());r.close();assert.equal(r.stats.fetchedBytes,0);});
test('representation changes are terminal',async()=>{const {url}=await setup('changed');const r=new RangeReader({url});await r.open();await assert.rejects(r.read(262144n,100));r.close();});
for(const mode of ['truncate','retry'])test(`recover ${mode} without false EOF`,async()=>{const {url}=await setup(mode);const r=new RangeReader({url});await r.open();const bytes=await r.read(32000n,1000);assert.equal(bytes[0],Number(32000n%251n));assert.ok(r.stats.retries>0);r.close();});
test('401 renewal and default redirect rejection',async()=>{const {url}=await setup('auth');let renewed=0;const r=new RangeReader({url},async()=>{renewed++;return {headers:{Authorization:'Bearer current'}};});await r.open();assert.equal(renewed,1);r.close();const other=await setup('redirect');const redirect=new RangeReader({url:other.url});await assert.rejects(redirect.open());redirect.close();});
test('supersede blocked read and reuse source; close cancels',async()=>{const {url,id}=await setup();const r=new RangeReader({url});await r.open();await fetch(`http://127.0.0.1:4180/control?id=${id}`,{method:'POST',body:JSON.stringify({stall:true})});const read=r.read(500000n,100);setTimeout(()=>r.beginEpoch(),100);await assert.rejects(read,{name:'AbortError'});await fetch(`http://127.0.0.1:4180/control?id=${id}`,{method:'POST',body:JSON.stringify({stall:false})});assert.equal((await r.read(500000n,100))[0],500000%251);r.close();await assert.rejects(r.read(0n,1));});
