// Snapshot-backed experiment mounts reach nested workers without DevTools routing.
import http from 'node:http';
import {readFile,stat,mkdir,writeFile} from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';
import assert from 'node:assert/strict';
const root=path.resolve(import.meta.dirname,'../..');
const configuration=JSON.parse(await readFile(process.argv[2]));
const mounts=Object.create(null),metadata=Object.create(null);
const snapshotRoot=path.join(root,'build/playback-performance/assets');await mkdir(snapshotRoot,{recursive:true});
const types={'.html':'text/html','.js':'text/javascript','.mjs':'text/javascript','.wasm':'application/wasm','.json':'application/json','.css':'text/css','.ttf':'font/ttf','.mkv':'video/x-matroska','.mp4':'video/mp4','.webm':'video/webm'};
for(const [name,files] of Object.entries(configuration)){
 assert.match(name,/^[a-z][a-z0-9-]*$/);mounts[name]={};metadata[name]={};
 for(const [asset,source] of Object.entries(files)){
  assert.ok(asset.startsWith('web/')||asset.startsWith('fixtures/'));assert.equal(path.posix.normalize(asset),asset);
  const file=path.resolve(root,source);assert.ok(file.startsWith(root+path.sep));
  const body=await readFile(file);mounts[name][asset]=body;
  const sha256=createHash('sha256').update(body).digest('hex'),snapshotFile=path.join(snapshotRoot,sha256+path.extname(asset));
  try{await writeFile(snapshotFile,body,{flag:'wx'});}catch(error){if(error.code!=='EEXIST')throw error;assert.equal(createHash('sha256').update(await readFile(snapshotFile)).digest('hex'),sha256);}
  metadata[name][asset]={sha256,bytes:body.length,hits:0,source,snapshotFile:path.relative(root,snapshotFile)};
 }
}
const server=http.createServer(async(req,res)=>{
 res.setHeader('Cross-Origin-Opener-Policy','same-origin');res.setHeader('Cross-Origin-Embedder-Policy','require-corp');res.setHeader('Cross-Origin-Resource-Policy','same-origin');res.setHeader('Cache-Control','no-store');
 try{
  const pathname=decodeURIComponent(new URL(req.url,'http://localhost').pathname);
  if(pathname==='/__metadata'){res.setHeader('Content-Type','application/json');res.end(JSON.stringify(metadata));return;}
  const parts=pathname.slice(1).split('/');
  const useDefault=process.env.DEFAULT_MOUNT&&(pathname==='/'||pathname.startsWith('/web/')||pathname.startsWith('/fixtures/'));
  const name=useDefault?process.env.DEFAULT_MOUNT:parts.shift();
  const asset=useDefault?(pathname==='/'?'web/player.html':pathname.slice(1)):parts.join('/');
  if(!mounts[name]||!(asset.startsWith('web/')||asset.startsWith('fixtures/'))){res.writeHead(404).end();return;}
  const file=path.resolve(root,asset),mount=path.join(root,asset.split('/')[0]);
  if(!file.startsWith(mount+path.sep)){res.writeHead(403).end();return;}
  let body=mounts[name][asset];
  if(body){metadata[name][asset].hits++;}else{const info=await stat(file);if(!info.isFile()){res.writeHead(404).end();return;}body=await readFile(file);}
  res.setHeader('Content-Type',types[path.extname(asset)]||'application/octet-stream');res.setHeader('Content-Length',body.length);res.end(req.method==='HEAD'?undefined:body);
 }catch{res.writeHead(404).end('Not found');}
});
server.listen(Number(process.env.PORT||0),'127.0.0.1',()=>console.log(`webmpv performance: http://127.0.0.1:${server.address().port}`));
