import http from 'node:http';
import {readFile,stat} from 'node:fs/promises';
import path from 'node:path';
const root=path.resolve(import.meta.dirname,'..');
const types={'.html':'text/html','.js':'text/javascript','.mjs':'text/javascript','.wasm':'application/wasm','.json':'application/json','.css':'text/css','.ttf':'font/ttf','.mkv':'video/x-matroska'};
const server=http.createServer(async(req,res)=>{
  res.setHeader('Cross-Origin-Opener-Policy','same-origin');
  res.setHeader('Cross-Origin-Embedder-Policy','require-corp');
  res.setHeader('Cross-Origin-Resource-Policy','same-origin');
  res.setHeader('Cache-Control','no-store');
  try {
    const pathname=decodeURIComponent(new URL(req.url,'http://localhost').pathname);
    if(pathname==='/favicon.ico'){res.writeHead(204).end();return;}
    if(!pathname.startsWith('/web/')&&!pathname.startsWith('/fixtures/')&&pathname!=='/') {res.writeHead(404).end();return;}
    const file=path.resolve(root,'.'+(pathname==='/'?'/web/player.html':pathname));
    const mount=path.join(root,pathname==='/'?'web':pathname.split('/')[1]);
    if(!file.startsWith(mount+path.sep)) {res.writeHead(403).end();return;}
    const info=await stat(file);
    if(!info.isFile()) {res.writeHead(404).end();return;}
    res.setHeader('Content-Type',types[path.extname(file)]||'application/octet-stream');
    res.end(await readFile(file));
  } catch {res.writeHead(404).end('Not found');}
});
server.listen(Number(process.env.PORT||4179),'127.0.0.1',()=>console.log(`webmpv: http://127.0.0.1:${server.address().port}`));
