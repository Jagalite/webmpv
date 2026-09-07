import http from 'node:http';
import path from 'node:path';
import {stat} from 'node:fs/promises';
import {createReadStream} from 'node:fs';
const root=path.resolve(import.meta.dirname,'../build/fixtures/s1'),states=new Map();
const delay=ms=>new Promise(r=>setTimeout(r,ms));
function state(id){if(!states.has(id))states.set(id,{requests:[],aborted:0,active:0});return states.get(id);}
http.createServer(async(req,res)=>{
  const url=new URL(req.url,'http://127.0.0.1:4182');
  res.setHeader('Cross-Origin-Resource-Policy','cross-origin');res.setHeader('Cache-Control','no-store');
  if(req.headers.origin==='http://127.0.0.1:4179'){
    res.setHeader('Access-Control-Allow-Origin',req.headers.origin);res.setHeader('Access-Control-Allow-Credentials','true');
    res.setHeader('Access-Control-Expose-Headers','Content-Range, Content-Length, Content-Encoding');
  }
  if(req.method==='OPTIONS'){res.setHeader('Access-Control-Allow-Headers','Authorization, Range');res.writeHead(204).end();return;}
  try{
    if(url.pathname==='/control'){
      const s=state(url.searchParams.get('id'));
      if(req.method==='POST'){let body='';for await(const part of req){body+=part;if(body.length>8192)throw Error('Control too large');}Object.assign(s,JSON.parse(body));}
      res.setHeader('Content-Type','application/json');res.end(JSON.stringify(s));return;
    }
    const parts=decodeURIComponent(url.pathname).split('/');
    if(parts[1]!=='media'){res.writeHead(404).end();return;}
    const s=state(parts[2]),relative=parts.slice(3).join('/'),file=path.resolve(root,relative);
    if(!file.startsWith(root+path.sep)){res.writeHead(403).end();return;}
    const info=await stat(file);
    // A disconnect can fire while stat is pending, before the body close
    // listener below exists. Do not count an already-closed response as active.
    if(res.destroyed){s.aborted++;return;}
    if(!info.isFile()){res.writeHead(404).end();return;}
    s.requests.push({path:relative,range:req.headers.range??null,authorized:req.headers.authorization==='Bearer current'});
    if(s.requests.length>20000)s.requests.shift();
    if(s.auth&&req.headers.authorization!=='Bearer current'){res.writeHead(401).end();return;}
    if(s.retry>0){s.retry--;res.writeHead(503).end();return;}
    if(s.fail&&relative.includes(s.fail)){res.writeHead(404).end();return;}
    let start=0,end=info.size-1,status=200;
    if(req.headers.range){const match=/^bytes=(\d+)-(\d+)$/.exec(req.headers.range);if(!match)throw Error('Invalid Range');start=Number(match[1]);end=Math.min(Number(match[2]),info.size-1);status=206;if(start>end||end>=info.size){res.writeHead(416).end();return;}res.setHeader('Content-Range',`bytes ${start}-${end}/${info.size}`);}
    s.active++;let completed=false;res.on('close',()=>{s.active--;if(!completed)s.aborted++;});
    while(s.stall&&relative.includes(s.stall)&&!res.destroyed)await delay(20);
    if(res.destroyed)return;
    res.writeHead(status,{'Content-Length':end-start+1,'Content-Type':'application/octet-stream'});
    const input=createReadStream(file,{start,end,highWaterMark:16384});res.on('close',()=>input.destroy());
    for await(const bytes of input){if(res.destroyed)return;res.write(bytes);if(s.slow)await delay(s.slow);}
    completed=true;res.end();
  }catch{if(!res.headersSent)res.writeHead(404);res.end();}
}).listen(4182,'127.0.0.1',()=>console.log('S1 fixture origin: http://127.0.0.1:4182'));
