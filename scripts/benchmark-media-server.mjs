// Benchmark-only origin supporting ordinary browser open-ended/suffix ranges.
// The production range broker and original qualification origin stay unchanged.
import http from 'node:http';
import {createReadStream} from 'node:fs';
import {stat} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {setTimeout as delay} from 'node:timers/promises';
import {pathToFileURL} from 'node:url';
import path from 'node:path';

export async function createBenchmarkServer({file,mbps=10,rtt=80}){
 const identity=await stat(file),hash=createHash('sha256');
 for await(const bytes of createReadStream(file))hash.update(bytes);
 const etag=`"${hash.digest('hex')}"`,states=new Map();
 return http.createServer(async(req,res)=>{
  const url=new URL(req.url,'http://localhost'),id=url.searchParams.get('id')||'default';
  if(!states.has(id))states.set(id,{mbps,rtt,requests:0,bytes:0,active:0,peakActive:0,aborted:0,ranges:[]});
  const state=states.get(id);
  res.setHeader('Access-Control-Allow-Origin','http://127.0.0.1:4179');
  res.setHeader('Access-Control-Allow-Headers','Range, If-Range');
  res.setHeader('Access-Control-Allow-Methods','GET, HEAD, OPTIONS');
  res.setHeader('Access-Control-Expose-Headers','Content-Range, ETag, Accept-Ranges');
  res.setHeader('Cross-Origin-Resource-Policy','cross-origin');
  res.setHeader('Cache-Control','no-store');
  if(req.method==='OPTIONS'){res.writeHead(204).end();return;}
  if(url.pathname==='/control'){res.setHeader('Content-Type','application/json');res.end(JSON.stringify({...state,etag,size:identity.size}));return;}
  if(url.pathname!=='/media'||!['GET','HEAD'].includes(req.method)){res.writeHead(404).end();return;}
  state.requests++;state.active++;state.peakActive=Math.max(state.peakActive,state.active);
  let finished=false;
  res.once('close',()=>{state.active--;if(!finished)state.aborted++;});
  try{
   const current=await stat(file);
   if(res.destroyed)return;
   if(current.size!==identity.size||current.mtimeMs!==identity.mtimeMs)throw Error('Fixture changed after identity calculation');
   let start=0,end=identity.size-1,partial=false;
   if(req.headers.range&&(!req.headers['if-range']||req.headers['if-range']===etag)){
    const match=/^bytes=(\d*)-(\d*)$/.exec(req.headers.range);
    if(!match||(!match[1]&&!match[2])){finished=true;res.writeHead(416,{'Content-Range':`bytes */${identity.size}`}).end();return;}
    if(!match[1]){const length=Number(match[2]);start=Math.max(0,identity.size-length);if(length===0)start=identity.size;}
    else{start=Number(match[1]);if(match[2])end=Math.min(Number(match[2]),end);}
    if(!Number.isSafeInteger(start)||!Number.isSafeInteger(end)||start>end||start>=identity.size){finished=true;res.writeHead(416,{'Content-Range':`bytes */${identity.size}`}).end();return;}
    partial=true;
   }
   if(state.ranges.length<10000)state.ranges.push({start,end,partial});
   await delay(rtt);if(res.destroyed)return;
   res.writeHead(partial?206:200,{'Content-Type':'video/mp4','Content-Length':end-start+1,'Accept-Ranges':'bytes','ETag':etag,...(partial?{'Content-Range':`bytes ${start}-${end}/${identity.size}`}:{})});
   if(req.method==='HEAD'){finished=true;res.end();return;}
   for await(const chunk of createReadStream(file,{start,end,highWaterMark:32768})){
    if(res.destroyed)return;
    // One shared pacing clock per trial prevents concurrent browser requests
    // from multiplying the aggregate bandwidth allocation.
    state.nextSendAt=Math.max(Date.now(),state.nextSendAt||0)+chunk.length*8/(mbps*1000);
    await delay(Math.max(0,state.nextSendAt-Date.now()));if(res.destroyed)return;
    state.bytes+=chunk.length;
    if(!res.write(chunk))await new Promise(resolve=>{
     const done=()=>{res.off('drain',done);res.off('close',done);resolve();};res.once('drain',done);res.once('close',done);
    });
   }
   finished=true;res.end();
  }catch(error){if(!res.headersSent)res.writeHead(500);res.end();console.error(error.message);}
 });
}
if(process.argv[1]&&import.meta.url===pathToFileURL(path.resolve(process.argv[1])).href){
 const file=path.resolve('build/fixtures/front.mp4');
 const server=await createBenchmarkServer({file});
 server.listen(4183,'127.0.0.1',()=>console.log('Benchmark media: http://127.0.0.1:4183 (10 Mbps, 80 ms RTT)'));
}
