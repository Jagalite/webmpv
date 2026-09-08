import {chromium} from 'playwright';
import assert from 'node:assert/strict';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';
await mkdir('results/m2',{recursive:true});
const browser=await chromium.launch({channel:'chrome',headless:false,ignoreDefaultArgs:['--mute-audio'],args:['--autoplay-policy=no-user-gesture-required']});
const page=await browser.newPage({viewport:{width:1280,height:1100},deviceScaleFactor:2});
await page.addInitScript(()=>{for(const n of ['VideoDecoder','AudioDecoder','VideoFrame','MediaSource'])Object.defineProperty(globalThis,n,{value:undefined,configurable:true});HTMLMediaElement.prototype.play=()=>{throw Error('Native media forbidden');};});
const network={rtt:80,mbps:10};
const logs=[],result={network,started:new Date().toISOString(),tests:[],passed:false};page.on('console',m=>logs.push(m.text()));
async function check(name,fn){const evidence=await fn();result.tests.push({name,evidence,passed:true});console.log('PASS',name);}
async function capture(file){const png=await page.evaluate(()=>{const source=document.querySelector('canvas'),c=document.createElement('canvas');c.width=source.width;c.height=source.height;c.getContext('2d').drawImage(source,0,0);return c.toDataURL('image/png').split(',')[1];});await writeFile(file,Buffer.from(png,'base64'));return png;}
async function compareImages(on,off,refOn,refOff,width=1920,height=1080){return await page.evaluate(async({on,off,refOn,refOff,width,height})=>{
   async function pixels(base64){const blob=await(await fetch('data:image/png;base64,'+base64)).blob(),bitmap=await createImageBitmap(blob),c=document.createElement('canvas');c.width=bitmap.width;c.height=bitmap.height;const x=c.getContext('2d');x.drawImage(bitmap,0,0);bitmap.close();return x.getImageData(0,0,c.width,c.height).data;}
   const [a,b,c,d]=await Promise.all([on,off,refOn,refOff].map(pixels));const w=width,h=height;
   function mask(on,off){const m=new Uint8Array(w*h);for(let i=0;i<m.length;i++){const at=i*4;m[i]=Math.max(Math.abs(on[at]-off[at]),Math.abs(on[at+1]-off[at+1]),Math.abs(on[at+2]-off[at+2]))>=12;}return m;}
   const actual=mask(a,b),reference=mask(c,d);
   function near(mask,x,y){for(let dy=-3;dy<=3;dy++)for(let dx=-3;dx<=3;dx++){const xx=x+dx,yy=y+dy;if(xx>=0&&xx<w&&yy>=0&&yy<h&&mask[yy*w+xx])return true;}return false;}
   return [[0,0,1920,300,'karaoke'],[700,400,1250,700,'vectors and overlap'],[0,850,1920,1080,'shaping and accents']].map(([x0,y0,x1,y1,name])=>{x0=Math.floor(x0*w/1920);x1=Math.floor(x1*w/1920);y0=Math.floor(y0*h/1080);y1=Math.floor(y1*h/1080);let n=0,r=0,matched=0,covered=0;for(let y=y0;y<y1;y++)for(let x=x0;x<x1;x++){if(actual[y*w+x]){n++;if(near(reference,x,y))matched++;}if(reference[y*w+x]){r++;if(near(actual,x,y))covered++;}}return {name,pixels:n,referencePixels:r,precision:matched/n,recall:covered/r};});
  },{on,off,refOn,refOff,width,height});}

