// Strict retained-mode failures must not silently decode/replay software frames.
import {chromium} from 'playwright';
import {spawn} from 'node:child_process';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import assert from 'node:assert/strict';
const out=`results/playback-performance/strict-runtime-${new Date().toISOString().replaceAll(':','-')}`;await mkdir(out,{recursive:true});console.log(out);
const base=process.env.WEBMPV_PERFORMANCE_CONFIG?JSON.parse(await readFile(process.env.WEBMPV_PERFORMANCE_CONFIG)).candidate:Object.fromEntries(Object.keys(JSON.parse(await readFile('build/playback-performance/baseline/manifest.json'))).map(path=>[path,path]));
const source=await readFile(base['web/filter-retained-engine-worker.js'],'utf8');assert.equal(source.split('faultAfter:data.decoderFaultAfter').length,2);
await writeFile(out+'/fault-worker.js',source.replace('faultAfter:data.decoderFaultAfter','faultAfter:48'));
await writeFile(out+'/config.json',JSON.stringify({candidate:base,fault:{...base,'web/filter-retained-engine-worker.js':out+'/fault-worker.js'}}));
const server=spawn(process.execPath,['experiments/playback-performance/serve.mjs',out+'/config.json'],{env:{...process.env,PORT:'0'},stdio:['ignore','pipe','inherit']});let browser,page,origin;const result={tests:[]};
try{
 origin=await new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(Error('Server timeout')),10000);server.once('error',reject);server.stdout.on('data',bytes=>{const match=/http:\/\/127\.0\.0\.1:\d+/.exec(String(bytes));if(match){clearTimeout(timer);resolve(match[0]);}});});
 browser=await chromium.launch({channel:'chrome',headless:true,args:['--autoplay-policy=no-user-gesture-required']});page=await browser.newPage();result.browser=browser.version();
 async function open(mount,input){await page.goto(`${origin}/${mount}/web/hybrid-performance.html`);await page.setInputFiles('#file',input);await page.evaluate(async()=>{window.logs=[];window.events=[];await start('hybrid');player.addEventListener('log',event=>logs.push(event.detail));player.addEventListener('mpv',event=>events.push(event.detail));});}
 async function state(){return page.evaluate(()=>({state:snapshot(),logs:logs.slice(-30),events:events.slice(-40)}));}
 async function cleanup(){const closed=await page.evaluate(async()=>{await player.destroy();return player.diagnostics;});for(let n=0;n<40&&page.workers().length;n++)await page.waitForTimeout(100);assert.equal(page.workers().length,0);return closed;}
 await open('candidate','build/fixtures/playback-performance/bbb-240.mp4');
 await page.waitForFunction(()=>player.properties.get('time-pos')>15||errors.length,null,{timeout:35000});const longGop=await state();assert.deepEqual(longGop.state.errors,[]);assert.equal(longGop.state.diagnostics.backend.decoder,'webcodecs');assert.ok(longGop.state.diagnostics.backend.decoderStats.submitted>400);result.tests.push({name:'long GOP and negative preroll exceed the old 256-packet replay bound',passed:true,...longGop,cleanup:await cleanup()});
 await open('fault','build/hybrid-performance/sample.mp4');await page.waitForTimeout(7000);const fault=await state();result.tests.push({name:'injected retained decoder failure is public and recoverable',...fault});
 assert.ok(fault.state.errors.length>0,'A terminal decoder failure must reach the public error event');
 await page.evaluate(()=>player.setMode('software'));await page.evaluate(()=>player.play());await page.waitForFunction(()=>player.audioDiagnostics().mediaFrames>12000,null,{timeout:6000});result.tests.at(-1).recovered=await state();result.tests.at(-1).cleanup=await cleanup();result.tests.at(-1).passed=true;
 result.passed=true;
}catch(error){result.error=String(error.stack);result.last=await page?.evaluate(()=>({state:snapshot(),logs:window.logs,events:window.events})).catch(()=>null);console.error(error);process.exitCode=1;}
finally{if(origin)result.assets=await fetch(origin+'/__metadata').then(response=>response.json()).catch(()=>null);await browser?.close();server.kill();await writeFile(out+'/result.json',JSON.stringify(result,null,2)+'\n');}
