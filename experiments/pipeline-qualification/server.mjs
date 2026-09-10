import http from 'node:http';
import path from 'node:path';
import {readFile,stat} from 'node:fs/promises';
import {createReadStream} from 'node:fs';
export async function serve({pagePath='experiments/pipeline-qualification/page.html',mediaPaths={}}={}){
 const root=process.cwd(),cache=new Map(),states=new Map();
 const media={movie:'build/fixtures/playback-performance/bbb-stream.mp4',mkv:'build/pipeline-separation/fixtures/movie.mkv',tail:'build/pipeline-separation/fixtures/tail.mp4',sample:'build/hybrid-performance/sample.mp4',animated:'build/fixtures/tracks.mkv',ass:'build/fixtures/playback-performance/sample-ass.mkv',long:'build/pipeline-separation/fixtures/long.mp4',ts:'build/pipeline-separation/fixtures/config-0.ts',config:'build/pipeline-separation/fixtures/config.ts',offset:'build/pipeline-separation/fixtures/offset.mkv',rotation:'build/pipeline-separation/fixtures/rotation.mp4',sar:'build/pipeline-separation/fixtures/sar.mp4',tenbit:'build/fixtures/playback-performance/h264-10bit.mkv',bt601:'build/fixtures/playback-performance/h264-consistent-601.mp4',bt709:'build/fixtures/playback-performance/h264-consistent-709.mp4'};
 for(const name of ['color-bt709-0','color-bt709-1','color-smpte170m-0','color-smpte170m-1','sync'])media[name]='build/pipeline-qualification/fixtures/'+name+(name==='sync'?'.mp4':'-v2.mkv');
 media.longts='build/pipeline-qualification/fixtures/long.ts';media.edit='build/pipeline-qualification/fixtures/edit.mp4';media.syncmkv='build/pipeline-qualification/fixtures/sync.mkv';media.offsetmp4='build/pipeline-qualification/fixtures/offset.mp4';
 Object.assign(media,mediaPaths);
 const server=http.createServer(async(req,res)=>{
  res.setHeader('Cross-Origin-Opener-Policy','same-origin');res.setHeader('Cross-Origin-Embedder-Policy','require-corp');res.setHeader('Cross-Origin-Resource-Policy','same-origin');res.setHeader('Cache-Control','no-store');
  try{
   const u=new URL(req.url,'http://localhost');if(u.searchParams.get('cors')==='allow'){res.setHeader('Access-Control-Allow-Origin',req.headers.origin||'*');res.setHeader('Access-Control-Allow-Headers','Authorization, Range, If-Range');res.setHeader('Access-Control-Expose-Headers','Content-Range, ETag, Content-Length');if(req.method==='OPTIONS'){res.writeHead(204).end();return;}}
   if(u.pathname==='/stats'){res.setHeader('Content-Type','application/json');res.end(JSON.stringify(Object.fromEntries(states)));return;}
   if(u.pathname.startsWith('/media/')){
    const name=u.pathname.split('/')[2],f=media[name];if(!f){res.writeHead(404).end();return;}
    const id=u.searchParams.get('id')||'default';if(!states.has(id))states.set(id,{bytes:0,requests:0,active:0,aborted:0,ranges:[]});const state=states.get(id);
    const info=await stat(f);let a=0,b=info.size-1,code=200;
    if(req.headers.range){const m=/^bytes=(\d+)-(\d*)$/.exec(req.headers.range);if(!m){res.writeHead(416).end();return;}a=Number(m[1]);if(m[2])b=Math.min(b,Number(m[2]));if(a>b){res.writeHead(416).end();return;}code=206;res.setHeader('Content-Range',`bytes ${a}-${b}/${info.size}`);}
    state.requests++;state.ranges.push({a,b});state.active++;let done=false;
    res.on('close',()=>{state.active--;if(!done)state.aborted++;});
    if(u.searchParams.has('auth')&&state.requests>1&&req.headers.authorization!=='Bearer refreshed'){res.writeHead(401).end();return;}
    if(u.searchParams.get('retry')==='1'&&state.requests===2){res.writeHead(503).end();return;}
    if(u.searchParams.has('delay'))await new Promise(r=>setTimeout(r,Number(u.searchParams.get('delay'))));
    res.writeHead(code,{'Content-Type':f.endsWith('.mkv')?'video/x-matroska':f.endsWith('.ts')?'video/mp2t':'video/mp4','Content-Length':b-a+1,'Accept-Ranges':'bytes','ETag':u.searchParams.has('changed')&&state.requests>2?'"changed-source"':`"${info.size}-${info.mtimeMs}"`});
    if(u.searchParams.has('truncate')&&state.requests===Number(u.searchParams.get('truncate')||2)){const bytes=(await readFile(f)).subarray(a,a+Math.min(4096,b-a+1));res.write(bytes);setTimeout(()=>res.destroy(),20);return;}
    const stream=createReadStream(f,{start:a,end:b,highWaterMark:65536});res.on('close',()=>stream.destroy());stream.on('data',v=>state.bytes+=v.length);stream.on('end',()=>done=true);stream.pipe(res);return;
   }
   let file;
   if(u.pathname==='/experiment/page.html')file=pagePath;
   else if(u.pathname.startsWith('/experiment/remux-engine/'))file='build/pipeline-qualification/remux/'+u.pathname.split('/').at(-1);
   else if(u.pathname.startsWith('/experiment/yuv-engine/'))file='build/pipeline-qualification/yuv/'+u.pathname.split('/').at(-1);
   else if(u.pathname.startsWith('/experiment/'))file='experiments/pipeline-qualification/'+u.pathname.slice('/experiment/'.length);
   else{
    const match=/^\/(baseline|yuv|native|hybrid)\/(web|fixtures)\/(.*)$/.exec(u.pathname);
    if(match){file=match[2]+'/'+match[3];if(match[1]==='yuv'&&file==='web/io-worker.js')file='experiments/pipeline-qualification/io-worker.js';if(match[1]==='yuv'&&file==='web/software-full-engine-worker.js')file='build/pipeline-qualification/yuv/worker.js';}
    else if(u.pathname.startsWith('/web/')||u.pathname.startsWith('/fixtures/'))file=u.pathname.slice(1);
    else {res.writeHead(404).end();return;}
   }
   file=path.resolve(root,file);if(!file.startsWith(root+path.sep)){res.writeHead(403).end();return;}
   if(!cache.has(file))cache.set(file,await readFile(file));
   const types={'.html':'text/html','.js':'text/javascript','.mjs':'text/javascript','.wasm':'application/wasm','.ttf':'font/ttf'};res.setHeader('Content-Type',types[path.extname(file)]||'application/octet-stream');res.end(cache.get(file));
  }catch(e){if(!res.headersSent)res.writeHead(500);res.end(String(e));}
 });
 await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(0,'127.0.0.1',resolve);});
 return {origin:`http://127.0.0.1:${server.address().port}`,states,media,close:async()=>{server.closeAllConnections();await new Promise(r=>server.close(r));}};
}
