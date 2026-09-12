import {chromium,firefox} from 'playwright';
import http from 'node:http';
import path from 'node:path';
import assert from 'node:assert/strict';
import {mkdtemp,readFile,writeFile,mkdir,stat} from 'node:fs/promises';
import {createReadStream} from 'node:fs';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
const family=process.env.BROWSER||'chrome',archive=path.resolve(process.env.BETA_ARCHIVE||'build/beta/webmpv-0.3.0-beta.2.tgz');
await mkdir('build/streaming-consumers',{recursive:true});
const root=await mkdtemp(path.resolve('build/streaming-consumers/run-'));
execFileSync('tar',['-xzf',archive,'-C',root]);
const assets=path.join(root,'package'),manifest=JSON.parse(await readFile(path.join(assets,'release-manifest.json')));
for(const [name,expected]of Object.entries(manifest.files))assert.equal(createHash('sha256').update(await readFile(path.join(assets,name))).digest('hex'),expected.sha256,name);
const media=path.resolve(process.env.STREAMING_FIXTURE||'build/fixtures/playback-performance/bbb-stream.mp4'),size=(await stat(media)).size;
const delay=ms=>new Promise(r=>setTimeout(r,ms));
let state;
const server=http.createServer(async(req,res)=>{
 for(const [k,v]of Object.entries({'Cross-Origin-Opener-Policy':'same-origin','Cross-Origin-Embedder-Policy':'require-corp','Cross-Origin-Resource-Policy':'same-origin','Cache-Control':'no-store'}))res.setHeader(k,v);
 try{
  const u=new URL(req.url,'http://localhost');
  if(u.pathname==='/'){res.setHeader('Content-Type','text/html');res.end('<!doctype html><div id="host"></div><script type="module">import{Player}from"/vendor/index.js";window.Player=Player;</script>');return;}
  if(u.pathname==='/media.mp4'){
   const current=state,m=/^bytes=(\d+)-(\d*)$/.exec(req.headers.range||'');
   if(!m){res.writeHead(400).end();return;}
   const start=Number(m[1]),end=Math.min(size-1,m[2]?Number(m[2]):size-1);
   let complete=false;const slow=current.mode!=='normal';
   current.requests++;if(slow){current.slowRequests++;current.startedAt??=Date.now();}
   res.on('close',()=>{if(!complete&&slow)current.aborts++;});
   res.writeHead(206,{'Content-Type':'video/mp4','Content-Range':`bytes ${start}-${end}/${size}`,'Content-Length':end-start+1,ETag:'"streaming-fixture-v1"'});
   const stream=createReadStream(media,{start,end,highWaterMark:slow?(current.mode==='deadline'?1024:32768):65536});res.on('close',()=>stream.destroy());
   for await(const chunk of stream){
    if(slow&&current.mode!=='normal')await delay(current.mode==='deadline'?100:250);
    if(res.destroyed)break;res.write(chunk);if(slow)current.progress+=chunk.length;
   }
   if(!res.destroyed){complete=true;if(slow)current.completed++;res.end();}return;
  }
  const file=path.resolve(assets,u.pathname.slice('/vendor/'.length));
  if(!u.pathname.startsWith('/vendor/')||!file.startsWith(assets+path.sep)){res.writeHead(404).end();return;}
  res.setHeader('Content-Type',file.endsWith('.wasm')?'application/wasm':/\.m?js$/.test(file)?'text/javascript':'application/octet-stream');res.end(await readFile(file));
 }catch(e){if(!res.destroyed){if(!res.headersSent)res.writeHead(500);res.end(String(e));}}
});
await new Promise(r=>server.listen(0,'127.0.0.1',r));const origin=`http://127.0.0.1:${server.address().port}`;
const browser=await({chrome:chromium,firefox})[family].launch({headless:true,...(family==='chrome'?{channel:'chrome',args:['--autoplay-policy=no-user-gesture-required']}:{})});
const out=`results/beta/streaming-${family}-${new Date().toISOString().replaceAll(':','-')}`;await mkdir(out,{recursive:true});console.log(out);
const fixtureHash=createHash('sha256');for await(const bytes of createReadStream(media))fixtureHash.update(bytes);
const result={testHarnessSHA256:createHash('sha256').update(await readFile(import.meta.filename)).digest('hex'),archiveSHA256:createHash('sha256').update(await readFile(archive)).digest('hex'),sourceCommit:manifest.sourceCommit,browser:browser.version(),family,fixture:{bytes:size,sha256:fixtureHash.digest('hex')},cases:[]};
async function until(fn,ms=5000){const end=Date.now()+ms;while(!fn()){if(Date.now()>end)throw Error('Server progress deadline exceeded');await delay(25);}}
try{
 for(const mode of ['hybrid','software'])for(const scenario of ['seek-completes-packet','seek-deadline','destroy-progress']){
  const name=mode+':'+scenario;if(process.env.CASES&&!process.env.CASES.split(',').includes(name))continue;
  state={mode:'normal',requests:0,slowRequests:0,progress:0,aborts:0,completed:0};
  const r={name,server:state};result.cases.push(r);const page=await browser.newPage();page.setDefaultTimeout(30000);
  try{
   await page.goto(origin);await page.waitForFunction(()=>window.Player);
   await page.evaluate(async mode=>{window.errors=[];window.player=new Player(document.querySelector('#host'),{mode,width:640,height:360});player.addEventListener('error',e=>errors.push(String(e.detail?.message||e.detail)));await player.openRemote({url:location.origin+'/media.mp4'});await player.play();},mode);
   await page.waitForFunction(()=>Number(player.properties.get('time-pos'))>.2);await page.evaluate(()=>player.pause());
   r.before=await page.evaluate(()=>player.diagnostics.backend);
   state.mode=scenario==='seek-completes-packet'?'slow':'deadline';
   await page.evaluate(()=>{window.firstSeek=player.seek(500).catch(e=>errors.push(String(e)));});
   await until(()=>state.progress>0);await page.waitForFunction(()=>player.diagnostics?.backend?.ioPending);
   const began=Date.now();
   if(scenario==='destroy-progress'){
    await page.evaluate(()=>player.destroy());r.destroyMs=Date.now()-began;assert.ok(r.destroyMs<5000);
    await until(()=>state.aborts>0);await page.waitForTimeout(200);assert.equal(page.workers().length,0);
   }else{
    await page.evaluate(()=>{window.secondSeek=player.seek(40).catch(e=>errors.push(String(e)));});
    if(scenario==='seek-completes-packet'){
     await delay(750);assert.equal(state.aborts,0,'seeking must not abort the active packet read');
     state.mode='normal';await page.waitForFunction(()=>!player.diagnostics?.backend?.seeking&&Math.abs(player.diagnostics?.backend?.presentedPosition-40)<.3);
     assert.ok(state.completed>0);assert.equal(state.aborts,0);assert.deepEqual(await page.evaluate(()=>errors),[]);
     await page.evaluate(()=>player.play());await page.waitForFunction(()=>player.properties.get('time-pos')>40.3);
    }else{
     await page.waitForFunction(()=>errors.some(e=>e.includes('Media read retry deadline exceeded')),{},{timeout:18000});
     r.deadlineMs=Date.now()-state.startedAt;assert.ok(r.deadlineMs>=14000&&r.deadlineMs<18000);
     assert.ok(state.progress>1024,'successful progress continued before deadline');assert.ok(state.aborts>0);
    }
    r.after=await page.evaluate(()=>({diagnostics:player.diagnostics.backend,errors}));
    assert.equal(r.after.diagnostics.interruptions,r.before.interruptions,'seek must not use the old interrupt hook');
    await page.evaluate(()=>player.destroy());await page.waitForTimeout(200);assert.equal(page.workers().length,0);
   }
   r.passed=true;console.log('PASS',name);
  }catch(e){r.error=String(e.stack);r.state=await page.evaluate(()=>({diagnostics:window.player?.diagnostics,errors:window.errors})).catch(()=>null);process.exitCode=1;console.log('FAIL',name,r.error);}
  finally{await page.evaluate(()=>window.player?.destroy()).catch(()=>{});await page.close();await writeFile(out+'/result.json',JSON.stringify(result,null,2)+'\n');}
 }
}finally{await browser.close();server.closeAllConnections();await new Promise(r=>server.close(r));result.passed=result.cases.length>0&&result.cases.every(r=>r.passed);await writeFile(out+'/result.json',JSON.stringify(result,null,2)+'\n');}
