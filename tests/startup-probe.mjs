// Diagnostic only: same warm-engine setup as G1, with stage/resource timings.
import {chromium} from 'playwright';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
const output=`results/development/startup-${new Date().toISOString().replaceAll(':','-')}`;
const media=process.argv[2]??'front';
if(!['front','tail'].includes(media))throw Error('Expected front or tail');
await mkdir(output,{recursive:true});
const result={scope:'Matched warm startup diagnostic; does not replace G1',media,runs:[],hashes:{}};
for(const name of ['web/engine/player.wasm','web/engine-m4/player.wasm','web/engine-worker.js','web/io-worker.js','web/range-reader.js','web/browser-decoder-worker.js','web/generated/player.js'])result.hashes[name]=createHash('sha256').update(await readFile(name)).digest('hex');
let workerOverride=await readFile('web/browser-decoder-worker.js','utf8');
result.probeWorkerRoute=process.env.PROBE_LATENCY_HINT!==undefined;
if(process.env.PROBE_LATENCY_HINT==='1'){
 const original=workerOverride;
 if(!original.includes('optimizeForLatency:false'))throw Error('Expected baseline latency configuration');
 workerOverride=original.replace('optimizeForLatency:false','optimizeForLatency:true');
 result.experiment={optimizeForLatency:true,effectiveWorkerSha256:createHash('sha256').update(workerOverride).digest('hex')};
}
const browser=await chromium.launch({channel:'chrome',headless:false,ignoreDefaultArgs:['--mute-audio'],args:['--autoplay-policy=no-user-gesture-required','--disable-background-timer-throttling','--disable-renderer-backgrounding']});
try{
 for(const backend of ['software','webcodecs','webcodecs','software']){
  const page=await browser.newPage({viewport:{width:1280,height:1100}});
  if(result.probeWorkerRoute)await page.context().route('**/browser-decoder-worker.js',async route=>{
   const response=await route.fetch();await route.fulfill({response,body:workerOverride});
  });
  await page.goto(`http://127.0.0.1:4179/?${backend==='software'?'no-codecs':'decoder=webcodecs'}`);
  await page.waitForFunction(()=>typeof createPlayer==='function');
  const id=`startup-${backend}-${Date.now()}`;
  await fetch(`http://127.0.0.1:4180/media/${media}?id=warm`,{headers:{Range:'bytes=0-0'}}).then(r=>r.arrayBuffer());
  await fetch(`http://127.0.0.1:4180/control?id=${id}`,{method:'POST',body:JSON.stringify({rtt:80,mbps:10,mode:'normal'})});
  await page.evaluate(async({id,media})=>{
   await createPlayer();player.resize(1920,1080);
   await player.open(await(await fetch('/fixtures/m0.mkv')).arrayBuffer());await player.play();
   while(!(player.diagnostics?.rendered>3&&player.audioDiagnostics().mediaFrames>128))await new Promise(r=>setTimeout(r,10));
   await player.pause();await new Promise(r=>setTimeout(r,200));
   window.stages=[];window.start=performance.now();window.startWall=performance.timeOrigin+start;
   window.initialRendered=player.diagnostics?.rendered||0;window.initialAudio=player.audioDiagnostics().mediaFrames;
   const mark=(name,data)=>stages.push({name,milliseconds:performance.now()-start,data});
   player.addEventListener('source',()=>mark('range-reader-ready'));
   player.addEventListener('log',event=>mark('log',event.detail));
   player.addEventListener('mpv',({detail})=>{if(['start-file','file-loaded','playback-restart','end-file'].includes(detail.event))mark(detail.event);});
   await player.openRemote({url:`http://127.0.0.1:4180/media/${media}?id=${id}`});mark('open-resolved');
   await player.play();mark('play-resolved');
  },{id,media});
  await page.waitForFunction(()=>player.diagnostics?.rendered>initialRendered+1&&player.audioDiagnostics().mediaFrames>initialAudio+128,{},{timeout:20000});
  const data=await page.evaluate(()=>({milliseconds:performance.now()-start,startWall,stages,video:player.diagnostics,audio:player.audioDiagnostics()}));
  const io=page.workers().find(w=>w.url().endsWith('/io-worker.js'));
  data.resources=io?await io.evaluate(()=>performance.getEntriesByType('resource').map(r=>({name:r.name,startWall:performance.timeOrigin+r.startTime,duration:r.duration,initiatorType:r.initiatorType}))):[];
  data.server=await fetch(`http://127.0.0.1:4180/control?id=${id}`).then(r=>r.json());
  result.runs.push({backend,...data});console.log(backend,data.milliseconds,data.stages);
  await writeFile(`${output}/result.json`,JSON.stringify(result,null,2)+'\n');
  await page.evaluate(()=>player.destroy());await page.close();
 }
}catch(error){result.failure=String(error.stack);process.exitCode=1;}
finally{
 await writeFile(`${output}/result.json`,JSON.stringify(result,null,2)+'\n');console.log(output);
 let closeTimer;
 result.browserClosed=await Promise.race([browser.close().then(()=>true),new Promise(resolve=>{closeTimer=setTimeout(()=>resolve(false),10000);})]);
 clearTimeout(closeTimer);
 await writeFile(`${output}/result.json`,JSON.stringify(result,null,2)+'\n');
 if(!result.browserClosed){console.error('Browser teardown timed out; diagnostic samples retained');process.exit(1);}
}
