import {chromium} from 'playwright';
import assert from 'node:assert/strict';
import {readFile,writeFile,mkdir,appendFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import os from 'node:os';
import {focusForQualification,observeForeground} from '../scripts/qualification-foreground.mjs';

const smoke=process.argv.includes('--smoke'),screen=true,out=`results/filter-routing/perf-${smoke?'smoke':screen?'screen':'measurement'}-${new Date().toISOString().replaceAll(':','-')}`;
await mkdir(out,{recursive:true});console.log(out);
const files=['experiments/filter-routing/PERF-PROTOCOL.md','experiments/filter-routing/prepare-perf.py','tests/filter-perf.mjs','web/filter-perf.html','web/filter-player.js','web/filter-retained-engine-worker.js','web/filter-copyback-engine-worker.js','web/generated/filter-retained-player.js','web/generated/filter-copyback-player.js','web/retained-decoder-worker.js','web/browser-decoder-worker.js','web/subtitle-overlay.js','web/engine-retained-subs/player.wasm','web/engine-retained-subs/player.mjs','web/engine-filter-copyback/player.wasm','web/engine-filter-copyback/player.mjs','web/benchmark-progress.js','scripts/benchmark-media-server.mjs','scripts/qualification-foreground.mjs','web/audio-worklet.js','web/io-worker.js','web/range-reader.js'];
const hashes=async()=>Object.fromEntries(await Promise.all(files.map(async f=>[f,createHash('sha256').update(await readFile(f)).digest('hex')])));
const median=values=>{const a=[...values].sort((a,b)=>a-b),n=a.length;return n?(a[Math.floor((n-1)/2)]+a[Math.floor(n/2)])/2:null;};
const result={started:new Date().toISOString(),smoke,screen,replicated:!smoke&&!screen,performanceEligible:!smoke,passed:false,hashes:await hashes(),
 host:{os:os.release(),arch:os.arch(),cpu:os.cpus()[0].model,memory:os.totalmem()},hardwareAcceleration:'unknown',energy:'unavailable',
 protocol:{warmupSeconds:smoke?2:10,measurementSeconds:smoke?5:30,network:{mbps:10,rtt:80},cssPresentation:[960,540],source:[1920,1080],deviceScaleFactor:1,
 orders:[['retained','copyback-null','copyback-mirror']]},trials:[]};
const save=()=>writeFile(`${out}/result.json`,JSON.stringify(result,null,2)+'\n');
async function trial(variant,round){
 const record={variant,round,samples:[],passed:false};result.trials.push(record);
 console.log(JSON.stringify({event:'start',variant,round}));
 const browser=await chromium.launch({channel:'chrome',headless:smoke,ignoreDefaultArgs:['--mute-audio'],args:['--autoplay-policy=no-user-gesture-required','--disable-background-timer-throttling','--disable-renderer-backgrounding','--disable-backgrounding-occluded-windows']});
 let page;
 const total=result.protocol.orders.flat().length,index=result.trials.length;
 const budget=result.protocol.warmupSeconds+result.protocol.measurementSeconds+15;
 const progress=(phase,phaseSeconds=0,extra={})=>page.evaluate(data=>setBenchmarkProgress(data),{index,total,label:variant,phase,phaseSeconds,remainingSeconds:(total-index)*budget+phaseSeconds+(phase==='Warmup'?result.protocol.measurementSeconds:0)+15,...extra});
 try{
  record.browser=browser.version();page=await browser.newPage({viewport:{width:1280,height:900},deviceScaleFactor:1});const pageErrors=[];
  page.on('pageerror',error=>pageErrors.push(String(error)));
  const id=`three-${round}-${variant}-${Date.now()}`,control=()=>fetch(`http://127.0.0.1:4183/control?id=${id}`).then(r=>r.json());
  record.originBefore=await control();assert.equal(record.originBefore.mbps,10);assert.equal(record.originBefore.rtt,80);assert.equal(record.originBefore.etag,result.origin.etag);
  await page.goto(`http://127.0.0.1:4179/web/filter-perf.html?mode=${variant}&quality=${+smoke}`);await page.waitForFunction(()=>typeof startBenchmark==='function'&&typeof setBenchmarkProgress==='function');
  await progress('Starting playback',result.protocol.warmupSeconds+result.protocol.measurementSeconds);
  await page.evaluate(({variant,id})=>startBenchmark(variant,`http://127.0.0.1:4183/media?id=${id}`),{variant,id});
  await page.waitForFunction(()=>benchmarkState().ready&&benchmarkState().rendered>5,null,{timeout:20000});
  if(!smoke)record.foregroundAtWarmup=await focusForQualification(page,browser);
  const cdp=await browser.newBrowserCDPSession();
  async function sample(phase){
   const processes=(await cdp.send('SystemInfo.getProcessInfo')).processInfo;
   const at=Date.now();
   const rss=execFileSync('/bin/ps',['-o','pid=,rss=','-p',processes.map(p=>p.id).join(',')],{encoding:'utf8'}).trim().split('\n').map(line=>{const [pid,kib]=line.trim().split(/\s+/).map(Number);return {pid,bytes:kib*1024};});
   const state=await page.evaluate(()=>benchmarkState());
   const data={at,phase,processes,rss,totalRSS:rss.reduce((sum,p)=>sum+p.bytes,0),foreground:smoke?{matched:null,scope:'headless smoke'}:await observeForeground(page,browser),state};
   record.samples.push(data);await appendFile(`${out}/raw.jsonl`,JSON.stringify({variant,round,...data})+'\n');
   if(!smoke)assert.ok(data.foreground.matched,'Foreground condition changed');
   assert.deepEqual(state.errors,[]);assert.ok(state.ready,'Playback is not ready');
   const d=state.diagnostics;
   assert.equal(d.decoder,'webcodecs');assert.ok(d.heapBytes<=536870912);assert.ok(d.io.peakCacheBytes<=16777216);
   assert.ok(d.decoderStats.peakOutstanding<=8);assert.ok(d.decoderStats.peakFrames<=8);
   assert.equal(d.route,variant==='retained'?'retained':'copyback');
   assert.equal(d.videoFilters,variant==='retained'?'':variant==='copyback-null'?'null':'hflip');
   if(variant==='retained'){assert.equal(d.skipCanvas,true);assert.equal(d.mode,'retained');assert.ok(d.presentation.peakRetained<=16);assert.equal(d.presentation.missing,0);assert.equal(d.decoderStats.actualWidth,1920);assert.equal(d.decoderStats.actualHeight,1080);}
   return data;
  }
  for(const [phase,seconds] of [['warmup',result.protocol.warmupSeconds],['measurement',result.protocol.measurementSeconds]]){
   await progress(phase==='warmup'?'Warmup':'Measuring',seconds);
   const first=await sample(phase);let last=first;
   while(last.at-first.at<seconds*1000){await page.waitForTimeout(smoke?1000:2000);last=await sample(phase);}
  }
  const samples=record.samples.filter(s=>s.phase==='measurement'),first=samples[0],last=samples.at(-1),turnover=[];
  let cpuSeconds=0;
  for(let i=1;i<samples.length;i++){
   const previous=new Map(samples[i-1].processes.map(p=>[p.id,p.cpuTime])),next=new Set(samples[i].processes.map(p=>p.id));
   for(const p of samples[i].processes){if(previous.has(p.id))cpuSeconds+=Math.max(0,p.cpuTime-previous.get(p.id));else turnover.push({added:p.id,at:samples[i].at});}
   for(const pid of previous.keys())if(!next.has(pid))turnover.push({removed:pid,at:samples[i].at});
  }
  const elapsed=(last.at-first.at)/1000,rendered=last.state.rendered-first.state.rendered,dropped=last.state.dropped-first.state.dropped;
  const copied=variant!=='native'?last.state.diagnostics.decoderStats.frames-first.state.diagnostics.decoderStats.frames:0;
  record.summary={elapsedSeconds:elapsed,cpuSeconds,cpuPercentOfOneCore:cpuSeconds/elapsed*100,processTurnover:turnover,
   medianRSSBytes:median(samples.map(s=>s.totalRSS)),rendered,dropped,dropFraction:dropped/(rendered+dropped),frameCounter:last.state.frameCounter,
   positionSeconds:last.state.position-first.state.position,decoderCopyWallMsPerFrame:copied?(last.state.diagnostics.decoderStats.copyMs-first.state.diagnostics.decoderStats.copyMs)/copied:null};
  assert.deepEqual(turnover,[]);assert.deepEqual(pageErrors,[]);assert.ok(rendered>=elapsed*29,'Frame delivery below 29 fps');assert.ok(record.summary.dropFraction<=.01);
  assert.ok(record.summary.positionSeconds>=elapsed*.97&&record.summary.positionSeconds<=elapsed*1.03,'Playback time did not track wall time');
  const da=first.state.diagnostics,db=last.state.diagnostics;
  record.summary.decodedFrames=db.decoderStats.frames-da.decoderStats.frames;
  record.summary.audioFrames=last.state.audio.mediaFrames-first.state.audio.mediaFrames;
  record.summary.renderWallMsPerFrame=(db.renderMs-da.renderMs)/rendered;
  record.summary.canvasWallMsPerFrame=(db.copyMs-da.copyMs)/rendered;
  assert.ok(Math.abs(record.summary.decodedFrames-rendered)<=12,'Decode/render counts diverged');
  assert.ok(record.summary.audioFrames>=elapsed*last.state.audio.sampleRate*.95,'Audio throughput too low');
  if(variant==='retained'){
   assert.equal(db.decoderStats.copyMs-da.decoderStats.copyMs,0);assert.equal(db.copyMs-da.copyMs,0);
   record.summary.presentationDraws=db.presentation.drawn-da.presentation.drawn;
   assert.ok(Math.abs(record.summary.presentationDraws-rendered)<=12);
   const observed=new Map(),startPTS=da.presentation.pts.at(-1);
   for(const sample of samples){const p=sample.state.diagnostics.presentation;for(let i=0;i<p.pts.length;i++)if(p.pts[i]>startPTS)observed.set(p.pts[i],p.lateMs[i]);}
   const late=[...observed.values()].sort((a,b)=>a-b);
   record.summary.presentationTimingSamples=late.length;record.summary.presentationLateP95Ms=late[Math.floor(late.length*.95)];record.summary.presentationLateMaxMs=Math.max(...late);
   assert.ok(record.summary.presentationLateP95Ms<=33&&record.summary.presentationLateMaxMs<=100);
  }else{assert.ok(db.decoderStats.copyMs-da.decoderStats.copyMs>0);assert.ok(db.copyMs-da.copyMs>0);}
  if(smoke){record.pixelCheck=await page.evaluate(()=>checkPixels());assert.ok(record.pixelCheck.max-record.pixelCheck.min>100);}
  record.originAfter=await control();record.summary.originBytes=record.originAfter.bytes;assert.equal(record.originAfter.etag,result.origin.etag);
  if(smoke)await page.screenshot({path:`${out}/${variant}.png`});
  await progress('Checking cleanup');
  record.cleanup=await page.evaluate(()=>stopBenchmark());
  for(let i=0;i<50&&page.workers().length;i++)await page.waitForTimeout(100);
  record.cleanup.retainedWorkers=page.workers().length;assert.equal(record.cleanup.retainedWorkers,0);
  if(variant==='retained'){const p=record.cleanup.presentation;assert.equal(p.received,p.closed);assert.equal(p.retained,0);assert.equal(p.pending,0);assert.equal(record.cleanup.decoderStats.transferredFrames,p.received);}
  if(record.cleanup.decoderStats){const stats=record.cleanup.decoderStats;assert.equal(stats.closedFrames,stats.receivedFrames);assert.equal(stats.active,false);}
  for(let i=0;i<50;i++){record.originAfterCleanup=await control();if(!record.originAfterCleanup.active)break;await page.waitForTimeout(100);}
  assert.equal(record.originAfterCleanup.active,0);record.passed=true;
  await progress(index===total?'Complete':'Test complete — next test starting',0,{done:index===total});
 }catch(error){await progress('Stopped',0,{failed:true}).catch(()=>{});record.failure=String(error.stack);record.failureState=await page?.evaluate(()=>typeof benchmarkState==='function'?benchmarkState():null).catch(()=>null);throw error;}
 finally{
  await save();
  let timeout;
  record.closeAcknowledged=await Promise.race([browser.close().then(()=>true),new Promise(resolve=>{timeout=setTimeout(()=>resolve(false),15000);})]);
  clearTimeout(timeout);
  const owned=record.samples.at(-1)?.processes.map(p=>p.id)??[];
  const live=new Set(execFileSync('/bin/ps',['-axo','pid='],{encoding:'utf8'}).trim().split(/\s+/).map(Number));
  record.retainedBrowserPIDs=owned.filter(pid=>live.has(pid));
  assert.deepEqual(record.retainedBrowserPIDs,[],'Browser processes remain after close');
  await save();
 }
 console.log(JSON.stringify({event:'done',variant,round,...record.summary}));
}
try{
 result.origin=await(await fetch('http://127.0.0.1:4183/control?id=preflight')).json();await save();
 for(const [round,order] of result.protocol.orders.entries())for(const variant of order)await trial(variant,round);
 result.rounds=result.protocol.orders.map((_,round)=>{
  const cpu=Object.fromEntries(result.trials.filter(t=>t.round===round).map(t=>[t.variant,t.summary.cpuPercentOfOneCore]));
  return {round,cpu,copybackOverheadPoints:cpu['copyback-null']-cpu.retained,copybackRelativePercent:(cpu['copyback-null']/cpu.retained-1)*100,mirrorIncrementPoints:cpu['copyback-mirror']-cpu['copyback-null'],mirrorRelativePercent:(cpu['copyback-mirror']/cpu['copyback-null']-1)*100};
 });
 result.passed=result.trials.every(t=>t.passed);
}catch(error){result.failure=String(error.stack);console.error(result.failure);process.exitCode=1;}
finally{result.hashesAfter=await hashes();result.runtimeUnchanged=JSON.stringify(result.hashes)===JSON.stringify(result.hashesAfter);if(!result.runtimeUnchanged){result.passed=false;process.exitCode=1;}result.finished=new Date().toISOString();await save();}
