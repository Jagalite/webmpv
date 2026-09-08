// Sustained development playback in an isolated headless browser. This is not
// foreground qualification. Keep one player alive across repeated remote seeks.
import {chromium} from 'playwright';
import {spawn,execFileSync} from 'node:child_process';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {createReadStream} from 'node:fs';
import {createHash} from 'node:crypto';
import assert from 'node:assert/strict';

const mode=process.env.MODE||'software';
assert.ok(['software','hybrid'].includes(mode));
const duration=Number(process.env.DURATION_SECONDS||3600);
const segmentSeconds=Number(process.env.SEGMENT_SECONDS||600);
const warmupSeconds=Number(process.env.WARMUP_SECONDS||10);
assert.ok(duration>=30&&duration<=7200);
assert.ok(segmentSeconds>=15&&segmentSeconds<=600);
assert.ok(warmupSeconds>=3&&warmupSeconds<=30);
const input=process.env.INPUT||'build/fixtures/playback-performance/bbb-stream.mp4';
const probe=JSON.parse(execFileSync('ffprobe',['-v','error','-show_streams','-show_format','-of','json',input],{encoding:'utf8'}));
const video=probe.streams.find(stream=>stream.codec_type==='video');
const [numerator,denominator]=video.avg_frame_rate.split('/').map(Number);
const fps=numerator/denominator;
assert.ok(fps>0&&fps<=120);
assert.ok(segmentSeconds+warmupSeconds+2<Number(probe.format.duration));
const out=`results/playback-performance/stability-${mode}-${new Date().toISOString().replaceAll(':','-')}`;
await mkdir(out,{recursive:true});console.log(out);
const baseline=JSON.parse(await readFile('build/playback-performance/baseline/manifest.json'));
const overrides=process.env.CANDIDATE_MANIFEST?JSON.parse(await readFile(process.env.CANDIDATE_MANIFEST)):{};
for(const name of Object.keys(overrides))assert.ok(name in baseline);
const assets=Object.fromEntries(Object.keys(baseline).map(name=>[name,overrides[name]||name]));
for(const path of ['web/generated/index.js','web/generated/types.js','web/generated/unified-player.js','web/generated/internal/native-player.js','web/io-worker.js','web/range-reader.js','web/resource-loader.js','web/vod-manifest.js','fixtures/DejaVuSans.ttf'])assets[path]=path;
const config={candidate:assets};
await writeFile(out+'/server-config.json',JSON.stringify(config,null,2)+'\n');
const digest=async path=>{const hash=createHash('sha256');for await(const bytes of createReadStream(path))hash.update(bytes);return hash.digest('hex');};
const paths=[...new Set([...Object.values(assets),input,'tests/playback-stability.mjs','web/hybrid-performance.html','experiments/playback-performance/serve.mjs','experiments/playback-performance/range-origin.mjs'])];
const hashes=async()=>Object.fromEntries(await Promise.all(paths.map(async path=>[path,await digest(path)])));
const result={scope:'Sustained headless development playback; no foreground qualification. Browser process CPU excludes external macOS video services.',mode,input,probe,fps,durationSeconds:duration,segmentSeconds,warmupSeconds,hashes:await hashes(),segments:[],issues:{},passed:false};
const issue=(name,evidence)=>{const entry=result.issues[name]??={count:0,first:evidence};entry.count++;entry.last=evidence;};
let server,mediaServer,browser,page,cdp,origin,mediaOrigin,stopReason;
const onTerm=()=>{stopReason='SIGTERM';},onInterrupt=()=>{stopReason='SIGINT';};
process.on('SIGTERM',onTerm);process.on('SIGINT',onInterrupt);
const checkpoint=()=>writeFile(out+'/result.json',JSON.stringify(result,null,2)+'\n');
async function launchServer(script,env,args=[]){
 const process=spawn(globalThis.process.execPath,[script,...args],{env:{...globalThis.process.env,...env},stdio:['ignore','pipe','inherit']});
 const ready=new Promise((resolve,reject)=>{
  const timer=setTimeout(()=>reject(Error(`Server timeout: ${script}`)),30000);
  process.once('error',error=>{clearTimeout(timer);reject(error);});
  process.once('exit',code=>{clearTimeout(timer);reject(Error(`Server exited ${code}: ${script}`));});
  process.stdout.on('data',bytes=>{const match=/http:\/\/127\.0\.0\.1:\d+/.exec(String(bytes));if(match){clearTimeout(timer);resolve(match[0]);}});
 });
 return {process,ready};
}
async function stopServer(child){
 if(!child||child.exitCode!==null||child.signalCode!==null)return;
 const closed=new Promise(resolve=>child.once('exit',resolve));child.kill('SIGTERM');
 let timer;await Promise.race([closed,new Promise(resolve=>{timer=setTimeout(()=>{child.kill('SIGKILL');resolve();},3000);})]);clearTimeout(timer);
}
try{
 let service=await launchServer('experiments/playback-performance/serve.mjs',{PORT:'0'},[out+'/server-config.json']);server=service.process;origin=await service.ready;
 result.assets=await(await fetch(origin+'/__metadata')).json();
 for(const [name,path] of Object.entries(assets))assert.equal(result.assets.candidate[name].sha256,result.hashes[path]);
 service=await launchServer('experiments/playback-performance/range-origin.mjs',{MEDIA_INPUT:input,APP_ORIGIN:origin});mediaServer=service.process;mediaOrigin=await service.ready;
 result.mediaBefore=await(await fetch(mediaOrigin+'/__stats')).json();assert.equal(result.mediaBefore.sha256,result.hashes[input]);
 browser=await chromium.launch({channel:'chrome',headless:true,ignoreDefaultArgs:['--mute-audio'],args:['--autoplay-policy=no-user-gesture-required','--disable-background-timer-throttling','--disable-renderer-backgrounding','--disable-backgrounding-occluded-windows']});
 result.browser=browser.version();page=await browser.newPage({viewport:{width:1100,height:760},deviceScaleFactor:1});
 const pageErrors=[];page.on('pageerror',error=>pageErrors.push(String(error)));
 await page.goto(origin+'/candidate/web/hybrid-performance.html');
 await page.evaluate(async({mode,url,width,height})=>{
  const {Player}=await import('./generated/index.js');window.errors=[];
  window.player=new Player(document.querySelector('#surface'),{mode,width,height});
  player.addEventListener('error',event=>errors.push(event.detail));
  await player.openRemote({url});await player.play();
 },{mode,url:mediaOrigin+'/movie.mp4',width:video.width,height:video.height});
 cdp=await browser.newBrowserCDPSession();result.gpu=(await cdp.send('SystemInfo.getInfo')).gpu;
 const began=Date.now();let measured=0;
 const frames=state=>mode==='hybrid'?state.diagnostics.backend.presentation.drawn:state.diagnostics.backend.rendered;
 const drops=state=>state.quality.frameDrops+state.quality.decoderDrops;
 const sample=async()=>{
  const processes=(await cdp.send('SystemInfo.getProcessInfo')).processInfo;
  const rss=execFileSync('/bin/ps',['-o','rss=','-p',processes.map(process=>process.id).join(',')],{encoding:'utf8'}).trim().split(/\s+/).map(Number).reduce((a,b)=>a+b,0)*1024;
  const state=await page.evaluate(()=>snapshot());
  const record={at:Date.now(),processes,rss,workers:page.workers().length,state};
  assert.deepEqual(state.errors,[],'Playback error');assert.deepEqual(pageErrors,[],'Page error');
  assert.equal(state.mode,mode);assert.equal(state.diagnostics.backend.decoder,mode==='hybrid'?'webcodecs':'software');
  assert.ok(state.diagnostics.backend.heapBytes<=536870912,'Wasm heap bound');
  assert.ok(Number.isFinite(state.quality.frameDrops)&&Number.isFinite(state.quality.decoderDrops),'Drop counters unavailable');
  if(!Number.isFinite(state.quality.avsync)||Math.abs(state.quality.avsync)>=.12)issue('avsync',{at:record.at,value:state.quality.avsync});
  if(mode==='hybrid'){
   const stats=state.diagnostics.backend.decoderStats,presentation=state.diagnostics.backend.presentation;
   assert.equal(stats.errors,0);assert.equal(stats.copyMs,0);assert.ok(stats.peakOutstanding<=8&&stats.peakFrames<=8,'Decoder ownership bound');
   assert.equal(presentation.missing,0);assert.ok(presentation.retained<=16,'Retained frame bound');
  }
  return record;
 };
 while(measured<duration&&!stopReason){
  const index=result.segments.length,seconds=Math.min(segmentSeconds,duration-measured);
  if(index)await page.evaluate(async()=>{await player.pause();await player.seek(0);await player.play();});
  await page.evaluate(data=>progress(data),{trial:index+1,total:Math.ceil(duration/segmentSeconds),label:mode+' warmup after open/seek',seconds:warmupSeconds,remaining:Math.ceil(duration-measured)});
  await page.waitForTimeout(warmupSeconds*1000);
  await page.evaluate(data=>progress(data),{trial:index+1,total:Math.ceil(duration/segmentSeconds),label:mode+' sustained playback',seconds:Math.ceil(seconds),remaining:Math.max(0,Math.ceil(duration-measured-seconds))});
  const segment={index,samples:[]};result.segments.push(segment);const first=await sample();segment.samples.push(first);let last=first;
  while((last.at-first.at)/1000<seconds&&!stopReason){
   await page.waitForTimeout(Math.min(5000,Math.max(100,seconds*1000-(last.at-first.at))));
   last=await sample();segment.samples.push(last);
   if(segment.samples.length%6===0){console.log(`${mode} ${Math.round(measured+(last.at-first.at)/1000)}/${duration}s; issues=${Object.keys(result.issues).join(',')||'none'}`);await checkpoint();}
  }
  const elapsed=(last.at-first.at)/1000,frameDelta=frames(last.state)-frames(first.state),dropDelta=drops(last.state)-drops(first.state),audioDelta=last.state.audio.mediaFrames-first.state.audio.mediaFrames;
  let cpu=0;const churn=[];
  for(let n=1;n<segment.samples.length;n++){
   const previous=new Map(segment.samples[n-1].processes.map(process=>[process.id,process.cpuTime])),current=segment.samples[n].processes;
   for(const process of current){if(previous.has(process.id)){cpu+=process.cpuTime-previous.get(process.id);previous.delete(process.id);}else churn.push({added:process.id});}
   for(const id of previous.keys())churn.push({removed:id});
  }
  segment.summary={elapsed,frames:frameDelta,dropDelta,audioDelta,positionDelta:last.state.position-first.state.position,underrunDelta:last.state.audio.underruns-first.state.audio.underruns,cpuPercent:churn.length?null:cpu/elapsed*100,churn,rssFirst:first.rss,rssLast:last.rss,rssPeak:Math.max(...segment.samples.map(sample=>sample.rss)),heapFirst:first.state.diagnostics.backend.heapBytes,heapLast:last.state.diagnostics.backend.heapBytes};
  if(dropDelta!==0)issue('droppedFrames',{segment:index,delta:dropDelta});
  if(frameDelta<elapsed*fps*.95)issue('frameThroughput',{segment:index,frames:frameDelta,elapsed});
  if(Math.abs(segment.summary.positionDelta-elapsed)>=.5)issue('playbackDrift',{segment:index,position:segment.summary.positionDelta,elapsed});
  if(audioDelta<elapsed*last.state.audio.sampleRate*.94)issue('audioThroughput',{segment:index,audioDelta,elapsed});
  if(segment.summary.underrunDelta!==0)issue('audioUnderruns',{segment:index,delta:segment.summary.underrunDelta});
  measured+=elapsed;result.measuredSeconds=measured;result.wallSeconds=(Date.now()-began)/1000;
  console.log(JSON.stringify({segment:index,...segment.summary}));await checkpoint();
 }
 result.stopReason=stopReason||null;
 await page.evaluate(()=>player.pause());
 result.beforeDestroy=await page.evaluate(()=>snapshot());
 result.cleanup=await page.evaluate(async()=>{const backend=player.current.backend;await player.destroy();return backend.diagnostics;});
 for(let n=0;n<50&&page.workers().length;n++)await page.waitForTimeout(100);
 result.workersAfterDestroy=page.workers().length;assert.equal(result.workersAfterDestroy,0);
 if(mode==='hybrid'){const presentation=result.cleanup.presentation;assert.equal(presentation.received,presentation.closed);assert.equal(presentation.retained,0);}
 result.assetsFinal=await(await fetch(origin+'/__metadata')).json();
 result.mediaAfter=await(await fetch(mediaOrigin+'/__stats')).json();
 result.hashesAfter=await hashes();assert.deepEqual(result.hashesAfter,result.hashes);
 result.passed=!stopReason&&measured>=duration&&Object.keys(result.issues).length===0;
 if(!result.passed)process.exitCode=1;
}catch(error){result.failure=String(error.stack);console.error(result.failure);process.exitCode=1;try{result.lastState=await page?.evaluate(()=>snapshot());}catch{}}
finally{
 await checkpoint();await cdp?.detach().catch(()=>{});await browser?.close();
 await stopServer(mediaServer);await stopServer(server);
 process.off('SIGTERM',onTerm);process.off('SIGINT',onInterrupt);
 console.log(JSON.stringify({passed:result.passed,measuredSeconds:result.measuredSeconds,issues:result.issues,failure:result.failure}));
}
