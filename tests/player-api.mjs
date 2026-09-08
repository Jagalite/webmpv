import {chromium} from 'playwright';
import assert from 'node:assert/strict';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {spawn} from 'node:child_process';
const out=`results/player-api/functional-${new Date().toISOString().replaceAll(':','-')}`;
await mkdir(out,{recursive:true});console.log(out);
const server=spawn(process.execPath,['scripts/serve.mjs'],{env:{...process.env,PORT:'0'},stdio:['ignore','pipe','inherit']});
const origin=await new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(Error('App server timeout')),10000);server.once('error',reject);server.stdout.on('data',b=>{const m=/http:\/\/127\.0\.0\.1:\d+/.exec(String(b));if(m){clearTimeout(timer);resolve(m[0]);}});});
const browser=await chromium.launch({channel:'chrome',headless:true,ignoreDefaultArgs:['--mute-audio'],args:['--autoplay-policy=no-user-gesture-required']});
const result={started:new Date().toISOString(),browser:browser.version(),scope:'Headless three-mode API functional checks, not performance qualification',tests:[],passed:false};
const page=await browser.newPage();const requests=[];const pageErrors=[];page.on('pageerror',e=>{pageErrors.push(String(e));console.error('PAGE',String(e));});page.on('request',r=>requests.push(r.url()));
const fixture=await readFile('fixtures/example.mp4');const tracks=await readFile('build/fixtures/tracks.mkv');
const hash=b=>createHash('sha256').update(b).digest('hex');
const paths=['src/index.ts','src/types.ts','src/unified-player.ts','src/internal/native-player.ts','src/internal/wasm-player.ts','web/generated/index.js','web/generated/unified-player.js','web/generated/internal/native-player.js','web/generated/internal/wasm-player.js','web/engine-software-full/player.wasm','web/engine-retained-subs/player.wasm','web/player.html','tests/player-api.mjs'];
const hashes=async()=>Object.fromEntries(await Promise.all(paths.map(async p=>[p,hash(await readFile(p))])));
result.hashes=await hashes();result.fixtures={mp4:hash(fixture),tracks:hash(tracks)};
const only=process.env.ONLY?.split('|');result.selection=only||'full';
const total=only?.length||15;
async function setup(){
 await page.evaluate(()=>window.player?.destroy()).catch(()=>{});await page.goto(origin+'/');
 await page.waitForFunction(()=>window.player);await page.evaluate(()=>player.destroy());
 await page.evaluate(async()=>{const m=await import('/web/generated/index.js');window.API=m;window.errors=[];window.events=[];window.make=mode=>{window.player=new API.Player(document.querySelector('#surface'),{mode,width:640,height:360});player.addEventListener('error',e=>errors.push(e.detail));player.addEventListener('mpv',e=>events.push(e.detail));};});
}
async function open(bytes=fixture){await page.evaluate(b=>player.open(Uint8Array.from(atob(b),c=>c.charCodeAt(0)).buffer),bytes.toString('base64'));}
async function cleanup(){const frames=await page.evaluate(async()=>{const p=player.current?.backend;await player.destroy();return p?.diagnostics?.presentation;});if(frames){assert.equal(frames.received,frames.closed);assert.equal(frames.retained,0);assert.equal(frames.pending,0);}for(let i=0;i<40&&page.workers().length;i++)await page.waitForTimeout(100);assert.equal(page.workers().length,0);assert.equal(await page.locator('#surface video,#surface canvas,iframe').count(),0);}
async function check(name,fn){if(only&&!only.includes(name))return;await setup();const start=Date.now();await page.evaluate(({name,n,total})=>{const p=document.createElement('p');document.body.prepend(p);const t=Date.now();setInterval(()=>p.textContent=`API check ${n}/${total}: ${name}. ${Math.floor((Date.now()-t)/1000)}s elapsed. No foreground hold needed.`,500);},{name,n:result.tests.length+1,total});try{const evidence=await fn();assert.deepEqual(pageErrors,[]);await cleanup();result.tests.push({name,passed:true,evidence,milliseconds:Date.now()-start});console.log('PASS',name);}catch(e){result.tests.push({name,passed:false,error:String(e.stack),state:await page.evaluate(()=>({errors,events:events.slice(-20),d:player.diagnostics,p:Object.fromEntries(player.properties)})).catch(()=>null)});console.error('FAIL',name,String(e));await cleanup().catch(()=>{});}await writeFile(`${out}/result.json`,JSON.stringify(result,null,2)+'\n');}
try{
 await check('exactly three modes and native default',async()=>{
  const data=await page.evaluate(()=>{const bad=[];for(const mode of ['retained','copyback','webcodecs','auto'])try{new API.Player(document.querySelector('#surface'),{mode});}catch(e){bad.push(mode);}make();return {modes:API.PLAYBACK_MODES,mode:player.mode,capabilities:player.capabilities,bad,command:typeof player.command,roots:document.querySelectorAll('.webmpv-player').length};});
  assert.deepEqual(data.modes,['native','hybrid','software']);assert.equal(data.mode,'native');assert.equal(data.bad.length,4);assert.equal(data.command,'undefined');assert.equal(data.roots,1);return data;
 });
 await check('native local playback loads no Wasm',async()=>{
  const at=requests.length;await page.evaluate(()=>make('native'));await open();await page.evaluate(async()=>{await player.volume(37);await player.rate(1.25);await player.play();});await page.waitForFunction(()=>player.properties.get('time-pos')>.5);await page.evaluate(async()=>{await player.pause();await player.seek(1);});
  const d=await page.evaluate(()=>({d:player.diagnostics,p:Object.fromEntries(player.properties)}));assert.ok(d.d.backend.rendered>0);assert.equal(d.p.volume,37);assert.equal(d.p.speed,1.25);assert.ok(Math.abs(d.p['time-pos']-1)<.05);assert.ok(!requests.slice(at).some(u=>u.endsWith('.wasm')||u.includes('wasm-player')));return d;
 });
 await check('native text tracks and capability rejection',async()=>{
  await page.evaluate(()=>make('native'));await open();
  const data=await page.evaluate(async()=>{const src=URL.createObjectURL(new Blob(['WEBVTT\n\n00:00:00.000 --> 00:00:10.000\nNative subtitle test\n'],{type:'text/vtt'}));window.trackURL=src;await player.addTextTrack({src,label:'English',language:'en'});await player.selectTrack('sub','1');const tracks=player.properties.get('track-list');await player.subtitleVisible(false);let filterError;try{await player.setVideoFilters('hflip');}catch(e){filterError=e.message;}return {tracks,hidden:player.surface.textTracks[0].mode,filterError,mode:player.mode};});assert.ok(data.tracks.some(t=>t.type==='sub'&&t.selected));assert.equal(data.hidden,'disabled');assert.match(data.filterError,/software/);assert.equal(data.mode,'native');await page.evaluate(()=>URL.revokeObjectURL(trackURL));return data;
 });
 await check('hybrid actual retained frames and subtitles',async()=>{
  await page.evaluate(()=>make('hybrid'));await page.evaluate(()=>player.selectTrack('sub','1'));await open(tracks);await page.evaluate(()=>player.play());await page.waitForFunction(()=>player.diagnostics.backend?.presentation?.drawn>12);await page.evaluate(()=>player.pause());
  const d=await page.evaluate(()=>player.diagnostics);assert.equal(d.mode,'hybrid');assert.equal(d.backend.decoder,'webcodecs');assert.equal(d.backend.decoderStats.copyMs,0);assert.ok(d.backend.subtitles.parts>0);return d;
 });
 await check('software expanded decode and filters',async()=>{
  await page.evaluate(async()=>{make('software');await player.setVideoFilters('hflip');await player.setAudioFilters('volume=0.5');});await open(await readFile('build/fixtures/software-full/vp9-opus.webm'));await page.evaluate(()=>player.play());await page.waitForFunction(()=>player.audioDiagnostics().mediaFrames>24000);await page.evaluate(()=>player.pause());const d=await page.evaluate(()=>player.diagnostics);assert.equal(d.backend.decoder,'software');assert.equal(d.videoFilters,'hflip');assert.equal(d.audioFilters,'volume=0.5');assert.ok(d.backend.rendered>8);return d;
 });
 await check('explicit mode changes preserve playback state',async()=>{
  await page.evaluate(()=>make('native'));await open();await page.evaluate(async()=>{await player.volume(41);await player.rate(1.25);await player.seek(2);await player.setMode('hybrid');});let p=await page.evaluate(()=>Object.fromEntries(player.properties));assert.ok(Math.abs(p['time-pos']-2)<.15);assert.equal(p.pause,true);assert.equal(p.volume,41);assert.equal(p.speed,1.25);
  await page.evaluate(async()=>{await player.play();await player.setMode('software');});await page.waitForFunction(()=>player.properties.get('time-pos')>2.2);assert.equal(await page.evaluate(()=>player.properties.get('pause')),false);
  await page.evaluate(async()=>{await player.pause();await player.setMode('native');});p=await page.evaluate(()=>Object.fromEntries(player.properties));assert.equal(p.pause,true);assert.equal(p.volume,41);assert.equal(p.speed,1.25);return p;
 });
 await check('filter reopens preserve state and reject leaving software',async()=>{
  await page.evaluate(()=>make('software'));await open();await page.evaluate(async()=>{await player.seek(2);await player.volume(29);await player.setVideoFilters('hflip');});
  const data=await page.evaluate(async()=>{let error;try{await player.setMode('native');}catch(e){error=e.message;}return {error,mode:player.mode,p:Object.fromEntries(player.properties),d:player.diagnostics};});assert.equal(data.mode,'software');assert.match(data.error,/Clear filters/);assert.ok(Math.abs(data.p['time-pos']-2)<.15);assert.equal(data.p.volume,29);
  await page.evaluate(async()=>{await player.setVideoFilters('');await player.setMode('native');});assert.equal(await page.evaluate(()=>player.mode),'native');return data;
 });
 await check('invalid filter rolls back to old playback',async()=>{
  await page.evaluate(()=>make('software'));await open();await page.evaluate(()=>player.play());const data=await page.evaluate(async()=>{const old=player.surface;let error;try{await player.setVideoFilters('no_such_filter_api_test');}catch(e){error=e.message;}return {error,same:old===player.surface,filters:player.diagnostics.videoFilters,pause:player.properties.get('pause')};});assert.ok(data.error);assert.equal(data.same,true);assert.equal(data.filters,'');assert.equal(data.pause,false);return data;
 });
 await check('native unsupported request policy rolls back',async()=>{
  await page.evaluate(()=>make('native'));await open();const data=await page.evaluate(async()=>{const old=player.surface;let error;try{await player.openRemote({url:location.origin+'/fixtures/example.mp4',headers:{Authorization:'test'}});}catch(e){error=e.message;}return {error,same:old===player.surface};});assert.match(data.error,/Native mode cannot/);assert.equal(data.same,true);return data;
 });
 await check('unsupported hybrid source rolls back without a fourth mode',async()=>{
  await page.evaluate(()=>make('native'));await open(await readFile('build/fixtures/software-full/vp9-opus.webm'));
  const data=await page.evaluate(async()=>{const old=player.surface;let error;try{await player.setMode('hybrid');}catch(e){error=e.message;}return {error,same:old===player.surface,mode:player.mode};});assert.ok(data.error);assert.equal(data.same,true);assert.equal(data.mode,'native');return data;
 });
 await check('native remote playback',async()=>{
  await page.evaluate(async()=>{make('native');await player.openRemote({url:location.origin+'/fixtures/example.mp4'});await player.play();});await page.waitForFunction(()=>player.properties.get('time-pos')>.4);return page.evaluate(()=>player.diagnostics);
 });
 await check('source replacement resets position and preserves controls',async()=>{
  await page.evaluate(()=>make('hybrid'));await open();await page.evaluate(async()=>{await player.seek(2);await player.volume(53);});await open();const p=await page.evaluate(()=>Object.fromEntries(player.properties));assert.ok(p['time-pos']<.15);assert.equal(p.pause,true);assert.equal(p.volume,53);return p;
 });
 await check('destroy interrupts native candidate load',async()=>{
  let release;const pending=new Promise(r=>release=r);await page.route('**/api-delayed.mp4',async route=>{await pending;await route.abort().catch(()=>{});});
  const data=await page.evaluate(async()=>{make('native');const opening=player.openRemote({url:location.origin+'/fixtures/api-delayed.mp4'}).then(()=>null,e=>e.message);await new Promise(r=>setTimeout(r,150));const start=performance.now();const a=player.destroy(),b=player.destroy();await a;return {same:a===b,error:await opening,elapsed:performance.now()-start};});release();await page.unroute('**/api-delayed.mp4');assert.equal(data.same,true);assert.match(data.error,/destroyed/i);assert.ok(data.elapsed<3000);return data;
 });
 await check('explicit mode change recovers a terminated backend',async()=>{
  await page.evaluate(()=>make('hybrid'));await open();await page.evaluate(()=>player.seek(1));
  const data=await page.evaluate(async()=>{const old=player.current.backend;await old.destroy();old.dispatchEvent(new CustomEvent('error',{detail:'Simulated terminal backend failure'}));await player.setMode('software');return {mode:player.mode,position:player.properties.get('time-pos'),oldAudio:old.audioDiagnostics(),diagnostics:player.diagnostics};});assert.equal(data.mode,'software');assert.ok(Math.abs(data.position-1)<.15);assert.equal(data.oldAudio.state,'closed');assert.ok(data.diagnostics.backend.rendered>0);return data;
 });
 await check('queued changes and destroy release all workers',async()=>{
  await page.evaluate(()=>make('software'));await open();await page.evaluate(async()=>{await Promise.all([player.volume(25),player.rate(1.5),player.seek(1)]);});const p=await page.evaluate(()=>Object.fromEntries(player.properties));assert.equal(p.volume,25);assert.equal(p.speed,1.5);
  const data=await page.evaluate(async()=>{const changing=player.setMode('hybrid').then(()=>null,e=>e.message);await new Promise(r=>setTimeout(r,100));await player.destroy();let error;try{await player.play();}catch(e){error=e.message;}return {change:await changing,error};});assert.match(data.error,/destroyed/);return data;
 });
 result.hashesAfter=await hashes();assert.deepEqual(result.hashesAfter,result.hashes);result.passed=result.tests.length===total&&result.tests.every(t=>t.passed);if(!result.passed)process.exitCode=1;
}catch(e){result.failure=String(e.stack);process.exitCode=1;console.error(e);}
finally{await page.evaluate(()=>window.player?.destroy()).catch(()=>{});await browser.close();server.kill('SIGTERM');result.finished=new Date().toISOString();await writeFile(`${out}/result.json`,JSON.stringify(result,null,2)+'\n');}
