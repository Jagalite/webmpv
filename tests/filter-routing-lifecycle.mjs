import {chromium} from 'playwright';
import assert from 'node:assert/strict';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';
const out=`results/filter-routing/lifecycle-${new Date().toISOString().replaceAll(':','-')}`;await mkdir(out,{recursive:true});console.log(out);
const files=['web/filter-player.js','web/filter-retained-engine-worker.js','web/filter-copyback-engine-worker.js','web/generated/filter-retained-player.js','web/generated/filter-copyback-player.js','web/filters.html','web/engine-filter-copyback/player.wasm','web/engine-retained-subs/player.wasm','tests/filter-routing-lifecycle.mjs','build/fixtures/tracks.mkv'];
const hashes=async()=>Object.fromEntries(await Promise.all(files.map(async p=>[p,createHash('sha256').update(await readFile(p)).digest('hex')])));
const result={started:new Date().toISOString(),passed:false,hashes:await hashes(),tests:[]};
const browser=await chromium.launch({channel:'chrome',headless:true,args:['--autoplay-policy=no-user-gesture-required']});const page=await browser.newPage();const pageErrors=[];page.on('pageerror',e=>pageErrors.push(String(e)));
async function check(name,fn){const evidence=await fn();assert.deepEqual(pageErrors,[]);assert.deepEqual(await page.evaluate(()=>errors),[]);result.tests.push({name,passed:true,evidence});console.log('PASS',name);}
try{
 await page.goto('http://127.0.0.1:4179/web/filters.html');await page.waitForFunction(()=>typeof createPlayer==='function');
 await page.evaluate(s=>window.fixture=Uint8Array.from(atob(s),c=>c.charCodeAt(0)).buffer,(await readFile('build/fixtures/tracks.mkv')).toString('base64'));
 await check('grayscale, resize and seek through the filtered route',async()=>{
  await page.evaluate(async()=>{await createPlayer();await player.setVideoFilters('lavfi=[format=gray]');await player.open(fixture);await player.subtitleVisible(false);player.resize(1280,720);await player.seek(3);});await page.waitForTimeout(300);
  const pixels=await page.evaluate(()=>{const source=document.querySelector('canvas'),c=document.createElement('canvas');c.width=source.width;c.height=source.height;const ctx=c.getContext('2d');ctx.drawImage(source,0,0);const data=ctx.getImageData(0,0,c.width,c.height).data;let max=0;for(let i=0;i<data.length;i+=68)max=Math.max(max,Math.abs(data[i]-data[i+1]),Math.abs(data[i]-data[i+2]));return {width:c.width,height:c.height,maxChannelDifference:max,d:player.diagnostics};});assert.equal(pixels.width,1280);assert.equal(pixels.height,720);assert.ok(pixels.maxChannelDifference<=2);assert.equal(pixels.d.decoder,'webcodecs');return pixels;
 });
 await check('invalid-filter rollback resumes playing video and audio',async()=>{
  await page.evaluate(()=>player.play());await page.waitForTimeout(250);
  const rollback=await page.evaluate(async()=>{const old=player.player;let failure;try{await player.setVideoFilters('no_such_filter_lifecycle');}catch(e){failure=String(e);}return {failure,same:old===player.player};});assert.equal(rollback.same,true);assert.match(rollback.failure,/filter/i);
  const before=await page.evaluate(()=>({position:player.properties.get('time-pos'),audio:player.audioDiagnostics().mediaFrames}));await page.waitForTimeout(700);const after=await page.evaluate(()=>({position:player.properties.get('time-pos'),audio:player.audioDiagnostics().mediaFrames,pause:player.properties.get('pause')}));assert.equal(after.pause,false);assert.ok(after.position>before.position+.4);assert.ok(after.audio>before.audio);await page.evaluate(()=>player.pause());return {rollback,before,after};
 });
 await check('local source replacement starts paused at zero on the selected route',async()=>{
  await page.evaluate(async()=>{await player.setVideoFilters('');await player.open(fixture);});const d=await page.evaluate(()=>({diagnostics:player.diagnostics,pause:player.properties.get('pause'),position:player.properties.get('time-pos')}));assert.equal(d.diagnostics.route,'retained');assert.equal(d.pause,true);assert.ok(Math.abs(d.position)<.15);return d;
 });
 await check('destroy cancels an in-flight engine switch and contains all workers',async()=>{
  await page.evaluate(()=>{window.pendingSwitch=player.setVideoFilters('hflip').then(()=>null,e=>String(e));});await page.waitForFunction(()=>player.candidate!==null);const started=Date.now();await page.evaluate(()=>player.destroy());const failure=await page.evaluate(()=>pendingSwitch);assert.match(failure,/destroy/i);for(let i=0;i<50&&page.workers().length;i++)await page.waitForTimeout(100);assert.equal(page.workers().length,0);assert.equal(await page.locator('iframe').count(),0);assert.equal(await page.locator('canvas').count(),0);const state=await page.evaluate(()=>({history:player.history,source:player.source,candidate:player.candidate}));assert.equal(state.source,null);assert.equal(state.candidate,null);for(const item of state.history){assert.equal(item.audio.state,'closed');const p=item.diagnostics?.presentation;if(p){assert.equal(p.closed,p.received);assert.equal(p.retained,0);assert.equal(p.pending,0);}}return {failure,elapsedMs:Date.now()-started,...state};
 });
 result.passed=true;
}catch(e){result.failure=String(e.stack);result.state=await page.evaluate(()=>({errors,diagnostics:window.player?.diagnostics,history:window.player?.history})).catch(()=>null);console.error(result.failure);process.exitCode=1;}
finally{await page.evaluate(()=>window.player?.destroy()).catch(()=>{});result.hashesAfter=await hashes();result.runtimeUnchanged=JSON.stringify(result.hashes)===JSON.stringify(result.hashesAfter);if(!result.runtimeUnchanged){result.passed=false;process.exitCode=1;}result.finished=new Date().toISOString();await writeFile(`${out}/result.json`,JSON.stringify(result,null,2)+'\n');await browser.close();}
