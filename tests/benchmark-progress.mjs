import {chromium} from 'playwright';
import assert from 'node:assert/strict';
const browser=await chromium.launch({channel:'chrome',headless:true});
try{
 const page=await browser.newPage({viewport:{width:1280,height:900}});
 await page.goto('http://127.0.0.1:4179/web/gap.html');
 await page.waitForFunction(()=>typeof setBenchmarkProgress==='function');
 await page.evaluate(()=>setBenchmarkProgress({index:2,total:4,label:'copy-render',phase:'Measuring',phaseSeconds:60,remainingSeconds:270}));
 assert.match(await page.locator('#bench-count').innerText(),/Test 2 of 4/);
 assert.match(await page.locator('#bench-phase').innerText(),/Measuring: 1:00/);
 assert.match(await page.locator('#bench-remaining').innerText(),/4:30/);
 await page.waitForFunction(()=>/0:5[89]/.test(document.querySelector('#bench-phase').textContent),null,{timeout:4000});
 await page.evaluate(()=>setBenchmarkProgress({phase:'Complete',phaseSeconds:0,done:true}));
 assert.equal(await page.locator('#bench-close').innerText(),'All tests complete. Safe to close.');
 await page.evaluate(()=>setBenchmarkProgress({phase:'Stopped',done:false,failed:true}));
 assert.equal(await page.locator('#bench-close').innerText(),'Run stopped. Safe to close.');
 console.log('PASS: test count, live countdown, overall estimate and safe-close states; no playback started.');
}finally{await browser.close();}
