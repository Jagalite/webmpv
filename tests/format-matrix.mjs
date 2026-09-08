import {chromium} from 'playwright';
import {readFile,writeFile,mkdir,copyFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {spawn} from 'node:child_process';
import assert from 'node:assert/strict';
const manifest=JSON.parse(await readFile('build/fixtures/format-matrix/manifest.json'));
const out=`results/format-matrix/${new Date().toISOString().replaceAll(':','-')}`;await mkdir(out,{recursive:true});console.log(out);
const digest=b=>createHash('sha256').update(b).digest('hex');
const paths=['src/unified-player.ts','src/internal/wasm-player.ts','web/generated/unified-player.js','web/generated/internal/wasm-player.js','web/software-full-engine-worker.js','web/engine-software-full/player.wasm','web/engine-software-full/player.mjs','tests/format-matrix.mjs'];
const hashes=async()=>Object.fromEntries(await Promise.all(paths.map(async p=>[p,digest(await readFile(p))])));
const result={started:new Date().toISOString(),scope:'Generated codec samples through the public Software API in headless Chrome; no performance or all-profile claim',hashes:await hashes(),cases:[]};
await copyFile('build/fixtures/format-matrix/manifest.json',out+'/fixtures.json');
let browser,server;
try{
 server=spawn(process.execPath,['scripts/serve.mjs'],{env:{...process.env,PORT:'0'},stdio:['ignore','pipe','inherit']});
 const origin=await new Promise((resolve,reject)=>{const t=setTimeout(()=>reject(Error('server timeout')),10000);server.once('error',reject);server.stdout.on('data',b=>{const m=/http:\/\/127\.0\.0\.1:\d+/.exec(String(b));if(m){clearTimeout(t);resolve(m[0]);}});});
 browser=await chromium.launch({channel:'chrome',headless:process.env.HEADED!=='1',args:['--autoplay-policy=no-user-gesture-required']});result.browser=browser.version();
 const page=await browser.newPage();await page.addInitScript(()=>{for(const name of ['VideoDecoder','AudioDecoder','VideoFrame','MediaSource'])Object.defineProperty(globalThis,name,{value:undefined,configurable:true});HTMLMediaElement.prototype.play=function(){throw Error('Native playback forbidden in software matrix');};});
 const selection=process.env.ONLY?.split(',');const cases=manifest.cases.filter(c=>!selection||selection.includes(c.codec));result.selection=selection||'all generated fixtures';
 for(const [index,fixture] of cases.entries()){
  const r={file:fixture.file,codec:fixture.codec,kind:fixture.kind,sha256:fixture.sha256,decode:false,seek:false,cleanup:false};const start=Date.now();
  try{
   await page.goto(origin+'/web/example.html');
   await page.evaluate(async({name,n,total})=>{const {Player}=await import('/web/generated/index.js');window.p=new Player(document.querySelector('#surface'),{mode:'software',width:320,height:240});window.logs=[];window.errors=[];p.addEventListener('log',e=>logs.push(e.detail));p.addEventListener('error',e=>errors.push(e.detail));const status=document.querySelector('[role=status]'),start=Date.now();setInterval(()=>{const elapsed=Math.floor((Date.now()-start)/1000);status.textContent=`${n}/${total}: ${name}; ${elapsed}s elapsed; estimated ${Math.max(0,(total-n+1)*2-elapsed)}s left. No foreground hold needed.`;},200);},{name:fixture.file,n:index+1,total:cases.length});
   const bytes=await readFile('build/fixtures/format-matrix/'+fixture.file);assert.equal(digest(bytes),fixture.sha256);
   const evidence=await page.evaluate(async({b,kind,codec})=>{
    const run=async()=>{await p.open(Uint8Array.from(atob(b),c=>c.charCodeAt(0)).buffer);await p.play();const t=performance.now();
     while(performance.now()-t<5000){const a=p.audioDiagnostics(),d=p.diagnostics.backend;if(kind==='V'?d?.rendered>=4:(a.mediaFrames>6000&&a.rms>.001))break;if(errors.length)throw Error(errors.join('; '));await new Promise(r=>setTimeout(r,25));}
     const e={properties:Object.fromEntries(p.properties),diagnostics:p.diagnostics,audio:p.audioDiagnostics()};
     if(kind==='V'){const c=document.createElement('canvas');c.width=320;c.height=240;const ctx=c.getContext('2d');ctx.drawImage(p.surface,0,0);const data=ctx.getImageData(0,0,320,240).data;e.nonblack=0;for(let i=0;i<data.length;i+=4)if(data[i]+data[i+1]+data[i+2]>30)e.nonblack++;}
     return e;};let timer;try{return await Promise.race([run(),new Promise((_,reject)=>timer=setTimeout(()=>reject(Error('Decode deadline exceeded')),10000))]);}finally{clearTimeout(timer);}
   },{b:bytes.toString('base64'),kind:fixture.kind,codec:fixture.codec});
   r.playing=evidence;assert.ok(evidence.properties['track-list'].some(t=>t.codec===fixture.codec||t.codec===fixture.probe.streams[0].codec_name));
   if(fixture.kind==='V'){assert.ok(evidence.diagnostics.backend.rendered>=4,'Multiple frames must be presented');assert.ok(evidence.nonblack>500,'Visible video pixels required');}
   else{assert.ok(evidence.audio.mediaFrames>6000&&evidence.audio.rms>.001,'Non-silent decoded PCM required');}
   r.decode=true;
   r.afterSeek=await page.evaluate(async()=>{await p.pause();await p.seek(.6);await p.play();await new Promise(r=>setTimeout(r,300));return {position:p.properties.get('time-pos'),audio:p.audioDiagnostics(),diagnostics:p.diagnostics};});
   assert.ok(r.afterSeek.position>=.65&&r.afterSeek.position<1.35,'Resumed seek position');r.seek=true;
  }catch(error){r.error=String(error);r.logs=await page.evaluate(()=>logs.slice(-16)).catch(()=>[]);}
  finally{try{await page.evaluate(()=>p.destroy());for(let i=0;i<40&&page.workers().length;i++)await page.waitForTimeout(100);assert.equal(page.workers().length,0);assert.equal(await page.locator('#surface canvas,iframe').count(),0);r.cleanup=true;}catch(error){r.cleanupError=String(error);}r.milliseconds=Date.now()-start;result.cases.push(r);console.log(`${index+1}/${cases.length} ${r.decode&&r.seek&&r.cleanup?'PASS':'GAP'} ${r.file}${r.error?' '+r.error:''}`);await writeFile(out+'/result.json',JSON.stringify(result,null,2)+'\n');}
 }
 result.finished=new Date().toISOString();assert.deepEqual(await hashes(),result.hashes);result.inputsUnchanged=true;
 result.counts={tested:result.cases.length,decode:result.cases.filter(c=>c.decode).length,seek:result.cases.filter(c=>c.seek).length,cleanup:result.cases.filter(c=>c.cleanup).length};console.log(result.counts);if(result.cases.some(c=>!c.decode||!c.seek||!c.cleanup))process.exitCode=1;
}finally{await browser?.close();server?.kill();await writeFile(out+'/result.json',JSON.stringify(result,null,2)+'\n');}
