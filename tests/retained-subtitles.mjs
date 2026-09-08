import {chromium} from 'playwright';
import assert from 'node:assert/strict';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';
const remote=process.argv.includes('--remote'),lavf=process.argv.includes('--lavf'),unshaped=process.argv.includes('--unshaped');
const out=`results/retained-subtitles/${remote?'remote':'local'}-${new Date().toISOString().replaceAll(':','-')}`;
await mkdir(out,{recursive:true});console.log(out);
const files=['web/subtitle-overlay.js','web/subtitled-engine-worker.js','web/generated/subtitled-player.js','web/subtitled.html','web/engine-retained-subs/player.wasm','web/engine-retained-subs/player.mjs','experiments/retained-subtitles/subtitles.c','experiments/retained-subtitles/prepare.py','experiments/retained-subtitles/player.c','experiments/retained-subtitles/vo_libmpv.c','tests/retained-subtitles.mjs','fixtures/qualification.ass','build/fixtures/tracks.mkv','web/retained-decoder-worker.js','web/audio-worklet.js','web/io-worker.js','web/range-reader.js','native/vd_browser.c','native/stream_bridge.c','native/events.c','experiments/retained-subtitles/link.sh','experiments/retained-subtitles/compile-hook.py',...['reference-on','reference-off','reference-720-on','reference-720-off','reference-karaoke-225-on','reference-karaoke-225-off','reference-karaoke-325-on','reference-karaoke-325-off'].map(p=>`build/${p}/00000001.png`)];
const hashes=async()=>Object.fromEntries(await Promise.all(files.map(async p=>[p,createHash('sha256').update(await readFile(p)).digest('hex')])));
const result={started:new Date().toISOString(),passed:false,remote,lavf,unshaped,network:{rtt:unshaped?0:80,mbps:unshaped?0:10},scope:remote?'headless remote-stream functional subtitle validation; not performance qualification':'headless local-file functional subtitle validation; not performance qualification',hashes:await hashes(),tests:[]};
const browser=await chromium.launch({channel:'chrome',headless:true,ignoreDefaultArgs:['--mute-audio'],args:['--autoplay-policy=no-user-gesture-required']});
const page=await browser.newPage({viewport:{width:1280,height:1000},deviceScaleFactor:2});const errors=[];page.on('pageerror',e=>errors.push(String(e)));
const save=()=>writeFile(`${out}/result.json`,JSON.stringify(result,null,2)+'\n');
async function check(name,fn){await page.evaluate(({index,name})=>setBenchmarkProgress({index,total:6,label:name,phase:'Checking',remainingSeconds:Math.max(5,90-(Date.now()-window.checkStarted)/1000)}),{index:result.tests.length+1,name});const evidence=await fn();if(result.tests.length<5)assert.equal(await page.evaluate(()=>player.diagnostics?.decoder),'webcodecs');assert.deepEqual(errors,[]);assert.deepEqual(await page.evaluate(()=>playerErrors),[]);result.tests.push({name,passed:true,evidence});await save();console.log('PASS',name);}
async function capture(name){const png=await page.evaluate(()=>capturePNG());await writeFile(`${out}/${name}.png`,Buffer.from(png,'base64'));return png;}
async function settled(position){await page.waitForFunction(position=>{if(playerErrors.length)throw Error(playerErrors.join(';'));return !player.diagnostics?.seeking&&Math.abs(player.diagnostics?.presentedPosition-position)<.08&&Math.abs(player.diagnostics?.presentation?.pts?.at(-1)/1e6-position)<.08&&player.diagnostics?.decoder==='webcodecs';},position,{timeout:20000});await page.waitForTimeout(250);}
async function reference(name){return (await readFile(`build/${name}/00000001.png`)).toString('base64');}
async function compareImages(on,off,refOn,refOff,width=1920,height=1080){return await page.evaluate(async({on,off,refOn,refOff,width,height})=>{
   async function pixels(base64){const blob=await(await fetch('data:image/png;base64,'+base64)).blob(),bitmap=await createImageBitmap(blob),c=document.createElement('canvas');c.width=bitmap.width;c.height=bitmap.height;const x=c.getContext('2d');x.drawImage(bitmap,0,0);bitmap.close();return x.getImageData(0,0,c.width,c.height).data;}
   const [a,b,c,d]=await Promise.all([on,off,refOn,refOff].map(pixels));const w=width,h=height;
   function mask(on,off){const m=new Uint8Array(w*h);for(let i=0;i<m.length;i++){const at=i*4;m[i]=Math.max(Math.abs(on[at]-off[at]),Math.abs(on[at+1]-off[at+1]),Math.abs(on[at+2]-off[at+2]))>=12;}return m;}
   const actual=mask(a,b),reference=mask(c,d);
   function near(mask,x,y){for(let dy=-3;dy<=3;dy++)for(let dx=-3;dx<=3;dx++){const xx=x+dx,yy=y+dy;if(xx>=0&&xx<w&&yy>=0&&yy<h&&mask[yy*w+xx])return true;}return false;}
   return [[0,0,1920,300,'karaoke'],[700,400,1250,700,'vectors and overlap'],[0,850,1920,1080,'shaping and accents']].map(([x0,y0,x1,y1,name])=>{x0=Math.floor(x0*w/1920);x1=Math.floor(x1*w/1920);y0=Math.floor(y0*h/1080);y1=Math.floor(y1*h/1080);let n=0,r=0,matched=0,covered=0;for(let y=y0;y<y1;y++)for(let x=x0;x<x1;x++){if(actual[y*w+x]){n++;if(near(reference,x,y))matched++;}if(reference[y*w+x]){r++;if(near(actual,x,y))covered++;}}return {name,pixels:n,referencePixels:r,precision:matched/n,recall:covered/r};});
  },{on,off,refOn,refOff,width,height});}
