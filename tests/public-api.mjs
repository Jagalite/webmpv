import {chromium,firefox} from 'playwright';
import {spawn} from 'node:child_process';import {mkdir,writeFile,readFile} from 'node:fs/promises';import assert from 'node:assert/strict';import {createHash} from 'node:crypto';
const family=process.env.BROWSER||'chrome',out=`results/public-api/${family}-${new Date().toISOString().replaceAll(':','-')}`;await mkdir(out,{recursive:true});console.log(out);
const server=spawn(process.execPath,['scripts/serve.mjs'],{env:{...process.env,PORT:'0'},stdio:['ignore','pipe','inherit']});
const origin=await new Promise((resolve,reject)=>{server.once('error',reject);server.stdout.on('data',d=>{const m=/http:\/\/127\.0\.0\.1:\d+/.exec(String(d));if(m)resolve(m[0]);});});
const browser=await(family==='firefox'?firefox:chromium).launch({headless:true,...(family==='chrome'?{channel:'chrome',args:['--autoplay-policy=no-user-gesture-required']}:{})});const page=await browser.newPage();page.setDefaultTimeout(30000);
const result={browser:browser.version(),family,checks:[],hashes:{}};for(const p of ['src/unified-player.ts','src/internal/state.ts','src/types.ts','src/internal/wasm-player.ts','src/internal/native-player.ts','tests/public-api.mjs'])result.hashes[p]=createHash('sha256').update(await readFile(p)).digest('hex');
const errors=[];page.on('pageerror',e=>errors.push(String(e)));
async function check(name,fn){if(process.env.ONLY&&!name.includes(process.env.ONLY))return;try{await fn();result.checks.push({name,passed:true});console.log('PASS',name);}catch(e){result.checks.push({name,passed:false,error:String(e.stack),state:await page.evaluate(()=>window.player?.state).catch(()=>null)});console.log('FAIL',name,String(e));process.exitCode=1;}await writeFile(out+'/result.json',JSON.stringify(result,null,2));}
async function make(mode){await page.evaluate(()=>window.player?.destroy());await page.evaluate(async mode=>{const {Player}=await import('/web/generated/index.js');window.player=new Player(document.querySelector('#surface'),{mode});window.historyEvents=[];for(const name of ['statechange','sourcechange','play','playing','pause','seeking','seeked','error'])player.addEventListener(name,e=>historyEvents.push({name,detail:e.detail,state:player.state}));},mode);}
async function open(){await page.evaluate(async()=>player.open(new File([await(await fetch('/fixtures/example.mp4')).arrayBuffer()],'example.mp4')));}
try{await page.goto(origin+'/examples/custom-controls.html');await page.waitForFunction(()=>window.player);
await check('immutable state, stable identity and no core UI import',async()=>{await make('native');const d=await page.evaluate(()=>{const a=player.state;let calls=0;const off=player.subscribe(()=>calls++);off();off();return {same:a===player.state,frozen:Object.isFrozen(a)&&Object.isFrozen(a.mediaInfo),calls,mode:a.activeMode,ranges:a.seekable,workers:performance.getEntriesByType('resource').filter(e=>/wasm|engine-worker|player-element/.test(e.name)).length};});assert.deepEqual(d,{same:true,frozen:true,calls:1,mode:null,ranges:null,workers:0});});
for(const mode of ['native','hybrid','software'])await check(mode+' state events, seek completion, mute and reopen',async()=>{
 await make(mode);await open();let d=await page.evaluate(()=>player.state);assert.equal(d.status,'paused');assert.equal(d.activeMode,mode);assert.ok(d.duration>1);assert.ok(d.mediaInfo.aspectRatio>1);assert.ok(d.seekable?.length,JSON.stringify(d));
 await page.evaluate(async()=>{await player.volume(43);await player.setMuted(true);await player.setVolume(.61);await player.setMuted(false);await player.rate(1.25);await player.play();});await page.waitForFunction(()=>player.state.status==='playing'&&player.state.currentTime>.3);
 await page.evaluate(async()=>{await player.pause();await player.seek(1);});d=await page.evaluate(()=>({state:player.state,events:historyEvents}));assert.equal(d.state.volume,.61);assert.equal(d.state.muted,false);assert.equal(d.state.playbackRate,1.25);assert.ok(Math.abs(d.state.currentTime-1)<.15);assert.equal(d.state.pendingOperation,null);const seeking=d.events.findIndex(e=>e.name==='seeking'),seeked=d.events.findIndex(e=>e.name==='seeked');assert.ok(seeked>seeking);assert.equal(d.events[seeking].state.pendingOperation.kind,'seeking');assert.equal(d.events[seeked].state.pendingOperation,null);assert.ok(d.events.find(e=>e.name==='playing'));assert.equal(d.events.filter(e=>e.name==='sourcechange').length,1);
 await page.evaluate(()=>player.close());d=await page.evaluate(()=>player.state);assert.equal(d.status,'idle');assert.equal(d.sourceId,null);assert.equal(d.volume,.61);await open();assert.equal(await page.evaluate(()=>player.state.status),'paused');
});
await check('canceled replacement preserves accepted state and bounded close',async()=>{
 await make('native');await open();await page.route('**/hung.mp4',()=>{});
 const d=await page.evaluate(async()=>{const old=player.surface,id=player.state.sourceId;const c=new AbortController();const work=player.open(location.origin+'/hung.mp4',{signal:c.signal}).catch(e=>e);await new Promise(r=>setTimeout(r,100));c.abort();const error=await work;return {code:error.code,same:old===player.surface,id:player.state.sourceId,previous:id,status:player.state.status,error:player.state.error};});assert.equal(d.code,'ABORTED');assert.ok(d.same);assert.equal(d.id,d.previous);assert.equal(d.status,'paused');assert.equal(d.error,null);
 const closed=await page.evaluate(async()=>{const work=player.open(location.origin+'/hung.mp4').catch(e=>e.code);await new Promise(r=>setTimeout(r,100));await player.close();return {error:await work,state:player.state};});assert.equal(closed.error,'ABORTED');assert.equal(closed.state.status,'idle');await page.unroute('**/hung.mp4');await open();
});
await check('close remains available with a full bounded operation queue',async()=>{await make('native');await open();await page.route('**/queue-hung.mp4',()=>{});const d=await page.evaluate(async()=>{const opening=player.open(location.origin+'/queue-hung.mp4').catch(e=>e.code);await new Promise(r=>setTimeout(r,50));const queued=Array.from({length:31},()=>player.volume(50).catch(e=>e.code));const overflow=await player.rate(1.5).catch(e=>e.code);await player.close();return {overflow,opening:await opening,queued:await Promise.all(queued),state:player.state};});await page.unroute('**/queue-hung.mp4');assert.equal(d.overflow,'INVALID_ARGUMENT');assert.equal(d.opening,'ABORTED');assert.ok(d.queued.every(code=>code==='ABORTED'));assert.equal(d.state.status,'idle');});
await check('failed replacement stays usable and redacts signed URL',async()=>{await make('native');await open();await page.route('**/bad.mp4*',r=>r.fulfill({status:403,body:'forbidden'}));const d=await page.evaluate(async()=>{const old=player.surface;try{await player.open(location.origin+'/bad.mp4?token=secret123');}catch(e){return {same:old===player.surface,error:e.toJSON(),state:player.state,diagnostics:player.diagnostics};}});assert.ok(d.same);assert.equal(d.state.error,null);assert.ok(!JSON.stringify(d).includes('secret123'));await page.unroute('**/bad.mp4*');});
await check('stable source-scoped tracks and explicit transition preservation',async()=>{await make('hybrid');await page.evaluate(async b=>{await player.open(new File([Uint8Array.from(atob(b),c=>c.charCodeAt(0))],'tracks.mkv'));const track=player.state.subtitleTracks[0];if(!track)throw Error('Missing subtitle track');window.trackId=track.id;await player.selectSubtitleTrack(track.id);await player.setMode('software');},(await readFile('build/fixtures/tracks.mkv')).toString('base64'));const d=await page.evaluate(()=>({id:trackId,selected:player.state.subtitleTracks.find(t=>t.selected)?.id}));assert.equal(d.id,d.selected);await open();const code=await page.evaluate(async()=>{try{await player.selectSubtitleTrack(trackId);}catch(e){return e.code;}});assert.equal(code,'INVALID_ARGUMENT');});
await check('external subtitles have distinct identities and preserve explicit selection across modes',async()=>{
 await make('hybrid');await open();
 await page.evaluate(async()=>{
  for(const name of ['first','second'])await player.addSubtitle(new File([`1\n00:00:00,000 --> 00:00:05,000\n${name}\n`],name+'.srt'));
 });
 const initial=await page.evaluate(()=>player.state.subtitleTracks);
 assert.equal(initial.length,2);assert.equal(new Set(initial.map(t=>t.id)).size,2);
 for(const track of initial){
  await page.evaluate(id=>player.selectSubtitleTrack(id),track.id);
  await page.waitForFunction(id=>player.state.subtitleTracks.find(t=>t.selected)?.id===id,track.id);
  assert.equal(await page.evaluate(()=>player.state.mediaInfo.subtitle.label),track.label);
 }
 for(const mode of ['software','hybrid']){
  await page.evaluate(mode=>player.setMode(mode),mode);
  const state=await page.evaluate(()=>player.state);
  assert.deepEqual(state.subtitleTracks.map(t=>t.id),initial.map(t=>t.id));
  assert.equal(state.mediaInfo.subtitle.id,initial[1].id);assert.equal(state.mediaInfo.subtitle.label,'second.srt');
 }
});
for(const mode of ['native','hybrid','software'])await check(mode+' fatal end-file reaches normalized state before error (adapter injection)',async()=>{
 await make(mode);await open();
 const d=await page.evaluate(async()=>{
  const received=[];player.addEventListener('error',event=>received.push({detail:event.detail,state:player.state}));
  player.current.backend.dispatchEvent(new CustomEvent('mpv',{detail:{event:'end-file',reason:'error',file_error:'Error decoding video frame'}}));
  await Promise.resolve();return {received,state:player.state};
 });
 assert.equal(d.received.length,1);assert.equal(d.state.status,'error');assert.equal(d.state.error.code,'DECODE_FAILED');
 assert.equal(d.received[0].detail.scope,'session');assert.deepEqual(d.received[0].state.error,d.received[0].detail);
 await open();assert.equal(await page.evaluate(()=>player.state.error),null);
});
for(const mode of ['native','software'])await check(mode+' caller abort at source acceptance does not reject committed open',async()=>{
 await make(mode);await open();
 const d=await page.evaluate(async()=>{
  const prior=player.state.sourceId,controller=new AbortController(),errors=[];
  player.addEventListener('error',event=>errors.push(event.detail));
  player.addEventListener('sourcechange',()=>controller.abort(),{once:true});
  await player.open(new File([await(await fetch('/fixtures/example.mp4')).arrayBuffer()],'example.mp4'),{signal:controller.signal});
  await player.play();await player.pause();
  return {prior,accepted:player.state.sourceId,aborted:controller.signal.aborted,state:player.state,errors};
 });
 assert.ok(d.aborted);assert.equal(d.accepted,d.prior+1);assert.equal(d.state.status,'paused');assert.equal(d.state.pendingOperation,null);assert.deepEqual(d.errors,[]);
});
await check('canceling Wasm asset initialization preserves the previous session',async()=>{await make('hybrid');await open();await page.route('**/DejaVuSans.ttf',()=>{});const d=await page.evaluate(async()=>{const old=player.surface,c=new AbortController();const pending=player.open(new File([await(await fetch('/fixtures/example.mp4')).arrayBuffer()],'example.mp4'),{signal:c.signal}).catch(e=>e.code);await new Promise(r=>setTimeout(r,100));c.abort();const code=await pending;return {code,same:old===player.surface,status:player.state.status,error:player.state.error};});await page.unroute('**/DejaVuSans.ttf');assert.equal(d.code,'ABORTED');assert.ok(d.same);assert.equal(d.status,'paused');assert.equal(d.error,null);});
await check('stale backend events cannot overwrite accepted playback',async()=>{await make('native');await open();const d=await page.evaluate(async()=>{const previous=player.current.backend;await player.setMode('hybrid');const before=player.state;previous.properties.set('time-pos',999);previous.dispatchEvent(new CustomEvent('mpv',{detail:{event:'property-change',name:'time-pos',data:999}}));previous.dispatchEvent(new CustomEvent('error',{detail:'late decoder failure'}));await Promise.resolve();return {same:player.state===before,time:player.state.currentTime,error:player.state.error};});assert.ok(d.same);assert.notEqual(d.time,999);assert.equal(d.error,null);});
await check('unknown duration and live windows remain truthful (adapter injection)',async()=>{await make('hybrid');await open();const d=await page.evaluate(async()=>{const backend=player.current.backend;const notify=()=>backend.dispatchEvent(new CustomEvent('mpv',{detail:{event:'property-change',name:'duration',data:null}}));backend.properties.set('duration',null);backend.properties.delete('demuxer-cache-state');notify();await Promise.resolve();const unknown=player.state;player.source={kind:'remote',options:{url:location.origin+'/live.m3u8',format:'hls',streaming:{live:true}}};backend.properties.set('demuxer-cache-state',{'seekable-ranges':[{start:20,end:40}]});notify();await Promise.resolve();const live=player.state;backend.properties.set('demuxer-cache-state',{'seekable-ranges':[]});notify();await Promise.resolve();return {unknown,live,empty:player.state};});assert.equal(d.unknown.duration,null);assert.equal(d.unknown.seekable,null);assert.equal(d.unknown.buffered,null);assert.equal(d.live.streamType,'live');assert.equal(d.live.duration,null);assert.deepEqual(d.live.seekable,[{start:20,end:40}]);assert.deepEqual(d.empty.seekable,[]);});
await check('waiting and ended reflect observed playback (native events)',async()=>{await make('native');await open();await page.evaluate(()=>player.play());await page.waitForFunction(()=>player.state.currentTime>.15);await page.evaluate(()=>player.surface.dispatchEvent(new Event('waiting')));await page.waitForFunction(()=>player.state.status==='buffering');await page.evaluate(()=>player.surface.dispatchEvent(new Event('playing')));await page.waitForFunction(()=>player.state.status==='playing');await page.evaluate(async()=>{await player.seek(player.state.duration-.25);await player.play();});await page.waitForFunction(()=>player.state.status==='ended');});
await check('idempotent destroy settles queue and removes workers',async()=>{const d=await page.evaluate(async()=>{const work=player.seek(1).catch(e=>e.code);const a=player.destroy(),b=player.destroy();await a;const error=await player.play().catch(e=>e.code);return {same:a===b,error,work:await work,status:player.state.status};});assert.ok(d.same);assert.equal(d.error,'ABORTED');assert.equal(d.status,'idle');await page.waitForTimeout(200);assert.equal(page.workers().length,0);});
await check('no uncaught errors',()=>assert.deepEqual(errors,[]));
}finally{await page.evaluate(()=>window.player?.destroy()).catch(()=>{});await browser.close();server.kill();result.passed=result.checks.every(c=>c.passed);await writeFile(out+'/result.json',JSON.stringify(result,null,2)+'\n');}
