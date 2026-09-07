import {chromium} from 'playwright';
import assert from 'node:assert/strict';
import {mkdir,writeFile,readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
const output=`results/m4/cancel-${new Date().toISOString().replaceAll(':','-')}`;await mkdir(output,{recursive:true});
const browser=await chromium.launch({channel:'chrome',headless:false,args:['--autoplay-policy=no-user-gesture-required']});
const page=await browser.newPage(),result={passed:false};
try{
 await page.goto('http://127.0.0.1:4179/?decoder=webcodecs');await page.evaluate(()=>createPlayer());
 const service=page.workers().find(w=>w.url().endsWith('/browser-decoder-worker.js'));assert.ok(service);
 // Hold a genuine copy operation in the browser service without adding a
 // production test hook. Destruction must preempt it and close the frame.
 await service.evaluate(()=>{const original=VideoFrame.prototype.copyTo;VideoFrame.prototype.copyTo=async function(...args){globalThis.copyPending=true;await new Promise(resolve=>setTimeout(resolve,3000));return original.apply(this,args);};});
 await page.evaluate(async()=>{await player.open(await(await fetch('/fixtures/m0.mkv')).arrayBuffer());await player.play();});
 const deadline=Date.now()+10000;while(!await service.evaluate(()=>!!globalThis.copyPending)){assert.ok(Date.now()<deadline);await page.waitForTimeout(20);}
 const started=Date.now();await page.evaluate(()=>player.destroy());result.destroyMs=Date.now()-started;assert.ok(result.destroyMs<2000);
 for(let i=0;i<50&&page.workers().length;i++)await page.waitForTimeout(100);
 result.workers=page.workers().map(w=>w.url());assert.deepEqual(result.workers,[]);
 result.stats=await page.evaluate(()=>player.diagnostics?.decoderStats);
 if(result.stats){assert.equal(result.stats.active,false);assert.equal(result.stats.closedFrames,result.stats.receivedFrames);}
 result.passed=true;
}catch(error){result.failure=String(error.stack||error);console.error(result.failure);process.exitCode=1;}
finally{
 for(const f of ['web/engine-m4/player.wasm','web/browser-decoder-worker.js','web/engine-worker.js','web/generated/player.js']) (result.hashes??={})[f]=createHash('sha256').update(await readFile(f)).digest('hex');
 await writeFile(`${output}/result.json`,JSON.stringify(result,null,2)+'\n');await browser.close();console.log(output);
}