try{
 await page.goto('http://127.0.0.1:4179/web/index.html?no-codecs');await page.waitForFunction(()=>typeof createPlayer==='function');
 for(const id of ['m2-reference','m2-close-pending','m2-karaoke'])await fetch(`http://127.0.0.1:4180/control?id=${id}`,{method:'POST',body:JSON.stringify({...network,mode:'normal',stall:false,outageUntil:0})});
 await check('attached ASS shaping, karaoke, vectors and overlap match native reference at DPR 2',async()=>{
  await page.evaluate(async()=>{await createPlayer();player.resize(1920,1080);await player.openRemote({url:'http://127.0.0.1:4180/media/tracks?id=m2-reference'});await player.selectTrack('sub','2');await player.seek(5);});
  await page.waitForFunction(()=>!player.diagnostics?.seeking&&Math.abs(player.diagnostics?.presentedPosition-5)<.2,{},{timeout:20000});await page.waitForTimeout(300);
  const on=await capture('results/m2/ass-on.png');await page.evaluate(()=>player.subtitleVisible(false));await page.waitForTimeout(300);const off=await capture('results/m2/ass-off.png');
  const refOn=(await readFile('build/reference-on/00000001.png')).toString('base64'),refOff=(await readFile('build/reference-off/00000001.png')).toString('base64');
  const comparison=await compareImages(on,off,refOn,refOff);
  for(const area of comparison){assert.ok(area.pixels>500,JSON.stringify(area));assert.ok(area.precision>=.95&&area.recall>=.95,JSON.stringify(area));}
  await page.evaluate(()=>player.subtitleVisible(true));await page.waitForTimeout(300);await page.evaluate(()=>player.resize(1280,720));await page.waitForTimeout(300);const resized=await capture('results/m2/ass-dpr2-resized.png');await page.evaluate(()=>player.subtitleVisible(false));await page.waitForTimeout(300);const resizedOff=await capture('results/m2/ass-dpr2-resized-off.png');
  const resizedRefOn=(await readFile('build/reference-720-on/00000001.png')).toString('base64'),resizedRefOff=(await readFile('build/reference-720-off/00000001.png')).toString('base64');const resizedComparison=await compareImages(resized,resizedOff,resizedRefOn,resizedRefOff,1280,720);for(const area of resizedComparison)assert.ok(area.pixels>200&&area.precision>=.95&&area.recall>=.95,JSON.stringify(area));
  await page.evaluate(()=>player.destroy());return {comparison,resizedComparison,deviceScaleFactor:2,tolerance:'RGB delta >=12; 3-pixel edge tolerance; each region precision and recall >=95%'};
 });
 await check('karaoke highlight advances at the reference timestamps',async()=>{
  await page.evaluate(async()=>{await createPlayer();player.resize(1920,1080);await player.openRemote({url:'http://127.0.0.1:4180/media/tracks?id=m2-karaoke'});await player.selectTrack('sub','2');});const phases=[];
  for(const [position,label] of [[2.25,'225'],[3.25,'325']]){
   await page.evaluate(async position=>{await player.subtitleVisible(true);await player.seek(position);},position);await page.waitForFunction(position=>!player.diagnostics?.seeking&&Math.abs(player.diagnostics?.presentedPosition-position)<.05&&Math.abs(player.properties.get('time-pos')-position)<.05,position);await page.waitForTimeout(200);
   const on=await capture(`results/m2/karaoke-${label}-on.png`);await page.evaluate(()=>player.subtitleVisible(false));await page.waitForTimeout(250);const off=await capture(`results/m2/karaoke-${label}-off.png`);
   const refOn=(await readFile(`build/reference-karaoke-${label}-on/00000001.png`)).toString('base64'),refOff=(await readFile(`build/reference-karaoke-${label}-off/00000001.png`)).toString('base64');
   const colors=await page.evaluate(async images=>{async function pixels(base64){const bitmap=await createImageBitmap(await(await fetch('data:image/png;base64,'+base64)).blob()),c=document.createElement('canvas');c.width=bitmap.width;c.height=bitmap.height;const x=c.getContext('2d');x.drawImage(bitmap,0,0);bitmap.close();return x.getImageData(0,0,c.width,c.height).data;}const [on,off,refOn,refOff]=await Promise.all(images.map(pixels));function count(a,b){let yellow=0,red=0;for(let y=70;y<240;y++)for(let x=650;x<1250;x++){const i=(y*1920+x)*4;if(Math.max(Math.abs(refOn[i]-refOff[i]),Math.abs(refOn[i+1]-refOff[i+1]),Math.abs(refOn[i+2]-refOff[i+2]))<12)continue;if(a[i]>170&&a[i+1]>170&&a[i+2]<100)yellow++;if(a[i]>170&&a[i+1]<100&&a[i+2]<100)red++;}return {yellow,red,highlightShare:yellow/(yellow+red)};}return {actual:count(on,off),reference:count(refOn,refOff)};},[on,off,refOn,refOff]);
   assert.ok(colors.actual.yellow+colors.actual.red>500);assert.ok(Math.abs(colors.actual.highlightShare-colors.reference.highlightShare)<.15,JSON.stringify(colors));phases.push({position,...colors});
  }
  assert.ok(phases[1].actual.highlightShare>phases[0].actual.highlightShare+.1);await page.evaluate(()=>player.destroy());return {phases,mask:'The native on/off glyph sample positions are shared by both color measurements',tolerance:'Highlighted-color share within 15 percentage points of the native reference and increasing between phases'};
 });
 await check('over-budget attachment is reported and playback remains bounded',async()=>{
  const before=logs.length;await page.evaluate(()=>{window.oldPlayer=player;window.playerEvents=[];});await page.locator('#file').setInputFiles('build/fixtures/over-budget.mkv');await page.waitForFunction(()=>player!==oldPlayer&&player.diagnostics?.rendered>5&&player.audioDiagnostics().mediaFrames>4096,{},{timeout:30000});
  const messages=[...logs.slice(before),...await page.evaluate(()=>playerEvents.filter(e=>e.event==='log-message').map(e=>e.text))];assert.ok(messages.some(m=>m.includes('Browser attachment budget exceeded')));const evidence=await page.evaluate(()=>({video:player.diagnostics,audio:player.audioDiagnostics()}));assert.ok(evidence.video.heapBytes<=536870912);await page.evaluate(()=>player.destroy());return {messages,evidence};
 });
 await check('destroy releases an actually stalled native demux callback',async()=>{
  await page.evaluate(async()=>{await createPlayer();await player.openRemote({url:'http://127.0.0.1:4180/media/front?id=m2-close-pending'});await player.play();});
  await fetch('http://127.0.0.1:4180/control?id=m2-close-pending',{method:'POST',body:JSON.stringify({stall:true})});
  await page.evaluate(()=>player.seek(1200));await page.waitForFunction(()=>player.diagnostics?.ioPending,{},{timeout:10000});const started=Date.now();await page.evaluate(()=>player.destroy());for(let i=0;i<30&&page.workers().length;i++)await page.waitForTimeout(100);assert.equal(page.workers().length,0);await fetch('http://127.0.0.1:4180/control?id=m2-close-pending',{method:'POST',body:JSON.stringify({stall:false})});return {milliseconds:Date.now()-started,retainedWorkers:page.workers().length};
 });
 await check('late authorization renewal cannot satisfy a replacement source',async()=>{
  for(const id of ['m2-auth-old','m2-auth-new'])await fetch(`http://127.0.0.1:4180/control?id=${id}`,{method:'POST',body:JSON.stringify({...network,mode:'auth'})});
  await page.evaluate(async()=>{await createPlayer();window.firstError=null;void player.openRemote({url:'http://127.0.0.1:4180/media/m0?id=m2-auth-old',refreshAuthorization:()=>new Promise(r=>window.resolveOld=r)}).catch(e=>window.firstError=e.message);});
  await page.waitForFunction(()=>firstError!==null,{},{timeout:12000});
  await page.evaluate(()=>{window.secondSettled=false;window.secondError=null;void player.openRemote({url:'http://127.0.0.1:4180/media/m0?id=m2-auth-new',refreshAuthorization:()=>new Promise(r=>window.resolveNew=r)}).then(()=>window.secondSettled=true,e=>window.secondError=e.message);});
  await page.waitForFunction(()=>typeof resolveNew==='function');await page.evaluate(()=>resolveOld({headers:{Authorization:'Bearer stale'}}));await page.waitForTimeout(200);assert.equal(await page.evaluate(()=>secondSettled),false);assert.equal(await page.evaluate(()=>secondError),null);
  await page.evaluate(()=>resolveNew({headers:{Authorization:'Bearer current'}}));await page.waitForFunction(()=>secondSettled||secondError);assert.equal(await page.evaluate(()=>secondError),null);const firstError=await page.evaluate(()=>window.firstError);await page.evaluate(()=>player.destroy());return {firstError,replacementOpened:true,staleResponseIgnored:true};
 });
 await check('renewed media URL opens and cross-origin renewal is rejected before Fetch',async()=>{
  for(const [id,mode] of [['m2-url-expired','auth'],['m2-url-renewed','normal']])await fetch(`http://127.0.0.1:4180/control?id=${id}`,{method:'POST',body:JSON.stringify({mode,rtt:80,mbps:10})});
  await page.evaluate(async()=>{await createPlayer();window.urlRefreshes=0;await player.openRemote({url:'http://127.0.0.1:4180/media/m0?id=m2-url-expired',refreshAuthorization:async()=>{urlRefreshes++;return {url:'http://127.0.0.1:4180/media/m0?id=m2-url-renewed'};}});await player.play();});await page.waitForFunction(()=>player.diagnostics?.rendered>5&&player.audioDiagnostics().mediaFrames>4096);assert.equal(await page.evaluate(()=>urlRefreshes),1);await page.evaluate(()=>player.destroy());
  const denied=await page.evaluate(async()=>{const {RangeReader}=await import('/web/range-reader.js');const r=new RangeReader({url:'http://127.0.0.1:4180/media/m0?id=m2-url-expired'},async()=>({url:'http://127.0.0.1:4181/media/m0?id=m2-denied-renewal'}));try{await r.open();return null;}catch(e){return e.message;}finally{r.close();}});assert.match(denied,/origin is not allowed/);const foreign=await(await fetch('http://127.0.0.1:4181/control?id=m2-denied-renewal')).json();assert.equal(foreign.requests,0);return {refreshes:1,denied,foreignRequests:foreign.requests};
 });
 await check('standalone integration example opens, pauses, resumes and closes',async()=>{
  await page.goto('http://127.0.0.1:4179/web/legacy-example.html');await page.click('#demo');await page.waitForFunction(()=>document.querySelector('[role=status]').textContent==='Playing example film.');await page.waitForTimeout(500);await page.click('#pause');await page.click('#play');await page.click('#close');await page.waitForFunction(()=>document.querySelector('[role=status]').textContent==='Closed.');for(let i=0;i<30&&page.workers().length;i++)await page.waitForTimeout(100);assert.equal(page.workers().length,0);return {closed:true};
 });result.passed=true;
}catch(error){result.failure=String(error.stack);console.error(result.failure);process.exitCode=1;}
finally{result.logs=logs;result.wasmSha256=createHash('sha256').update(await readFile('web/engine/player.wasm')).digest('hex');result.finished=new Date().toISOString();await writeFile('results/m2/supplemental.json',JSON.stringify(result,null,2)+'\n');await browser.close();}
