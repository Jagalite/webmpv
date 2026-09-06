import http from 'node:http';
import {createReadStream} from 'node:fs';
import {stat} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {once} from 'node:events';
import path from 'node:path';
const root=path.resolve(import.meta.dirname,'..');
const files=new Map(Object.entries({m0:path.join(root,'fixtures/m0.mkv'),user:process.env.WEBMPV_TEST_MEDIA||'/Users/jagatranvo/Downloads/full_subs_test.mkv',front:path.join(root,'build/fixtures/front.mp4'),tail:path.join(root,'build/fixtures/tail.mp4'),tracks:path.join(root,'build/fixtures/tracks.mkv'),vfr:path.join(root,'build/fixtures/vfr.mkv')}));
const states=new Map(),representations=new Map();
const delay=ms=>new Promise(resolve=>setTimeout(resolve,ms));
function state(id){if(!states.has(id))states.set(id,{requests:0,bytes:0,ranges:[],aborted:0,mode:'normal',stall:false,rtt:0,mbps:0});return states.get(id);}
async function metadata(file){const info=await stat(file);const key=`${file}:${info.size}:${info.mtimeMs}`;if(!representations.has(key)){const hash=createHash('sha256');for await(const bytes of createReadStream(file))hash.update(bytes);representations.set(key,{size:info.size,etag:`"${hash.digest('hex')}"`});}return representations.get(key);}
const allowed=new Set(['http://127.0.0.1:4179','http://localhost:4179']);
function server(port){return http.createServer(async(req,res)=>{
  const url=new URL(req.url,`http://127.0.0.1:${port}`),origin=req.headers.origin;
  const s=state(url.searchParams.get('id')||'default');
  res.setHeader('Cross-Origin-Resource-Policy','cross-origin');res.setHeader('Cache-Control','no-store');
  if(origin&&allowed.has(origin)&&s.mode!=='cors-denied'){
    res.setHeader('Access-Control-Allow-Origin',origin);res.setHeader('Vary','Origin');res.setHeader('Access-Control-Allow-Credentials','true');
    res.setHeader('Access-Control-Expose-Headers','Content-Range, ETag, Accept-Ranges, Retry-After, Content-Encoding');
  }
  if(req.method==='OPTIONS'){res.setHeader('Access-Control-Allow-Headers','Authorization, Range, If-Range, X-Test');res.setHeader('Access-Control-Allow-Methods','GET, POST, OPTIONS');res.writeHead(204).end();return;}
  try{
    if(url.pathname==='/control'){
      if(req.method==='POST'){let body='';for await(const part of req){body+=part;if(body.length>8192)throw Error('Control too large');}Object.assign(s,JSON.parse(body));}
      res.setHeader('Content-Type','application/json');res.end(JSON.stringify(s));return;
    }
    const name=url.pathname.split('/').at(-1),virtual=name==='large',file=files.get(name);
    if(!file&&!virtual){res.writeHead(404).end();return;}
    const meta=virtual?{size:8589934765,etag:'"virtual-v1"'}:await metadata(file);
    s.requests++;
    if(s.mode==='forbidden'){res.writeHead(403).end();return;}
    if(s.mode==='auth'&&req.headers.authorization!=='Bearer current'){res.writeHead(401).end();return;}
    if(s.mode==='cookie'&&!req.headers.cookie?.includes('webmpv=ok')){res.writeHead(401).end();return;}
    if(s.mode==='redirect'){res.writeHead(302,{Location:`http://127.0.0.1:4181/media/${name}`}).end();return;}
    if(s.mode==='retry'&&s.requests<=2){res.writeHead(503,{'Retry-After':'0'}).end();return;}
    if(s.setCookie)res.setHeader('Set-Cookie','webmpv=ok; SameSite=Lax; Path=/');
    const m=/^bytes=(\d+)-(\d+)$/.exec(req.headers.range||'');
    if(!m){res.writeHead(400).end();return;}
    let start=Number(m[1]),end=Math.min(Number(m[2]),meta.size-1);
    if(!Number.isSafeInteger(start)||!Number.isSafeInteger(end)||end-start>262143){res.writeHead(400).end();return;}
    if(start>=meta.size){res.writeHead(416,{'Content-Range':`bytes */${meta.size}`}).end();return;}
    if(s.ranges.length<1000)s.ranges.push({start,end});
    let completed=false;res.on('close',()=>{if(!completed)s.aborted++;});
    while((s.stall||Date.now()<(s.outageUntil||0))&&!res.destroyed)await delay(25);
    if(res.destroyed)return;
    if(s.rtt)await delay(s.rtt);
    const etag=s.mode==='changed'&&s.requests>1?'"changed"':meta.etag;
    if(s.mode==='ignore-range'||req.headers['if-range']&&req.headers['if-range']!==etag){res.writeHead(200,{'Content-Length':meta.size});res.write(Buffer.alloc(1));return;}
    const length=end-start+1;
    res.writeHead(206,{'Content-Range':`bytes ${s.mode==='bad-range'?start+1:start}-${end}/${meta.size}`,'Content-Length':length,'ETag':etag,'Accept-Ranges':'bytes','Content-Type':'application/octet-stream',...(s.mode==='encoded'?{'Content-Encoding':'gzip'}:{})});
    let sent=0;
    const source=virtual?(async function*(){for(let at=start;at<=end;at+=32768){const b=Buffer.alloc(Math.min(32768,end-at+1));for(let i=0;i<b.length;i++)b[i]=(at+i)%251;yield b;}})():createReadStream(file,{start,end,highWaterMark:32768});
    for await(const chunk of source){
      if(res.destroyed)break;
      if(s.mbps)await delay(chunk.length*8/(s.mbps*1000));
      if(!res.write(chunk))await Promise.race([once(res,'drain'),once(res,'close')]);
      sent+=chunk.length;s.bytes+=chunk.length;
      if(s.mode==='truncate'&&s.requests===1&&sent>=32768){res.destroy();break;}
    }
    completed=sent===length;res.end();
  }catch(error){if(!res.headersSent)res.writeHead(500);res.end();console.error(error.message);}
}).listen(port,'127.0.0.1',()=>console.log(`Media origin: http://127.0.0.1:${port}`));}
server(4180);server(4181);