try{
 await page.goto('http://127.0.0.1:4179/web/subtitled.html');await page.waitForFunction(()=>typeof createPlayer==='function');await page.evaluate(()=>{window.checkStarted=Date.now();});
 await page.evaluate(base64=>{window.fixtureBytes=Uint8Array.from(atob(base64),c=>c.charCodeAt(0)).buffer;},(await readFile('build/fixtures/tracks.mkv')).toString('base64'));
 await page.evaluate(({remote,lavf})=>{window.useRemote=remote;window.useLavf=lavf;},{remote,lavf});
 await fetch('http://127.0.0.1:4180/control?id=retained-subs',{method:'POST',body:JSON.stringify({rtt:unshaped?0:80,mbps:unshaped?0:10,mode:'normal',stall:false,outageUntil:0})});
 await check('native-reference ASS shaping, vectors and overlap at paused 5 seconds',async()=>{
  await page.evaluate(async()=>{await createPlayer();if(window.useLavf)await player.command('set','demuxer','lavf');if(window.useRemote)await player.openRemote({url:'http://127.0.0.1:4180/media/tracks?id=retained-subs'});else await player.open(fixtureBytes);});
  await page.waitForFunction(()=>player.diagnostics?.presentation?.drawn>0,null,{timeout:15000});
  await page.evaluate(async()=>{await player.selectTrack('sub','2');await player.seek(5);});await settled(5);
  const on=await capture('ass-on');await page.evaluate(()=>player.subtitleVisible(false));await page.waitForTimeout(300);const off=await capture('ass-off');
  const comparison=await compareImages(on,off,await reference('reference-on'),await reference('reference-off'));
  for(const a of comparison)assert.ok(a.pixels>500&&a.precision>=.95&&a.recall>=.95,JSON.stringify(a));
  return {comparison,diagnostics:await page.evaluate(()=>player.diagnostics)};
 });
 await check('paused subtitle visibility and cache stability',async()=>{
  await page.evaluate(()=>player.subtitleVisible(true));await page.waitForTimeout(300);const on=await capture('toggle-on');
  const a=await page.evaluate(()=>({position:player.properties.get('time-pos'),subtitles:player.diagnostics.subtitles}));await page.waitForTimeout(500);const stable=await capture('toggle-stable');assert.equal(on,stable);
  const b=await page.evaluate(()=>({position:player.properties.get('time-pos'),subtitles:player.diagnostics.subtitles}));assert.equal(a.position,b.position);assert.equal(a.subtitles.updates,b.subtitles.updates);return {a,b};
 });
 await check('resize to 720p preserves native subtitle placement',async()=>{
  await page.evaluate(()=>player.resize(1280,720));await page.waitForTimeout(350);const on=await capture('720-on');await page.evaluate(()=>player.subtitleVisible(false));await page.waitForTimeout(300);const off=await capture('720-off');
  const comparison=await compareImages(on,off,await reference('reference-720-on'),await reference('reference-720-off'),1280,720);
  for(const a of comparison)assert.ok(a.pixels>200&&a.precision>=.95&&a.recall>=.95,JSON.stringify(a));
  await page.evaluate(()=>player.resize(1920,1080));return {comparison};
 });
 await check('backward paused seeks and karaoke progression match reference',async()=>{
  const phases=[];
  for(const [position,label] of [[2.25,'225'],[3.25,'325']]){
   await page.evaluate(async t=>{await player.subtitleVisible(true);await player.seek(t);},position);await settled(position);
   const on=await capture(`karaoke-${label}-on`);await page.evaluate(()=>player.subtitleVisible(false));await page.waitForTimeout(300);const off=await capture(`karaoke-${label}-off`);
   const refOn=await reference(`reference-karaoke-${label}-on`),refOff=await reference(`reference-karaoke-${label}-off`);
   const comparison=await compareImages(on,off,refOn,refOff);for(const a of comparison.filter(a=>a.name==='karaoke'))assert.ok(a.pixels>500&&a.precision>=.95&&a.recall>=.95,JSON.stringify(a));
   const colors=await page.evaluate(async images=>{async function pixels(base64){const bitmap=await createImageBitmap(await(await fetch('data:image/png;base64,'+base64)).blob()),c=document.createElement('canvas');c.width=bitmap.width;c.height=bitmap.height;const x=c.getContext('2d');x.drawImage(bitmap,0,0);bitmap.close();return x.getImageData(0,0,c.width,c.height).data;}const [on,off,refOn,refOff]=await Promise.all(images.map(pixels));function count(a,b){let yellow=0,red=0;for(let y=70;y<240;y++)for(let x=650;x<1250;x++){const i=(y*1920+x)*4;if(Math.max(Math.abs(refOn[i]-refOff[i]),Math.abs(refOn[i+1]-refOff[i+1]),Math.abs(refOn[i+2]-refOff[i+2]))<12)continue;if(a[i]>170&&a[i+1]>170&&a[i+2]<100)yellow++;if(a[i]>170&&a[i+1]<100&&a[i+2]<100)red++;}return {yellow,red,highlightShare:yellow/(yellow+red)};}return {actual:count(on,off),reference:count(refOn,refOff)};},[on,off,refOn,refOff]);
   assert.ok(colors.actual.yellow+colors.actual.red>500);assert.ok(Math.abs(colors.actual.highlightShare-colors.reference.highlightShare)<.15,JSON.stringify(colors));phases.push({position,comparison,...colors});
  }
  assert.ok(phases[1].actual.highlightShare>phases[0].actual.highlightShare+.1);
  return {phases,diagnostics:await page.evaluate(()=>player.diagnostics)};
 });
 await check('animated ASS updates while real retained video and audio play',async()=>{
  await page.evaluate(async()=>{await player.subtitleVisible(true);await player.seek(4.2);});await settled(4.2);
  const before=await page.evaluate(()=>({d:player.diagnostics,a:player.audioDiagnostics()}));await page.evaluate(()=>player.play());await page.waitForTimeout(1500);await page.evaluate(()=>player.pause());await page.waitForTimeout(250);const after=await page.evaluate(()=>({d:player.diagnostics,a:player.audioDiagnostics()}));
  await capture('animated');assert.ok(after.d.presentation.drawn-before.d.presentation.drawn>=30);assert.ok(after.a.mediaFrames>before.a.mediaFrames);assert.ok(after.d.subtitles.updates-before.d.subtitles.updates>5);assert.equal(after.d.decoderStats.copyMs,0);return {before,after};
 });
 await check('track switching and complete frame/worker cleanup',async()=>{
  await page.evaluate(()=>player.selectTrack('sub','1'));await page.waitForTimeout(300);const first=await capture('track1');await page.evaluate(()=>player.selectTrack('sub','2'));await page.waitForTimeout(300);const second=await capture('track2');assert.notEqual(first,second);
  await page.evaluate(()=>player.destroy());for(let i=0;i<50&&page.workers().length;i++)await page.waitForTimeout(100);assert.equal(page.workers().length,0);
  const d=await page.evaluate(()=>player.diagnostics);assert.equal(d.presentation.received,d.presentation.closed);assert.equal(d.presentation.retained,0);assert.equal(d.presentation.pending,0);assert.equal(d.decoderStats.active,false);return d;
 });
 result.passed=true;await page.evaluate(()=>setBenchmarkProgress({phase:'Complete',done:true}));
}catch(e){result.failure=String(e.stack);result.state=await page.evaluate(()=>({errors:playerErrors,events:playerEvents.filter(e=>e.event==='log-message'||e.event==='browser-log'),diagnostics:window.player?.diagnostics,properties:window.player?Object.fromEntries(player.properties):{}})).catch(()=>null);console.error(result.failure);await page.evaluate(()=>setBenchmarkProgress({failed:true})).catch(()=>{});await page.evaluate(()=>window.player?.destroy()).catch(()=>{});process.exitCode=1;}
finally{result.hashesAfter=await hashes();result.runtimeUnchanged=JSON.stringify(result.hashes)===JSON.stringify(result.hashesAfter);if(!result.runtimeUnchanged){result.passed=false;process.exitCode=1;}result.finished=new Date().toISOString();await save();await browser.close();}
