import {chromium} from 'playwright';
import {mkdir,writeFile,readFile,appendFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import os from 'node:os';
const smoke=process.argv.includes('--smoke');
const out=process.env.RESULT_DIR || `results/m3/${smoke?'smoke':'measurement'}-${new Date().toISOString().replaceAll(':','-')}`;
await mkdir(out,{recursive:true});
const hash=b=>createHash('sha256').update(b).digest('hex');
const median=xs=>{const a=[...xs].sort((a,b)=>a-b);return a.length?a[Math.floor(a.length/2)]:null;};
const result={started:new Date().toISOString(),smoke,host:{os:os.release(),arch:os.arch(),cpu:os.cpus()[0].model,memory:os.totalmem()},
  energy:'unavailable; CPU is not an energy measurement',hardwareAcceleration:'unknown',hashes:{},quality:[],seeks:[],measurements:[],errors:[],consoleDiagnostics:[]};
for(const file of ['docs/M3-BENCHMARK.md','experiments/m3/decoder.c','experiments/m3/build.sh','experiments/m3/run.mjs',
  'web/m3/index.html','web/m3/worker.js','web/m3/engine/decoder.mjs','web/m3/engine/decoder.wasm',
  'web/m3/fixture/manifest.json','web/m3/fixture/packets.bin','sources.lock.json']) result.hashes[file]=hash(await readFile(file));
const manifest=JSON.parse(await readFile('web/m3/fixture/manifest.json','utf8'));
const packets=await readFile('web/m3/fixture/packets.bin');
if(hash(packets)!==manifest.packetsSha256)throw Error('Packed payload mismatch');
for(const p of manifest.packets)if(hash(packets.subarray(p.offset,p.offset+p.size))!==p.sha256)throw Error('Packet mismatch');
const browser=await chromium.launch({channel:'chrome',headless:false,args:['--disable-background-timer-throttling','--disable-renderer-backgrounding','--disable-backgrounding-occluded-windows']});
const cdp=await browser.newBrowserCDPSession();
result.browser=browser.version();
const page=await browser.newPage({viewport:{width:1100,height:850}});
page.on('pageerror',e=>result.errors.push(String(e)));
page.on('console',m=>{if(m.type()==='error')result.consoleDiagnostics.push(m.text());});
await page.addInitScript(()=>{HTMLMediaElement.prototype.play=()=>{throw Error('Native media playback forbidden');};});
await page.goto(process.env.BENCH_URL||'http://127.0.0.1:4179/web/m3/index.html');
await page.bringToFront();
await page.waitForFunction(()=>typeof runBenchmark==='function');
async function sample(){
 const info=(await cdp.send('SystemInfo.getProcessInfo')).processInfo;
 const rss=execFileSync('/bin/ps',['-o','pid=,rss=','-p',info.map(p=>p.id).join(',')],{encoding:'utf8'}).trim().split('\n').map(line=>{
  const [pid,kib]=line.trim().split(/\s+/).map(Number);return {pid,bytes:kib*1024};});
 return {at:Date.now(),cpu:info.map(p=>({pid:p.id,type:p.type,seconds:p.cpuTime})),rssBytes:rss.reduce((s,p)=>s+p.bytes,0),
   progress:await page.evaluate(()=>window.progress),visibility:await page.evaluate(()=>document.visibilityState)};
}
async function run(options){
 console.log(JSON.stringify({event:'start',...options}));
 let settled=false, failure, value;
 const promise=page.evaluate(options=>runBenchmark(options),options).then(r=>{value=r;settled=true;},e=>{failure=e;settled=true;});
 const samples=[];
 while(!settled){
  await new Promise(r=>setTimeout(r,1000));
  if(!settled){const s=await sample();samples.push(s);await appendFile(`${out}/raw.jsonl`,JSON.stringify({options,...s})+'\n');}
 }
 await promise;if(failure)throw failure;
 value.samples=samples;
 const steady=samples.filter(s=>s.progress?.phase==='playback');
 let cpuSeconds=0,elapsedSeconds=0;
 for(let i=1;i<steady.length;i++){
  const previous=new Map(steady[i-1].cpu.map(p=>[p.pid,p.seconds]));
  cpuSeconds+=steady[i].cpu.reduce((sum,p)=>sum+(previous.has(p.pid)?Math.max(0,p.seconds-previous.get(p.pid)):0),0);
  elapsedSeconds+=(steady[i].at-steady[i-1].at)/1000;
 }
 value.cpu={cpuSeconds,elapsedSeconds,percentOfOneCore:elapsedSeconds?cpuSeconds/elapsedSeconds*100:null};
 const early=steady.slice(2,Math.max(3,Math.floor(steady.length/3))).map(s=>s.rssBytes);
 const late=steady.slice(-Math.max(1,Math.floor(steady.length/3))).map(s=>s.rssBytes);
 value.memory={peakRSSBytes:steady.length?Math.max(...steady.map(s=>s.rssBytes)):null,
   medianRSSGrowthBytes:early.length&&late.length?median(late)-median(early):null};
 value.foreground=value.visibility.every(v=>v.state==='visible')&&samples.every(s=>s.visibility==='visible');
 console.log(JSON.stringify({event:'done',path:options.path,quality:options.quality,seek:options.seek,
   cpu:value.cpu.percentOfOneCore,checks:value.checks}));
 return value;
}
try {
 for(const path of ['software','copyback','retained']){
  result.quality.push(await run({path,passes:1,quality:true}));
  result.seeks.push(await run({path,passes:1,seek:true}));
 }
 const reference=result.quality[0].runs[0].samples;
 result.pixelComparisons=result.quality.slice(1).map(q=>({path:q.path,frames:q.runs[0].samples.map(s=>{
  const ref=reference.find(r=>r.pts===s.pts);if(!ref||ref.rgb.length!==s.rgb.length)throw Error('Missing quality reference');
  const differences=s.rgb.map((v,i)=>Math.abs(v-ref.rgb[i])).sort((a,b)=>a-b);
  return {pts:s.pts,mae:differences.reduce((a,b)=>a+b,0)/differences.length,p99:differences[Math.ceil(differences.length*.99)-1]};
 })}));
 for(const comparison of result.pixelComparisons)comparison.passed=comparison.frames.length===4&&comparison.frames.every(f=>f.mae<=3&&f.p99<=16);
 result.qualityPassed=result.pixelComparisons.every(c=>c.passed);
 result.copybackQualityPassed=result.pixelComparisons.find(c=>c.path==='copyback').passed;
 if(!result.copybackQualityPassed)throw Error('Predeclared copy-back pixel equivalence gate failed');
 const orders=[['software','copyback','retained'],['copyback','retained','software'],['retained','software','copyback']];
 for(let pair=0;pair<(smoke?1:3);pair++)for(const path of orders[pair]) {
  const measured=await run({path,passes:smoke?1:3});measured.pair=pair;result.measurements.push(measured);
  await writeFile(`${out}/result.json`,JSON.stringify(result,null,2)+'\n');
 }
 result.pairs=Array.from({length:smoke?1:3},(_,pair)=>{
  const runs=result.measurements.filter(r=>r.pair===pair);
  const sw=runs.find(r=>r.path==='software').cpu.percentOfOneCore;
  return {pair,...Object.fromEntries(runs.filter(r=>r.path!=='software').map(r=>[r.path,1-r.cpu.percentOfOneCore/sw]))};
 });
 const runtimePass=r=>Object.values(r.checks).every(Boolean)&&r.foreground&&
   r.memory.medianRSSGrowthBytes!==null&&r.memory.medianRSSGrowthBytes<=64*1048576;
 result.correctnessPassed=result.qualityPassed&&result.measurements.every(runtimePass)&&result.errors.length===0;
 result.copybackCorrectnessPassed=result.copybackQualityPassed&&result.measurements.filter(r=>r.path!=='retained').every(runtimePass)&&result.errors.length===0;
 result.copybackBenefitPassed=!smoke&&median(result.pairs.map(p=>p.copyback))>=.3&&result.pairs.every(p=>p.copyback>=.2);
 result.g2='Pending explicit user decision; no production integration authorized';
 result.passed=!smoke&&result.copybackCorrectnessPassed&&result.copybackBenefitPassed;
 if(!result.copybackCorrectnessPassed)process.exitCode=1;
}catch(error){result.failure=String(error.stack||error);process.exitCode=1;console.error(result.failure);}
finally{
 result.finished=new Date().toISOString();
 await writeFile(`${out}/result.json`,JSON.stringify(result,null,2)+'\n');
 await page.screenshot({path:`${out}/final.png`}).catch(()=>{});
 await browser.close();console.log(JSON.stringify({out,passed:result.passed,failure:result.failure}));
}
