// Immutable, bounded-range movie origin for headless performance/endurance tests.
import http from 'node:http';
import {open} from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';
import assert from 'node:assert/strict';
import {Readable} from 'node:stream';
const root=path.resolve(import.meta.dirname,'../..'),source=path.resolve(root,process.env.MEDIA_INPUT||'');
assert.ok(source.startsWith(root+path.sep),'Media must be in the project');
const appOrigin=new URL(process.env.APP_ORIGIN).origin;
const file=await open(source,'r'),identity=await file.stat();assert.ok(identity.isFile()&&identity.size>0);
async function* readRange(start,end){
 for(let position=start;position<=end;){
  const buffer=Buffer.allocUnsafe(Math.min(64*1024,end-position+1));
  const {bytesRead}=await file.read(buffer,0,buffer.length,position);
  if(!bytesRead)throw new Error('Movie was truncated during reading');
  position+=bytesRead;yield buffer.subarray(0,bytesRead);
 }
}
const digest=createHash('sha256');for await(const chunk of readRange(0,identity.size-1))digest.update(chunk);
const stats={source:path.relative(root,source),sha256:digest.digest('hex'),size:identity.size,inode:identity.ino,modified:identity.mtimeMs,requests:0,ranges:0,bytes:0,active:0,peakActive:0,aborted:0};
const active=new Set(),limit=256*1024;
const server=http.createServer((request,response)=>{
 response.setHeader('Access-Control-Allow-Origin',appOrigin);response.setHeader('Access-Control-Expose-Headers','Accept-Ranges,Content-Length,Content-Range,ETag');response.setHeader('Cross-Origin-Resource-Policy','cross-origin');response.setHeader('Cache-Control','no-store');
 if(request.method==='OPTIONS'){response.setHeader('Access-Control-Allow-Methods','GET,HEAD,OPTIONS');response.setHeader('Access-Control-Allow-Headers','Range,If-Range');response.writeHead(204).end();return;}
 if(request.url==='/__stats'){response.setHeader('Content-Type','application/json');response.end(JSON.stringify(stats));return;}
 if(request.url!=='/movie.mp4'||!['GET','HEAD'].includes(request.method)){response.writeHead(404).end();return;}
 stats.requests++;response.setHeader('Content-Type','video/mp4');response.setHeader('Accept-Ranges','bytes');response.setHeader('ETag',`"${stats.sha256}"`);
 let start=0,end=identity.size-1,status=200;
 if(request.headers.range){
  const match=/^bytes=(\d+)-(\d*)$/.exec(request.headers.range);
  if(!match){response.writeHead(416,{'Content-Range':`bytes */${identity.size}`}).end();return;}
  start=Number(match[1]);end=match[2]?Number(match[2]):end;
  if(!Number.isSafeInteger(start)||!Number.isSafeInteger(end)||start>=identity.size||end<start){response.writeHead(416,{'Content-Range':`bytes */${identity.size}`}).end();return;}
  end=Math.min(end,identity.size-1,start+limit-1);status=206;stats.ranges++;response.setHeader('Content-Range',`bytes ${start}-${end}/${identity.size}`);
 }
 response.setHeader('Content-Length',end-start+1);
 if(request.method==='HEAD'){response.writeHead(status).end();return;}
 if(active.size>=8){response.removeHeader('Content-Length');response.writeHead(503).end();return;}
 response.writeHead(status);const stream=Readable.from(readRange(start,end),{objectMode:false,highWaterMark:64*1024});active.add(stream);stats.active=active.size;stats.peakActive=Math.max(stats.peakActive,stats.active);let ended=false;
 stream.on('data',chunk=>stats.bytes+=chunk.length);stream.once('end',()=>ended=true);stream.once('error',error=>response.destroy(error));
 response.once('close',()=>{if(!ended)stats.aborted++;stream.destroy();active.delete(stream);stats.active=active.size;});stream.pipe(response);
});
server.listen(0,'127.0.0.1',()=>console.log(`webmpv movie: http://127.0.0.1:${server.address().port}`));
process.on('SIGTERM',()=>{for(const stream of active)stream.destroy();server.closeAllConnections();server.close(()=>void file.close().finally(()=>process.exit(0)));});
