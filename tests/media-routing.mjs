import {chromium,firefox,webkit} from 'playwright';
import {readFile,mkdir,writeFile} from 'node:fs/promises';
import assert from 'node:assert/strict';
import {serve} from '../experiments/pipeline-qualification/server.mjs';
const family=process.env.BROWSER||'chrome',server=await serve(),out=`results/media-routing-integration/${family}-${new Date().toISOString().replaceAll(':','-')}`;
await mkdir(out,{recursive:true});console.log(out);const result={family,cases:[]};
const cases=[
 {name:'native-direct',mode:'native',file:'fixtures/example.mp4',plan:'direct'},
 ...[['h264','build/fixtures/software-full/h264-aac.mp4'],['hevc-ac3','build/fixtures/software-full/hevc-ac3.mkv'],['vp8-vorbis','build/fixtures/software-full/vp8-vorbis.webm'],['vp9-opus','build/fixtures/software-full/vp9-opus.webm'],['av1','build/fixtures/format-matrix/av1.mp4'],['hevc-10bit','build/fixtures/playback-performance/hevc-10bit.mkv'],['h264-annexb','build/pipeline-separation/fixtures/config-0.ts']].map(([name,file])=>({name,mode:'hybrid',file})),
 {name:'native-ts-fallback',mode:'native',file:'build/pipeline-separation/fixtures/config-0.ts',plan:'remux'},
 {name:'native-mkv-forced',mode:'native',file:'build/fixtures/tracks.mkv',plan:'remux',nativeRemux:'always',subtitles:true},
 {name:'native-remote-auth',mode:'native',remote:true,plan:'remux'},
 {name:'native-seek-stress',mode:'native',remote:true,plan:'remux',stress:true},
];
try{for(const test of cases.filter(t=>!process.env.CASES||process.env.CASES.split(',').includes(t.name))){
 console.log('Checking',test.name);const r={...test};result.cases.push(r);
 const browser=await ({chrome:chromium,firefox,webkit})[family].launch({headless:true,...(family==='chrome'?{channel:'chrome',args:['--autoplay-policy=no-user-gesture-required']}:{})});r.browserVersion=browser.version();let page;
 try{page=await browser.newPage();page.setDefaultTimeout(30000);const requests=[];page.on('request',r=>requests.push(r.url()));await page.goto(server.origin+'/experiment/page.html');
  await page.evaluate(async options=>{const {Player}=await import('/web/generated/index.js');window.errors=[];window.logs=[];window.player=new Player(document.querySelector('#surface'),{mode:options.mode,width:640,height:360,nativeRemux:options.nativeRemux});player.addEventListener('error',e=>errors.push(e.detail));player.addEventListener('log',e=>logs.push(e.detail));window.candidateStates=[];setInterval(()=>{if(player.candidate){candidateStates.push({properties:Object.fromEntries(player.candidate.backend.properties),diagnostics:player.candidate.backend.diagnostics});if(candidateStates.length>60)candidateStates.shift();}},100);window.state=()=>({properties:Object.fromEntries(player.properties),diagnostics:player.diagnostics,audio:player.audioDiagnostics(),errors,logs});},test);
  const begun=Date.now();
  if(test.remote)await page.evaluate(url=>player.openRemote({url,headers:{Authorization:'Bearer initial'},refreshAuthorization:async()=>({headers:{Authorization:'Bearer refreshed'}})}),server.origin+'/media/mkv?auth=1&id=auth');
  else {const bytes=await readFile(test.file);await page.evaluate(b=>player.open(new File([Uint8Array.from(atob(b),c=>c.charCodeAt(0))],'source')) ,bytes.toString('base64'));}
  r.openMs=Date.now()-begun;r.opened=await page.evaluate(()=>state());
  if(test.mode==='hybrid'){assert.equal(r.opened.diagnostics.backend.decoder,'webcodecs');assert.ok(r.opened.diagnostics.backend.presentation.drawn>0);assert.equal(r.opened.diagnostics.backend.decoderStats.copyMs,0);}
  else assert.equal(r.opened.diagnostics.backend.plan,test.plan);
  if(test.subtitles){r.subtitles=await page.evaluate(async()=>{const url=URL.createObjectURL(new Blob(['WEBVTT\n\n00:00:00.000 --> 00:00:10.000\nRemux source-time caption\n'],{type:'text/vtt'}));await player.addTextTrack({src:url,label:'test',language:'en'});await player.selectTrack('sub','1');return {start:player.surface.textTracks[0].cues[0].startTime,tracks:player.properties.get('track-list')};});assert.equal(r.subtitles.start,1);}
  await page.evaluate(()=>player.play());await page.waitForFunction(()=>Number(player.properties.get('time-pos'))>.5);r.playing=await page.evaluate(()=>state());assert.ok(r.playing.properties['time-pos']>.5);assert.deepEqual(r.playing.errors,[]);
  await page.evaluate(()=>player.pause());const target=Math.min(2,Number(r.opened.properties.duration)/2);r.seek=await page.evaluate(async t=>{await player.seek(t);return state();},target);assert.ok(Math.abs(r.seek.properties['time-pos']-target)<.15);
  if(test.stress){r.stress=await page.evaluate(async()=>{const samples=[];for(const t of [120,12,240,2]){const at=performance.now();await player.seek(t);samples.push({target:t,ms:performance.now()-at,position:player.properties.get('time-pos')});}const at=performance.now();await Promise.all([100,20,180,4].map(t=>player.seek(t)));return {samples,stormMs:performance.now()-at,position:player.properties.get('time-pos'),diagnostics:player.diagnostics};});for(const s of r.stress.samples)assert.ok(Math.abs(s.position-s.target)<.15);assert.ok(Math.abs(r.stress.position-4)<.15);}
  await page.evaluate(async()=>{await player.rate(1.25);await player.volume(42);});assert.equal(await page.evaluate(()=>player.properties.get('volume')),42);
  if(test.plan==='direct')assert.ok(!requests.some(x=>x.endsWith('.wasm')),'Direct playback must remain Wasm-free');
  await page.screenshot({path:out+'/'+test.name+'.png'});r.cleanup=await page.evaluate(async()=>{const backend=player.current.backend;await player.destroy();return backend.diagnostics;});await page.waitForTimeout(200);r.workersAfter=page.workers().length;assert.equal(r.workersAfter,0);
  if(test.mode==='hybrid'){const p=r.cleanup.presentation;assert.equal(p.received,p.closed);assert.equal(p.retained,0);assert.equal(p.pending,0);}
  r.passed=true;
 }catch(e){r.error=String(e.stack);r.failure=await page?.evaluate(()=>({...state(),candidateStates})).catch(()=>null);console.log(r.error.split('\n')[0]);process.exitCode=1;}
 finally{await page?.evaluate(()=>player.destroy()).catch(()=>{});await browser.close();await writeFile(out+'/result.json',JSON.stringify(result,null,2)+'\n');}
}}finally{await server.close();result.passed=result.cases.every(c=>c.passed);await writeFile(out+'/result.json',JSON.stringify(result,null,2)+'\n');console.log(out,result.passed);}
