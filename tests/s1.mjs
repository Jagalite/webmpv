import {chromium} from 'playwright';
import assert from 'node:assert/strict';
import {mkdir,writeFile,readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
const output=process.env.RESULT_DIR||`results/s1/browser-${new Date().toISOString().replaceAll(':','-')}`;
await mkdir(output,{recursive:true});
const browser=await chromium.launch({channel:'chrome',headless:process.env.HEADLESS==='1',ignoreDefaultArgs:['--mute-audio'],args:['--autoplay-policy=no-user-gesture-required']});
const page=await browser.newPage({viewport:{width:1000,height:900}}),logs=[],errors=[];
page.on('console',m=>logs.push(`${m.type()}: ${m.text()}`));page.on('pageerror',e=>errors.push(String(e)));
await page.addInitScript(()=>{for(const name of ['VideoDecoder','AudioDecoder','VideoFrame','MediaSource'])Object.defineProperty(globalThis,name,{value:undefined,configurable:true});HTMLMediaElement.prototype.play=function(){throw Error('Native media playback forbidden');};});
const result={scope:'S1 real software playback',started:new Date().toISOString(),browser:browser.version(),headless:process.env.HEADLESS==='1',tests:[],passed:false};
const control=async(id,body)=>await(await fetch(`http://127.0.0.1:4182/control?id=${id}`,body?{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)}:{})).json();
async function wait(fn,timeout=30000){await page.waitForFunction(fn,null,{timeout});}
async function pixels(){return page.evaluate(()=>{const c=document.createElement('canvas'),source=document.querySelector('canvas');c.width=source.width;c.height=source.height;const ctx=c.getContext('2d');ctx.drawImage(source,0,0);const data=ctx.getImageData(0,0,c.width,c.height).data;let hash=2166136261,nonblack=0;for(let i=0;i<data.length;i+=4){hash=Math.imul(hash^data[i],16777619);if(data[i]+data[i+1]+data[i+2]>40)nonblack++;}return {hash:hash>>>0,nonblack};});}
async function check(name,fn){const start=Date.now();console.log(`RUN ${name}`);const evidence=await fn();result.tests.push({name,milliseconds:Date.now()-start,passed:true,evidence});console.log(`PASS ${name}`);}
async function open(id,file,format,auth=false){await page.evaluate(async({id,file,format,auth})=>{window.playerErrors=[];window.playerEvents=[];const p=await createPlayer();await p.openRemote({url:`http://127.0.0.1:4182/media/${id}/${file}`,format,headers:auth?{Authorization:'Bearer expired'}:undefined,refreshAuthorization:auth?async resource=>{window.refreshedResource=resource;return {headers:{Authorization:'Bearer current'}};}:undefined});await p.play();},{id,file,format,auth});}
async function destroy(){await page.evaluate(()=>player.destroy());for(let i=0;i<40&&page.workers().length;i++)await page.waitForTimeout(100);if(page.workers().length){
  const cdp=await page.context().newCDPSession(page);const targets=await cdp.send('Target.getTargets');await cdp.detach();
  result.teardownProbe={targets:targets.targetInfos.filter(t=>t.type==='worker'),evaluations:await Promise.all(page.workers().map(async w=>({url:w.url(),evaluation:await Promise.race([w.evaluate(()=>({alive:true,time:performance.now()})).catch(e=>({error:String(e)})),new Promise(r=>setTimeout(()=>r({timeout:true}),1000))])})))};
  console.log(JSON.stringify(result.teardownProbe));
 }
 assert.deepEqual(page.workers().map(w=>w.url()),[],'Workers retained after destroy');}
