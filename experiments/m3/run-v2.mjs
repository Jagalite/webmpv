import {chromium} from 'playwright';
import {mkdir,writeFile,readFile,appendFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import os from 'node:os';
const smoke=process.argv.includes('--smoke');
const out=process.env.RESULT_DIR || `results/m3/followup-${smoke?'smoke':'measurement'}-${new Date().toISOString().replaceAll(':','-')}`;
await mkdir('results/m3',{recursive:true});await mkdir(out);
const hash=b=>createHash('sha256').update(b).digest('hex');
const median=xs=>{const a=[...xs].sort((a,b)=>a-b);return a.length?a[Math.floor(a.length/2)]:null;};
const result={schema:2,started:new Date().toISOString(),smoke,protocol:'fresh-browser-fixed-warmup-per-packet-bridge',
 host:{os:os.release(),arch:os.arch(),cpu:os.cpus()[0].model,memory:os.totalmem()},
 energy:'unavailable',hardwareAcceleration:'unknown',hashes:{},quality:[],seeks:[],measurements:[],errors:[],consoleDiagnostics:[]};
for(const file of ['docs/M3-FOLLOWUP-CONTRACT.md','experiments/m3/decoder.c','experiments/m3/run-v2.mjs',
 'web/m3/followup.html','web/m3/worker-v2.js','web/m3/packet-bridge.js','web/m3/packet-producer.js',
 'web/m3/engine/decoder.mjs','web/m3/engine/decoder.wasm','web/m3/fixture/manifest.json','web/m3/fixture/packets.bin','sources.lock.json'])result.hashes[file]=hash(await readFile(file));
const manifest=JSON.parse(await readFile('web/m3/fixture/manifest.json','utf8'));
const packets=await readFile('web/m3/fixture/packets.bin');
if(hash(packets)!==manifest.packetsSha256)throw Error('Packed payload mismatch');
for(const p of manifest.packets)if(hash(packets.subarray(p.offset,p.offset+p.size))!==p.sha256)throw Error('Packet mismatch');
let sequence=0;
async function run(variant,options){
 const browser=await chromium.launch({channel:'chrome',headless:false,args:['--disable-background-timer-throttling','--disable-renderer-backgrounding','--disable-backgrounding-occluded-windows']});
 const browserSequence=++sequence;
 const path=variant==='software'?'software':'copyback',transport=variant==='copyback-bridge'?'bridge':'direct';
 options={...options,path,transport};
 console.log(JSON.stringify({event:'start',variant,browserSequence,...options}));
 let page;
 try {
  const cdp=await browser.newBrowserCDPSession();result.browser=browser.version();
  page=await browser.newPage({viewport:{width:1100,height:850}});
  page.on('pageerror',e=>result.errors.push({browserSequence,error:String(e)}));
  page.on('console',m=>{if(m.type()==='error')result.consoleDiagnostics.push({browserSequence,message:m.text()});});
  await page.addInitScript(()=>{HTMLMediaElement.prototype.play=()=>{throw Error('Native playback forbidden');};});
  await page.goto(process.env.BENCH_URL||'http://127.0.0.1:4179/web/m3/followup.html');
  await page.bringToFront();await page.waitForFunction(()=>typeof runBenchmark==='function');
  const browserPID=(await cdp.send('SystemInfo.getProcessInfo')).processInfo.find(p=>p.type==='browser').id;
  let settled=false,failure,value;
  const promise=page.evaluate(options=>runBenchmark(options),options).then(r=>{value=r;settled=true;},e=>{failure=e;settled=true;});
  const samples=[],deadline=Date.now()+((options.passes+(options.warmupPasses??0))*32+120)*1000;
  while(!settled){
   if(Date.now()>deadline)throw Error('Run watchdog expired');
   await new Promise(r=>setTimeout(r,1000));if(settled)break;
   const info=(await cdp.send('SystemInfo.getProcessInfo')).processInfo;
   const rss=execFileSync('/bin/ps',['-o','pid=,rss=','-p',info.map(p=>p.id).join(',')],{encoding:'utf8'}).trim().split('\n').map(line=>{
    const [pid,kib]=line.trim().split(/\s+/).map(Number);return {pid,bytes:kib*1024};});
   const pageState=await page.evaluate(()=>({progress:window.progress,visibility:document.visibilityState,focused:document.hasFocus()}));
   const sample={at:Date.now(),cpu:info.map(p=>({pid:p.id,type:p.type,seconds:p.cpuTime})),processRSS:rss,
    rssBytes:rss.reduce((s,p)=>s+p.bytes,0),...pageState};
   samples.push(sample);await appendFile(`${out}/raw.jsonl`,JSON.stringify({variant,browserSequence,options,...sample})+'\n');
  }
  await promise;if(failure)throw failure;
  Object.assign(value,{variant,browserSequence,browserPID,samples});
  const steady=samples.filter(s=>s.progress?.phase==='playback');
  let cpuSeconds=0,elapsedSeconds=0;const processChanges=[];
  for(let i=1;i<steady.length;i++){
   const previous=new Map(steady[i-1].cpu.map(p=>[p.pid,p.seconds]));
   const nextIDs=new Set(steady[i].cpu.map(p=>p.pid));
   for(const p of steady[i].cpu){cpuSeconds+=Math.max(0,p.seconds-(previous.get(p.pid)??0));if(!previous.has(p.pid))processChanges.push({at:steady[i].at,kind:'added',pid:p.pid});}
   for(const pid of previous.keys())if(!nextIDs.has(pid))processChanges.push({at:steady[i].at,kind:'removed',pid});
   elapsedSeconds+=(steady[i].at-steady[i-1].at)/1000;
  }
  value.cpu={cpuSeconds,elapsedSeconds,percentOfOneCore:elapsedSeconds?cpuSeconds/elapsedSeconds*100:null,processChanges};
  const early=steady.slice(2,Math.max(3,Math.floor(steady.length/3))).map(s=>s.rssBytes);
  const late=steady.slice(-Math.max(1,Math.floor(steady.length/3))).map(s=>s.rssBytes);
  value.memory={peakRSSBytes:steady.length?Math.max(...steady.map(s=>s.rssBytes)):null,
   medianRSSGrowthBytes:early.length&&late.length?median(late)-median(early):null,
   warmupPeakRSSBytes:Math.max(0,...samples.filter(s=>s.progress?.phase==='warmup').map(s=>s.rssBytes))};
  value.foreground=value.visibility.every(v=>v.state==='visible')&&samples.every(s=>s.visibility==='visible'&&s.focused);
  console.log(JSON.stringify({event:'done',variant,cpu:value.cpu.percentOfOneCore,memory:value.memory,checks:value.checks}));
  if(!options.quality&&!options.seek)await page.screenshot({path:`${out}/${browserSequence}-${variant}.png`});
  return value;
 }finally{await browser.close();}
}
const variants=['software','copyback-direct','copyback-bridge'];
try{
 for(const variant of variants){
  result.quality.push(await run(variant,{passes:1,quality:true}));
  result.seeks.push(await run(variant,{passes:1,seek:true}));
 }
 const reference=result.quality[0].runs[0].samples;
 result.pixelComparisons=result.quality.slice(1).map(q=>({variant:q.variant,frames:q.runs[0].samples.map(s=>{
  const ref=reference.find(r=>r.pts===s.pts);if(!ref||ref.rgb.length!==s.rgb.length)throw Error('Missing reference pixels');
  const differences=s.rgb.map((v,i)=>Math.abs(v-ref.rgb[i])).sort((a,b)=>a-b);
  return {pts:s.pts,mae:differences.reduce((a,b)=>a+b,0)/differences.length,p99:differences[Math.ceil(differences.length*.99)-1]};
 })}));
 result.qualityPassed=result.pixelComparisons.every(c=>c.frames.length===4&&c.frames.every(f=>f.mae<=3&&f.p99<=16))&&
   result.quality.every(q=>q.runs[0].packetHashesVerified===manifest.packets.length);
 if(!result.qualityPassed)throw Error('Pixel or packet identity gate failed');
 const orders=[variants,['copyback-direct','copyback-bridge','software'],['copyback-bridge','software','copyback-direct']];
 for(let pair=0;pair<(smoke?1:3);pair++)for(const variant of orders[pair]){
  const value=await run(variant,{passes:smoke?1:3,warmupPasses:1});value.pair=pair;result.measurements.push(value);
  await writeFile(`${out}/result.json`,JSON.stringify(result,null,2)+'\n');
 }
 result.g2='Pending explicit user decision; no production integration authorized';
}catch(error){result.failure=String(error.stack||error);process.exitCode=1;console.error(result.failure);}
finally{
 result.finished=new Date().toISOString();await writeFile(`${out}/result.json`,JSON.stringify(result,null,2)+'\n');
 console.log(JSON.stringify({out,failure:result.failure}));
}
