import {chromium} from 'playwright';
import assert from 'node:assert/strict';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {spawn} from 'node:child_process';
import {createHash} from 'node:crypto';
const out=`results/playback-performance/hints-runtime-${new Date().toISOString().replaceAll(':','-')}`;
await mkdir(out,{recursive:true});console.log(out);
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
const manifest=JSON.parse(await readFile('build/playback-performance/baseline/manifest.json','utf8'));
const base=Object.fromEntries(Object.keys(manifest).map(asset=>[asset,asset]));
const hinted={...base,...JSON.parse(await readFile('build/playback-performance/decoder-hints/overrides.json','utf8'))};
const legacy={...hinted,'web/retained-decoder-worker.js':'build/playback-performance/baseline/web/retained-decoder-worker.js'};
const reverse={...base,'web/retained-decoder-worker.js':hinted['web/retained-decoder-worker.js']};
const worker=await readFile(hinted['web/retained-decoder-worker.js'],'utf8');
assert.equal(worker.split('stats.receivedFrames++;').length,2);
await writeFile(out+'/stalled-decoder.js',worker.replace('stats.receivedFrames++;','stats.receivedFrames++;if(stats.receivedFrames>48){closeFrame(frame);return;}'));
const config={hinted,legacy,reverse,stalled:{...hinted,'web/retained-decoder-worker.js':out+'/stalled-decoder.js'}};
await writeFile(out+'/server-config.json',JSON.stringify(config,null,2)+'\n');
const paths=new Set(['tests/hybrid-hints-runtime.mjs','experiments/playback-performance/serve.mjs','build/hybrid-performance/sample.mp4',...Object.values(config).flatMap(files=>Object.values(files))]);
const hashes=async()=>Object.fromEntries(await Promise.all([...paths].map(async path=>[path,hash(await readFile(path))])));
const result={scope:'Headless native/worker ABI compatibility and injected stalled-output recovery; no performance claims',started:new Date().toISOString(),hashes:await hashes(),tests:[]};
let server,browser,page;
try{
 server=spawn(process.execPath,['experiments/playback-performance/serve.mjs',out+'/server-config.json'],{env:{...process.env,PORT:'0'},stdio:['ignore','pipe','inherit']});
 const origin=await new Promise((resolve,reject)=>{const timeout=setTimeout(()=>reject(Error('Server timeout')),10000);server.once('error',reject);server.stdout.on('data',bytes=>{const match=/http:\/\/127\.0\.0\.1:\d+/.exec(String(bytes));if(match){clearTimeout(timeout);resolve(match[0]);}});});
 result.snapshot=await(await fetch(origin+'/__metadata')).json();
 browser=await chromium.launch({channel:'chrome',headless:true,ignoreDefaultArgs:['--mute-audio'],args:['--autoplay-policy=no-user-gesture-required']});result.browser=browser.version();
 page=await browser.newPage();const pageErrors=[];page.on('pageerror',error=>pageErrors.push(String(error)));
 async function start(name){
  await page.goto(`${origin}/${name}/web/hybrid-performance.html`);
  await page.setInputFiles('#file','build/hybrid-performance/sample.mp4');
  await page.evaluate(()=>start('hybrid'));await page.waitForFunction(()=>player.diagnostics.backend?.presentation?.drawn>20,null,{timeout:10000});
 }
 async function cleanup(){
  const diagnostics=await page.evaluate(async()=>{await player.destroy();return player.diagnostics;});
  for(let i=0;i<40&&page.workers().length;i++)await page.waitForTimeout(100);
  assert.equal(page.workers().length,0);assert.equal(await page.locator('iframe').count(),0);
  return diagnostics;
 }
 for(const name of ['hinted','legacy','reverse']){
  await start(name);await page.evaluate(()=>player.pause());
  await page.waitForTimeout(4200);assert.deepEqual(await page.evaluate(()=>errors),[]);
  const paused=await page.evaluate(()=>snapshot());
  await page.evaluate(()=>player.seek(5));await page.evaluate(()=>player.play());
  await page.waitForFunction(()=>player.properties.get('time-pos')>5.5,null,{timeout:5000});
  const playing=await page.evaluate(()=>snapshot());
  assert.equal(playing.diagnostics.backend.decoder,'webcodecs');assert.deepEqual(playing.errors,[]);
  result.tests.push({name,passed:true,paused,playing,cleanup:await cleanup()});console.log('PASS',name);
 }
 await start('stalled');const started=performance.now();
 await page.waitForFunction(()=>errors.some(message=>message.includes('Hybrid decoder stopped')),null,{timeout:12000});
 const failed=await page.evaluate(()=>snapshot());assert.equal(failed.mode,'hybrid');
 const detectionMilliseconds=performance.now()-started;assert.ok(detectionMilliseconds<9000);
 await page.evaluate(()=>player.setMode('software'));await page.evaluate(()=>player.play());
 const before=await page.evaluate(()=>player.audioDiagnostics().mediaFrames);
 await page.waitForFunction(frames=>player.audioDiagnostics().mediaFrames>frames+16000,before,{timeout:5000});
 const recovered=await page.evaluate(()=>snapshot());assert.equal(recovered.mode,'software');assert.equal(recovered.diagnostics.backend.decoder,'software');
 result.tests.push({name:'stalled decoder wakes native fallback and supports explicit Software recovery',passed:true,detectionMilliseconds,failed,recovered,cleanup:await cleanup()});console.log('PASS stalled-output recovery');
 assert.deepEqual(pageErrors,[]);
 result.snapshotAfter=await(await fetch(origin+'/__metadata')).json();
 for(const name of Object.keys(config))for(const asset of ['web/retained-decoder-worker.js','web/engine-retained-subs/player.mjs','web/engine-retained-subs/player.wasm']){
  assert.ok(result.snapshotAfter[name][asset].hits>0,`${name} ${asset} was served`);
  assert.equal(result.snapshotAfter[name][asset].sha256,result.hashes[config[name][asset]]);
 }
 result.hashesAfter=await hashes();assert.deepEqual(result.hashesAfter,result.hashes);result.passed=true;
}catch(error){result.error=String(error.stack);result.state=await page?.evaluate(()=>snapshot()).catch(()=>null);console.error(error);process.exitCode=1;}
finally{await page?.evaluate(()=>window.player?.destroy()).catch(()=>{});await browser?.close();server?.kill();result.finished=new Date().toISOString();await writeFile(out+'/result.json',JSON.stringify(result,null,2)+'\n');}
