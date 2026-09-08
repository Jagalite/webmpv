// Real dedicated-worker chunk ownership after shared-mailbox reuse.
import {chromium} from 'playwright';
import {spawn} from 'node:child_process';
import {writeFile,mkdir} from 'node:fs/promises';
import assert from 'node:assert/strict';
const out=`results/playback-performance/chunk-ownership-${new Date().toISOString().replaceAll(':','-')}`;
await mkdir(out,{recursive:true});console.log(out);
const workerSource=`
let chunk;
onmessage=({data})=>{
 try{
  if(data.operation==='construct'){
   const bytes=new Uint8Array(data.memory,data.offset,data.size);
   chunk=new EncodedVideoChunk({type:'key',timestamp:-33333,duration:33333,data:bytes});
   postMessage({constructed:true,byteLength:chunk.byteLength});
  }else if(data.operation==='copy'){
   const bytes=new Uint8Array(chunk.byteLength);chunk.copyTo(bytes);
   postMessage({bytes,timestamp:chunk.timestamp,duration:chunk.duration},[bytes.buffer]);chunk=null;
  }else if(data.operation==='measure'){
   const bytes=new Uint8Array(new SharedArrayBuffer(data.size));bytes.fill(83);
   const results=[];
   for(let n=0;n<100;n++)for(const sliced of [true,false])new EncodedVideoChunk({type:'delta',timestamp:n,data:sliced?bytes.slice():bytes});
   for(let trial=0;trial<8;trial++){
    const sliced=[true,false,false,true,true,false,false,true][trial],start=performance.now();let total=0;
    for(let n=0;n<data.iterations;n++){const value=new EncodedVideoChunk({type:'delta',timestamp:n,data:sliced?bytes.slice():bytes});total+=value.byteLength;}
    results.push({sliced,milliseconds:performance.now()-start,total});
   }
   postMessage({results});
  }
 }catch(error){postMessage({error:String(error.stack)});}
};`;
await writeFile(out+'/worker.js',workerSource);
await writeFile(out+'/config.json',JSON.stringify({candidate:{'web/chunk-test-worker.js':out+'/worker.js'}}));
const server=spawn(process.execPath,['experiments/playback-performance/serve.mjs',out+'/config.json'],{env:{...process.env,PORT:'0',DEFAULT_MOUNT:'candidate'},stdio:['ignore','pipe','inherit']});
let browser,origin;const result={};
try{
 origin=await new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(Error('Server timeout')),10000);server.once('error',reject);server.stdout.on('data',bytes=>{const match=/http:\/\/127\.0\.0\.1:\d+/.exec(String(bytes));if(match){clearTimeout(timer);resolve(match[0]);}});});
 browser=await chromium.launch({channel:'chrome',headless:true});const page=await browser.newPage();await page.goto(origin+'/web/hybrid-performance.html');result.browser=browser.version();
 Object.assign(result,await page.evaluate(async()=>{
  const worker=new Worker('./chunk-test-worker.js'),cases=[],measurements=[];
  const request=data=>new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(Error('Worker deadline')),15000);worker.onerror=event=>{clearTimeout(timer);reject(Error(event.message));};worker.onmessage=event=>{clearTimeout(timer);event.data.error?reject(Error(event.data.error)):resolve(event.data);};worker.postMessage(data);});
  try{
   for(const size of [1,13,4096,65536,262144,8*1024*1024])for(const offset of [0,17])for(const kind of ['shared','wasm']){
    const length=size+offset+64,pages=Math.ceil(length/65536),allocation=kind==='wasm'?new WebAssembly.Memory({initial:pages,maximum:pages+1,shared:true}):null;
    const memory=allocation?allocation.buffer:new SharedArrayBuffer(length),bytes=new Uint8Array(memory,offset,size);
    for(let i=0;i<size;i++)bytes[i]=(i*37+(i>>>8))%256;
    const constructed=await request({operation:'construct',memory,offset,size});
    if(allocation)allocation.grow(1);
    bytes.fill(173); // The native producer can reuse its mailbox after this acknowledgment.
    const copied=await request({operation:'copy'});let differences=0;
    for(let i=0;i<size;i++)differences+=copied.bytes[i]!==((i*37+(i>>>8))%256);
    cases.push({size,offset,kind,differences,byteLength:constructed.byteLength,timestamp:copied.timestamp,duration:copied.duration});
   }
   for(const size of [1024,16384,65536])measurements.push({size,iterations:2000,...await request({operation:'measure',size,iterations:2000})});
   return {cases,measurements};
  }finally{worker.terminate();}
 }));
 for(const item of result.cases){assert.equal(item.differences,0);assert.equal(item.byteLength,item.size);assert.equal(item.timestamp,-33333);assert.equal(item.duration,33333);}result.passed=true;
}catch(error){result.error=String(error.stack);process.exitCode=1;console.error(error);}
finally{if(origin)result.assets=await(await fetch(origin+'/__metadata')).json();await browser?.close();server.kill();await writeFile(out+'/result.json',JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify({passed:result.passed,cases:result.cases?.length}));}
