import {chromium} from 'playwright';
import {mkdir,writeFile,appendFile,readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
await mkdir('results/m2',{recursive:true});
const duration=Number(process.env.DURATION_SECONDS||3605);
if(!Number.isFinite(duration)||duration<30)throw Error('Invalid qualification duration');
const raw='results/m2/long-raw.jsonl';await writeFile(raw,'');
const hashes={};for(const f of ['web/engine/player.wasm','web/engine/player.mjs','web/generated/player.js','web/engine-worker.js','web/audio-worklet.js','web/io-worker.js','web/range-reader.js'])hashes[f]=createHash('sha256').update(await readFile(f)).digest('hex');
const network={mbps:10,rtt:80},sourceID=`m2-long-${Date.now()}`;
const result={started:new Date().toISOString(),durationSeconds:duration,artifactHashes:hashes,network,sourceID,passed:false};
await fetch(`http://127.0.0.1:4180/control?id=${sourceID}`,{method:'POST',body:JSON.stringify({...network,mode:'normal',stall:false,outageUntil:0})});
result.networkServerBefore=await(await fetch(`http://127.0.0.1:4180/control?id=${sourceID}`)).json();
const previousCPU=new Map();let previousSampleAt;
function powerState(){const state={};for(const key of ['batt','therm'])try{state[key]=execFileSync('/usr/bin/pmset',['-g',key],{encoding:'utf8'}).trim();}catch(e){state[key]='unavailable: '+e.message;}return state;}
result.powerStateBefore=powerState();
const browser=await chromium.launch({channel:'chrome',headless:false,ignoreDefaultArgs:['--mute-audio'],args:['--autoplay-policy=no-user-gesture-required','--disable-background-timer-throttling','--disable-backgrounding-occluded-windows','--disable-renderer-backgrounding']});
const cdp=await browser.newBrowserCDPSession();
const lifecycle=[];browser.on('disconnected',()=>lifecycle.push({event:'browser-disconnected',at:Date.now()}));
const page=await browser.newPage({viewport:{width:1280,height:1100}}),errors=[],samples=[],signals=[],discontinuities=[];
page.on('pageerror',e=>errors.push(String(e)));
page.on('close',()=>lifecycle.push({event:'page-closed',at:Date.now()}));
page.on('crash',()=>lifecycle.push({event:'page-crashed',at:Date.now()}));
await page.addInitScript(()=>{for(const n of ['VideoDecoder','AudioDecoder','VideoFrame','MediaSource'])Object.defineProperty(globalThis,n,{value:undefined,configurable:true});HTMLMediaElement.prototype.play=()=>{throw Error('Native media forbidden');};});
const percentile=(xs,p)=>{const a=[...xs].sort((a,b)=>a-b);return a.length?a[Math.min(a.length-1,Math.ceil(p*a.length)-1)]:null;};
try{
 await page.goto('http://127.0.0.1:4179/?no-codecs&measure-output');await page.waitForFunction(()=>typeof createPlayer==='function');
 await page.evaluate(()=>{document.title='webmpv qualification — please keep this window open';const banner=document.createElement('p');banner.id='qualification';banner.textContent='60-minute qualification in progress. Please keep this test window open.';document.querySelector('h1').after(banner);});
 await page.evaluate(async sourceID=>{await createPlayer();player.resize(1920,1080);window.signals=[];window.discontinuities=[];player.addEventListener('output',({detail})=>signals.push(detail));player.addEventListener('mpv',({detail})=>{if(['seek','start-file','playback-restart'].includes(detail.event))discontinuities.push({event:detail.event,wallTime:performance.timeOrigin+performance.now(),position:player.properties.get('time-pos')});});await player.command('set','loop-file','inf');await player.openRemote({url:`http://127.0.0.1:4180/media/front?id=${sourceID}`});await player.play();},sourceID);
 await page.waitForFunction(()=>player.audioDiagnostics().mediaFrames>4096&&player.diagnostics?.rendered>5,{},{timeout:20000});
 const start=Date.now();result.measurementStarted=start;result.browser=browser.version();
 await appendFile(raw,JSON.stringify({type:'header',...result})+'\n');
 for(let i=0;Date.now()-start<duration*1000;i++){
  await page.waitForTimeout(5000);
  const data=await page.evaluate(()=>({wallTime:performance.timeOrigin+performance.now(),video:player.diagnostics,audio:player.audioDiagnostics(),position:player.properties.get('time-pos'),drops:player.properties.get('frame-drop-count'),decoderDrops:player.properties.get('decoder-frame-drop-count'),mpvAvsync:player.properties.get('avsync'),signals:signals.splice(0),discontinuities:discontinuities.splice(0),errors:playerErrors.slice(),browserCodecsAbsent:player.browserCodecsAbsent}));
  const processInfo=await cdp.send('SystemInfo.getProcessInfo');
  const ids=processInfo.processInfo.map(p=>p.id);let processRSS=[];
  try{processRSS=execFileSync('ps',['-o','pid=,rss=','-p',ids.join(',')],{encoding:'utf8'}).trim().split('\n').map(line=>{const [pid,kib]=line.trim().split(/\s+/).map(Number);return {pid,bytes:kib*1024,type:processInfo.processInfo.find(p=>p.id===pid)?.type};});}catch(e){errors.push('Process RSS collection failed: '+e.message);}
  signals.push(...data.signals);discontinuities.push(...data.discontinuities);const {signals:batch,discontinuities:events,...sample}=data;
  sample.elapsedSeconds=(Date.now()-start)/1000;sample.processRSS=processRSS;
  sample.processCPU=processInfo.processInfo.map(p=>({pid:p.id,type:p.type,seconds:p.cpuTime}));let cpuSeconds=0;for(const p of sample.processCPU){cpuSeconds+=Math.max(0,p.seconds-(previousCPU.get(p.pid)??p.seconds));previousCPU.set(p.pid,p.seconds);}sample.cpuPercentOfOneCore=previousSampleAt===undefined?null:cpuSeconds/(sample.elapsedSeconds-previousSampleAt)*100;previousSampleAt=sample.elapsedSeconds;if(i%12===0)sample.powerState=powerState();sample.totalRSS=processRSS.reduce((n,p)=>n+p.bytes,0);samples.push(sample);
  await appendFile(raw,JSON.stringify({type:'sample',...sample,signals:batch,discontinuities:events})+'\n');
  if(i%12===0)console.log(JSON.stringify({elapsedSeconds:Math.round(sample.elapsedSeconds),position:data.position,frames:data.video.rendered,drops:data.drops,heapMiB:data.video.heapBytes/1048576,rssMiB:Math.round(sample.totalRSS/1048576),underruns:data.audio.underruns,signals:signals.length}));
 }
 const excluded=t=>t<start+5000||discontinuities.some(d=>['seek','start-file'].includes(d.event)&&t>=d.wallTime&&t<d.wallTime+5000);
 const clicks=signals.filter(s=>s.kind==='click'&&Number.isFinite(s.wallTime)&&!excluded(s.wallTime));
 const flashes=signals.filter(s=>s.kind==='flash'&&!excluded(s.wallTime));
 const matched=new Set(),pairs=[],unmatched=[];
 for(const flash of flashes){let at=-1,best=Infinity;for(let i=0;i<clicks.length;i++){const delta=Math.abs(clicks[i].wallTime-flash.wallTime);if(!matched.has(i)&&delta<best){best=delta;at=i;}}if(best<500){matched.add(at);pairs.push({flash,click:clicks[at],errorMs:flash.wallTime-clicks[at].wallTime});}else unmatched.push(flash);}
 const abs=pairs.map(p=>Math.abs(p.errorMs)),first=samples[0],last=samples.at(-1);
 const steady=samples.filter(s=>s.elapsedSeconds>=10),ten=steady.find(s=>s.elapsedSeconds>=610),tenStart=steady[0];
 const dropped=(ten?.drops||0)-(tenStart?.drops||0),rendered=(ten?.video.rendered||0)-(tenStart?.video.rendered||0);
 const early=samples.filter(s=>s.elapsedSeconds>=600&&s.elapsedSeconds<1200).map(s=>s.totalRSS),late=samples.filter(s=>s.elapsedSeconds>=3000).map(s=>s.totalRSS);
 const rssGrowth=early.length&&late.length?percentile(late,.5)-percentile(early,.5):null;
 result.elapsedSeconds=(Date.now()-start)/1000;result.sync={pairs:pairs.length,p95Ms:percentile(abs,.95),maxMs:abs.length?Math.max(...abs):null,unmatchedFlashes:unmatched.length,unmatchedClicks:clicks.length-matched.size,invalidTimestamps:signals.filter(s=>s.kind==='click'&&!Number.isFinite(s.wallTime)).length};
 result.frameDelivery={windowSeconds:ten?ten.elapsedSeconds-tenStart.elapsedSeconds:0,rendered,dropped,dropFraction:dropped/(rendered+dropped)};
 result.memory={maximumHeapBytes:Math.max(...samples.map(s=>s.video.heapBytes)),maximumRSSBytes:Math.max(...samples.map(s=>s.totalRSS)),medianRSSGrowthBytes:rssGrowth,maximumHTTPCacheBytes:Math.max(...samples.map(s=>s.video.io?.peakCacheBytes||0))};
 const cpu=samples.map(s=>s.cpuPercentOfOneCore).filter(Number.isFinite);result.cpu={medianPercentOfOneCore:percentile(cpu,.5),p95PercentOfOneCore:percentile(cpu,.95),maximumPercentOfOneCore:Math.max(...cpu)};result.powerStateAfter=powerState();result.networkServerAfter=await(await fetch(`http://127.0.0.1:4180/control?id=${sourceID}`)).json();
 result.audio={first:first.audio,last:last.audio};result.errors=[...errors,...new Set(samples.flatMap(s=>s.errors))];result.discontinuities=discontinuities;
 result.checks={networkProfile:result.networkServerBefore.mbps===10&&result.networkServerBefore.rtt===80&&result.networkServerAfter.mbps===10&&result.networkServerAfter.rtt===80,fullDuration:result.elapsedSeconds>=3600,independentSync:abs.length>3500&&result.sync.p95Ms<=40&&result.sync.maxMs<=80&&result.sync.invalidTimestamps===0,signalContinuity:(result.sync.unmatchedClicks+result.sync.unmatchedFlashes)/(clicks.length+flashes.length)<.01,frameDelivery:!!ten&&result.frameDelivery.dropFraction<=.01,memory:result.memory.maximumHeapBytes<=536870912&&result.memory.maximumHTTPCacheBytes<=16777216&&rssGrowth!==null&&rssGrowth<=64*1048576,softwareOnly:samples.every(s=>s.browserCodecsAbsent),noErrors:result.errors.length===0};
 result.passed=Object.values(result.checks).every(Boolean);
 await writeFile('results/m2/long-sync-pairs.json',JSON.stringify(pairs)+'\n');await page.screenshot({path:'results/m2/long-final.png'});await page.evaluate(()=>player.destroy());
 console.log(JSON.stringify({checks:result.checks,sync:result.sync,frames:result.frameDelivery,memory:result.memory}));if(!result.passed)process.exitCode=1;
}catch(error){result.passed=false;result.failure=String(error.stack);console.error(result.failure);process.exitCode=1;}
finally{result.browserLifecycle=lifecycle;result.finished=new Date().toISOString();await writeFile('results/m2/long.json',JSON.stringify(result,null,2)+'\n');await browser.close();}
