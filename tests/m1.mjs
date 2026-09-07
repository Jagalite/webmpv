import {chromium} from 'playwright';
import assert from 'node:assert/strict';
import {writeFile,mkdir,readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
const output=process.env.RESULT_DIR||'results/m1';
await mkdir(output,{recursive:true});
await mkdir('build/private-results',{recursive:true});
const browser=await chromium.launch({channel:'chrome',headless:process.env.HEADED!=='1',ignoreDefaultArgs:['--mute-audio'],args:['--autoplay-policy=no-user-gesture-required']});
const page=await browser.newPage({viewport:{width:1100,height:900}}),logs=[];
page.on('console',m=>logs.push(`${m.type()}: ${m.text()}`));page.on('pageerror',e=>logs.push(String(e)));
await page.addInitScript(()=>{for(const name of ['VideoDecoder','AudioDecoder','VideoFrame','MediaSource'])Object.defineProperty(globalThis,name,{value:undefined,configurable:true});HTMLMediaElement.prototype.play=function(){throw Error('Native media is forbidden');};});
const report={browser:browser.version(),headless:process.env.HEADED!=='1',started:new Date().toISOString(),passed:false,tests:[]};
async function check(name,fn){const start=Date.now(),evidence=await fn();report.tests.push({name,evidence,milliseconds:Date.now()-start});console.log('PASS',name);}
try{
 await page.goto('http://127.0.0.1:4179/?no-codecs');await page.waitForFunction(()=>typeof createPlayer==='function');
 await check('remote fixture startup',async()=>{await page.evaluate(async()=>{const p=await createPlayer();await p.openRemote({url:'http://127.0.0.1:4180/media/m0?id=browser-small'});await p.selectTrack('sub','1');await p.play();});await page.waitForFunction(()=>player.diagnostics?.rendered>10&&player.audioDiagnostics().mediaFrames>12000);return page.evaluate(()=>({video:player.diagnostics,audio:player.audioDiagnostics(),errors:playerErrors}));});
 await check('remote exact seek',async()=>{await page.evaluate(()=>player.seek(8));await page.waitForFunction(()=>!player.diagnostics?.seeking&&player.diagnostics?.presentedPosition>8);return page.evaluate(()=>player.diagnostics);});
 await page.evaluate(()=>player.destroy());
 await check('user MKV streams with audio and ASS',async()=>{
   const start=Date.now();await page.evaluate(async()=>{const p=await createPlayer();await p.openRemote({url:'http://127.0.0.1:4180/media/user?id=browser-user'});await p.selectTrack('sub','1');await p.play();});
   await page.waitForFunction(()=>player.diagnostics?.rendered>10&&player.audioDiagnostics().mediaFrames>16000,{},{timeout:60000});
   await page.screenshot({path:'build/private-results/user-startup.png'});return {startupMs:Date.now()-start,...await page.evaluate(()=>({video:player.diagnostics,audio:player.audioDiagnostics(),tracks:player.properties.get('track-list'),errors:playerErrors}))};
 });
 await check('user embedded ASS produces visible pixels and restores while paused',async()=>{
   await page.evaluate(async()=>{await player.pause();await player.seek(6);});await page.waitForFunction(()=>!player.diagnostics?.seeking&&Math.abs(player.diagnostics?.presentedPosition-6)<.2);
   const evidence=await page.evaluate(async()=>{const snap=()=>{const source=document.querySelector('canvas'),c=document.createElement('canvas');c.width=source.width;c.height=source.height;const x=c.getContext('2d');x.drawImage(source,0,0);return x.getImageData(0,0,c.width,c.height).data;};const a=snap();await player.subtitleVisible(false);await new Promise(r=>setTimeout(r,250));const b=snap();await player.subtitleVisible(true);await new Promise(r=>setTimeout(r,250));const c=snap();let changed=0,restoredMismatch=0;for(let i=0;i<a.length;i+=4){if(a[i]!==b[i]||a[i+1]!==b[i+1]||a[i+2]!==b[i+2])changed++;if(a[i]!==c[i]||a[i+1]!==c[i+1]||a[i+2]!==c[i+2])restoredMismatch++;}return {changed,restoredMismatch};});assert.ok(evidence.changed>200);assert.equal(evidence.restoredMismatch,0);await page.evaluate(()=>player.play());return evidence;
 });
 await check('user MKV distant seek',async()=>{await page.evaluate(()=>player.seek(1440));await page.waitForFunction(()=>!player.diagnostics?.seeking&&Math.abs(player.diagnostics?.presentedPosition-1440)<2,{},{timeout:30000});return page.evaluate(()=>({video:player.diagnostics,audio:player.audioDiagnostics()}));});
 await check('seek supersedes a stalled actual demux read',async()=>{
   await fetch('http://127.0.0.1:4180/control?id=browser-user',{method:'POST',body:JSON.stringify({stall:true})});
   await page.evaluate(()=>player.seek(800));await page.waitForFunction(()=>player.diagnostics?.ioPending===true,{},{timeout:5000});
   await page.evaluate(()=>player.seek(60));await page.waitForFunction(()=>player.diagnostics?.interruptions>0,{},{timeout:5000});
   await fetch('http://127.0.0.1:4180/control?id=browser-user',{method:'POST',body:JSON.stringify({stall:false})});
   await page.waitForFunction(()=>!player.diagnostics?.seeking&&Math.abs(player.diagnostics?.presentedPosition-60)<3,{},{timeout:30000});return page.evaluate(()=>({video:player.diagnostics,audio:player.audioDiagnostics()}));
 });
 await page.evaluate(()=>player.destroy());for(let i=0;i<30&&page.workers().length;i++)await page.waitForTimeout(100);assert.equal(page.workers().length,0);report.passed=true;
}catch(error){report.failure=String(error.stack||error);report.state=await page.evaluate(()=>({events:window.playerEvents,diagnostics:window.player?.diagnostics,errors:window.playerErrors}));console.error(report.failure);await page.screenshot({path:'build/private-results/m1-failure.png'});process.exitCode=1;}
finally{report.logs=logs;report.finished=new Date().toISOString();report.wasmSha256=createHash('sha256').update(await readFile('web/engine/player.wasm')).digest('hex');await writeFile(`${output}/browser.json`,JSON.stringify(report,null,2)+'\n');await browser.close();}
