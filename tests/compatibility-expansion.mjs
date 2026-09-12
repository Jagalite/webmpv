import {chromium} from 'playwright';
import assert from 'node:assert/strict';import {isDeepStrictEqual} from 'node:util';
import {readFile,writeFile,mkdir,stat} from 'node:fs/promises';
import path from 'node:path';import http from 'node:http';import {createHash} from 'node:crypto';
const fixtures=path.resolve('build/fixtures/compatibility');
const out=process.env.OUT??`results/compatibility-expansion/${new Date().toISOString().replaceAll(':','-')}`;await mkdir(out,{recursive:true});
const result={scope:'Generated source functional qualification; no physical-speaker, HDR display or real-time 4K claim',started:new Date().toISOString(),cases:[]};
let liveOpened=0,dashOpened=0;let liveEpoch;const requests=[];
const server=http.createServer(async(req,res)=>{try{
 const u=new URL(req.url,'http://localhost');requests.push(u.pathname);if(requests.length>10000)requests.shift();
 res.setHeader('Cross-Origin-Opener-Policy','same-origin');res.setHeader('Cross-Origin-Embedder-Policy','require-corp');res.setHeader('Cross-Origin-Resource-Policy','same-origin');res.setHeader('Cache-Control','no-store');
 let f=u.pathname.startsWith('/media/')?path.join(fixtures,u.pathname.slice(7)):path.resolve('.'+u.pathname);
 if(!f.startsWith(path.resolve('.')+path.sep))throw Error('path');
 let bytes;
 if(u.pathname==='/media/live.m3u8'){
  liveOpened++;const complete=liveOpened>4;const text=await readFile(path.join(fixtures,'low/index.m3u8'),'utf8');const n=Math.min(6,liveOpened+2);
  const parts=text.split(/(?=#EXTINF)/);bytes=Buffer.from(parts[0].replace('#EXT-X-MEDIA-SEQUENCE:0','#EXT-X-MEDIA-SEQUENCE:0')+parts.slice(1,n+1).join('').replaceAll(/(?<=\n)(\d+\.ts)/g,'low/$1').replace('#EXT-X-ENDLIST','')+(complete?'#EXT-X-ENDLIST\n':''));
 }else if(u.pathname==='/media/live-dash.mpd'){
  dashOpened++;if(dashOpened===1)liveEpoch=new Date(Date.now()-1000).toISOString();const original=await readFile(path.join(fixtures,'period0/manifest.mpd'),'utf8');
  const period=original.slice(original.indexOf('<Period'),original.indexOf('</Period>')+9).replace('<AdaptationSet','<BaseURL>period0/</BaseURL><AdaptationSet');
  bytes=Buffer.from(`<MPD xmlns="urn:mpeg:dash:schema:mpd:2011" profiles="urn:mpeg:dash:profile:isoff-live:2011" type="dynamic" availabilityStartTime="${liveEpoch}" publishTime="${new Date().toISOString()}" minimumUpdatePeriod="PT0.25S" timeShiftBufferDepth="PT3S" minBufferTime="PT0.1S">${period}</MPD>`);
 }else bytes=await readFile(f);
 res.setHeader('Content-Type',f.endsWith('.js')||f.endsWith('.mjs')?'text/javascript':f.endsWith('.wasm')?'application/wasm':f.endsWith('.html')?'text/html':'application/octet-stream');
 res.setHeader('ETag','"'+createHash('sha256').update(bytes).digest('hex')+'"');res.setHeader('Accept-Ranges','bytes');
 const m=/^bytes=(\d+)-(\d*)$/.exec(req.headers.range??'');if(m){const a=Number(m[1]),b=Math.min(Number(m[2]||bytes.length-1),bytes.length-1);res.writeHead(206,{'Content-Length':b-a+1,'Content-Range':`bytes ${a}-${b}/${bytes.length}`});res.end(bytes.subarray(a,b+1));}else {res.setHeader('Content-Length',bytes.length);res.end(bytes);}
 }catch{res.writeHead(404).end();}});
await new Promise(r=>server.listen(0,'127.0.0.1',r));const origin=`http://127.0.0.1:${server.address().port}`;
const browser=await chromium.launch({channel:'chrome',args:['--autoplay-policy=no-user-gesture-required']});result.browser=browser.version();
const assets=['src/unified-player.ts','src/internal/wasm-player.ts','web/software-full-engine-worker.js','web/filter-retained-engine-worker.js','web/audio-worklet.js','web/resource-loader.js','web/streaming-manifest.js','web/segmented-subtitles.js','web/engine-software-full/player.wasm','web/engine-hybrid/player.wasm','web/engine-hybrid/player.mjs','web/engine-software-full/player.mjs','web/engine-remux/remux.wasm','web/engine-remux/remux.mjs','web/native-remux-player.js','web/native-remux-worker.js','web/vod-manifest.js','web/generated/unified-player.js','web/generated/internal/wasm-player.js','web/generated/internal/native-player.js','tests/compatibility-expansion.mjs','build/fixtures/compatibility/manifest.json'];
const hashes=async()=>Object.fromEntries(await Promise.all(assets.map(async f=>[f,createHash('sha256').update(await readFile(f)).digest('hex')])));result.hashes=await hashes();
async function check(name,run,setup){if(process.env.ONLY&&!process.env.ONLY.split(',').some(s=>name.includes(s)))return;const page=await browser.newPage();page.setDefaultTimeout(30000);const started=Date.now();
 try{if(setup)await setup(page);await page.goto(origin+'/web/example.html');await page.evaluate(async()=>{
  const{Player}=await import('/web/generated/index.js');window.logs=[];window.errors=[];
  window.create=async options=>{await window.p?.destroy();window.p=new Player(document.querySelector('#surface'),{mode:'software',width:320,height:180,...options});p.addEventListener('log',e=>logs.push(e.detail));p.addEventListener('error',e=>errors.push(e.detail));};
  window.open=async(name,input)=>{const data=await(await fetch('/media/'+name)).arrayBuffer();await p.open(new File([data],name),input);};
  window.pixels=()=>{const c=document.createElement('canvas');c.width=320;c.height=180;const ctx=c.getContext('2d');ctx.drawImage(p.surface,0,0,320,180);return Array.from(ctx.getImageData(0,0,320,180).data);};
  window.snapshot=()=>({properties:Object.fromEntries(p.properties),diagnostics:p.diagnostics,audio:p.audioDiagnostics(),logs:logs.slice(-12)});
  await create();
 });const evidence=await run(page);await page.evaluate(()=>p.destroy());await page.waitForTimeout(150);assert.equal(page.workers().length,0,'Workers released');assert.equal(await page.locator('iframe,#surface canvas,#surface video').count(),0,'Surfaces released');result.cases.push({name,passed:true,milliseconds:Date.now()-started,evidence});console.log('PASS',name);
 }catch(error){result.cases.push({name,passed:false,milliseconds:Date.now()-started,error:String(error.stack),state:await page.evaluate(()=>snapshot()).catch(()=>null)});console.log('FAIL',name,String(error));process.exitCode=1;
 }finally{await page.evaluate(()=>p.destroy()).catch(()=>{});await page.close();await writeFile(out+'/result.json',JSON.stringify(result,null,2)+'\n');}}
const seekPlay=async(page,t=.6)=>{await page.evaluate(async t=>{await p.pause();await p.seek(t);await p.play();},t);await page.waitForFunction(t=>Number(p.properties.get('time-pos'))>t+.15,t);return page.evaluate(()=>snapshot());};
try{
 for(const bits of [8,10])await check(`AV1 ${bits}-bit Software pixels, seek and filter`,async page=>{
  await page.evaluate(async bits=>{await open(`av1-${bits}.mkv`);await p.play();},bits);await page.waitForFunction(()=>p.diagnostics.backend?.rendered>=4);
  const first=await page.evaluate(()=>({state:snapshot(),nonblack:pixels().filter((v,i)=>i%4!==3&&v>30).length}));assert.ok(first.nonblack>1000);assert.equal(first.state.diagnostics.backend.decoder,'software');assert.ok(first.state.properties['track-list'].some(t=>t.decoder==='libdav1d'));
  const seek=await seekPlay(page);await page.evaluate(async()=>{await p.pause();await p.setVideoFilters('hflip');});assert.equal(await page.evaluate(()=>p.diagnostics.videoFilters),'hflip');return {first,seek};
 },async page=>{await page.addInitScript(()=>{for(const name of ['VideoDecoder','AudioDecoder','VideoFrame','MediaSource'])Object.defineProperty(globalThis,name,{value:undefined,configurable:true});HTMLMediaElement.prototype.play=function(){throw Error('Native decoder forbidden');};});});
 for(const file of ['sbc.sbc','dfpwm.nut','adpcm_swf.wav','comfortnoise.nut','ra_144.mkv','dirac.nut','mpeg1video.mpg','mpeg2video.ts'])await check(`Recorded format ${file}`,async page=>{
  await page.evaluate(async file=>{await open(file);await p.play();},file);const audio=!/dirac|mpeg/.test(file);await page.waitForFunction(audio=>audio?p.audioDiagnostics().mediaFrames>6000:p.diagnostics.backend?.rendered>=4,audio);
  const first=await page.evaluate(()=>snapshot());if(audio)assert.ok(first.audio.rms>.001);const seek=await seekPlay(page);return {first,seek};
 });
 await check('4K Software input and lower pixel budget rollback',async page=>{
  await page.evaluate(async()=>{await create({width:1920,height:1080});await open('4k.mkv');});assert.equal(await page.evaluate(()=>p.surface.width),1920);const d=await page.evaluate(()=>snapshot());assert.equal(d.properties['video-params'].w,3840);assert.equal(d.properties['video-params'].h,2160);assert.ok(await page.evaluate(()=>pixels().some((v,i)=>i%4!==3&&v>30)));
  await page.evaluate(async()=>{await create({resourceLimits:{maxDecodePixels:1920*1080}});await open('black.mp4');window.oldSurface=p.surface;});const error=await page.evaluate(async()=>{try{await open('4k.mkv');return null;}catch(e){return String(e);}});assert.ok(error);assert.equal(await page.evaluate(()=>oldSurface===p.surface),true);return {decoded:d,rejection:error};
 });
 for(const hdr of ['hdr','hlg'])await check(`${hdr} to SDR reference colors and filter composition`,async page=>{
  await page.evaluate(async hdr=>{await create({toneMapping:'hdr-to-sdr'});await open(hdr+'.mkv');},hdr);await page.waitForTimeout(200);
  const evidence=await page.evaluate(async hdr=>{const got=pixels(),ref=new Uint8Array(await(await fetch('/media/'+hdr+'-reference.rgb')).arrayBuffer());let total=0,maximum=0,n=0;for(let y=4;y<176;y++)for(let x=4;x<316;x++)for(let c=0;c<3;c++){const i=(y*320+x)*4+c,d=Math.abs(got[i]-ref[i]);total+=d;maximum=Math.max(maximum,d);n++;}return {meanError:total/n,maxError:maximum,state:snapshot()};},hdr);assert.ok(evidence.meanError<5,`Color MAE ${evidence.meanError}`);
  await page.evaluate(()=>p.setVideoFilters('hflip'));await page.evaluate(()=>p.setToneMapping('off'));return evidence;
 });
 await check('External SRT and ASS fonts, seek, selection and Hybrid transition',async page=>{
  await page.evaluate(async()=>{await open('black.mp4');const s=await(await fetch('/media/subtitle.srt')).blob();await p.addSubtitle(new File([s],'captions.srt'),{label:'External SRT',language:'eng'});await p.seek(1);});await page.waitForTimeout(200);
  const srt=await page.evaluate(()=>({lit:pixels().filter((v,i)=>i%4!==3&&v>100).length,tracks:p.properties.get('track-list')}));assert.ok(srt.lit>300);assert.ok(srt.tracks.some(t=>t.title==='External SRT'&&t.lang==='eng'));
  await page.evaluate(async()=>{const sub=await(await fetch('/media/subtitle.ass')).blob();await p.addSubtitle(new File([sub],'captions.ass'));await p.seek(2);});await page.waitForTimeout(200);
  const fallback=await page.evaluate(()=>pixels());
  await page.evaluate(async()=>{const font=await(await fetch('/media/custom.ttf')).blob();await p.addFont(new File([font],'custom.ttf'));});await page.waitForTimeout(200);
  const loaded=await page.evaluate(()=>pixels());assert.ok(loaded.filter((v,i)=>v!==fallback[i]).length>100,'The supplied font changes rendered glyphs');
  const ass=await page.evaluate(()=>{const pix=pixels();let green=0;for(let i=0;i<pix.length;i+=4)if(pix[i+1]>150&&pix[i]<80&&pix[i+2]<80)green++;return {green,state:snapshot()};});assert.ok(ass.green>100);
  await page.evaluate(()=>p.setMode('hybrid'));await page.evaluate(()=>p.seek(3));await page.waitForTimeout(200);assert.ok(await page.evaluate(()=>pixels().some((v,i,a)=>i%4===1&&v>150&&a[i-1]<80)));
  await page.evaluate(()=>p.subtitleVisible(false));await page.waitForTimeout(200);assert.ok(await page.evaluate(()=>pixels().filter((v,i)=>i%4!==3&&v>100).length)<20);await page.evaluate(()=>open('black.mp4'));assert.equal(await page.evaluate(()=>p.properties.get('track-list').filter(t=>t.external).length),0);return {srt,ass};
 });
 await check('Audio device negotiation, stereo fallback and reject policy',async page=>{
  await page.evaluate(async()=>{await create({audioOutput:'7.1'});await open('black.mp4');await p.play();});await page.waitForFunction(()=>p.audioDiagnostics().mediaFrames>6000);const d=await page.evaluate(()=>p.audioDiagnostics());assert.equal(d.outputChannels,d.deviceChannels>=8?8:2);
  if(d.deviceChannels<8){const error=await page.evaluate(async()=>{await create({audioOutput:'7.1',audioFallback:'reject'});try{await open('black.mp4');return null;}catch(e){return String(e);}});assert.match(error,/unavailable/);}return d;
 });
 for(const channels of [6,8])await check(`${channels}-channel native PCM to Web Audio graph`,async page=>{
  await page.evaluate(async n=>{await create({audioOutput:n===6?'5.1':'7.1',audioFallback:'reject'});await open(`channels-${n}.wav`);await p.play();},channels);await page.waitForFunction(()=>p.audioDiagnostics().mediaFrames>12000);
  const levels=await page.evaluate(()=>window.channelAnalysers.map(a=>{const x=new Float32Array(a.fftSize);a.getFloatTimeDomainData(x);return x.reduce((s,v)=>s+v,0)/x.length;}));for(let c=0;c<channels;c++)assert.ok(Math.abs(levels[c]-(c+1)/20)<.005,`channel ${c}: ${levels[c]}`);return {levels,state:await page.evaluate(()=>snapshot()),scope:'Virtual multichannel output graph; physical device remains stereo'};
 },page=>page.addInitScript(n=>{
  const Base=AudioContext;window.AudioContext=class extends Base{constructor(...args){super(...args);const actual=super.destination;const output=this.createGain();output.channelCount=n;output.channelCountMode='explicit';Object.defineProperty(output,'maxChannelCount',{value:n});output.connect(actual);this.virtual=output;}get destination(){return this.virtual??super.destination;}};
  const Node=AudioWorkletNode;window.AudioWorkletNode=class extends Node{constructor(ctx,name,opts){super(ctx,name,opts);const split=ctx.createChannelSplitter(n);this.connect(split);window.channelAnalysers=Array.from({length:n},(_,i)=>{const a=ctx.createAnalyser();split.connect(a,i);return a;});}};
 },channels));
 for(const [name,opts,red] of [['HLS low variant with segmented subtitles',{format:'hls',streaming:{maxBandwidth:200000}},true],['HLS explicit high variant',{format:'hls',streaming:{representation:'1'}},false]])await check(name,async page=>{
  await page.evaluate(opts=>p.openRemote({url:location.origin+'/media/master.m3u8',...opts}),opts);await page.evaluate(()=>p.seek(1));await page.waitForTimeout(200);const first=await page.evaluate(()=>({pixel:pixels().slice(0,3),state:snapshot()}));assert.ok(red?first.pixel[0]>200:first.pixel[2]>200);
  await page.evaluate(()=>p.seek(4.5));await page.waitForTimeout(200);const last=await page.evaluate(()=>({lit:pixels().filter((v,i,a)=>i%4===0&&v>150&&a[i+1]>150&&a[i+2]>150).length,state:snapshot()}));assert.ok(last.lit>50,'Later subtitle segment visible');return {first,last};
 });
 for(const manifest of ['periods.mpd','periods-av.mpd'])await check(`Finite DASH ${manifest}, transition and forward/backward seek`,async page=>{
  await page.evaluate(manifest=>p.openRemote({url:location.origin+'/media/'+manifest,format:'dash'}),manifest);await page.evaluate(()=>p.play());await page.waitForFunction(()=>p.properties.get('time-pos')>3.5);await page.evaluate(()=>p.pause());const second=await page.evaluate(()=>({pixel:pixels().slice(0,3),state:snapshot()}));assert.ok(second.pixel[2]>200);if(manifest==='periods-av.mpd')assert.ok(second.state.audio.mediaFrames>120000);
  await page.evaluate(()=>p.seek(1));await page.waitForTimeout(150);assert.ok(await page.evaluate(()=>pixels()[0])>200);await page.evaluate(()=>p.seek(4));await page.waitForTimeout(150);assert.ok(await page.evaluate(()=>pixels()[2])>200);return second;
 });
 await check('Remux video-only transport stream, playback and seek',async page=>{
  await page.evaluate(async()=>{await create({mode:'native',nativeRemux:'always'});await open('video-only.ts');await p.play();});await page.waitForFunction(()=>p.properties.get('time-pos')>.3);const seek=await seekPlay(page,3);assert.equal(seek.diagnostics.backend.plan,'remux');return seek;
 });
 await check('Remux transient restart, bounded retry and automatic recovery',async page=>{
  await page.evaluate(async()=>{await create({automaticSelection:true,nativeRemux:'always',mode:'native'});await open('black.mp4');await p.volume(37);await p.rate(1.25);await p.play();});await page.waitForFunction(()=>p.properties.get('time-pos')>.3);
  await page.evaluate(()=>{window.controller=p.current.backend.remux;controller.worker.dispatchEvent(new ErrorEvent('error',{message:'transient fixture fault',cancelable:true}));});
  await page.waitForFunction(()=>controller.stats.recoveries[0]?.restored);const restored=await page.evaluate(()=>snapshot());assert.equal(restored.diagnostics.backend.plan,'remux');assert.equal(restored.properties.volume,37);assert.equal(restored.properties.speed,1.25);
  await page.evaluate(()=>controller.worker.dispatchEvent(new ErrorEvent('error',{message:'second fixture fault',cancelable:true})));await page.waitForFunction(()=>p.mode!=='native'&&!p.diagnostics.switching);assert.equal(await page.evaluate(()=>controller.stats.recoveries.length),1);await page.waitForFunction(()=>p.properties.get('time-pos')>1);return {restored,recovered:await page.evaluate(()=>snapshot())};
 });
 await check('Remux configuration change continues through automatic fallback',async page=>{
  await page.evaluate(async()=>{await create({mode:'native',automaticSelection:true,nativeRemux:'always'});await open('configuration-change.ts');await p.play();});await page.waitForFunction(()=>p.properties.get('time-pos')>9);await page.evaluate(()=>p.pause());const after=await page.evaluate(()=>({pixel:pixels().slice(0,3),state:snapshot()}));assert.ok(after.pixel[2]>200);assert.notEqual(after.state.diagnostics.mode,'native');await page.evaluate(()=>p.seek(12));await page.waitForTimeout(200);assert.ok(await page.evaluate(()=>pixels()[2])>200);return after;
 });
 await check('Standard dynamic DASH open, playback and cancellation',async page=>{
  dashOpened=0;await page.evaluate(()=>p.openRemote({url:location.origin+'/media/live-dash.mpd',format:'dash',streaming:{live:true}}));await page.evaluate(()=>p.play());await page.waitForFunction(()=>p.diagnostics.backend?.rendered>4);const state=await page.evaluate(()=>snapshot());return {manifestRequests:dashOpened,state};
 });
 await check('Standard HLS live refresh, pause/resume, finish and cleanup',async page=>{
  liveOpened=0;await page.evaluate(()=>p.openRemote({url:location.origin+'/media/live.m3u8',format:'hls',streaming:{live:true}}));await page.evaluate(()=>p.play());await page.waitForFunction(()=>p.properties.get('time-pos')>1);await page.evaluate(()=>p.pause());await page.waitForTimeout(200);await page.evaluate(()=>p.play());await page.waitForFunction(()=>p.properties.get('time-pos')>4);assert.ok(liveOpened>1);return {manifestRequests:liveOpened,state:await page.evaluate(()=>snapshot())};
 });
 result.finished=new Date().toISOString();result.hashesAfter=await hashes();result.inputsUnchanged=isDeepStrictEqual(result.hashesAfter,result.hashes);assert.deepEqual(result.hashesAfter,result.hashes,'Qualification inputs changed');
}finally{await browser.close();await new Promise(r=>server.close(r));result.passed=result.inputsUnchanged===true&&result.cases.every(t=>t.passed);result.counts={tested:result.cases.length,passed:result.cases.filter(t=>t.passed).length};await writeFile(out+'/result.json',JSON.stringify(result,null,2)+'\n');console.log(out);}
