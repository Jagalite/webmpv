import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {createBenchmarkServer} from '../scripts/benchmark-media-server.mjs';
test('benchmark origin serves native open-ended/suffix ranges and bounded mpv ranges identically',async()=>{
 const folder=await mkdtemp(path.join(tmpdir(),'webmpv-benchmark-')),file=path.join(folder,'fixture.mp4');
 await writeFile(file,Buffer.from('0123456789'));
 const server=await createBenchmarkServer({file,mbps:1000,rtt:0});await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 const url=`http://127.0.0.1:${server.address().port}`;
 try{
  for(const [range,body,status] of [['bytes=2-5','2345',206],['bytes=6-','6789',206],['bytes=-3','789',206],[null,'0123456789',200],['bytes=10-','',416],['bytes=0-1,3-4','',416]]){
   const response=await fetch(url+'/media',{headers:range?{Range:range}:{}});assert.equal(response.status,status);assert.equal(await response.text(),body);
  }
  const head=await fetch(url+'/media',{method:'HEAD'});assert.equal(head.headers.get('content-length'),'10');assert.equal(await head.text(),'');
  const state=await(await fetch(url+'/control')).json();assert.equal(state.active,0);assert.equal(state.bytes,21);assert.match(state.etag,/^"[a-f0-9]{64}"$/);
 }finally{await new Promise(resolve=>server.close(resolve));await rm(folder,{recursive:true});}
});
