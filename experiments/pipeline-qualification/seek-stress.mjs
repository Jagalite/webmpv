import {chromium} from 'playwright';
import {mkdir,writeFile} from 'node:fs/promises';
import assert from 'node:assert/strict';
import {serve} from './server.mjs';
const out=`results/pipeline-qualification/seek-stress-${new Date().toISOString().replaceAll(':','-')}`;
await mkdir(out,{recursive:true});console.log(out);
const server=await serve(),result={cases:[]};
try {
 for(const filters of ['format=yuv444p','hflip,eq=brightness=0.1','']) {
  const browser=await chromium.launch({channel:'chrome',headless:true,args:['--autoplay-policy=no-user-gesture-required']});
  const r={filters,browserVersion:browser.version(),seeks:[]};result.cases.push(r);
  const page=await browser.newPage();page.setDefaultTimeout(30000);
  try {
   await page.goto(server.origin+'/experiment/page.html');
   await page.evaluate(o=>start(o),{variant:'yuv',url:server.origin+'/media/movie?delay=15',filters});
   await page.evaluate(()=>player.pause());
   for(const target of [3,400,1,237,500,30,2,480,7,236,1,350,5,400,2,238,8,510,3,450]) {
    const begun=Date.now();await page.evaluate(t=>player.seek(t),target);
    await page.waitForFunction(t=>Math.abs(snapshot().diagnostics.yuv.lastPts-t)<.15,target);
    const state=await page.evaluate(()=>snapshot());assert.deepEqual(state.errors,[]);
    r.seeks.push({target,ms:Date.now()-begun,state});
   }
   await page.evaluate(()=>stop());await page.waitForTimeout(200);r.workersAfter=page.workers().length;
   assert.equal(r.workersAfter,0);r.passed=true;
  }catch(e){r.error=String(e.stack);r.failureState=await page.evaluate(()=>snapshot()).catch(()=>null);process.exitCode=1;}
  finally{await browser.close();await writeFile(out+'/result.json',JSON.stringify(result,null,2)+'\n');}
 }
}finally{await server.close();result.passed=result.cases.every(c=>c.passed);await writeFile(out+'/result.json',JSON.stringify(result,null,2)+'\n');console.log(out,result.passed);}
