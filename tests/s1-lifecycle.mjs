import {chromium} from 'playwright';
import assert from 'node:assert/strict';
import {mkdir,writeFile,readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
const output=process.env.RESULT_DIR||`results/s1/lifecycle-${new Date().toISOString().replaceAll(':','-')}`;await mkdir(output,{recursive:true});
const browser=await chromium.launch({channel:'chrome',headless:process.env.HEADLESS==='1',ignoreDefaultArgs:['--mute-audio'],args:['--autoplay-policy=no-user-gesture-required']});
const page=await browser.newPage(),result={scope:'S1 cancellation and lifecycle',browser:browser.version(),headless:process.env.HEADLESS==='1',tests:[],passed:false};
const control=async(id,body)=>await(await fetch(`http://127.0.0.1:4182/control?id=${id}`,body?{method:'POST',body:JSON.stringify(body)}:{})).json();
async function check(name,fn){console.log(`RUN ${name}`);const start=Date.now();const evidence=await fn();result.tests.push({name,passed:true,milliseconds:Date.now()-start,evidence});console.log(`PASS ${name}`);}
async function wait(fn,timeout=30000){await page.waitForFunction(fn,null,{timeout});}
async function open(id,file='muxed/media.m3u8',format='hls'){await page.evaluate(async({id,file,format})=>{window.playerErrors=[];window.playerEvents=[];const p=await createPlayer();await p.openRemote({url:`http://127.0.0.1:4182/media/${id}/${file}`,format});await p.play();},{id,file,format});}
async function destroy(){await page.evaluate(()=>player.destroy());for(let i=0;i<50&&page.workers().length;i++)await page.waitForTimeout(100);assert.deepEqual(page.workers().map(w=>w.url()),[]);}
async function networkWait(id,predicate,timeout=15000){const deadline=Date.now()+timeout;while(Date.now()<deadline){const s=await control(id);if(predicate(s))return s;await new Promise(r=>setTimeout(r,100));}throw Error('Network condition timed out');}
try{
 await page.goto('http://127.0.0.1:4179/web/index.html?no-codecs');await wait(()=>typeof createPlayer==='function');
 if(!process.env.S1_CHECK||process.env.S1_CHECK==='stall')await check('stalled nested open is interrupted by seek',async()=>{
  const id='stall';await control(id,{requests:[],aborted:0,stall:'av-005.ts'});await open(id);
  await networkWait(id,s=>s.active>0&&s.requests.some(r=>r.path.endsWith('av-005.ts')));
  await wait(()=>player.diagnostics?.ioPending);const before=await page.evaluate(()=>player.diagnostics);
  await page.evaluate(()=>player.seek(18));await page.waitForFunction(()=>!player.diagnostics.seeking&&player.diagnostics.presentedPosition>=18&&player.diagnostics.presentedPosition<20,null,{timeout:15000});
  const after=await page.evaluate(()=>player.diagnostics);assert.ok(after.interruptions>before.interruptions);await destroy();
  const network=await control(id);assert.equal(network.active,0);assert.ok(network.aborted>0);await control(id,{stall:null});return {before,after,network};
 });
 if(!process.env.S1_CHECK||process.env.S1_CHECK==='destroy')await check('destroy during manifest and nested media opens releases workers and requests',async()=>{
  const rows=[];
  for(const stalled of ['media.m3u8','av-000.ts']){
   const id=`destroy-${stalled}`;await control(id,{requests:[],aborted:0,stall:stalled});
   await page.evaluate(async({id})=>{const p=await createPlayer();window.pendingOpen=p.openRemote({url:`http://127.0.0.1:4182/media/${id}/muxed/media.m3u8`,format:'hls'}).then(()=>({opened:true}),error=>({error:error.message}));},{id});
   await networkWait(id,s=>s.active>0);await destroy();const rejection=await page.evaluate(()=>window.pendingOpen);assert.ok(rejection.error);
   const network=await networkWait(id,s=>s.active===0);assert.ok(network.aborted>0);rows.push({stalled,rejection,network});await control(id,{stall:null});
  }
  return rows;
 });
 if(!process.env.S1_CHECK||process.env.S1_CHECK==='reject')await check('unsupported manifests fail before nested media requests',async()=>{
  const rows=[];for(const file of ['live.m3u8','encrypted.m3u8']){
   const id=`reject-${file}`;await control(id,{requests:[]});const error=await page.evaluate(async({id,file})=>{const p=await createPlayer();return p.openRemote({url:`http://127.0.0.1:4182/media/${id}/muxed/${file}`,format:'hls'}).then(()=>null,e=>e.message);},{id,file});assert.ok(error);await destroy();const network=await control(id);assert.equal(network.requests.length,1);rows.push({file,error,network});
  }return rows;
 });
 if(!process.env.S1_CHECK||process.env.S1_CHECK==='replace')await check('HLS to direct MP4 to local MKV to DASH source replacement',async()=>{
  await open('replace','ts/master.m3u8');await wait(()=>player.audioDiagnostics().rms>0.005);
  await page.evaluate(async()=>{await player.openRemote({url:'http://127.0.0.1:4182/media/replace/source.mp4',immutable:true});await player.play();});
  await wait(()=>player.diagnostics.demuxFormat.includes('mov')&&player.audioDiagnostics().rms>0.005);
  const directSeeks=[];for(const position of [13,0,7]){await page.evaluate(async position=>{await player.pause();await player.seek(position);},position);await page.waitForFunction(position=>!player.diagnostics.seeking&&Math.abs(player.diagnostics.presentedPosition-position)<0.2,position,{timeout:20000});directSeeks.push(await page.evaluate(()=>player.diagnostics));}

  await page.evaluate(async()=>{await player.open(await(await fetch('/fixtures/m0.mkv')).arrayBuffer());await player.play();});await wait(()=>player.diagnostics.demuxFormat==='mkv'&&player.audioDiagnostics().rms>0.005);
  await page.evaluate(async()=>{await player.openRemote({url:'http://127.0.0.1:4182/media/replace/dash/manifest.mpd',format:'dash'});await player.play();});await wait(()=>player.diagnostics.demuxFormat==='dash'&&player.audioDiagnostics().rms>0.005);
  const diagnostics=await page.evaluate(()=>player.diagnostics);await destroy();return {diagnostics,directSeeks};
 });
 if(!process.env.S1_CHECK||process.env.S1_CHECK==='cycles')await check('ten subtitle HLS and ten DASH player lifecycles',async()=>{
  const cycles=[];for(let i=0;i<20;i++){
   const hls=i%2===0;await open(`cycle-${i}`,hls?'ts/master.m3u8':'dash/manifest.mpd',hls?'hls':'dash');
   await wait(()=>player.diagnostics?.rendered>5&&player.audioDiagnostics().rms>0.005);cycles.push(await page.evaluate(()=>player.diagnostics));await destroy();
  }return cycles;
 });
 result.passed=true;
}catch(error){result.failure=String(error.stack||error);console.error(result.failure);try{result.player=await page.evaluate(()=>({diagnostics:player?.diagnostics,events:window.playerEvents,errors:window.playerErrors}));result.workers=page.workers().map(w=>w.url());}catch{}process.exitCode=1;}
finally{for(const file of ['scripts/s1-media-server.mjs','web/engine/player.wasm','web/engine/player.mjs','web/io-worker.js','web/resource-loader.js','web/vod-manifest.js','native/stream_bridge.c']){try{(result.hashes??={})[file]=createHash('sha256').update(await readFile(file)).digest('hex');}catch{}}
 await writeFile(`${output}/result.json`,JSON.stringify(result,null,2)+'\n');await browser.close();console.log(output);}
