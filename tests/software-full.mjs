import {chromium} from 'playwright';
import assert from 'node:assert/strict';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import http from 'node:http';
import {spawn} from 'node:child_process';
const out=`results/software-full/functional-${new Date().toISOString().replaceAll(':','-')}`;
await mkdir(out,{recursive:true});console.log(out);
const manifest=JSON.parse(await readFile('build/fixtures/software-full/manifest.json'));
const build=JSON.parse(await readFile('results/software-full/build.json'));
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
const preservedPaths=['web/engine/player.wasm','web/engine-m4/player.wasm','web/engine-retained-subs/player.wasm','web/engine-filter-copyback/player.wasm'];
const hashes=async paths=>Object.fromEntries(await Promise.all(paths.map(async p=>[p,hash(await readFile(p))])));
const inputs=[...Object.keys(build.hashes),'tests/software-full.mjs'];
const result={started:new Date().toISOString(),scope:'Short headless functional tests, not performance or exhaustive format qualification',buildManifestSha256:hash(await readFile('results/software-full/build.json')),hashes:await hashes(inputs),preserved:await hashes(preservedPaths),tests:[],passed:false};
let rangeRequests=0;
const remote=await readFile('build/fixtures/software-full/vp9-opus.webm');
const server=http.createServer((req,res)=>{
 res.setHeader('Access-Control-Allow-Origin','*');res.setHeader('Access-Control-Expose-Headers','Content-Length,Content-Range,Accept-Ranges,ETag');res.setHeader('Cross-Origin-Resource-Policy','cross-origin');res.setHeader('Accept-Ranges','bytes');res.setHeader('ETag','"software-full-vp9"');res.setHeader('Content-Type','video/webm');
 if(req.method==='OPTIONS'){res.setHeader('Access-Control-Allow-Headers','Range,If-Range');res.writeHead(204).end();return;}
 const m=/^bytes=(\d+)-(\d*)$/.exec(req.headers.range||'');let start=0,end=remote.length-1;
 if(m){rangeRequests++;start=Number(m[1]);end=Math.min(end,m[2]?Number(m[2]):end);res.statusCode=206;res.setHeader('Content-Range',`bytes ${start}-${end}/${remote.length}`);}
 res.setHeader('Content-Length',end-start+1);res.end(req.method==='HEAD'?undefined:remote.subarray(start,end+1));
});await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const performanceConfig=process.env.WEBMPV_PERFORMANCE_CONFIG;
let appServer,origin='http://127.0.0.1:4179';
if(performanceConfig){
 appServer=spawn(process.execPath,['experiments/playback-performance/serve.mjs',performanceConfig],{env:{...process.env,PORT:'0',DEFAULT_MOUNT:'candidate'},stdio:['ignore','pipe','inherit']});
 origin=await new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(Error('App server timeout')),10000);appServer.once('error',reject);appServer.stdout.on('data',bytes=>{const match=/http:\/\/127\.0\.0\.1:\d+/.exec(String(bytes));if(match){clearTimeout(timer);resolve(match[0]);}});});
 result.assetSnapshot=await(await fetch(origin+'/__metadata')).json();
}
const browser=await chromium.launch({channel:'chrome',headless:true,ignoreDefaultArgs:['--mute-audio'],args:['--autoplay-policy=no-user-gesture-required']});
result.browser=browser.version();const page=await browser.newPage();const pageErrors=[];
page.on('pageerror',e=>pageErrors.push(String(e)));
await page.addInitScript(()=>{for(const n of ['VideoDecoder','AudioDecoder','VideoFrame','MediaSource'])Object.defineProperty(globalThis,n,{value:undefined,configurable:true});HTMLMediaElement.prototype.play=function(){throw Error('Native playback forbidden in software qualification');};});
const save=()=>writeFile(`${out}/result.json`,JSON.stringify(result,null,2)+'\n');
const only=process.env.ONLY?.split(',');
const total=only?.length||manifest.cases.length+3;
result.selection=only||'full matrix';
async function reset(){await page.evaluate(()=>player?.destroy()).catch(()=>{});await page.goto(origin+'/web/software-full.html?no-codecs');await page.waitForFunction(()=>typeof createPlayer==='function');await page.evaluate(()=>{window.nativeLogs=[];window.fixtureErrors=[];});}
async function create(){await page.evaluate(async()=>{await createPlayer();player.addEventListener('log',({detail})=>nativeLogs.push(detail));});assert.equal(await page.evaluate(()=>player.browserCodecsAbsent),true);}
async function open(file){const bytes=await readFile(file);await page.evaluate(async b=>{await player.open(Uint8Array.from(atob(b),c=>c.charCodeAt(0)).buffer);},bytes.toString('base64'));}
async function pixels(){return page.evaluate(async()=>{const source=document.querySelector('canvas'),snapshot=await createImageBitmap(await(await fetch(source.toDataURL())).blob()),c=document.createElement('canvas');c.width=snapshot.width;c.height=snapshot.height;const ctx=c.getContext('2d');ctx.drawImage(snapshot,0,0);snapshot.close();return Array.from(ctx.getImageData(0,0,c.width,c.height).data);});}
async function png(name){const b=await page.evaluate(()=>document.querySelector('canvas').toDataURL().split(',')[1]);await writeFile(`${out}/${name}.png`,Buffer.from(b,'base64'));}
async function settled(){await page.waitForFunction(()=>player.diagnostics?.rendered>0);await page.waitForTimeout(150);}
async function cleanup(){await page.evaluate(()=>player.destroy());await page.waitForFunction(()=>document.querySelectorAll('iframe').length===0);for(let i=0;i<30&&page.workers().length;i++)await page.waitForTimeout(100);assert.equal(page.workers().length,0);assert.equal(await page.evaluate(()=>player.audioDiagnostics().state),'closed');}
async function check(name,fn){if(only&&!only.includes(name))return;const start=Date.now();await reset();await page.evaluate(({n,total,name})=>{
 const panel=document.createElement('p');panel.id='qualification-progress';document.body.prepend(panel);const started=Date.now();
 const paint=()=>{const elapsed=Math.floor((Date.now()-started)/1000);panel.textContent=`Check ${n}/${total}: ${name}. ${elapsed}s elapsed; roughly ${Math.max(0,(total-n+1)*10-elapsed)}s remaining overall. No foreground hold needed.`;};paint();setInterval(paint,1000);
 }, {n:result.tests.length+1,total,name});try{const evidence=await fn();assert.deepEqual(pageErrors,[]);assert.deepEqual(await page.evaluate(()=>playerErrors),[]);await cleanup();result.tests.push({name,passed:true,milliseconds:Date.now()-start,evidence});console.log('PASS',name);}catch(e){result.tests.push({name,passed:false,error:String(e.stack),state:await page.evaluate(()=>({properties:Object.fromEntries(player.properties),diagnostics:player.diagnostics,audio:player.audioDiagnostics()})).catch(()=>null),logs:await page.evaluate(()=>nativeLogs).catch(()=>[]),events:await page.evaluate(()=>playerEvents).catch(()=>[])});console.error('FAIL',name,String(e));await cleanup().catch(()=>{});}await save();}
