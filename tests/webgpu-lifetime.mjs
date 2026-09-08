// Force collection between paused redraws to expose weak external-texture ownership.
import {chromium} from 'playwright';
import {spawn} from 'node:child_process';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import assert from 'node:assert/strict';
const out=`results/playback-performance/gpu-lifetime-${new Date().toISOString().replaceAll(':','-')}`;await mkdir(out,{recursive:true});console.log(out);
const fixed=JSON.parse(await readFile('build/playback-performance/api-strict-gpu.json')).candidate;
const source=await readFile(fixed['web/filter-retained-engine-worker.js'],'utf8');assert.equal(source.split('this.videoTexture=texture;').length,2);
await writeFile(out+'/weak-worker.js',source.replace('this.videoTexture=texture;',''));
await writeFile(out+'/config.json',JSON.stringify({fixed,weak:{...fixed,'web/filter-retained-engine-worker.js':out+'/weak-worker.js'}}));
const server=spawn(process.execPath,['experiments/playback-performance/serve.mjs',out+'/config.json'],{env:{...process.env,PORT:'0'},stdio:['ignore','pipe','inherit']});let browser,origin;const result={tests:[]};
try{
 origin=await new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(Error('Server timeout')),10000);server.once('error',reject);server.stdout.on('data',bytes=>{const match=/http:\/\/127\.0\.0\.1:\d+/.exec(String(bytes));if(match){clearTimeout(timer);resolve(match[0]);}});});
 browser=await chromium.launch({channel:'chrome',headless:true,args:['--autoplay-policy=no-user-gesture-required']});result.browser=browser.version();
 const cdp=await browser.newBrowserCDPSession();let serial=0;const pending=new Map();
 cdp.on('Target.receivedMessageFromTarget',({sessionId,message})=>{const data=JSON.parse(message),key=`${sessionId}:${data.id}`,record=pending.get(key);if(record){clearTimeout(record.timer);pending.delete(key);data.error?record.reject(Error(JSON.stringify(data.error))):record.resolve(data.result);}});
 async function send(sessionId,method,params={}){const id=++serial,key=`${sessionId}:${id}`;const response=new Promise((resolve,reject)=>{const timer=setTimeout(()=>{pending.delete(key);reject(Error(`Timeout ${method}`));},10000);pending.set(key,{resolve,reject,timer});});await cdp.send('Target.sendMessageToTarget',{sessionId,message:JSON.stringify({id,method,params})});return response;}
 for(const name of ['weak','fixed','weak','fixed']){
  const page=await browser.newPage(),record={name,rounds:0};result.tests.push(record);let sessionId;
  try{
   await page.goto(`${origin}/${name}/web/hybrid-performance.html`);await page.setInputFiles('#file','build/hybrid-performance/sample.mp4');await page.evaluate(()=>start('hybrid'));await page.evaluate(()=>player.pause());await page.waitForTimeout(300);
   const target=(await cdp.send('Target.getTargets')).targetInfos.find(target=>target.type==='worker'&&target.url.includes(`/${name}/web/filter-retained-engine-worker.js`));assert.ok(target);
   ({sessionId}=await cdp.send('Target.attachToTarget',{targetId:target.targetId,flatten:false}));await send(sessionId,'HeapProfiler.enable');
   for(let n=0;n<8;n++){
    await send(sessionId,'HeapProfiler.collectGarbage');await page.evaluate(n=>player.resize(n%2?1920:960,n%2?1080:540),n);await page.waitForTimeout(250);record.rounds++;
    record.state=await page.evaluate(()=>snapshot());if(record.state.errors.length)break;
   }
  }catch(error){record.error=String(error);record.state=await page.evaluate(()=>snapshot()).catch(()=>null);}
  finally{if(sessionId)await cdp.send('Target.detachFromTarget',{sessionId}).catch(()=>{});await page.evaluate(()=>player?.destroy()).catch(()=>{});for(let i=0;i<40&&page.workers().length;i++)await page.waitForTimeout(100);record.workersAfter=page.workers().length;await page.close();}
  const errors=[record.error,...(record.state?.errors||[])].filter(Boolean).join('\n');
  record.expectedOutcome=name==='weak'?'Destroyed texture error':'Eight clean garbage-collection/redraw cycles';
  record.passed=name==='weak'?errors.includes('Destroyed texture'):record.rounds===8&&!errors&&record.workersAfter===0;
  console.log(name,record.passed,record.rounds,errors.slice(0,250));
 }
 assert.ok(result.tests.every(test=>test.passed));result.passed=true;
}catch(error){result.error=String(error.stack);process.exitCode=1;console.error(error);}
finally{if(origin)result.assets=await fetch(origin+'/__metadata').then(response=>response.json()).catch(()=>null);await browser?.close();server.kill();await writeFile(out+'/result.json',JSON.stringify(result,null,2)+'\n');}
