import {chromium} from 'playwright';
import assert from 'node:assert/strict';
import {mkdir,writeFile,readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
await mkdir('results/m2',{recursive:true});
const browser=await chromium.launch({channel:'chrome',headless:false,ignoreDefaultArgs:['--mute-audio'],args:['--autoplay-policy=no-user-gesture-required','--disable-background-timer-throttling','--disable-renderer-backgrounding']});
const page=await browser.newPage({viewport:{width:1280,height:1100}}),logs=[];
page.on('pageerror',e=>logs.push(String(e)));
await page.addInitScript(()=>{for(const n of ['VideoDecoder','AudioDecoder','VideoFrame','MediaSource'])Object.defineProperty(globalThis,n,{value:undefined,configurable:true});HTMLMediaElement.prototype.play=()=>{throw Error('Native media forbidden');};});
const network={rtt:80,mbps:10};
const result={network,started:new Date().toISOString(),browser:browser.version(),tests:[],passed:false};
const control=async(id,options)=>fetch(`http://127.0.0.1:4180/control?id=${id}`,options?{method:'POST',body:JSON.stringify(options)}:{}).then(r=>r.json());
const wait=(fn,timeout=20000)=>page.waitForFunction(fn,{},{timeout});
async function check(name,fn){const started=Date.now();try{const evidence=await fn();result.tests.push({name,passed:true,milliseconds:Date.now()-started,evidence});console.log('PASS',name);}catch(error){result.tests.push({name,passed:false,error:String(error.stack)});throw error;}}
async function open(name,id){await control(id,{...network,mode:'normal',stall:false,outageUntil:0});await page.evaluate(async({name,id})=>{await createPlayer();player.resize(1920,1080);await player.openRemote({url:`http://127.0.0.1:4180/media/${name}?id=${id}`});await player.play();},{name,id});await wait(()=>player.diagnostics?.rendered>5&&player.audioDiagnostics().mediaFrames>4096);}
async function destroy(){await page.evaluate(()=>player?.destroy());for(let i=0;i<30&&page.workers().length;i++)await page.waitForTimeout(100);if(page.workers().length){const cdp=await browser.newBrowserCDPSession();result.cleanupDebug={targets:await cdp.send('Target.getTargets'),workers:await Promise.all(page.workers().map(async w=>({url:w.url(),probe:await Promise.race([w.evaluate(()=>1).catch(e=>String(e)),new Promise(r=>setTimeout(()=>r('timeout'),1000))])})))};await cdp.detach();}assert.equal(page.workers().length,0,JSON.stringify(result.cleanupDebug));}
try{
 await page.goto('http://127.0.0.1:4179/?no-codecs');await wait(()=>typeof createPlayer==='function');
 await check('real browser CORS, authorization, renewal, cookies and rejected responses',async()=>{
  const cases=[];
  for(const mode of ['auth','cookie','cors-denied','forbidden','ignore-range','bad-range','encoded','redirect','retry','truncate']){
   const id=`m2-${mode}-${Date.now()}`;await control(id,{...network,mode});
   if(mode==='cookie')await page.context().addCookies([{name:'webmpv',value:'ok',url:'http://127.0.0.1:4180',sameSite:'Lax'}]);
   const evidence=await page.evaluate(async({mode,id})=>{const {RangeReader}=await import('/web/range-reader.js');let refreshes=0;const r=new RangeReader({url:`http://127.0.0.1:4180/media/m0?id=${id}`,credentials:mode==='cookie'?'include':'omit',headers:mode==='auth'?{Authorization:'Bearer expired'}:{}},mode==='auth'?async()=>{refreshes++;return {headers:{Authorization:'Bearer current'}};}:undefined);try{return {ok:true,info:await r.open(),refreshes,stats:r.stats};}catch(e){return {ok:false,error:e.message,stats:r.stats};}finally{r.close();}},{mode,id});
   assert.equal(evidence.ok,['auth','cookie','retry','truncate'].includes(mode),JSON.stringify({mode,evidence}));if(mode==='auth')assert.equal(evidence.refreshes,1);cases.push({mode,...evidence,server:await control(id)});
  }
  return cases;
 });
 for(const name of ['front','tail'])await check(`${name} index: shaped startup and distant seek`,async()=>{
  await fetch(`http://127.0.0.1:4180/media/${name}?id=warm`,{headers:{Range:'bytes=0-0'}}).then(r=>r.arrayBuffer());
  const id=`m2-shaped-${name}-${Date.now()}`;await control(id,{rtt:80,mbps:10});
  await page.evaluate(async({name,id})=>{await createPlayer();player.resize(1920,1080);await player.open(await(await fetch('/fixtures/m0.mkv')).arrayBuffer());await player.play();while(!(player.diagnostics?.rendered>3&&player.audioDiagnostics().mediaFrames>128))await new Promise(r=>setTimeout(r,10));await player.pause();await new Promise(r=>setTimeout(r,200));window.start=performance.now();window.initialRendered=player.diagnostics?.rendered||0;window.initialAudio=player.audioDiagnostics().mediaFrames;await player.openRemote({url:`http://127.0.0.1:4180/media/${name}?id=${id}`});await player.play();},{name,id});
  await wait(()=>player.diagnostics?.rendered>initialRendered+1&&player.audioDiagnostics().mediaFrames>initialAudio+128);
  const startup=await page.evaluate(()=>({milliseconds:performance.now()-start,video:player.diagnostics,audio:player.audioDiagnostics()}));
  const before=await control(id),seekStart=Date.now();await page.evaluate(()=>player.seek(1620));await wait(()=>!player.diagnostics?.seeking&&Math.abs(player.diagnostics?.presentedPosition-1620)<1);
  const after=await control(id),seek={milliseconds:Date.now()-seekStart,bytes:after.bytes-before.bytes,video:await page.evaluate(()=>player.diagnostics)};
  console.log('shaped',name,JSON.stringify({startup,seek}));await destroy();
  assert.ok(startup.milliseconds<=3000,`startup ${startup.milliseconds} ms`);assert.ok(startup.video.io.fetchedBytes<4*1024*1024);assert.ok(seek.milliseconds<=2000,`seek ${seek.milliseconds} ms`);assert.ok(seek.bytes<=8*1024*1024);
  return {startup,seek};
 });
 await check('100 seeks at five per second, then latest output and PCM recover',async()=>{
  await open('front','m2-storm');
  await page.evaluate(async()=>{for(let i=0;i<100;i++){void player.seek(10+(i*137)%1600);await new Promise(r=>setTimeout(r,200));}await player.seek(301);});
  await wait(()=>!player.diagnostics?.seeking&&player.diagnostics?.presentedPosition>=301&&player.diagnostics?.presentedPosition<305);
  const before=await page.evaluate(()=>player.audioDiagnostics().mediaFrames);await page.waitForTimeout(500);const evidence=await page.evaluate(()=>({video:player.diagnostics,audio:player.audioDiagnostics(),errors:playerErrors}));assert.ok(evidence.audio.mediaFrames>before);assert.deepEqual(evidence.errors,[]);await destroy();return evidence;
 });
 await check('five-second network outage recovers on the same source',async()=>{
  const id=`m2-outage-${Date.now()}`;await open('front',id);await control(id,{outageUntil:Date.now()+5000});await page.evaluate(()=>player.seek(900));
  await wait(()=>!player.diagnostics?.seeking&&player.diagnostics?.presentedPosition>=900,15000);const evidence=await page.evaluate(()=>({video:player.diagnostics,audio:player.audioDiagnostics(),errors:playerErrors}));assert.ok(evidence.video.io.retries>0);assert.deepEqual(evidence.errors,[]);await destroy();return evidence;
 });
 await check('multiple tracks, volume, rate and composed ASS paused redraw',async()=>{
  await open('tracks','m2-tracks');const tracks=await page.evaluate(()=>player.properties.get('track-list'));assert.equal(tracks.filter(t=>t.type==='audio').length,2);assert.equal(tracks.filter(t=>t.type==='sub').length,2);
  const frequencies=[];async function frequency(expected){const started=Date.now();await page.waitForFunction(expected=>{const a=player.analyser,values=new Float32Array(a.frequencyBinCount);a.getFloatFrequencyData(values);let peak=1;for(let i=2;i<values.length;i++)if(values[i]>values[peak])peak=i;window.measuredFrequency=peak*player.audioDiagnostics().sampleRate/(a.frequencyBinCount*2);return Number.isFinite(values[peak])&&Math.abs(measuredFrequency-expected)<40;},expected,{timeout:5000});const hz=await page.evaluate(()=>measuredFrequency);frequencies.push({expected,hz,milliseconds:Date.now()-started});}
  await frequency(440);await page.evaluate(async()=>{await player.selectTrack('audio','2');await player.selectTrack('sub','2');});await frequency(880);
  await page.evaluate(async()=>{await player.selectTrack('audio','2');await player.selectTrack('sub','2');await player.volume(35);await player.rate(1.5);});
  await wait(()=>player.properties.get('speed')===1.5&&player.properties.get('volume')===35&&player.properties.get('track-list').some(t=>t.type==='audio'&&t.id==='2'&&t.selected));
  await page.evaluate(async()=>{await player.pause();await player.seek(5);});await wait(()=>!player.diagnostics?.seeking&&Math.abs(player.diagnostics?.presentedPosition-5)<.2);
  await page.evaluate(async()=>{await player.selectTrack('audio','1');await player.selectTrack('sub','1');await player.rate(1);});
  await wait(()=>player.properties.get('track-list').some(t=>t.type==='audio'&&t.id==='1'&&t.selected)&&player.properties.get('track-list').some(t=>t.type==='sub'&&t.id==='1'&&t.selected));
  const pausedFrames=await page.evaluate(()=>player.audioDiagnostics().mediaFrames);await page.waitForTimeout(200);assert.equal(await page.evaluate(()=>player.audioDiagnostics().mediaFrames),pausedFrames);
  await page.evaluate(()=>player.play());await frequency(440);
  await page.evaluate(async()=>{await player.seek(6);await player.selectTrack('audio','2');await player.selectTrack('sub','2');});await wait(()=>!player.diagnostics?.seeking&&player.diagnostics?.presentedPosition>=6);await frequency(880);
  await page.evaluate(async()=>{await player.pause();await player.seek(5);});await wait(()=>!player.diagnostics?.seeking&&Math.abs(player.diagnostics?.presentedPosition-5)<.2);
  const compare=await page.evaluate(async()=>{const snapshot=()=>{const source=document.querySelector('canvas'),c=document.createElement('canvas');c.width=source.width;c.height=source.height;const ctx=c.getContext('2d');ctx.drawImage(source,0,0);return ctx.getImageData(0,0,c.width,c.height).data;};const withASS=snapshot();await player.subtitleVisible(false);await new Promise(r=>setTimeout(r,300));const without=snapshot();await player.subtitleVisible(true);await new Promise(r=>setTimeout(r,300));const restored=snapshot();let changed=0,mismatch=0;for(let i=0;i<withASS.length;i+=4){if(withASS[i]!==without[i]||withASS[i+1]!==without[i+1]||withASS[i+2]!==without[i+2])changed++;if(withASS[i]!==restored[i]||withASS[i+1]!==restored[i+1]||withASS[i+2]!==restored[i+2])mismatch++;}return {changed,mismatch};});
  assert.ok(compare.changed>1000);assert.equal(compare.mismatch,0);
  for(const visible of [true,false]){await page.evaluate(v=>player.subtitleVisible(v),visible);await page.waitForTimeout(250);const png=await page.evaluate(()=>{const source=document.querySelector('canvas'),c=document.createElement('canvas');c.width=source.width;c.height=source.height;c.getContext('2d').drawImage(source,0,0);return c.toDataURL('image/png').split(',')[1];});await writeFile(`results/m2/ass-${visible?'on':'off'}.png`,Buffer.from(png,'base64'));}await page.evaluate(()=>player.subtitleVisible(true));await page.waitForTimeout(250);
  await page.screenshot({path:'results/m2/ass-composition.png'});await page.evaluate(()=>player.resize(1280,720));await page.waitForTimeout(300);await page.screenshot({path:'results/m2/ass-resize.png'});await destroy();return {tracks,compare,frequencies};
 });
 await check('VFR and B-frame playback preserves ordered variable timestamps and final frames',async()=>{
  await control('m2-vfr',{...network,mode:'normal'});await page.evaluate(async()=>{await createPlayer();window.positions=[];player.addEventListener('mpv',({detail})=>{if(detail.event==='property-change'&&detail.name==='time-pos'&&typeof detail.data==='number')positions.push(detail.data);});await player.openRemote({url:'http://127.0.0.1:4180/media/vfr?id=m2-vfr'});await player.play();});
  await wait(()=>player.properties.get('eof-reached')===true,20000);await page.waitForTimeout(250);const evidence=await page.evaluate(()=>({video:player.diagnostics,position:player.properties.get('time-pos'),positions,errors:playerErrors}));assert.ok(evidence.position>11.93);for(let i=1;i<evidence.positions.length;i++)assert.ok(evidence.positions[i]>=evidence.positions[i-1]-.001);
  const deltas=evidence.positions.slice(1).map((t,i)=>t-evidence.positions[i]);assert.ok(deltas.some(d=>d>.06&&d<.075));assert.ok(deltas.some(d=>d>.025&&d<.04));assert.deepEqual(evidence.errors,[]);await destroy();return evidence;
 });
 await check('100 complete lifecycles including invalid media',async()=>{
  const cycles=[];await control('m2-cycle',{...network,mode:'normal'});
  for(let i=0;i<100;i++){
   const data=await page.evaluate(async i=>{await createPlayer();let rejection;try{if(i%10===0){try{await player.open(new Uint8Array([0,1,2,3]).buffer);}catch(e){rejection=e.message;}}else{await player.openRemote({url:'http://127.0.0.1:4180/media/m0?id=m2-cycle'});await player.play();await new Promise(r=>setTimeout(r,180));}return {i,rejection,heap:player.diagnostics?.heapBytes,errors:playerErrors};}finally{await player.destroy();}},i);
   for(let n=0;n<30&&page.workers().length;n++)await page.waitForTimeout(100);assert.equal(page.workers().length,0);if(i%10===0)assert.ok(data.rejection);cycles.push(data);if(i%10===0)console.log('lifecycle',i);
  }return cycles;
 });
 result.passed=true;
}catch(error){result.failure=String(error.stack);result.state=await page.evaluate(()=>({events:window.playerEvents,errors:window.playerErrors,video:window.player?.diagnostics})).catch(()=>null);console.error(result.failure);process.exitCode=1;}
finally{result.logs=logs;result.finished=new Date().toISOString();result.wasmSha256=createHash('sha256').update(await readFile('web/engine/player.wasm')).digest('hex');await writeFile('results/m2/functional.json',JSON.stringify(result,null,2)+'\n');await browser.close();}
