import {chromium} from 'playwright';
import assert from 'node:assert/strict';
import {writeFile} from 'node:fs/promises';
const origin=process.env.RELEASE_URL||'http://127.0.0.1:4182';
const started=Date.now();
const browser=await chromium.launch({channel:'chrome',headless:false,ignoreDefaultArgs:['--mute-audio'],args:['--autoplay-policy=no-user-gesture-required']});
const result={started:new Date(started).toISOString(),browser:browser.version(),browserLaunchMs:Date.now()-started,origin,passed:false};
const page=await browser.newPage({viewport:{width:1100,height:1000}}),errors=[];
page.on('pageerror',e=>errors.push(String(e)));
await page.addInitScript(()=>{for(const n of ['VideoDecoder','AudioDecoder','VideoFrame','MediaSource'])Object.defineProperty(globalThis,n,{value:undefined,configurable:true});HTMLMediaElement.prototype.play=()=>{throw Error('Native media forbidden');};});
try{
 await page.goto(origin+'/?no-codecs');await page.waitForFunction(()=>typeof createPlayer==='function');
 result.readyMs=await page.evaluate(async()=>{const start=performance.now();await createPlayer();return performance.now()-start;});
 await page.evaluate(async()=>{window.mediaStart=performance.now();await player.open(await(await fetch('/fixtures/m0.mkv')).arrayBuffer());await player.play();});
 await page.waitForFunction(()=>player.diagnostics?.rendered>3&&player.audioDiagnostics().mediaFrames>128&&player.audioDiagnostics().rms>.005);
 result.firstOutput=await page.evaluate(()=>({milliseconds:performance.now()-mediaStart,video:player.diagnostics,audio:player.audioDiagnostics(),browserCodecsAbsent:player.browserCodecsAbsent}));
 assert.equal(result.firstOutput.browserCodecsAbsent,true);
 await page.evaluate(async()=>{await player.pause();await player.seek(3);});await page.waitForFunction(()=>!player.diagnostics?.seeking&&Math.abs(player.diagnostics?.presentedPosition-3)<.2);
 await page.evaluate(()=>player.destroy());for(let i=0;i<30&&page.workers().length;i++)await page.waitForTimeout(100);assert.equal(page.workers().length,0);
 await page.goto(origin+'/web/example.html');await page.click('#demo');await page.waitForFunction(()=>document.querySelector('[role=status]').textContent==='Playing example film.');await page.click('#close');await page.waitForFunction(()=>document.querySelector('[role=status]').textContent==='Closed.');
 assert.deepEqual(errors,[]);result.passed=true;console.log('PASS extracted release and cold browser-profile startup');
}catch(error){result.failure=String(error.stack);console.error(result.failure);process.exitCode=1;}
finally{result.errors=errors;result.finished=new Date().toISOString();await writeFile('results/release-smoke.json',JSON.stringify(result,null,2)+'\n');await browser.close();}
