import {chromium} from 'playwright';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {spawn,execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import assert from 'node:assert/strict';
const out=`results/hybrid-performance/${new Date().toISOString().replaceAll(':','-')}`;await mkdir(out,{recursive:true});console.log(out);
const baseline=JSON.parse(await readFile('build/hybrid-performance/baseline/manifest.json'));
const before={};for(const file of Object.keys(baseline)){before[file]=await readFile('build/hybrid-performance/baseline/'+file);assert.equal(createHash('sha256').update(before[file]).digest('hex'),baseline[file]);}
const paths=[...Object.keys(baseline),'src/internal/wasm-player.ts','web/engine-retained-subs/player.wasm','web/retained-decoder-worker.js','web/subtitle-overlay.js','web/hybrid-performance.html','tests/hybrid-performance.mjs','build/hybrid-performance/sample.mp4'];
const hashes=async()=>Object.fromEntries(await Promise.all(paths.map(async p=>[p,createHash('sha256').update(await readFile(p)).digest('hex')])));
const idleSeconds=Number(process.env.IDLE_SECONDS||2);assert.ok(idleSeconds>=2&&idleSeconds<=15);
const measurement=Number(process.env.MEASURE_SECONDS||12);assert.ok(measurement>=5&&measurement<=30);
const selected=process.env.VARIANTS?.split(',');const order=selected||['native','baseline','candidate','candidate','baseline','native'];
const result={scope:'Short headless development CPU screen; no foreground/endurance/native-parity qualification',baseline,hashes:await hashes(),order,warmupSeconds:3,measurementSeconds:measurement,idleSeconds,trials:[]};
let server;
try{
 server=spawn(process.execPath,['scripts/serve.mjs'],{env:{...process.env,PORT:'0'},stdio:['ignore','pipe','inherit']});const origin=await new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(Error('Server timeout')),10000);server.once('error',reject);server.stdout.on('data',b=>{const m=/http:\/\/127\.0\.0\.1:\d+/.exec(String(b));if(m){clearTimeout(timer);resolve(m[0]);}});});
 for(const [index,variant] of order.entries()){
  const browser=await chromium.launch({channel:'chrome',headless:true,ignoreDefaultArgs:['--mute-audio'],args:['--autoplay-policy=no-user-gesture-required','--disable-background-timer-throttling','--disable-renderer-backgrounding','--disable-backgrounding-occluded-windows']});
  const record={variant,browser:browser.version(),samples:[]};result.trials.push(record);
  try{
   const page=await browser.newPage({viewport:{width:1100,height:760},deviceScaleFactor:1});
   // Both variants use identical routing/cache conditions. Only these preserved
   // baseline bytes differ; native loads no Wasm client or engine.
   for(const file of Object.keys(baseline))await page.route('**/'+file+'*',async route=>route.fulfill({contentType:'text/javascript',headers:{'Cross-Origin-Embedder-Policy':'require-corp','Cross-Origin-Opener-Policy':'same-origin','Cross-Origin-Resource-Policy':'same-origin'},body:(variant==='candidate'||variant==='drawing'&&file.endsWith('retained-video.js')||variant==='timing'&&file.endsWith('wasm-player.js')||variant==='polling'&&file.endsWith('engine-worker.js'))?await readFile(file):before[file]}));
   await page.goto(origin+'/web/hybrid-performance.html');await page.waitForFunction(()=>typeof start==='function');await page.locator('#file').setInputFiles('build/hybrid-performance/sample.mp4');
   await page.evaluate(mode=>start(mode),variant==='native'?'native':'hybrid');
   const progress=async(label,seconds)=>page.evaluate(data=>window.progress(data),{trial:index+1,total:order.length,label:variant+' '+label,seconds,remaining:(order.length-index-1)*(measurement+6)});
   await progress('warmup',3);await page.waitForTimeout(3000);await progress('measurement',measurement);
   const cdp=await browser.newBrowserCDPSession();
   async function sample(){const processes=(await cdp.send('SystemInfo.getProcessInfo')).processInfo;const rss=execFileSync('/bin/ps',['-o','rss=','-p',processes.map(p=>p.id).join(',')],{encoding:'utf8'}).trim().split(/\s+/).map(Number).reduce((a,b)=>a+b,0)*1024;const s={at:Date.now(),processes,rss,state:await page.evaluate(()=>snapshot())};record.samples.push(s);assert.deepEqual(s.state.errors,[]);return s;}
   const first=await sample();let last=first;while(last.at-first.at<measurement*1000){await page.waitForTimeout(1000);last=await sample();}
   let cpu=0;const churn=[];for(let i=1;i<record.samples.length;i++){const a=new Map(record.samples[i-1].processes.map(p=>[p.id,p.cpuTime]));for(const p of record.samples[i].processes){if(a.has(p.id))cpu+=p.cpuTime-a.get(p.id);else churn.push(p.id);}}
   const elapsed=(last.at-first.at)/1000;const frames=s=>variant==='native'?s.diagnostics.backend.rendered:s.diagnostics.backend.presentation.drawn;
   const dropped=s=>variant==='native'?s.diagnostics.backend.dropped:Number(s.diagnostics.backend.decoderStats?.errors||0);
   record.summary={cpuPercent:cpu/elapsed*100,elapsed,frames:frames(last.state)-frames(first.state),position:last.state.position-first.state.position,dropOrErrorDelta:dropped(last.state)-dropped(first.state),rssMean:record.samples.reduce((sum,s)=>sum+s.rss,0)/record.samples.length,churn};
   assert.ok(record.summary.frames>=elapsed*28.5,'Frame delivery below 28.5 fps');assert.ok(Math.abs(record.summary.position-elapsed)<.5,'Playback drift');assert.equal(record.summary.dropOrErrorDelta,0);
   if(variant!=='native'){const a=first.state.audio,b=last.state.audio;assert.ok((b.mediaFrames-a.mediaFrames)>=elapsed*b.sampleRate*.94,'Audio throughput');assert.equal(last.state.diagnostics.backend.decoderStats.copyMs,0);assert.equal(last.state.diagnostics.backend.presentation.missing,0);}
   await page.evaluate(()=>player.pause());await progress('paused idle',idleSeconds);await page.waitForTimeout(250);const idleStart=(await cdp.send('SystemInfo.getProcessInfo')).processInfo;const idleAt=Date.now();await page.waitForTimeout(idleSeconds*1000);const idleEnd=(await cdp.send('SystemInfo.getProcessInfo')).processInfo;const starts=new Map(idleStart.map(p=>[p.id,p.cpuTime]));record.summary.pausedCpuPercent=idleEnd.reduce((n,p)=>n+Math.max(0,p.cpuTime-(starts.get(p.id)??p.cpuTime)),0)/((Date.now()-idleAt)/1000)*100;
   record.closed=await page.evaluate(async()=>{const backend=player.current?.backend;await player.destroy();return backend?.diagnostics?.presentation;});for(let n=0;n<40&&page.workers().length;n++)await page.waitForTimeout(100);assert.equal(page.workers().length,0);if(record.closed){assert.equal(record.closed.received,record.closed.closed);assert.equal(record.closed.retained,0);}
   record.passed=true;console.log(variant,JSON.stringify(record.summary));
  }catch(error){record.error=String(error);console.error(variant,record.error);process.exitCode=1;}
  finally{await browser.close();await writeFile(out+'/result.json',JSON.stringify(result,null,2)+'\n');}
 }
 assert.deepEqual(await hashes(),result.hashes);result.inputsUnchanged=true;
}finally{server?.kill();await writeFile(out+'/result.json',JSON.stringify(result,null,2)+'\n');}
