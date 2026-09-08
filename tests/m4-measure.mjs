import {chromium} from 'playwright';
import assert from 'node:assert/strict';
import {readFile,writeFile,mkdir,appendFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import os from 'node:os';
import {focusForQualification,observeForeground} from '../scripts/qualification-foreground.mjs';

const out=`results/m4/integrated-${new Date().toISOString().replaceAll(':','-')}`;
await mkdir(out,{recursive:true});
const files=['docs/M4-MEASUREMENT-PROTOCOL.md','tests/m4-measure.mjs',
 'scripts/qualification-foreground.mjs','web/engine/player.wasm','web/engine/player.mjs',
 'web/engine-m4/player.wasm','web/engine-m4/player.mjs','web/index.html',
 'web/generated/player.js','web/engine-worker.js','web/browser-decoder-worker.js',
 'web/audio-worklet.js','web/io-worker.js','web/range-reader.js','scripts/media-server.mjs'];
const hashes=async()=>Object.fromEntries(await Promise.all(files.map(async f=>[f,createHash('sha256').update(await readFile(f)).digest('hex')])));
const median=xs=>{const a=[...xs].sort((a,b)=>a-b);return a.length?a[Math.floor(a.length/2)]:null;};
const result={started:new Date().toISOString(),host:{os:os.release(),arch:os.arch(),cpu:os.cpus()[0].model,memory:os.totalmem()},
 protocol:{warmupSeconds:30,measurementSeconds:60,network:{mbps:10,rtt:80},orders:[['software','webcodecs'],['webcodecs','software'],['software','webcodecs']]},
 hashes:await hashes(),measurements:[],passed:false,energy:'unavailable',hardwareAcceleration:'unknown'};
const save=()=>writeFile(`${out}/result.json`,JSON.stringify(result,null,2)+'\n');
await save();console.log(out);
async function measure(backend,pair){
 const record={backend,pair,samples:[],passed:false};result.measurements.push(record);
 const browser=await chromium.launch({channel:'chrome',headless:false,ignoreDefaultArgs:['--mute-audio'],args:['--autoplay-policy=no-user-gesture-required','--disable-background-timer-throttling','--disable-renderer-backgrounding','--disable-backgrounding-occluded-windows']});
 try{
  record.browser=browser.version();const page=await browser.newPage({viewport:{width:1280,height:1100}}),pageErrors=[];
  page.on('pageerror',e=>pageErrors.push(String(e)));
  await page.addInitScript(()=>{HTMLMediaElement.prototype.play=()=>{throw Error('Native media forbidden');};});
  const id=`m4-measure-${pair}-${backend}-${Date.now()}`;
  const control=async options=>fetch(`http://127.0.0.1:4180/control?id=${id}`,options?{method:'POST',body:JSON.stringify(options)}:{}).then(r=>r.json());
  record.networkBefore=await control({...result.protocol.network,mode:'normal',stall:false,outageUntil:0});
  await page.goto(`http://127.0.0.1:4179/web/index.html?${backend==='software'?'no-codecs':'decoder=webcodecs'}`);
  await page.waitForFunction(()=>typeof createPlayer==='function');
  record.foregroundAtStart=await focusForQualification(page,browser);
  await page.evaluate(async id=>{await createPlayer();player.resize(1920,1080);await player.openRemote({url:`http://127.0.0.1:4180/media/front?id=${id}`});await player.play();},id);
  await page.waitForFunction(()=>player.diagnostics?.rendered>5&&player.audioDiagnostics().mediaFrames>4096,{},{timeout:20000});
  // Fresh browser activation can settle during source startup. Establish
  // focus at the actual warmup boundary, then only observe it during sampling.
  record.foregroundAtWarmup=await focusForQualification(page,browser);
  const cdp=await browser.newBrowserCDPSession();
  async function sample(phase){
   const processes=(await cdp.send('SystemInfo.getProcessInfo')).processInfo;
   const rss=execFileSync('/bin/ps',['-o','pid=,rss=','-p',processes.map(p=>p.id).join(',')],{encoding:'utf8'}).trim().split('\n').map(line=>{const [pid,kib]=line.trim().split(/\s+/).map(Number);return {pid,bytes:kib*1024};});
   const data={at:Date.now(),phase,processes,rss,totalRSS:rss.reduce((n,p)=>n+p.bytes,0),foreground:await observeForeground(page,browser),
    ...await page.evaluate(()=>({video:player.diagnostics,audio:player.audioDiagnostics(),drops:player.properties.get('frame-drop-count'),errors:playerErrors.slice()}))};
   record.samples.push(data);await appendFile(`${out}/raw.jsonl`,JSON.stringify({backend,pair,...data})+'\n');
   assert.ok(data.foreground.matched,'Foreground condition changed');assert.deepEqual(data.errors,[]);
   assert.equal(data.video.decoder,backend);assert.ok(data.video.heapBytes<=536870912);
   assert.ok((data.video.io?.peakCacheBytes||0)<=16777216);
   if(backend==='webcodecs'){assert.ok(data.video.decoderStats.peakOutstanding<=8);assert.ok(data.video.decoderStats.peakFrames<=8);}
   return data;
  }
  for(const [phase,seconds] of [['warmup',30],['measurement',60]]){
   const start=Date.now();await sample(phase);
   while(Date.now()-start<seconds*1000){await page.waitForTimeout(2000);await sample(phase);}
  }
  const samples=record.samples.filter(s=>s.phase==='measurement'),first=samples[0],last=samples.at(-1);
  let cpu=0;const turnover=[];
  for(let i=1;i<samples.length;i++){
   const previous=new Map(samples[i-1].processes.map(p=>[p.id,p.cpuTime]));
   const current=new Set(samples[i].processes.map(p=>p.id));
   for(const p of samples[i].processes){if(previous.has(p.id))cpu+=Math.max(0,p.cpuTime-previous.get(p.id));else turnover.push({at:samples[i].at,added:p.id});}
   for(const id of previous.keys())if(!current.has(id))turnover.push({at:samples[i].at,removed:id});
  }
  const elapsed=(last.at-first.at)/1000,frames=last.video.rendered-first.video.rendered;
  const copied=backend==='webcodecs'?last.video.decoderStats.frames-first.video.decoderStats.frames:0;
  record.summary={elapsedSeconds:elapsed,cpuPercentOfOneCore:cpu/elapsed*100,processTurnover:turnover,
   medianRSSBytes:median(samples.map(s=>s.totalRSS)),rendered:frames,dropped:(last.drops||0)-(first.drops||0),
   decoderCopyWallMsPerFrame:copied?(last.video.decoderStats.copyMs-first.video.decoderStats.copyMs)/copied:null,
   renderWallMsPerFrame:frames?(last.video.renderMs-first.video.renderMs)/frames:null,
   canvasCopyWallMsPerFrame:frames?(last.video.copyMs-first.video.copyMs)/frames:null};
  record.networkAfter=await control();assert.equal(record.networkAfter.mbps,10);assert.equal(record.networkAfter.rtt,80);
  assert.ok(frames>0&&last.audio.mediaFrames>first.audio.mediaFrames);assert.deepEqual(turnover,[]);assert.deepEqual(pageErrors,[]);
  await page.evaluate(()=>player.destroy());for(let i=0;i<30&&page.workers().length;i++)await page.waitForTimeout(100);
  record.retainedWorkers=page.workers().length;assert.equal(record.retainedWorkers,0);record.passed=true;
 }catch(error){record.failure=String(error.stack);throw error;}
 finally{await save();await browser.close();}
 console.log(JSON.stringify({backend,pair,...record.summary}));
}
try{
 // Warm the origin's full-file identity cache before browser startup; this
 // request is outside all warmup and measurement intervals.
 const preflightStart=Date.now();
 const response=await fetch('http://127.0.0.1:4180/media/front?id=g3-preflight-'+Date.now(),{headers:{Range:'bytes=0-0'},signal:AbortSignal.timeout(120000)});
 const bytes=await response.arrayBuffer();
 result.originPreflight={elapsedMs:Date.now()-preflightStart,status:response.status,etag:response.headers.get('etag'),contentRange:response.headers.get('content-range'),bytes:bytes.byteLength};
 assert.equal(response.status,206);assert.equal(bytes.byteLength,1);await save();
 for(const [pair,order] of result.protocol.orders.entries())for(const backend of order)await measure(backend,pair);
 result.pairs=result.protocol.orders.map((_,pair)=>{const samples=result.measurements.filter(m=>m.pair===pair);const sw=samples.find(m=>m.backend==='software').summary.cpuPercentOfOneCore;const wc=samples.find(m=>m.backend==='webcodecs').summary.cpuPercentOfOneCore;return {pair,softwareCPU:sw,optionalCPU:wc,savingsFraction:1-wc/sw};});
 result.passed=result.measurements.every(m=>m.passed);
}catch(error){result.failure=String(error.stack);process.exitCode=1;}
finally{result.hashesAfter=await hashes();result.runtimeUnchanged=JSON.stringify(result.hashes)===JSON.stringify(result.hashesAfter);if(!result.runtimeUnchanged){result.passed=false;process.exitCode=1;}result.finished=new Date().toISOString();await save();}
