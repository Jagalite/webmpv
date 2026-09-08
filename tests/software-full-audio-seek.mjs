import {chromium} from 'playwright';
import {readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
const browser=await chromium.launch({channel:'chrome',headless:true,ignoreDefaultArgs:['--mute-audio'],args:['--autoplay-policy=no-user-gesture-required']});
const result={scope:'Compare existing and expanded software paused audio seek position; diagnostic, not performance',browser:browser.version(),runs:[]};
try{
 for(const [entry,fixture,engine] of [['index.html','control.wav','engine'],['software-full.html','control.wav','engine-software-full'],['software-full.html','audio.flac','engine-software-full'],['software-full.html','audio.wv','engine-software-full']]){
  const page=await browser.newPage();await page.goto(`http://127.0.0.1:4179/web/${entry}?no-codecs`);await page.waitForFunction(()=>typeof createPlayer==='function');await page.evaluate(()=>createPlayer());
  const bytes=await readFile(`build/fixtures/software-full/${fixture}`);
  await page.evaluate(b=>player.open(Uint8Array.from(atob(b),c=>c.charCodeAt(0)).buffer),bytes.toString('base64'));
  await page.evaluate(()=>player.play());await page.waitForFunction(()=>player.audioDiagnostics().mediaFrames>24000);
  const before=await page.evaluate(()=>({p:Object.fromEntries(player.properties),a:player.audioDiagnostics(),latency:player.audioContext.baseLatency+player.audioContext.outputLatency}));
  await page.evaluate(()=>player.pause());await page.evaluate(()=>player.seek(.75));await page.waitForTimeout(250);
  const paused=await page.evaluate(()=>({p:Object.fromEntries(player.properties),a:player.audioDiagnostics(),d:player.diagnostics,events:playerEvents.filter(e=>e.event==='seek'||e.event==='playback-restart'||e.name==='time-pos').slice(-12)}));
  await page.evaluate(()=>player.play());await page.waitForTimeout(350);
  const resumed=await page.evaluate(()=>({p:Object.fromEntries(player.properties),a:player.audioDiagnostics()}));
  await page.evaluate(()=>player.destroy());await page.close();
  result.runs.push({entry,fixture,fixtureSha256:createHash('sha256').update(bytes).digest('hex'),engineSha256:createHash('sha256').update(await readFile(`web/${engine}/player.wasm`)).digest('hex'),before,paused,resumed});console.log(entry,fixture,paused.p['time-pos'],resumed.p['time-pos']);
 }
}finally{await browser.close();await writeFile('results/software-full/audio-seek-diagnostic.json',JSON.stringify(result,null,2)+'\n');}
