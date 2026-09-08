import {chromium} from 'playwright';
import {spawn} from 'node:child_process';
import {mkdir,writeFile} from 'node:fs/promises';
import assert from 'node:assert/strict';
const out=`results/player-api/demo-${new Date().toISOString().replaceAll(':','-')}`;await mkdir(out,{recursive:true});console.log(out);
const server=spawn(process.execPath,['scripts/serve.mjs'],{env:{...process.env,PORT:'0'},stdio:['ignore','pipe','inherit']});
let browser;const result={passed:false,started:new Date().toISOString(),scope:'Headless main-demo controls'};
try {
 const origin=await new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(Error('Server timeout')),10000);server.once('error',e=>{clearTimeout(timer);reject(e);});server.stdout.on('data',b=>{const m=/http:\/\/127\.0\.0\.1:\d+/.exec(String(b));if(m){clearTimeout(timer);resolve(m[0]);}});});
 browser=await chromium.launch({channel:'chrome',headless:true,args:['--autoplay-policy=no-user-gesture-required']});const page=await browser.newPage({viewport:{width:1100,height:1000}});const errors=[];page.on('pageerror',e=>errors.push(String(e)));
 await page.goto(origin);await page.waitForFunction(()=>window.player);
 assert.deepEqual(await page.locator('#mode option').evaluateAll(o=>o.map(x=>x.value)),['native','hybrid','software']);assert.equal(await page.locator('#vf').isDisabled(),true);
 await page.click('#demo');await page.waitForFunction(()=>player.properties.get('time-pos')>.3);assert.equal(await page.evaluate(()=>player.mode),'native');await page.click('#pause');
 await page.selectOption('#mode','hybrid');await page.waitForFunction(()=>player.mode==='hybrid'&&!player.diagnostics.switching);assert.equal(await page.locator('#text-track').isDisabled(),true);
 await page.selectOption('#mode','software');await page.waitForFunction(()=>player.mode==='software'&&!player.diagnostics.switching);assert.equal(await page.locator('#vf').isDisabled(),false);
 await page.fill('#vf','hflip');await page.fill('#af','volume=0.5');await page.click('#apply-filters');await page.waitForFunction(()=>player.diagnostics.videoFilters==='hflip'&&player.diagnostics.audioFilters==='volume=0.5'&&!player.diagnostics.switching);
 await page.screenshot({path:`${out}/software.png`,fullPage:true});result.filtered=await page.evaluate(()=>player.diagnostics);
 await page.selectOption('#mode','native');await page.waitForFunction(()=>document.querySelector('#status').textContent.includes('Clear filters'));assert.equal(await page.inputValue('#mode'),'software');
 await page.click('#clear-filters');await page.waitForFunction(()=>!player.diagnostics.videoFilters&&!player.diagnostics.audioFilters&&!player.diagnostics.switching);
 await page.selectOption('#mode','native');await page.waitForFunction(()=>player.mode==='native'&&!player.diagnostics.switching);
 await page.locator('#volume').fill('35');await page.selectOption('#speed','1.5');await page.click('#close');await page.waitForFunction(()=>document.querySelector('#status').textContent==='Closed.');assert.equal(await page.locator('#surface canvas,#surface video,iframe').count(),0);assert.equal(await page.inputValue('#volume'),'100');assert.equal(await page.inputValue('#speed'),'1');assert.equal(await page.inputValue('#timeline'),'0');assert.deepEqual(errors,[]);assert.deepEqual(await page.evaluate(()=>playerErrors),[]);result.passed=true;
} catch(e){result.failure=String(e.stack);console.error(e);process.exitCode=1;}
finally{await browser?.close();server.kill('SIGTERM');result.finished=new Date().toISOString();await writeFile(`${out}/result.json`,JSON.stringify(result,null,2)+'\n');}
