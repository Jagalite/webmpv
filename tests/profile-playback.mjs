// Diagnostic sampling run. Results from this harness are not CPU benchmarks.
import {chromium} from 'playwright';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {spawn} from 'node:child_process';
import {createHash} from 'node:crypto';
import assert from 'node:assert/strict';
const mode=process.env.MODE||'software';const paused=process.env.PAUSED==='1';
const input=process.env.INPUT||'build/hybrid-performance/sample.mp4';
const out=`results/playback-performance/profile-${new Date().toISOString().replaceAll(':','-')}`;
await mkdir(out,{recursive:true});console.log(out);
const result={mode,paused,input,scope:'Instrumented worker CPU sampling; not a performance comparison',targets:[],hashes:{}};
const baseline=JSON.parse(await readFile('build/playback-performance/baseline/manifest.json'));
const files=Object.fromEntries(Object.keys(baseline).map(asset=>[asset,asset]));
const folder=mode==='software'?'native-baseline':'hybrid-baseline';
for(const extension of ['mjs','wasm'])files[`web/engine-${mode==='software'?'software-full':'retained-subs'}/player.${extension}`]=`build/playback-performance/${folder}/player.${extension}`;
if(process.env.CANDIDATE_MANIFEST)Object.assign(files,JSON.parse(await readFile(process.env.CANDIDATE_MANIFEST)));
await writeFile(out+'/server-config.json',JSON.stringify({candidate:files},null,2)+'\n');
const paths=[...Object.values(files),'tests/profile-playback.mjs','experiments/playback-performance/serve.mjs','web/hybrid-performance.html',input];
const hashes=async()=>Object.fromEntries(await Promise.all(paths.map(async path=>[path,createHash('sha256').update(await readFile(path)).digest('hex')])));
result.hashes=await hashes();
let server,browser;
try {
 server=spawn(process.execPath,['experiments/playback-performance/serve.mjs',out+'/server-config.json'],{env:{...process.env,PORT:'0',DEFAULT_MOUNT:'candidate'},stdio:['ignore','pipe','inherit']});
 const origin=await new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(Error('Server timeout')),10000);server.once('error',reject);server.stdout.on('data',b=>{const m=/http:\/\/127\.0\.0\.1:\d+/.exec(String(b));if(m){clearTimeout(timer);resolve(m[0]);}});});
 browser=await chromium.launch({channel:'chrome',headless:true,ignoreDefaultArgs:['--mute-audio'],args:['--autoplay-policy=no-user-gesture-required','--disable-background-timer-throttling','--disable-renderer-backgrounding']});
 result.browser=browser.version();
 const page=await browser.newPage({viewport:{width:1100,height:760}});
 result.serverSnapshot=await(await fetch(origin+'/__metadata')).json();
 await page.goto(origin+'/web/hybrid-performance.html');await page.waitForFunction(()=>typeof start==='function');await page.locator('#file').setInputFiles(input);await page.evaluate(mode=>start(mode),mode);await page.waitForTimeout(2000);await page.evaluate(()=>player.pause());
 const cdp=await browser.newBrowserCDPSession();let serial=0;const pending=new Map();
 result.gpuInfo=(await cdp.send('SystemInfo.getInfo')).gpu;
 cdp.on('Target.receivedMessageFromTarget',({sessionId,message})=>{const data=JSON.parse(message),key=`${sessionId}:${data.id}`,p=pending.get(key);if(p){clearTimeout(p.timer);pending.delete(key);data.error?p.reject(Error(JSON.stringify(data.error))):p.resolve(data.result);}});
 async function send(sessionId,method,params={}){const id=++serial,key=`${sessionId}:${id}`;const response=new Promise((resolve,reject)=>{const timer=setTimeout(()=>{pending.delete(key);reject(Error(`Timeout ${method}`));},10000);pending.set(key,{resolve,reject,timer});});await cdp.send('Target.sendMessageToTarget',{sessionId,message:JSON.stringify({id,method,params})});return response;}
 const targets=(await cdp.send('Target.getTargets')).targetInfos.filter(t=>t.type==='worker');
 await Promise.all(targets.map(async target=>{
  const record={target};result.targets.push(record);
  try {const {sessionId}=await cdp.send('Target.attachToTarget',{targetId:target.targetId,flatten:false});record.sessionId=sessionId;await send(sessionId,'Profiler.enable');await send(sessionId,'Profiler.setSamplingInterval',{interval:1000});record.ready=true;}
  catch(error){record.error=String(error);}
 }));
 await page.evaluate(async()=>{await player.seek(0);await player.play();});await page.waitForTimeout(4000);if(paused){await page.evaluate(()=>player.pause());await page.waitForTimeout(4000);}
 result.processStart=(await cdp.send('SystemInfo.getProcessInfo')).processInfo;result.measureStart=Date.now();
 await Promise.all(result.targets.filter(t=>t.ready).map(async record=>{try{await send(record.sessionId,'Profiler.start');record.started=true;}catch(error){record.error=String(error);}}));
 console.log('Profiling',result.targets.filter(t=>t.started).length,'workers');
 await page.evaluate(total=>progress({trial:1,total:1,label:`Profiling ${total} workers`,seconds:10,remaining:0}),result.targets.length);await page.waitForTimeout(10000);
 for(const [index,record] of result.targets.entries())if(record.started){
  try {
   const {profile}=await send(record.sessionId,'Profiler.stop');await writeFile(`${out}/${index}.cpuprofile`,JSON.stringify(profile));
   const nodes=new Map(profile.nodes.map(n=>[n.id,n])),weights=new Map();
   for(const [i,id] of (profile.samples||[]).entries()){const node=nodes.get(id),frame=node.callFrame;const name=frame.functionName||`${frame.url}:${frame.lineNumber}`;weights.set(name,(weights.get(name)||0)+(profile.timeDeltas?.[i]||1000));}
   record.top=[...weights].sort((a,b)=>b[1]-a[1]).slice(0,35).map(([name,microseconds])=>({name,milliseconds:microseconds/1000}));record.samples=profile.samples?.length;
   console.log(index,JSON.stringify(record.top.slice(0,8)));
  }catch(error){record.error=String(error);}
 }
 result.processEnd=(await cdp.send('SystemInfo.getProcessInfo')).processInfo;result.measureEnd=Date.now();
 result.final=await page.evaluate(()=>snapshot());await page.evaluate(()=>player.destroy());
 result.serverFinal=await(await fetch(origin+'/__metadata')).json();
 for(const asset of ['web/audio-worklet.js',`web/engine-${mode==='software'?'software-full':'retained-subs'}/player.wasm`,...(mode==='hybrid'?['web/retained-decoder-worker.js']:[])])assert.ok(result.serverFinal.candidate[asset].hits>0);
 result.hashesAfter=await hashes();assert.deepEqual(result.hashesAfter,result.hashes);result.inputsUnchanged=true;
} catch(error){result.error=String(error.stack);console.error(error);process.exitCode=1;}
finally {await browser?.close();server?.kill();await writeFile(out+'/result.json',JSON.stringify(result,null,2)+'\n');}
