import http from 'node:http';
import {stat} from 'node:fs/promises';
import {createReadStream} from 'node:fs';
import {createHash} from 'node:crypto';
import path from 'node:path';
const root=path.resolve(import.meta.dirname,'..');
const types={'.html':'text/html','.js':'text/javascript','.mjs':'text/javascript','.wasm':'application/wasm','.json':'application/json','.css':'text/css','.ttf':'font/ttf','.otf':'font/otf','.mkv':'video/x-matroska','.mp4':'video/mp4','.webm':'video/webm','.mp3':'audio/mpeg','.wav':'audio/wav','.flac':'audio/flac','.m3u8':'application/vnd.apple.mpegurl','.mpd':'application/dash+xml','.vtt':'text/vtt'};
const hashes=new Map();
async function etag(file,info){
  const key=`${file}:${info.size}:${info.mtimeMs}:${info.ctimeMs}`;
  if(hashes.has(key))return hashes.get(key);
  const hash=createHash('sha256');
  for await(const chunk of createReadStream(file))hash.update(chunk);
  const value=`"${hash.digest('hex')}"`;
  if(hashes.size>=128)hashes.delete(hashes.keys().next().value);
  hashes.set(key,value);return value;
}
const server=http.createServer(async(req,res)=>{
  res.setHeader('Cross-Origin-Opener-Policy','same-origin');
  res.setHeader('Cross-Origin-Embedder-Policy','require-corp');
  res.setHeader('Cross-Origin-Resource-Policy','same-origin');
  res.setHeader('Cache-Control','no-store');
  try {
    if(!['GET','HEAD'].includes(req.method)){res.writeHead(405,{'Allow':'GET, HEAD'}).end();return;}
    const pathname=decodeURIComponent(new URL(req.url,'http://localhost').pathname);
    if(pathname==='/favicon.ico'){res.writeHead(204).end();return;}
    if(!pathname.startsWith('/web/')&&!pathname.startsWith('/fixtures/')&&pathname!=='/') {res.writeHead(404).end();return;}
    const file=path.resolve(root,'.'+(pathname==='/'?'/web/player.html':pathname));
    const mount=path.join(root,pathname==='/'?'web':pathname.split('/')[1]);
    if(!file.startsWith(mount+path.sep)) {res.writeHead(403).end();return;}
    const info=await stat(file);
    if(!info.isFile()) {res.writeHead(404).end();return;}
    res.setHeader('Content-Type',types[path.extname(file)]||'application/octet-stream');
    res.setHeader('Accept-Ranges','bytes');
    let start=0,end=info.size-1,code=200;
    if(req.headers.range){
      const match=/^bytes=(\d*)-(\d*)$/.exec(req.headers.range);
      if(!match||(!match[1]&&!match[2])){res.writeHead(416,{'Content-Range':`bytes */${info.size}`}).end();return;}
      if(match[1]){start=Number(match[1]);end=match[2]?Math.min(Number(match[2]),end):end;}
      else start=Math.max(0,info.size-Number(match[2]));
      if(!Number.isSafeInteger(start)||!Number.isSafeInteger(end)||start>end||start>=info.size){res.writeHead(416,{'Content-Range':`bytes */${info.size}`}).end();return;}
      const identity=await etag(file,info);
      res.setHeader('ETag',identity);
      if(req.headers['if-range']&&req.headers['if-range']!==identity){start=0;end=info.size-1;}
      else {code=206;res.setHeader('Content-Range',`bytes ${start}-${end}/${info.size}`);}
    }
    res.setHeader('Content-Length',Math.max(0,end-start+1));
    res.writeHead(code);
    if(req.method==='HEAD'||info.size===0){res.end();return;}
    const stream=createReadStream(file,{start,end});
    res.on('close',()=>stream.destroy());
    stream.on('error',()=>res.destroy());
    stream.pipe(res);
  } catch {if(!res.headersSent)res.writeHead(404).end('Not found');else res.destroy();}
});
server.listen(Number(process.env.PORT||4179),'127.0.0.1',()=>console.log(`webmpv: http://127.0.0.1:${server.address().port}`));
