import {chromium} from 'playwright';
import assert from 'node:assert/strict';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';
const out=`results/filter-routing/functional-${new Date().toISOString().replaceAll(':','-')}`;
await mkdir(out,{recursive:true});console.log(out);
const files=['web/filter-player.js','web/filter-retained-engine-worker.js','web/generated/filter-retained-player.js','experiments/filter-routing/prepare.py','experiments/filter-routing/build.sh','web/filters.html','web/filter-copyback-engine-worker.js','web/generated/filter-copyback-player.js','web/engine-filter-copyback/player.mjs','web/engine-filter-copyback/player.wasm','web/subtitled-engine-worker.js','web/retained-decoder-worker.js','web/subtitle-overlay.js','web/generated/subtitled-player.js','web/engine-retained-subs/player.wasm','web/engine-retained-subs/player.mjs','web/browser-decoder-worker.js','web/audio-worklet.js','web/io-worker.js','web/range-reader.js','tests/filter-routing.mjs','build/fixtures/tracks.mkv'];
const hashes=async()=>Object.fromEntries(await Promise.all(files.map(async p=>[p,createHash('sha256').update(await readFile(p)).digest('hex')])));
const result={started:new Date().toISOString(),scope:'Headless local functional filter routing; not performance qualification',skipNegative:process.argv.includes('--skip-negative'),passed:false,hashes:await hashes(),tests:[]};
const browser=await chromium.launch({channel:'chrome',headless:true,ignoreDefaultArgs:['--mute-audio'],args:['--autoplay-policy=no-user-gesture-required']});
const page=await browser.newPage({viewport:{width:1280,height:1000},deviceScaleFactor:1});const errors=[];page.on('pageerror',e=>errors.push(String(e)));
const save=()=>writeFile(`${out}/result.json`,JSON.stringify(result,null,2)+'\n');
async function check(name,fn){await page.evaluate(({name,index})=>document.querySelector('#status').textContent=`Check ${index} of 8: ${name}. No foreground hold required.`,{name,index:result.tests.length+1});const evidence=await fn();assert.deepEqual(errors,[]);assert.deepEqual(await page.evaluate(()=>window.errors),[]);result.tests.push({name,passed:true,evidence});await save();console.log('PASS',name);}
async function capture(name){await page.waitForTimeout(250);const png=await page.evaluate(()=>capturePNG());await writeFile(`${out}/${name}.png`,Buffer.from(png,'base64'));return png;}
async function compare(base,filtered,kind){return page.evaluate(async({base,filtered,kind})=>{
 async function pixels(s){const im=await createImageBitmap(await(await fetch('data:image/png;base64,'+s)).blob());const c=document.createElement('canvas');c.width=im.width;c.height=im.height;const ctx=c.getContext('2d');ctx.drawImage(im,0,0);im.close();return ctx.getImageData(0,0,c.width,c.height).data;}
 const [a,b]=await Promise.all([pixels(base),pixels(filtered)]);let error=0,change=0,count=0;
 for(let y=32;y<1048;y+=17)for(let x=32;x<1888;x+=17){let xx=x,yy=y;if(kind==='hflip')xx=1919-x;if(kind==='vflip')yy=1079-y;if(kind==='crop'){xx=Math.floor(480+x/2);yy=Math.floor(270+y/2);}for(let c=0;c<3;c++){error+=Math.abs(a[(yy*1920+xx)*4+c]-b[(y*1920+x)*4+c]);change+=Math.abs(a[(y*1920+x)*4+c]-b[(y*1920+x)*4+c]);count++;}}
 return {meanError:error/count,meanChange:change/count};
 },{base,filtered,kind});}
