import {chromium} from 'playwright';
import assert from 'node:assert/strict';
import {mkdir,writeFile,readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
const output=process.env.RESULT_DIR||`results/s1/timeline-${new Date().toISOString().replaceAll(':','-')}`;await mkdir(output,{recursive:true});
const browser=await chromium.launch({channel:'chrome',headless:process.env.HEADLESS==='1',ignoreDefaultArgs:['--mute-audio'],args:['--autoplay-policy=no-user-gesture-required']});
const page=await browser.newPage(),result={scope:'S1 timeline boundaries and failures',browser:browser.version(),headless:process.env.HEADLESS==='1',tests:[],passed:false};
const control=async(id,body)=>await(await fetch(`http://127.0.0.1:4182/control?id=${id}`,body?{method:'POST',body:JSON.stringify(body)}:{})).json();
async function check(name,fn){console.log(`RUN ${name}`);const start=Date.now();const evidence=await fn();result.tests.push({name,passed:true,milliseconds:Date.now()-start,evidence});console.log(`PASS ${name}`);}
async function wait(fn,timeout=30000){await page.waitForFunction(fn,null,{timeout});}
async function open(id,file='muxed/media.m3u8',format='hls'){await page.evaluate(async({id,file,format})=>{window.playerErrors=[];window.playerEvents=[];const p=await createPlayer();await p.openRemote({url:`http://127.0.0.1:4182/media/${id}/${file}`,format});await p.play();},{id,file,format});}
async function destroy(){await page.evaluate(()=>player.destroy());for(let i=0;i<50&&page.workers().length;i++)await page.waitForTimeout(100);assert.deepEqual(page.workers().map(w=>w.url()),[]);}
async function networkWait(id,predicate,timeout=15000){const deadline=Date.now()+timeout;while(Date.now()<deadline){const s=await control(id);if(predicate(s))return s;await new Promise(r=>setTimeout(r,100));}throw Error('Network condition timed out');}
try{
 await page.goto('http://127.0.0.1:4179/?no-codecs');await wait(()=>typeof createPlayer==='function');
 for(const [id,file,fail] of [['fmp4-discontinuity','fmp4-discontinuity/media.m3u8',null],['discontinuity','discontinuity.m3u8',null],['offset','offset.m3u8',null],['gap','gap.m3u8','av-005.ts']]){
  if(process.env.S1_CASE&&process.env.S1_CASE!==id)continue;
  await check(`${id}: forward playback and seeks across timeline boundary`,async()=>{
   await control(id,{requests:[],fail});await open(id,file.includes('/')?file:`muxed/${file}`);
   await wait(()=>player.diagnostics?.rendered>8&&player.audioDiagnostics().rms>0.005);
   const seeks=[];
   for(const position of [7,13,3]){
    await page.evaluate(async position=>{await player.pause();await player.seek(position);},position);
    await page.waitForFunction(position=>!player.diagnostics.seeking&&Math.abs(player.diagnostics.presentedPosition-position)<0.2,position,{timeout:20000});
    seeks.push(await page.evaluate(()=>player.diagnostics));
   }
   await page.evaluate(async()=>{await player.seek(9);await player.play();});
   await wait(()=>player.diagnostics.presentedPosition>14&&player.audioDiagnostics().rms>0.005,20000);
   const diagnostics=await page.evaluate(()=>player.diagnostics);await destroy();
   const network=await control(id);assert.equal(network.active,0);return {seeks,diagnostics,network};
  });
 }
 await check('missing initialization resource terminates open and cleans up',async()=>{
  const id='terminal';await control(id,{requests:[],fail:'video-init.mp4'});
  const error=await page.evaluate(async id=>{const p=await createPlayer();return p.openRemote({url:`http://127.0.0.1:4182/media/${id}/fmp4/master.m3u8`,format:'hls'}).then(()=>null,e=>e.message);},id);
  assert.ok(error);await destroy();const network=await control(id);assert.equal(network.active,0);return {error,network};
 });
 result.passed=true;
}catch(error){result.failure=String(error.stack||error);console.error(result.failure);try{result.player=await page.evaluate(()=>({diagnostics:player?.diagnostics,events:window.playerEvents,errors:window.playerErrors}));result.workers=page.workers().map(w=>w.url());}catch{}process.exitCode=1;}
finally{for(const file of ['scripts/s1-media-server.mjs','web/engine/player.wasm','web/engine/player.mjs','web/io-worker.js','web/resource-loader.js','web/vod-manifest.js','native/stream_bridge.c']){try{(result.hashes??={})[file]=createHash('sha256').update(await readFile(file)).digest('hex');}catch{}}
 await writeFile(`${output}/result.json`,JSON.stringify(result,null,2)+'\n');await browser.close();console.log(output);}
