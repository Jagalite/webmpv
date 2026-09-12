import {chromium,firefox} from 'playwright';
import assert from 'node:assert/strict';
import {readFile,mkdir,writeFile} from 'node:fs/promises';
import {serve} from '../experiments/pipeline-qualification/server.mjs';
const server=await serve(),out=`results/automatic-selection/run-${new Date().toISOString().replaceAll(':','-')}`;
await mkdir(out,{recursive:true});const result={cases:[]};console.log(out);
const browser=await chromium.launch({headless:true,channel:'chrome',args:['--autoplay-policy=no-user-gesture-required']});result.browser=browser.version();const fallbackBrowser=await firefox.launch({headless:true});result.fallbackBrowser=fallbackBrowser.version();
const files={avc:'build/fixtures/software-full/h264-aac.mp4',ass:'build/fixtures/tracks.mkv',hevc:'build/fixtures/software-full/hevc-ac3.mkv',mpeg4:'build/fixtures/software-full/mpeg4-mp3.avi',ts:'build/pipeline-separation/fixtures/config-0.ts'};
const open=async(p,name)=>{const b=await readFile(files[name]);return p.evaluate(b=>player.open(new File([Uint8Array.from(atob(b),c=>c.charCodeAt(0))],'source')),b.toString('base64'));};
async function check(name,fn,options={}){
 const p=await (name==='browser-rejection'?fallbackBrowser:browser).newPage();p.setDefaultTimeout(40000);const r={name};result.cases.push(r);
 try{await p.goto(server.origin+'/experiment/page.html');await p.evaluate(async options=>{const {Player}=await import('/web/generated/index.js');window.player=new Player(document.querySelector('#surface'),options);window.errors=[];player.addEventListener('error',e=>errors.push(String(e.detail)));},options);
  r.evidence=await fn(p);await p.screenshot({path:out+'/'+name+'.png'});await p.evaluate(()=>player.destroy());await p.waitForTimeout(150);assert.equal(p.workers().length,0);r.passed=true;console.log('PASS',name);
 }catch(e){r.error=String(e.stack);r.state=await p.evaluate(()=>({mode:player.mode,diagnostics:player.diagnostics,errors})).catch(()=>null);console.log('FAIL',name,String(e));process.exitCode=1;}
 finally{await p.evaluate(()=>player.destroy()).catch(()=>{});await p.close();await writeFile(out+'/result.json',JSON.stringify(result,null,2)+'\n');}
}
const snapshot=p=>p.evaluate(()=>({mode:player.mode,auto:player.automaticSelection,diagnostics:player.diagnostics,properties:Object.fromEntries(player.properties),errors}));
const playback=async(p,mode)=>{assert.equal(await p.evaluate(()=>player.mode),mode);await p.evaluate(()=>player.play());await p.waitForFunction(()=>Number(player.properties.get('time-pos'))>.3);await p.evaluate(()=>player.pause());return snapshot(p);};
try{
 await check('native-direct',async p=>{await open(p,'avc');const r=await playback(p,'native');assert.equal(r.diagnostics.backend.plan,'direct');return r;});
 await check('native-remux',async p=>{await open(p,'ts');const r=await playback(p,'native');assert.equal(r.diagnostics.backend.plan,'remux');await p.evaluate(()=>player.seek(2));return r;});
 await check('embedded-ass',async p=>{await open(p,'ass');const r=await playback(p,'hybrid');assert.ok(r.diagnostics.selection.attempts.some(a=>a.reason.includes('subtitles')));return r;});
 await check('incompatible-native-audio',async p=>{await open(p,'hevc');return playback(p,'hybrid');});
 await check('software-codec',async p=>{await open(p,'mpeg4');return playback(p,'software');});
 await check('browser-rejection',async p=>{await open(p,'hevc');return playback(p,'software');});
 await check('reselect-new-source',async p=>{await open(p,'mpeg4');assert.equal(await p.evaluate(()=>player.mode),'software');await open(p,'avc');return playback(p,'native');});
 await check('automatic-filters',async p=>{await open(p,'avc');await p.evaluate(async()=>{await player.seek(.5);await player.volume(37);await player.rate(1.25);await player.setVideoFilters('hflip');});const r=await playback(p,'software');assert.equal(r.properties.volume,37);assert.equal(r.properties.speed,1.25);await p.evaluate(()=>player.setVideoFilters(''));assert.equal(await p.evaluate(()=>player.mode),'native');return r;});
 await check('explicit-mode-pins',async p=>{await open(p,'mpeg4');await p.evaluate(()=>player.setMode('software'));await open(p,'avc');assert.equal(await p.evaluate(()=>player.automaticSelection),false);assert.equal(await p.evaluate(()=>player.mode),'software');await p.evaluate(()=>player.setAutomaticSelection());return playback(p,'native');});
 await check('runtime-recovery',async p=>{await open(p,'hevc');await p.evaluate(async()=>{await player.volume(37);await player.rate(1.25);await player.play();});await p.waitForFunction(()=>Number(player.properties.get('time-pos'))>.5);await p.evaluate(()=>player.current.backend.dispatchEvent(new CustomEvent('error',{detail:'Injected runtime decoder failure'})));await p.waitForFunction(()=>player.mode==='software');const r=await snapshot(p);assert.equal(r.properties.volume,37);assert.equal(r.properties.speed,1.25);assert.equal(r.properties.pause,false);assert.deepEqual(r.errors,[]);assert.ok(r.diagnostics.selection.attempts.some(a=>a.mode==='hybrid'&&a.outcome==='failed'&&a.reason.includes('Injected runtime decoder failure')));return r;});
 await check('native-runtime-remux',async p=>{await open(p,'avc');await p.evaluate(()=>player.play());await p.waitForFunction(()=>Number(player.properties.get('time-pos'))>.3);await p.evaluate(()=>player.current.backend.dispatchEvent(new CustomEvent('error',{detail:'Injected native decode failure'})));await p.waitForFunction(()=>player.diagnostics.backend?.plan==='remux');assert.equal(await p.evaluate(()=>player.mode),'native');return snapshot(p);});
 await check('subtitle-enable-reselect',async p=>{await p.evaluate(()=>player.subtitleVisible(false));await open(p,'ass');assert.equal(await p.evaluate(()=>player.mode),'native');await p.evaluate(()=>player.subtitleVisible(true));return playback(p,'hybrid');});
 await check('source-identity-is-terminal',async p=>{await open(p,'ts');await p.evaluate(()=>player.current.backend.dispatchEvent(new CustomEvent('error',{detail:'Media representation changed'})));await p.waitForTimeout(800);const r=await snapshot(p);assert.equal(r.mode,'native');assert.equal(r.errors.length,1);return r;});
 await check('range-change-does-not-fallback',async p=>{
  let changed=false;const requests=[];
  await p.route('**/media/mkv?automatic-change=1',async route=>{
   const response=await route.fetch();requests.push({changed,ifRange:route.request().headers()['if-range']});
   await route.fulfill({response,status:changed?200:206,headers:{...response.headers(),etag:changed?'"new-version"':'"original-version"'}});
  });
  await p.evaluate(url=>player.openRemote({url,headers:{'X-Test':'automatic'}}),server.origin+'/media/mkv?automatic-change=1');await p.waitForTimeout(300);changed=true;
  const error=await p.evaluate(async()=>{try{await player.seek(120);return null;}catch(e){return String(e);}});
  assert.match(error,/Source transport:/);await p.waitForTimeout(300);const r=await snapshot(p);assert.equal(r.mode,'native');assert.ok(requests.filter(q=>q.changed).every(q=>q.ifRange==='"original-version"'));return {error,requests,state:r};
 });
 await check('remote-authorization',async p=>{await p.evaluate(url=>player.openRemote({url,headers:{Authorization:'Bearer initial'},refreshAuthorization:async()=>({headers:{Authorization:'Bearer refreshed'}})}),server.origin+'/media/mkv?auth=1&id=automatic');return playback(p,'native');});
 await check('disabled-tracks-survive-reselection',async p=>{await open(p,'avc');await p.evaluate(async()=>{await player.selectTrack('audio','no');await player.selectTrack('sub','no');await player.setVideoFilters('hflip');});assert.equal(await p.evaluate(()=>player.mode),'software');assert.equal(await p.evaluate(()=>player.properties.get('track-list').some(t=>t.type==='audio'&&t.selected)),false);await p.evaluate(()=>player.setVideoFilters(''));assert.equal(await p.evaluate(()=>player.surface.muted),true);return snapshot(p);});
 await check('all-routes-fail-rollback',async p=>{await open(p,'avc');const r=await p.evaluate(async()=>{const surface=player.surface;let error;try{await player.open(new File(['invalid'],'bad'));}catch(e){error=String(e);}return {error,same:surface===player.surface};});assert.ok(r.error);assert.ok(r.same);await playback(p,'native');return r;});
 await check('selected-language-survives-filters',async p=>{
  await p.evaluate(()=>player.subtitleVisible(false));await open(p,'ass');
  await p.evaluate(()=>player.selectTrack('audio','3'));
  await p.evaluate(()=>player.setVideoFilters('hflip'));
  assert.equal(await p.evaluate(()=>player.properties.get('track-list').find(t=>t.type==='audio'&&t.selected)?.lang),'jpn');
  return snapshot(p);
 },{nativeRemux:'always'});
 await check('second-failure-during-recovery',async p=>{
  await open(p,'avc');await p.evaluate(()=>{
   player.addEventListener('selectionchange',e=>{if(e.detail.outcome==='selected'&&player.diagnostics.backend.plan==='remux')player.current.backend.dispatchEvent(new CustomEvent('error',{detail:'Second decoder failure'}));});
   player.current.backend.dispatchEvent(new CustomEvent('error',{detail:'First decoder failure'}));
  });await p.waitForFunction(()=>player.mode==='hybrid');assert.deepEqual(await p.evaluate(()=>errors),[]);return playback(p,'hybrid');
 });
 await check('identity-survives-decoder-fallback',async p=>{
  let changed=false;const requests=[];
  await p.route('**/media/mkv?fallback-identity=1',async route=>{
   const response=await route.fetch();requests.push({changed,ifRange:route.request().headers()['if-range']});
   await route.fulfill({response,headers:{...response.headers(),etag:changed?'"version-two"':'"version-one"'}});
  });
  await p.evaluate(url=>player.openRemote({url,headers:{'X-Test':'review'}}),server.origin+'/media/mkv?fallback-identity=1');
  changed=true;await p.evaluate(()=>player.current.backend.dispatchEvent(new CustomEvent('error',{detail:'Decoder failure'})));
  await p.waitForFunction(()=>errors.length>0);assert.equal(await p.evaluate(()=>player.mode),'native');
  assert.ok(requests.some(r=>r.changed));assert.ok(requests.filter(r=>r.changed).every(r=>r.ifRange==='"version-one"'));
  return {requests,state:await snapshot(p)};
 },{nativeRemux:'always'});
 await check('destroy-during-stalled-probe-import',async p=>{
  let requested;const seen=new Promise(r=>requested=r);await p.route('**/source-probe.js',()=>requested());
  await p.evaluate(url=>{window.opening=player.openRemote({url}).then(()=>false,()=>true);},server.origin+'/media/mkv');await seen;
  const result=await p.evaluate(()=>Promise.race([player.destroy().then(async()=>({destroyed:true,rejected:await opening})),new Promise(r=>setTimeout(()=>r({destroyed:false}),1000))]));
  assert.deepEqual(result,{destroyed:true,rejected:true});return result;
 });
 await check('destroy-during-probe',async p=>{await p.route('**/source-probe.js',async route=>{await new Promise(r=>setTimeout(r,300));await route.continue().catch(()=>{});});const r=await p.evaluate(async url=>{const opening=player.openRemote({url}).then(()=>false,()=>true);await new Promise(r=>setTimeout(r,50));await player.destroy();return {rejected:await opening};},server.origin+'/media/mkv');assert.equal(r.rejected,true);return r;});
}finally{await browser.close();await fallbackBrowser.close();await server.close();result.passed=result.cases.every(c=>c.passed);await writeFile(out+'/result.json',JSON.stringify(result,null,2)+'\n');}
