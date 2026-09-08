import {chromium} from 'playwright';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {createReadStream} from 'node:fs';
import {spawn,execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import assert from 'node:assert/strict';
import {PNG} from '../node_modules/playwright-core/lib/utilsBundle.js';
const out=`results/playback-performance/${new Date().toISOString().replaceAll(':','-')}`;await mkdir(out,{recursive:true});console.log(out);
const baseline=JSON.parse(await readFile('build/playback-performance/baseline/manifest.json'));
const before={};for(const file of Object.keys(baseline)){before[file]=await readFile('build/playback-performance/baseline/'+file);assert.equal(createHash('sha256').update(before[file]).digest('hex'),baseline[file]);}
const baselineOverrides=process.env.BASELINE_MANIFEST?JSON.parse(await readFile(process.env.BASELINE_MANIFEST)):{};
for(const [file,path] of Object.entries(baselineOverrides)){assert.ok(file in baseline);before[file]=await readFile(path);}
const overrides=process.env.CANDIDATE_MANIFEST?JSON.parse(await readFile(process.env.CANDIDATE_MANIFEST)):{};
for(const file of Object.keys(overrides))assert.ok(file in baseline,`Unknown override ${file}`);
const candidate={};for(const file of Object.keys(baseline))candidate[file]=await readFile(overrides[file]||file);
const extraInputs=process.env.EXTRA_INPUTS?.split(',')||[];
const remote=!!process.env.REMOTE_INPUT;
const input=process.env.REMOTE_INPUT||process.env.INPUT||'build/hybrid-performance/sample.mp4';
const probe=JSON.parse(execFileSync('ffprobe',['-v','error','-show_streams','-show_format','-of','json',input],{encoding:'utf8'}));
const video=probe.streams.find(stream=>stream.codec_type==='video');assert.ok(video,'A video stream is required');
const ratio=(video.avg_frame_rate==='0/0'?video.r_frame_rate:video.avg_frame_rate).split('/').map(Number);
const expectedFps=Number(process.env.EXPECTED_FPS||ratio[0]/ratio[1]);assert.ok(expectedFps>0&&expectedFps<=120);
const playbackOptions={width:Number(process.env.WIDTH||video.width),height:Number(process.env.HEIGHT||video.height),videoFilters:process.env.VIDEO_FILTERS||'',audioFilters:process.env.AUDIO_FILTERS||'',subtitle:process.env.SUBTITLE||''};
const decoderIdentities=JSON.parse(process.env.DECODER_IDENTITIES||'{}');
const presenters=JSON.parse(process.env.EXPECTED_PRESENTERS||'{}');
const serverConfiguration={baseline:Object.fromEntries(Object.keys(baseline).map(p=>[p,baselineOverrides[p]||'build/playback-performance/baseline/'+p])),candidate:Object.fromEntries(Object.keys(baseline).map(p=>[p,overrides[p]||p])),native:{}};
await writeFile(out+'/server-config.json',JSON.stringify(serverConfiguration,null,2)+'\n');
const paths=['experiments/playback-performance/serve.mjs',...extraInputs,...Object.values(baselineOverrides),...Object.values(overrides),...Object.keys(baseline),'src/internal/wasm-player.ts','web/engine-retained-subs/player.wasm','web/retained-decoder-worker.js','web/subtitle-overlay.js','web/hybrid-performance.html','tests/playback-performance.mjs',input];
if(remote)paths.push('experiments/playback-performance/range-origin.mjs');
const digestFile=async path=>{const hash=createHash('sha256');for await(const bytes of createReadStream(path))hash.update(bytes);return hash.digest('hex');};
const hashes=async()=>Object.fromEntries(await Promise.all(paths.map(async p=>[p,await digestFile(p)])));
const idleSeconds=Number(process.env.IDLE_SECONDS||2);assert.ok(idleSeconds>=2&&idleSeconds<=15);
const prewarm=Number(process.env.PREWARM_SECONDS||0);assert.ok(prewarm>=0&&prewarm<=120);
const startPosition=Number(process.env.START_SECONDS||0);assert.ok(Number.isFinite(startPosition)&&startPosition>=0);
const warmup=Number(process.env.WARMUP_SECONDS||6);assert.ok(warmup>=3&&warmup<=60);
const measurement=Number(process.env.MEASURE_SECONDS||12);assert.ok(measurement>=5&&measurement<=600);assert.ok(startPosition+Math.max(prewarm,warmup+measurement)<Number(probe.format.duration)-1,'Keep measurement before sample EOF');
const sampleInterval=Number(process.env.SAMPLE_SECONDS||1);assert.ok(sampleInterval>=1&&sampleInterval<=10);
const mode=process.env.MODE||'software';assert.ok(['software','hybrid'].includes(mode));
const selected=process.env.VARIANTS?.split(',');const order=selected||['baseline','candidate','candidate','baseline'];
assert.ok(order.every(v=>['baseline','candidate','native'].includes(v)));
assert.ok(!order.includes('native')||(!playbackOptions.subtitle&&!playbackOptions.videoFilters&&!playbackOptions.audioFilters),'Native comparison requires plain playback');
const result={serverConfiguration,scope:'Short headless development CPU screen; no foreground/endurance/native-parity qualification',mode,extraInputs,decoderIdentities,overrides,baselineOverrides,baseline,servedBaselineHashes:Object.fromEntries(Object.entries(before).map(([p,b])=>[p,createHash('sha256').update(b).digest('hex')])),servedCandidateHashes:Object.fromEntries(Object.entries(candidate).map(([p,b])=>[p,createHash('sha256').update(b).digest('hex')])),hashes:await hashes(),order,warmupSeconds:warmup,measurementSeconds:measurement,idleSeconds,trials:[]};
const reuseBrowser=process.env.REUSE_BROWSER==='1';result.reuseBrowser=reuseBrowser;
const reusePage=process.env.REUSE_PAGE==='1';assert.ok(!reusePage||reuseBrowser,'Page reuse requires browser reuse');
Object.assign(result,{input,remote,prewarm,startPosition,sampleInterval,reusePage,probe,expectedFps,playbackOptions,presenters});
const launch=()=>chromium.launch({channel:'chrome',headless:true,ignoreDefaultArgs:['--mute-audio'],args:['--autoplay-policy=no-user-gesture-required','--disable-background-timer-throttling','--disable-renderer-backgrounding','--disable-backgrounding-occluded-windows']});
let server,sharedBrowser,sharedPage,mediaServer;
try{
 server=spawn(process.execPath,['experiments/playback-performance/serve.mjs',out+'/server-config.json'],{env:{...process.env,PORT:'0'},stdio:['ignore','pipe','inherit']});const origin=await new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(Error('Server timeout')),10000);server.once('error',reject);server.stdout.on('data',b=>{const m=/http:\/\/127\.0\.0\.1:\d+/.exec(String(b));if(m){clearTimeout(timer);resolve(m[0]);}});});
 const metadata=async()=>{const response=await fetch(origin+'/__metadata');assert.ok(response.ok);return response.json();};
 result.serverSnapshot=await metadata();
 let mediaOrigin;
 if(remote){
  mediaServer=spawn(process.execPath,['experiments/playback-performance/range-origin.mjs'],{env:{...process.env,MEDIA_INPUT:input,APP_ORIGIN:origin},stdio:['ignore','pipe','inherit']});
  mediaOrigin=await new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(Error('Media origin timeout')),30000);mediaServer.once('error',reject);mediaServer.stdout.on('data',bytes=>{const match=/http:\/\/127\.0\.0\.1:\d+/.exec(String(bytes));if(match){clearTimeout(timer);resolve(match[0]);}});});
  result.mediaBefore=await(await fetch(mediaOrigin+'/__stats')).json();assert.equal(result.mediaBefore.sha256,result.hashes[input]);
 }
 for(const [name,hashes] of [['baseline',result.servedBaselineHashes],['candidate',result.servedCandidateHashes]])for(const [file,hash] of Object.entries(hashes))assert.equal(result.serverSnapshot[name][file].sha256,hash);
 for(const [index,variant] of order.entries()){
  if(reuseBrowser&&!sharedBrowser)sharedBrowser=await launch();
  const browser=sharedBrowser||await launch();let page,cdp;
  const record={variant,browser:browser.version(),samples:[],routeHits:{}};result.trials.push(record);
  if(process.platform==='darwin')record.hostMemoryBefore=execFileSync('/usr/bin/vm_stat',[],{encoding:'utf8'});
  try{
   page=sharedPage||await browser.newPage({viewport:{width:1100,height:760},deviceScaleFactor:1});if(reusePage)sharedPage=page;
   const beforeRequests=(await metadata())[variant];
   await page.goto(origin+'/'+variant+'/web/hybrid-performance.html');await page.waitForFunction(()=>typeof start==='function');
   if(remote){
    await page.evaluate(async({mode,options,url})=>{const {Player}=await import('./generated/index.js');window.errors=[];window.player=new Player(document.querySelector('#surface'),{mode,width:options.width,height:options.height});player.addEventListener('error',event=>errors.push(event.detail));if(options.videoFilters)await player.setVideoFilters(options.videoFilters);if(options.audioFilters)await player.setAudioFilters(options.audioFilters);await player.openRemote({url});if(options.subtitle)await player.selectTrack('sub',options.subtitle);await player.play();},{mode:variant==='native'?'native':mode,options:playbackOptions,url:mediaOrigin+'/movie.mp4'});
   }else{
    await page.locator('#file').setInputFiles(input);await page.evaluate(({mode,options})=>start(mode,options),{mode:variant==='native'?'native':mode,options:playbackOptions});
   }
   const afterRequests=(await metadata())[variant];
   record.routeHits=Object.fromEntries(Object.entries(afterRequests).map(([p,v])=>[p,v.hits-beforeRequests[p].hits]));
   const required=variant==='native'?[]:['web/generated/internal/wasm-player.js','web/audio-worklet.js',...(mode==='hybrid'?['web/filter-retained-engine-worker.js','web/retained-decoder-worker.js','web/engine-retained-subs/player.mjs','web/engine-retained-subs/player.wasm']:['web/software-full-engine-worker.js','web/engine-software-full/player.mjs','web/engine-software-full/player.wasm'])];
   for(const file of new Set([...required,...Object.keys(variant==='candidate'?overrides:variant==='baseline'?baselineOverrides:{})]))assert.ok(record.routeHits[file]>0,`Asset was not served: ${file}`);
   if(decoderIdentities[variant])await page.waitForFunction(id=>player.diagnostics.backend?.decoderStats?.implementation===id,decoderIdentities[variant],{timeout:5000});
   if(presenters[variant])await page.waitForFunction(presenter=>player.diagnostics.backend?.presenter===presenter,presenters[variant],{timeout:5000});
   const progress=async(label,seconds)=>{console.log(`${index+1}/${order.length} ${variant} ${label}: ${seconds}s`);return page.evaluate(data=>window.progress(data),{trial:index+1,total:order.length,label:variant+' '+label,seconds,remaining:(order.length-index-1)*(prewarm+warmup+measurement+idleSeconds+4)});};
   if(startPosition)await page.evaluate(async position=>{await player.pause();await player.seek(position);await player.play();},startPosition);
   if(prewarm){await progress('prewarm',prewarm);await page.waitForTimeout(prewarm*1000);await page.evaluate(async position=>{await player.pause();await player.seek(position);await player.play();},startPosition);}
   await progress('warmup',warmup);await page.waitForTimeout(warmup*1000);await progress('measurement',measurement);
   await page.evaluate(()=>{player.current?.backend?.trackPresenter?.clock.reset();});
   cdp=await browser.newBrowserCDPSession();
   result.gpuInfo??=(await cdp.send('SystemInfo.getInfo')).gpu;
   async function sample(){const processes=(await cdp.send('SystemInfo.getProcessInfo')).processInfo;const rss=execFileSync('/bin/ps',['-o','rss=','-p',processes.map(p=>p.id).join(',')],{encoding:'utf8'}).trim().split(/\s+/).map(Number).reduce((a,b)=>a+b,0)*1024;const s={at:Date.now(),processes,rss,state:await page.evaluate(()=>snapshot())};record.samples.push(s);assert.deepEqual(s.state.errors,[]);return s;}
   const first=await sample();let last=first;while(last.at-first.at<measurement*1000){await page.waitForTimeout(sampleInterval*1000);last=await sample();if(record.samples.length%Math.ceil(30/sampleInterval)===0){console.log(`${variant} measured ${Math.round((last.at-first.at)/1000)}/${measurement}s`);await writeFile(out+'/result.json',JSON.stringify(result,null,2)+'\n');}}
   let cpu=0;const churn=[];for(let i=1;i<record.samples.length;i++){const a=new Map(record.samples[i-1].processes.map(p=>[p.id,p.cpuTime]));const present=new Set(record.samples[i].processes.map(p=>p.id));for(const id of a.keys())if(!present.has(id))churn.push({removed:id});for(const p of record.samples[i].processes){if(a.has(p.id))cpu+=p.cpuTime-a.get(p.id);else churn.push({added:p.id});}}
   const elapsed=(last.at-first.at)/1000;const frames=s=>variant==='native'?s.diagnostics.backend.rendered:(mode==='hybrid'?(s.diagnostics.backend.trackOutput?.presentedFrames??s.diagnostics.backend.presentation.drawn):s.diagnostics.backend.rendered);
   assert.deepEqual(churn,[],'Browser process churn invalidates the CPU interval');
   const dropped=s=>variant==='native'?s.diagnostics.backend.dropped:s.quality.frameDrops+s.quality.decoderDrops+Number(s.diagnostics.backend.decoderStats?.errors||0)+Number(s.diagnostics.backend.trackOutput?.dropped||0);
   if(variant!=='native')for(const sample of record.samples){assert.ok(Number.isFinite(sample.state.quality.frameDrops)&&Number.isFinite(sample.state.quality.decoderDrops),'mpv drop counters must be available');assert.ok(Number.isFinite(sample.state.quality.avsync)&&Math.abs(sample.state.quality.avsync)<.12,'mpv A/V estimate exceeded 120 ms');}
   record.summary={renderMs:(last.state.diagnostics.backend.renderMs||0)-(first.state.diagnostics.backend.renderMs||0),copyMs:(last.state.diagnostics.backend.copyMs||0)-(first.state.diagnostics.backend.copyMs||0),cpuPercent:cpu/elapsed*100,elapsed,frames:frames(last.state)-frames(first.state),position:last.state.position-first.state.position,dropOrErrorDelta:dropped(last.state)-dropped(first.state),rssMean:record.samples.reduce((sum,s)=>sum+s.rss,0)/record.samples.length,churn};
   assert.ok(record.summary.frames>=elapsed*expectedFps*.95,`Frame delivery below ${expectedFps*.95} fps`);assert.ok(Math.abs(record.summary.position-elapsed)<.5,'Playback drift');assert.equal(record.summary.dropOrErrorDelta,0);
   if(variant!=='native'){const a=first.state.audio,b=last.state.audio;record.summary.audioUnderrunDelta=b.underruns-a.underruns;assert.equal(record.summary.audioUnderrunDelta,0,'Audio underruns during measurement');assert.ok((b.mediaFrames-a.mediaFrames)>=elapsed*b.sampleRate*.94,'Audio throughput');if(mode==='hybrid'){assert.equal(last.state.diagnostics.backend.decoderStats.copyMs,0);assert.equal(last.state.diagnostics.backend.presentation.missing,0);}}
   if(last.state.diagnostics.backend.rgbUpload){
    const upload=last.state.diagnostics.backend.rgbUpload;
    assert.equal(upload.created,upload.closed,'Every raw presentation frame must close');
    assert.equal(upload.failures,0,'The intended RGBX upload path must remain active');
    assert.ok(upload.drawn>=record.summary.frames);
   }
   if(last.state.diagnostics.backend.trackOutput){
    const track=last.state.diagnostics.backend.trackOutput;assert.ok(track.width>0&&track.height>0,'Live video surface must have a picture');
    const delays=record.samples.flatMap(sample=>sample.state.diagnostics.backend.trackOutput.delays);assert.ok(delays.length>0&&delays.every(Number.isFinite));
    const initial=first.state.diagnostics.backend.trackOutput,count=track.delayCount-initial.delayCount;assert.ok(count>record.summary.frames*.95,'Match at least 95% of displayed frames to their submission clock');
    record.summary.trackDisplayDelayMs={frames:count,mean:(track.delaySum-initial.delaySum)/count,max:track.delayMax,min:track.delayMin,scope:'All compositor callbacks since measurement reset; submission-to-display delay, not independent A/V synchronization'};
    assert.ok(record.summary.trackDisplayDelayMs.max<100,'Video compositor added more than 100ms display latency');
    const sink=last.state.diagnostics.backend.trackStats;assert.ok(sink.peakPending<=2);assert.equal(sink.completed,sink.closedBySink,'Video sink must close submitted references');
   }
   await page.evaluate(()=>player.pause());await progress('paused idle',idleSeconds);await page.waitForTimeout(250);const idleStart=(await cdp.send('SystemInfo.getProcessInfo')).processInfo;const idleAt=Date.now();await page.waitForTimeout(idleSeconds*1000);const idleEnd=(await cdp.send('SystemInfo.getProcessInfo')).processInfo;const starts=new Map(idleStart.map(p=>[p.id,p.cpuTime]));record.summary.pausedCpuPercent=idleEnd.reduce((n,p)=>n+Math.max(0,p.cpuTime-(starts.get(p.id)??p.cpuTime)),0)/((Date.now()-idleAt)/1000)*100;
   await page.evaluate(()=>player.seek(5));await page.waitForTimeout(250);
   record.pixels=await page.evaluate(()=>{
    const canvas=document.querySelector('canvas');if(!canvas)return null;
    if(player.diagnostics.backend.presenter!=='track')return canvas.toDataURL();
    // Experimental track output is a video plus subtitle layer, not a compatible
    // canvas-only public surface. Capture the displayed composition explicitly.
    const video=document.querySelector('#surface video'),capture=document.createElement('canvas');capture.width=canvas.width;capture.height=canvas.height;const context=capture.getContext('2d',{alpha:false});
    const scale=Math.min(capture.width/video.videoWidth,capture.height/video.videoHeight),width=video.videoWidth*scale,height=video.videoHeight*scale;context.fillStyle='#000';context.fillRect(0,0,capture.width,capture.height);context.drawImage(video,(capture.width-width)/2,(capture.height-height)/2,width,height);context.drawImage(canvas,0,0);return capture.toDataURL();
   });
   if(record.pixels){const bytes=Buffer.from(record.pixels.split(',')[1],'base64');await writeFile(`${out}/${index}-${variant}.png`,bytes);record.pixels=createHash('sha256').update(bytes).digest('hex');record.rawPixelSha256=createHash('sha256').update(PNG.sync.read(bytes).data).digest('hex');}
   record.closed=await page.evaluate(async()=>{const backend=player.current?.backend;await player.destroy();return backend?.diagnostics?.presentation;});for(let n=0;n<40&&page.workers().length;n++)await page.waitForTimeout(100);assert.equal(page.workers().length,0);if(record.closed){assert.equal(record.closed.received,record.closed.closed);assert.equal(record.closed.retained,0);}
   if(record.pixels){const reference=result.trials.find(t=>t.variant===variant&&t.passed);if(reference)assert.equal(record.pixels,reference.pixels,'Stable exact-seek pixels');}
   record.passed=true;console.log(variant,JSON.stringify(record.summary));
  }catch(error){record.error=String(error);record.failureState=await page?.evaluate(()=>typeof snapshot==='function'?snapshot():null).catch(()=>null);console.error(variant,record.error);process.exitCode=1;}
  finally{await cdp?.detach().catch(()=>{});if(reusePage)await page?.evaluate(()=>window.player?.destroy()).catch(()=>{});else await page?.close();if(!reuseBrowser)await browser.close();await writeFile(out+'/result.json',JSON.stringify(result,null,2)+'\n');}
 }
 assert.deepEqual(await hashes(),result.hashes);result.inputsUnchanged=true;result.serverFinal=await metadata();result.passed=result.trials.every(t=>t.passed);
 if(remote)result.mediaAfter=await(await fetch(mediaOrigin+'/__stats')).json();
}catch(error){result.failure=String(error.stack);process.exitCode=1;console.error(String(error));}finally{await sharedBrowser?.close();server?.kill();mediaServer?.kill();await writeFile(out+'/result.json',JSON.stringify(result,null,2)+'\n');}
