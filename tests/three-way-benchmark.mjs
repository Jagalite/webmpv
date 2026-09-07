import {chromium} from 'playwright';
import assert from 'node:assert/strict';
import {readFile,writeFile,mkdir,appendFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import os from 'node:os';
import {focusForQualification,observeForeground} from '../scripts/qualification-foreground.mjs';

const smoke=process.argv.includes('--smoke'),out=`results/benchmark/${smoke?'smoke':'measurement'}-${new Date().toISOString().replaceAll(':','-')}`;
await mkdir(out,{recursive:true});console.log(out);
const files=['docs/THREE-WAY-BENCHMARK.md','tests/three-way-benchmark.mjs','scripts/benchmark-media-server.mjs','scripts/qualification-foreground.mjs',
 'web/benchmark.html','web/generated/player.js','web/engine/player.wasm','web/engine/player.mjs','web/engine-m4/player.wasm','web/engine-m4/player.mjs',
 'web/engine-worker.js','web/browser-decoder-worker.js','web/audio-worklet.js','web/io-worker.js','web/range-reader.js'];
const hashes=async()=>Object.fromEntries(await Promise.all(files.map(async f=>[f,createHash('sha256').update(await readFile(f)).digest('hex')])));
const median=values=>{const a=[...values].sort((a,b)=>a-b),n=a.length;return n?(a[Math.floor((n-1)/2)]+a[Math.floor(n/2)])/2:null;};
const result={started:new Date().toISOString(),smoke,performanceEligible:!smoke,passed:false,hashes:await hashes(),
 host:{os:os.release(),arch:os.arch(),cpu:os.cpus()[0].model,memory:os.totalmem()},hardwareAcceleration:'unknown',energy:'unavailable',
 protocol:{warmupSeconds:smoke?2:30,measurementSeconds:smoke?4:60,network:{mbps:10,rtt:80},cssPresentation:[960,540],source:[1920,1080],deviceScaleFactor:1,
 orders:smoke?[['native','software','webcodecs']]:[['native','software','webcodecs'],['software','webcodecs','native'],['webcodecs','native','software']]},trials:[]};
const save=()=>writeFile(`${out}/result.json`,JSON.stringify(result,null,2)+'\n');
async function trial(variant,round){
 const record={variant,round,samples:[],passed:false};result.trials.push(record);
 console.log(JSON.stringify({event:'start',variant,round}));
 const browser=await chromium.launch({channel:'chrome',headless:smoke,ignoreDefaultArgs:['--mute-audio'],args:['--autoplay-policy=no-user-gesture-required','--disable-background-timer-throttling','--disable-renderer-backgrounding','--disable-backgrounding-occluded-windows']});
 let page;
 try{
  record.browser=browser.version();page=await browser.newPage({viewport:{width:1280,height:900},deviceScaleFactor:1});const pageErrors=[];
  page.on('pageerror',error=>pageErrors.push(String(error)));
  const id=`three-${round}-${variant}-${Date.now()}`,control=()=>fetch(`http://127.0.0.1:4183/control?id=${id}`).then(r=>r.json());
  record.originBefore=await control();assert.equal(record.originBefore.mbps,10);assert.equal(record.originBefore.rtt,80);assert.equal(record.originBefore.etag,result.origin.etag);
  await page.goto('http://127.0.0.1:4179/web/benchmark.html');await page.waitForFunction(()=>typeof startBenchmark==='function');
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
   if(variant==='native'){assert.equal(state.width,1920);assert.equal(state.height,1080);assert.equal(state.audio.muted,false);assert.equal(state.audio.volume,1);}
   else{assert.equal(state.diagnostics.decoder,variant);assert.ok(state.diagnostics.heapBytes<=536870912);assert.ok(state.diagnostics.io.peakCacheBytes<=16777216);}
   if(variant==='webcodecs'){assert.ok(state.diagnostics.decoderStats.peakOutstanding<=8);assert.ok(state.diagnostics.decoderStats.peakFrames<=8);}
   return data;
  }
  for(const [phase,seconds] of [['warmup',result.protocol.warmupSeconds],['measurement',result.protocol.measurementSeconds]]){
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
  const copied=variant==='webcodecs'?last.state.diagnostics.decoderStats.frames-first.state.diagnostics.decoderStats.frames:0;
  record.summary={elapsedSeconds:elapsed,cpuSeconds,cpuPercentOfOneCore:cpuSeconds/elapsed*100,processTurnover:turnover,
   medianRSSBytes:median(samples.map(s=>s.totalRSS)),rendered,dropped,dropFraction:dropped/(rendered+dropped),frameCounter:last.state.frameCounter,
   positionSeconds:last.state.position-first.state.position,decoderCopyWallMsPerFrame:copied?(last.state.diagnostics.decoderStats.copyMs-first.state.diagnostics.decoderStats.copyMs)/copied:null};
  assert.deepEqual(turnover,[]);assert.deepEqual(pageErrors,[]);assert.ok(rendered>=elapsed*29,'Frame delivery below 29 fps');assert.ok(record.summary.dropFraction<=.01);
  assert.ok(record.summary.positionSeconds>=elapsed*.97&&record.summary.positionSeconds<=elapsed*1.03,'Playback time did not track wall time');
  if(variant!=='native')assert.ok(last.state.audio.mediaFrames>first.state.audio.mediaFrames);
  record.originAfter=await control();record.summary.originBytes=record.originAfter.bytes;assert.equal(record.originAfter.etag,result.origin.etag);
  record.cleanup=await page.evaluate(()=>stopBenchmark());
  for(let i=0;i<50&&page.workers().length;i++)await page.waitForTimeout(100);
  record.cleanup.retainedWorkers=page.workers().length;assert.equal(record.cleanup.retainedWorkers,0);
  if(record.cleanup.decoderStats){const stats=record.cleanup.decoderStats;assert.equal(stats.closedFrames,stats.receivedFrames);assert.equal(stats.active,false);}
  for(let i=0;i<50;i++){record.originAfterCleanup=await control();if(!record.originAfterCleanup.active)break;await page.waitForTimeout(100);}
  assert.equal(record.originAfterCleanup.active,0);record.passed=true;
 }catch(error){record.failure=String(error.stack);record.failureState=await page?.evaluate(()=>typeof benchmarkState==='function'?benchmarkState():null).catch(()=>null);throw error;}
 finally{await save();await browser.close();}
 console.log(JSON.stringify({event:'done',variant,round,...record.summary}));
}
try{
 result.origin=await(await fetch('http://127.0.0.1:4183/control?id=preflight')).json();await save();
 for(const [round,order] of result.protocol.orders.entries())for(const variant of order)await trial(variant,round);
 result.rounds=result.protocol.orders.map((_,round)=>{
  const cpu=Object.fromEntries(result.trials.filter(t=>t.round===round).map(t=>[t.variant,t.summary.cpuPercentOfOneCore]));
  return {round,cpu,webcodecsSavingsVsSoftware:1-cpu.webcodecs/cpu.software,softwareMultipleOfNative:cpu.software/cpu.native,webcodecsMultipleOfNative:cpu.webcodecs/cpu.native};
 });
 result.passed=result.trials.every(t=>t.passed);
}catch(error){result.failure=String(error.stack);console.error(result.failure);process.exitCode=1;}
finally{result.hashesAfter=await hashes();result.runtimeUnchanged=JSON.stringify(result.hashes)===JSON.stringify(result.hashesAfter);if(!result.runtimeUnchanged){result.passed=false;process.exitCode=1;}result.finished=new Date().toISOString();await save();}