try{
 for(const fixture of manifest.cases)await check(fixture.file,async()=>{
  assert.equal(hash(await readFile(`build/fixtures/software-full/${fixture.file}`)),fixture.sha256);
  await create();await open(`build/fixtures/software-full/${fixture.file}`);
  if(fixture.subtitle){await page.evaluate(async()=>{await player.selectTrack('sub','1');await player.seek(0);});}
  if(fixture.video){await settled();const p=await pixels();assert.ok(p.filter((v,i)=>i%4!==3&&v>35).length>10000,'decoded video must contain pixels');}
  const initialRendered=await page.evaluate(()=>player.diagnostics?.rendered||0);
  await page.evaluate(()=>player.play());await page.waitForFunction(()=>player.audioDiagnostics().mediaFrames>24000&&player.audioDiagnostics().rms>.005,{},{timeout:15000});
  if(fixture.video)await page.waitForFunction(n=>player.diagnostics?.rendered>=n+6,initialRendered,{timeout:15000});
  const playing=await page.evaluate(()=>({audio:player.audioDiagnostics(),diagnostics:player.diagnostics,tracks:player.properties.get('track-list'),video:player.properties.get('video-codec'),audioCodec:player.properties.get('audio-codec-name')}));
  assert.equal(playing.diagnostics?.decoder,'software');
  assert.ok(playing.tracks.some(t=>t.type==='audio'&&t.codec===fixture.audio),JSON.stringify(playing.tracks));
  if(fixture.video)assert.ok(playing.tracks.some(t=>t.type==='video'&&t.codec===fixture.video));
  await page.evaluate(()=>player.pause());await page.evaluate(()=>player.seek(.75));await page.waitForTimeout(200);
  const pausedPosition=await page.evaluate(()=>player.properties.get('time-pos'));
  if(fixture.video)assert.ok(Math.abs(pausedPosition-.75)<.15,'video seek reaches requested position');
  else {
   // The unchanged baseline also reports a buffered-audio offset while paused.
   // Record that limitation; qualify seek completion and resumed playback separately.
   const consumed=await page.evaluate(()=>player.audioDiagnostics().mediaFrames);
   await page.evaluate(()=>player.play());await page.waitForTimeout(350);
   const resumed=await page.evaluate(()=>({position:player.properties.get('time-pos'),audio:player.audioDiagnostics()}));
   assert.ok(resumed.position>.8&&resumed.position<1.35,'resumed audio position follows seek target');
   assert.ok(resumed.audio.mediaFrames>consumed+8000&&resumed.audio.rms>.005,'audio resumes after seek');
   playing.seek={target:.75,pausedPosition,pausedOffset:.75-pausedPosition,resumed,limitation:'Paused audio-only time reporting includes an existing buffered-output offset; see audio-seek-diagnostic.json'};
   await page.evaluate(()=>player.pause());
  }
  if(fixture.subtitle){await page.evaluate(async()=>{await player.selectTrack('sub','1');await player.subtitleVisible(false);});await page.waitForTimeout(100);const off=await pixels();await page.evaluate(()=>player.subtitleVisible(true));await page.waitForTimeout(150);const on=await pixels();let changed=0;for(let i=0;i<off.length;i+=4)if(Math.abs(off[i]-on[i])+Math.abs(off[i+1]-on[i+1])+Math.abs(off[i+2]-on[i+2])>30)changed++;assert.ok(changed>100,'subtitle pixels');playing.subtitlePixels=changed;}
  return {sha256:fixture.sha256,playing,afterSeek:await page.evaluate(()=>({position:player.properties.get('time-pos'),diagnostics:player.diagnostics}))};
 });
 await check('software filters transform decoded pixels',async()=>{
  async function frame(filter){
   await create();await page.evaluate(f=>player.command('set','vf',f),filter);
   await open('build/fixtures/software-full/ffv1-flac.mkv');await settled();await page.evaluate(()=>player.seek(.75));
   await page.waitForFunction(()=>Math.abs(player.diagnostics?.presentedPosition-.75)<.05&&!player.diagnostics?.seeking);
   await page.screenshot();return pixels();
  }
  const before=await frame('null');await png('filter-before');
  const flipped=await frame('hflip');await png('filter-flipped');let error=0,change=0,count=0;
  for(let y=8;y<352;y+=7)for(let x=8;x<632;x+=7)for(let c=0;c<3;c++){error+=Math.abs(before[(y*640+639-x)*4+c]-flipped[(y*640+x)*4+c]);change+=Math.abs(before[(y*640+x)*4+c]-flipped[(y*640+x)*4+c]);count++;}
  await writeFile(`${out}/filter-pixels.json`,JSON.stringify({lengths:[before.length,flipped.length],error,change,count,samples:[8,100,200,300,500].map(x=>({x,before:before.slice((100*640+639-x)*4,(100*640+639-x)*4+4),after:flipped.slice((100*640+x)*4,(100*640+x)*4+4)}))},null,2));
  assert.ok(error/count<8,`mirror error ${error/count}`);assert.ok(change/count>15);
  const bright=await frame('eq=brightness=0.2');let delta=0;for(let i=0;i<before.length;i+=4)delta+=bright[i]-before[i];assert.ok(delta/(before.length/4)>15);
  await page.evaluate(async()=>{await player.command('set','vf','');await player.command('set','af','volume=0.5');await player.play();});await page.waitForFunction(()=>player.audioDiagnostics().rms>.005);
  return {mirrorMeanError:error/count,mirrorMeanChange:change/count,brightnessDelta:delta/(before.length/4),audio:await page.evaluate(()=>player.audioDiagnostics())};
 });
 await check('new WebM codecs through bounded HTTP range I/O',async()=>{
  await create();await page.evaluate(url=>player.openRemote({url}),`http://127.0.0.1:${server.address().port}/video.webm`);await settled();await page.evaluate(()=>player.play());await page.waitForFunction(()=>player.audioDiagnostics().mediaFrames>24000);await page.evaluate(()=>player.pause());await page.evaluate(()=>player.seek(1));assert.ok(rangeRequests>0);return {rangeRequests,diagnostics:await page.evaluate(()=>player.diagnostics)};
 });
 await check('existing 1080p H264 AAC ASS fixture',async()=>{
  await create();await open('build/fixtures/tracks.mkv');await settled();await page.evaluate(async()=>{await player.selectTrack('sub','1');await player.seek(5);await player.play();});await page.waitForFunction(()=>player.audioDiagnostics().mediaFrames>24000&&player.audioDiagnostics().rms>.005);return {diagnostics:await page.evaluate(()=>player.diagnostics),tracks:await page.evaluate(()=>player.properties.get('track-list'))};
 });
 result.hashesAfter=await hashes(inputs);result.runtimeUnchanged=JSON.stringify(result.hashes)===JSON.stringify(result.hashesAfter);assert.ok(result.runtimeUnchanged);
 result.preservedAfter=await hashes(preservedPaths);assert.deepEqual(result.preservedAfter,result.preserved);
 result.passed=result.tests.length===total&&result.tests.every(t=>t.passed);if(!result.passed)process.exitCode=1;
}catch(e){result.failure=String(e.stack);console.error(e);process.exitCode=1;}
finally{if(performanceConfig)result.assetSnapshotAfter=await(await fetch(origin+'/__metadata')).json();await page.evaluate(()=>player?.destroy()).catch(()=>{});await browser.close();await new Promise(resolve=>server.close(resolve));appServer?.kill();result.finished=new Date().toISOString();await save();}
