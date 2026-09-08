import {chromium} from 'playwright';
import {writeFile,mkdir} from 'node:fs/promises';
await mkdir('results/m2',{recursive:true});
const browser=await chromium.launch({channel:'chrome',headless:false,ignoreDefaultArgs:['--mute-audio'],args:['--autoplay-policy=no-user-gesture-required','--disable-background-timer-throttling','--disable-renderer-backgrounding']});
const page=await browser.newPage({viewport:{width:1280,height:1100}});const logs=[];
page.on('console',m=>logs.push(m.text()));page.on('pageerror',e=>logs.push(String(e)));
try{
 await page.goto('http://127.0.0.1:4179/web/index.html?no-codecs&measure-output');await page.waitForFunction(()=>typeof createPlayer==='function');
 await fetch('http://127.0.0.1:4180/media/front?id=warm',{headers:{Range:'bytes=0-0'}}).then(r=>r.arrayBuffer());
 await page.evaluate(async()=>{await createPlayer();player.resize(1920,1080);window.signals=[];window.samples=[];player.addEventListener('output',({detail})=>signals.push(detail));window.start=performance.now();await player.openRemote({url:'http://127.0.0.1:4180/media/front?id=qual-smoke'});await player.play();});
 await page.waitForFunction(()=>player.diagnostics?.rendered>10&&player.audioDiagnostics().mediaFrames>12000,{},{timeout:20000});
 const startup=await page.evaluate(()=>({milliseconds:performance.now()-start,video:player.diagnostics,audio:player.audioDiagnostics()}));console.log('startup',JSON.stringify(startup));
 for(let i=0;i<30;i++){await page.waitForTimeout(1000);const sample=await page.evaluate(()=>({at:performance.now(),video:player.diagnostics,audio:player.audioDiagnostics(),properties:Object.fromEntries(player.properties)}));await page.evaluate(s=>samples.push(s),sample);if(i%10===0)console.log('sample',i,sample.video?.rendered,sample.properties['frame-drop-count'],sample.properties['avsync']);}
 const data=await page.evaluate(()=>({signals,samples,errors:playerErrors}));
 const errors=[];for(const flash of data.signals.filter(s=>s.kind==='flash').slice(5)){const clicks=data.signals.filter(s=>s.kind==='click');const click=clicks.reduce((best,c)=>Math.abs(c.wallTime-flash.wallTime)<Math.abs(best.wallTime-flash.wallTime)?c:best,clicks[0]);if(click)errors.push(flash.wallTime-click.wallTime);}
 data.syncErrorsMs=errors;data.startup=startup;data.logs=logs;
 console.log('sync',errors);await writeFile('results/m2/smoke.json',JSON.stringify(data,null,2)+'\n');await page.screenshot({path:'results/m2/smoke.png'});await page.evaluate(()=>player.destroy());
}catch(error){console.error(error);await writeFile('results/m2/smoke-failure.json',JSON.stringify({error:String(error),logs,state:await page.evaluate(()=>({events:window.playerEvents,errors:window.playerErrors,video:window.player?.diagnostics}))},null,2));process.exitCode=1;}
finally{await browser.close();}