try{
  await page.goto('http://127.0.0.1:4179/?no-codecs');await wait(()=>typeof createPlayer==='function');
  for(const [id,file,format] of [['hls-ts','ts/master.m3u8','hls'],['hls-fmp4','fmp4/master.m3u8','hls'],['dash','dash/manifest.mpd','dash'],['range','byterange/media.m3u8','hls']]){
    if(process.env.S1_CASE&&process.env.S1_CASE!==id)continue;
    await check(`${id}: moving software output, audio, seeks and cleanup`,async()=>{
      await control(id,{requests:[],aborted:0,auth:true,retry:1});await open(id,file,format,true);
      await wait(()=>player.diagnostics?.rendered>8&&player.audioDiagnostics().rms>0.005);
      const first=await pixels();await page.waitForTimeout(350);const second=await pixels();assert.notEqual(first.hash,second.hash);assert.ok(first.nonblack>100000);
      const tracks=await page.evaluate(()=>player.properties.get('track-list'));
      const audio=await page.evaluate(()=>player.audioDiagnostics());assert.ok(audio.mediaFrames>0);
      const seeks=[];
      for(const position of [13,3,19,7]){
        await page.evaluate(async position=>{await player.pause();await player.seek(position);},position);
        await page.waitForFunction(position=>!player.diagnostics?.seeking&&Math.abs(player.diagnostics?.presentedPosition-position)<0.2,position,{timeout:20000});
        seeks.push(await page.evaluate(()=>player.diagnostics));await page.evaluate(()=>player.play());await page.waitForTimeout(250);
      }
      const audioTracks=tracks.filter(t=>t.type==='audio');
      let alternateAudio;
      if(audioTracks.length>1){
        await page.evaluate(id=>player.selectTrack('audio',String(id)),audioTracks[1].id);
        await page.waitForFunction(()=>{const bins=new Float32Array(player.analyser.frequencyBinCount);player.analyser.getFloatFrequencyData(bins);let peak=0;for(let i=1;i<bins.length;i++)if(bins[i]>bins[peak])peak=i;window.peakFrequency=peak*player.audioDiagnostics().sampleRate/player.analyser.fftSize;return Math.abs(window.peakFrequency-880)<35&&player.audioDiagnostics().rms>0.005;},null,{timeout:10000});
        alternateAudio=await page.evaluate(()=>({frequency:window.peakFrequency,audio:player.audioDiagnostics(),tracks:player.properties.get('track-list')}));
      }
      const subtitles=tracks.filter(t=>t.type==='sub');let subtitlePixels;
      if(subtitles.length){
        await page.evaluate(async id=>{await player.pause();await player.selectTrack('sub',String(id));await player.seek(5);},subtitles[0].id);
        await wait(()=>!player.diagnostics?.seeking);await page.waitForTimeout(500);
        await page.evaluate(()=>player.subtitleVisible(true));await page.waitForTimeout(300);const on=await pixels();
        await page.evaluate(()=>player.subtitleVisible(false));await page.waitForTimeout(300);const off=await pixels();assert.notEqual(on.hash,off.hash);subtitlePixels={on,off};
      }
      const codecErrors=await page.evaluate(()=>playerEvents.filter(e=>e.event==='log-message'&&/Invalid NAL|Error splitting|missing picture/.test(e.text)));assert.deepEqual(codecErrors,[]);
      const diagnostics=await page.evaluate(()=>player.diagnostics);assert.ok(diagnostics.io.peakRetainedBytes<=16*1024*1024);assert.ok(diagnostics.heapBytes<=536870912);
      await page.screenshot({path:`${output}/${id}.png`});await destroy();
      const network=await control(id);assert.equal(network.active,0);assert.ok(network.requests.some(r=>r.authorized));
      if(id==='range')assert.ok(network.requests.some(r=>r.range));
      return {first,second,tracks,audio,alternateAudio,seeks,subtitlePixels,diagnostics,network,events:await page.evaluate(()=>window.playerEvents)};
    });
  }
  assert.deepEqual(errors,[]);result.passed=true;
}catch(error){result.failure=String(error.stack||error);console.error(result.failure);try{result.player=await page.evaluate(()=>({diagnostics:player?.diagnostics,events:window.playerEvents,errors:window.playerErrors}));await page.screenshot({path:`${output}/failure.png`});}catch{}process.exitCode=1;}
finally{for(const file of ['scripts/s1-media-server.mjs','web/engine/player.wasm','web/engine/player.mjs','web/io-worker.js','web/resource-loader.js','web/vod-manifest.js','native/stream_bridge.c']){try{(result.hashes??={})[file]=createHash('sha256').update(await readFile(file)).digest('hex');}catch{}}
await writeFile(`${output}/result.json`,JSON.stringify(result,null,2)+'\n');await writeFile(`${output}/console.json`,JSON.stringify(logs,null,2)+'\n');await browser.close();console.log(output);}
