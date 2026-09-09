import {chromium,firefox,webkit} from 'playwright';
import {mkdir,writeFile} from 'node:fs/promises';
import assert from 'node:assert/strict';
import {serve} from './server.mjs';
const out=`results/pipeline-qualification/remux-lifecycle-${new Date().toISOString().replaceAll(':','-')}`;
await mkdir(out,{recursive:true});console.log(out);const server=await serve(),result={scope:'Synthetic stale/current SourceBuffer error events, real seek/reopen, post-destroy rejection',cases:[]};
try{for(const [family,type] of Object.entries({chrome:chromium,firefox,webkit})){
 const browser=await type.launch({headless:true,...(family==='chrome'?{channel:'chrome',args:['--autoplay-policy=no-user-gesture-required']}:{})}),r={family,browserVersion:browser.version()};result.cases.push(r);
 try{const page=await browser.newPage();await page.goto(server.origin+'/experiment/page.html');await page.evaluate(o=>start(o),{variant:'remux',url:server.origin+'/media/movie'});
  r.stale=await page.evaluate(async()=>{const old=player.sb;await player.seek(40);old.dispatchEvent(new Event('error'));await player.play();await new Promise(r=>setTimeout(r,500));return snapshot();});assert.deepEqual(r.stale.errors,[]);assert.equal(r.stale.remux.stats.workers,2);assert.ok(r.stale.position>40.2);
  r.current=await page.evaluate(()=>{player.sb.dispatchEvent(new Event('error'));return snapshot();});assert.equal(r.current.remux.stats.workers,0);assert.deepEqual(r.current.errors,['MSE SourceBuffer error']);
  r.reopened=await page.evaluate(async url=>{await player.open({options:{url}},30);await player.play();await new Promise(r=>setTimeout(r,500));return snapshot();},server.origin+'/media/movie');assert.deepEqual(r.reopened.errors,[]);assert.ok(r.reopened.position>30.2);
  r.afterDestroy=await page.evaluate(async()=>{await stop();const rejected=await player.seek(3).then(()=>false,e=>String(e).includes('destroyed'));return {rejected,state:snapshot()};});assert.equal(r.afterDestroy.rejected,true);await page.waitForTimeout(150);assert.equal(page.workers().length,0);r.passed=true;
 }catch(e){r.error=String(e.stack);process.exitCode=1;}finally{await browser.close();await writeFile(out+'/result.json',JSON.stringify(result,null,2)+'\n');}
}}finally{await server.close();result.passed=result.cases.every(c=>c.passed);await writeFile(out+'/result.json',JSON.stringify(result,null,2)+'\n');console.log(out,result.passed);}