try{
 await page.goto('http://127.0.0.1:4179/web/filters.html');await page.waitForFunction(()=>typeof createPlayer==='function');
 await page.evaluate(s=>window.fixture=Uint8Array.from(atob(s),c=>c.charCodeAt(0)).buffer,(await readFile('build/fixtures/tracks.mkv')).toString('base64'));
 await check('unfiltered source starts on retained frames',async()=>{
  await page.evaluate(async()=>{await createPlayer();await player.open(fixture);await player.selectTrack('sub','2');await player.selectTrack('audio','2');await player.subtitleVisible(false);await player.volume(37);await player.rate(1.25);await player.seek(5);});
  const d=await page.evaluate(()=>player.diagnostics);assert.equal(d.route,'retained');assert.equal(d.decoder,'webcodecs');assert.equal(d.decoderStats.copyMs,0);return d;
 });
 let baseline;
 await check('filter activation selects full-frame WebCodecs and restores state',async()=>{
  await page.evaluate(()=>player.setVideoFilters('null'));baseline=await capture('copyback-baseline');
  const state=await page.evaluate(()=>({d:player.diagnostics,p:Object.fromEntries(player.properties),settings:player.settings}));
  assert.equal(state.d.route,'copyback');assert.equal(state.d.decoder,'webcodecs');assert.ok(state.d.decoderStats.copyMs>0);assert.ok(Math.abs(state.p['time-pos']-5)<.15);assert.equal(state.p.pause,true);assert.equal(state.p.speed,1.25);assert.equal(state.p.volume,37);assert.equal(state.p['track-list'].find(t=>t.type==='audio'&&t.selected).id,'2');assert.equal(state.p['track-list'].find(t=>t.type==='sub'&&t.selected).id,'2');return state;
 });
 await check('mirror, vertical flip and crop transform real video pixels',async()=>{
  const evidence=[];for(const [filter,kind] of [['hflip','hflip'],['vflip','vflip'],['crop=960:540:480:270','crop']]){
   await page.evaluate(f=>player.setVideoFilters(f),filter);const actual=await capture(kind),comparison=await compare(baseline,actual,kind);
   assert.ok(comparison.meanError<8,JSON.stringify({kind,...comparison}));assert.ok(comparison.meanChange>8,JSON.stringify({kind,...comparison}));evidence.push({filter,...comparison});
  }
  if(!result.skipNegative){await page.evaluate(()=>player.setVideoFilters('negate'));const negative=await capture('negative'),comparison=await compare(baseline,negative,'negate');assert.ok(comparison.meanChange>80,JSON.stringify(comparison));evidence.push({filter:'negate',...comparison});}return evidence;
 });
 await check('subtitles stay upright after video filtering',async()=>{
  await page.evaluate(()=>player.setVideoFilters('null'));const normalOff=await capture('normal-off');await page.evaluate(()=>player.subtitleVisible(true));const normalOn=await capture('normal-on');
  await page.evaluate(()=>player.setVideoFilters('hflip'));const flippedOn=await capture('flipped-on');await page.evaluate(()=>player.subtitleVisible(false));const flippedOff=await capture('flipped-off');
  const masks=await page.evaluate(async images=>{
   async function pixels(s){const im=await createImageBitmap(await(await fetch('data:image/png;base64,'+s)).blob()),c=document.createElement('canvas');c.width=1920;c.height=1080;const ctx=c.getContext('2d');ctx.drawImage(im,0,0);im.close();return ctx.getImageData(0,0,1920,1080).data;}
   const [a,b,c,d]=await Promise.all(images.map(pixels)),m=[],n=[];let total=0,matched=0;
   for(let i=0;i<a.length/4;i++){m[i]=[0,1,2].some(k=>Math.abs(a[i*4+k]-b[i*4+k])>12);n[i]=[0,1,2].some(k=>Math.abs(c[i*4+k]-d[i*4+k])>12);}
   for(let y=0;y<1080;y++)for(let x=0;x<1920;x++)if(m[y*1920+x]){total++;let found=false;for(let dy=-3;dy<=3&&!found;dy++)for(let dx=-3;dx<=3;dx++)if(x+dx>=0&&x+dx<1920&&y+dy>=0&&y+dy<1080&&n[(y+dy)*1920+x+dx]){found=true;break;}matched+=found;}
   return {subtitlePixels:total,matched,recall:matched/total};
  },[normalOn,normalOff,flippedOn,flippedOff]);assert.ok(masks.subtitlePixels>10000);assert.ok(masks.recall>.95,JSON.stringify(masks));return masks;
 });
 await check('clearing filters restores retained frames and subtitle visibility',async()=>{
  await page.evaluate(async()=>{await player.subtitleVisible(true);await player.command('vf','clr','');});await capture('restored-retained');
  const d=await page.evaluate(()=>player.diagnostics);assert.equal(d.route,'retained');assert.equal(d.decoderStats.copyMs,0);assert.ok(d.subtitles.parts>0);assert.ok(Math.abs(d.presentedPosition-5)<.15);return d;
 });
 await check('filter switching during playback restores advancing audio and video',async()=>{
  await page.evaluate(()=>player.play());await page.waitForTimeout(350);await page.evaluate(()=>player.setVideoFilters('hflip'));const before=await page.evaluate(()=>({d:player.diagnostics,a:player.audioDiagnostics()}));await page.waitForTimeout(1100);const after=await page.evaluate(()=>({d:player.diagnostics,a:player.audioDiagnostics(),pause:player.properties.get('pause')}));assert.equal(after.pause,false);assert.ok(after.d.rendered>before.d.rendered+10);assert.ok(after.a.mediaFrames>before.a.mediaFrames);await page.evaluate(()=>player.pause());return {before,after};
 });
 await check('unavailable filters roll back without losing the current player',async()=>{
  const state=await page.evaluate(async()=>{const old=player.player,filters=player.filters,position=player.properties.get('time-pos');let error;try{await player.setVideoFilters('no_such_filter_qualification');}catch(e){error=String(e);}return {error,samePlayer:old===player.player,filters,after:player.filters,position,afterPosition:player.properties.get('time-pos'),route:player.diagnostics.route};});assert.match(state.error,/filter|option|load/i);assert.equal(state.samePlayer,true);assert.equal(state.filters,state.after);assert.ok(Math.abs(state.position-state.afterPosition)<.15);return state;
 });
 await check('serialized changes and destroy release every engine and frame',async()=>{
  await page.evaluate(async()=>{await Promise.all([player.setVideoFilters('null'),player.setVideoFilters('')]);});assert.equal(await page.evaluate(()=>player.diagnostics.route),'retained');
  await page.evaluate(()=>player.destroy());for(let i=0;i<50&&page.workers().length;i++)await page.waitForTimeout(100);assert.equal(page.workers().length,0);
  const history=await page.evaluate(()=>player.history);assert.ok(history.length>=10);for(const item of history){const d=item.diagnostics;if(!d)continue;if(d.presentation){assert.equal(d.presentation.received,d.presentation.closed);assert.equal(d.presentation.retained,0);assert.equal(d.presentation.pending,0);}if(d.decoderStats)assert.equal(d.decoderStats.active,false);assert.equal(item.audio.state,'closed');}assert.equal(await page.locator('iframe').count(),0);return history;
 });
 result.passed=true;
}catch(e){result.failure=String(e.stack);result.state=await page.evaluate(()=>({errors:window.errors,events:window.events,diagnostics:window.player?.diagnostics,properties:window.player?Object.fromEntries(player.properties):{},history:window.player?.history})).catch(()=>null);console.error(result.failure);process.exitCode=1;}
finally{await page.evaluate(()=>window.player?.destroy()).catch(()=>{});result.hashesAfter=await hashes();result.runtimeUnchanged=JSON.stringify(result.hashes)===JSON.stringify(result.hashesAfter);if(!result.runtimeUnchanged){result.passed=false;process.exitCode=1;}result.finished=new Date().toISOString();await save();await browser.close();}
