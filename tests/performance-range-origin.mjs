// Regression for aborted responses closing the shared movie descriptor.
import test from 'node:test';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {mkdir,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
const folder='build/playback-performance/range-origin-test';
await mkdir(folder,{recursive:true});
const bytes=Buffer.alloc(8*1024*1024);for(let i=0;i<bytes.length;i++)bytes[i]=(i*37+(i>>>8))&255;
await writeFile(folder+'/source.mp4',bytes);
test('bounded ranges survive repeated cancellation and retain byte identity',async()=>{
 const appOrigin='http://127.0.0.1:12345';
 const server=spawn(process.execPath,['experiments/playback-performance/range-origin.mjs'],{env:{...process.env,MEDIA_INPUT:folder+'/source.mp4',APP_ORIGIN:appOrigin},stdio:['ignore','pipe','pipe']});
 let errors='';server.stderr.on('data',chunk=>errors+=chunk);
 try{
  const origin=await new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(Error('Origin timeout')),10000);server.once('error',reject);server.once('exit',code=>{clearTimeout(timer);reject(Error(`Origin exited ${code}: ${errors}`));});server.stdout.on('data',chunk=>{const match=/http:\/\/127\.0\.0\.1:\d+/.exec(String(chunk));if(match){clearTimeout(timer);resolve(match[0]);}});});
  const head=await fetch(origin+'/movie.mp4',{method:'HEAD'});assert.equal(head.status,200);assert.equal(head.headers.get('content-length'),String(bytes.length));assert.equal(head.headers.get('access-control-allow-origin'),appOrigin);
  const etag='"'+createHash('sha256').update(bytes).digest('hex')+'"';assert.equal(head.headers.get('etag'),etag);
  for(let n=0;n<4;n++){
   const full=await fetch(origin+'/movie.mp4');const reader=full.body.getReader();assert.ok((await reader.read()).value.length);await reader.cancel();
   const start=17+n*12345,response=await fetch(origin+'/movie.mp4',{headers:{Range:`bytes=${start}-`}});
   assert.equal(response.status,206);assert.equal(response.headers.get('content-range'),`bytes ${start}-${start+256*1024-1}/${bytes.length}`);assert.equal(response.headers.get('etag'),etag);
   assert.deepEqual(Buffer.from(await response.arrayBuffer()),bytes.subarray(start,start+256*1024));
  }
  const tail=await fetch(origin+'/movie.mp4',{headers:{Range:`bytes=${bytes.length-17}-${bytes.length+100}`}});assert.equal(tail.status,206);assert.deepEqual(Buffer.from(await tail.arrayBuffer()),bytes.subarray(-17));
  const bad=await fetch(origin+'/movie.mp4',{headers:{Range:`bytes=${bytes.length}-`}});assert.equal(bad.status,416);
  const preflight=await fetch(origin+'/movie.mp4',{method:'OPTIONS',headers:{Origin:appOrigin,'Access-Control-Request-Headers':'range,if-range'}});assert.equal(preflight.status,204);assert.equal(preflight.headers.get('access-control-allow-headers'),'Range,If-Range');
  await new Promise(resolve=>setTimeout(resolve,50));const stats=await(await fetch(origin+'/__stats')).json();assert.equal(stats.active,0);assert.ok(stats.peakActive<=8);assert.ok(stats.aborted>=1);assert.equal(stats.ranges,5);assert.equal(stats.sha256,etag.slice(1,-1));assert.equal(errors,'');
 }finally{
  if(server.exitCode===null){const exited=new Promise(resolve=>server.once('exit',resolve));server.kill();await exited;}
 }
});
