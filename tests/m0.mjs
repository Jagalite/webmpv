import {chromium} from 'playwright';
import assert from 'node:assert/strict';
import {mkdir,writeFile,readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import os from 'node:os';
const output=process.env.RESULT_DIR||'results/m2/m0-regression';
await mkdir(output,{recursive:true});
const browser=await chromium.launch({channel:'chrome',headless:process.env.HEADED!=='1',ignoreDefaultArgs:['--mute-audio'],args:['--autoplay-policy=no-user-gesture-required']});
const page=await browser.newPage({viewport:{width:1000,height:900}});
const errors=[],logs=[];
page.on('pageerror',e=>errors.push(String(e)));
page.on('console',m=>{logs.push(`${m.type()}: ${m.text()}`);if(m.type()==='error')console.error(m.text());});
await page.addInitScript(()=>{
  for(const name of ['VideoDecoder','AudioDecoder','VideoFrame','MediaSource']) Object.defineProperty(globalThis,name,{value:undefined,configurable:true});
  HTMLMediaElement.prototype.play=function(){throw new Error('Native media playback is forbidden in M0 acceptance');};
});
const result={schema:1,started:new Date().toISOString(),browser:browser.version(),headless:process.env.HEADED!=='1',host:{platform:os.platform(),release:os.release(),arch:os.arch(),cpu:os.cpus()[0]?.model},tests:[],passed:false};
async function check(name,fn){const start=Date.now();const evidence=await fn();result.tests.push({name,passed:true,milliseconds:Date.now()-start,evidence});console.log(`PASS ${name}`);}
async function wait(expression,timeout=15000){await page.waitForFunction(expression,{},{timeout});}
async function pixels(){return page.evaluate(()=>{const src=document.querySelector('canvas'), c=document.createElement('canvas');c.width=src.width;c.height=src.height;const ctx=c.getContext('2d');ctx.drawImage(src,0,0);const bytes=ctx.getImageData(0,0,c.width,c.height).data;const previous=window.lastPixelSample;let changedBottom=0;let nonblack=0,yellow=0,hash=2166136261;for(let i=0;i<bytes.length;i+=4){if(bytes[i]+bytes[i+1]+bytes[i+2]>40)nonblack++;if(i/4>c.width*(c.height-75)&&bytes[i]>170&&bytes[i+1]>170&&bytes[i+2]<100)yellow++;if(previous?.length===bytes.length&&i/4>c.width*(c.height-75)&&(bytes[i]!==previous[i]||bytes[i+1]!==previous[i+1]||bytes[i+2]!==previous[i+2]))changedBottom++;hash=Math.imul(hash^bytes[i],16777619);}window.lastPixelSample=bytes;return {width:c.width,height:c.height,nonblack,yellow,changedBottom,hash:hash>>>0};});}
try {
  await page.goto('http://127.0.0.1:4179/?no-codecs');
  await wait(()=>typeof window.createPlayer==='function');
  await check('isolated software-only browser',async()=>{
    const data=await page.evaluate(()=>({isolated:crossOriginIsolated,disabled:['VideoDecoder','AudioDecoder','VideoFrame'].every(n=>typeof globalThis[n]==='undefined')}));assert.ok(data.isolated&&data.disabled);return data;
  });
  await page.click('#demo');
  await check('upstream initialization and local decode',async()=>{
    await wait(()=>window.playerErrors?.length || (window.player?.diagnostics?.rendered>10 && window.player?.audioDiagnostics().mediaFrames>24000),60000);
    const startupErrors=await page.evaluate(()=>window.playerErrors);
    assert.deepEqual(startupErrors,[]);
    const data=await page.evaluate(()=>({video:player.diagnostics,audio:player.audioDiagnostics(),codecsAbsent:player.browserCodecsAbsent,events:playerEvents.filter(e=>e.event==='file-loaded'||e.event==='property-change'&&['video-codec','audio-codec-name','track-list'].includes(e.name))}));assert.equal(data.codecsAbsent,true);assert.equal(data.video.path,'wasm');return data;
  });
  await check('changing visible software frames and output PCM',async()=>{
    const first=await pixels();await page.waitForTimeout(350);const second=await pixels();
    assert.ok(first.nonblack>100000);assert.notEqual(first.hash,second.hash);
    await wait(()=>player.audioDiagnostics().rms>0.005);
    return {first,second,audio:await page.evaluate(()=>player.audioDiagnostics())};
  });
  await check('pause, ASS composition and paused redraw',async()=>{
    await page.evaluate(()=>player.pause());await wait(()=>player.properties.get('pause')===true);await page.waitForTimeout(250);
    const t=await page.evaluate(()=>player.properties.get('time-pos'));await page.waitForTimeout(350);const later=await page.evaluate(()=>player.properties.get('time-pos'));assert.ok(Math.abs(later-t)<0.08);
    await page.evaluate(()=>player.seek(3));await wait(()=>Math.abs(player.properties.get('time-pos')-3)<0.15);await page.waitForTimeout(250);
    const withASS=await pixels();await page.screenshot({path:`${output}/m0-subtitles.png`});
    await page.evaluate(()=>player.subtitleVisible(false));await page.waitForTimeout(300);const withoutASS=await pixels();
    assert.ok(withoutASS.changedBottom>300&&withASS.hash!==withoutASS.hash,JSON.stringify({withASS,withoutASS}));
    await page.evaluate(()=>player.subtitleVisible(true));await page.waitForTimeout(250);const restored=await pixels();assert.equal(restored.hash,withASS.hash);
    return {pausedTime:t,later,withASS,withoutASS,restored};
  });
  await check('resize, volume, seek, resume and EOF',async()=>{
    await page.evaluate(()=>{player.resize(800,450);return player.volume(40);});await page.waitForTimeout(200);const resized=await pixels();assert.equal(resized.width,800);assert.equal(resized.height,450);
    await page.evaluate(async()=>{await player.seek(10);await player.play();});await wait(()=>player.properties.get('time-pos')>10.2);await wait(()=>player.properties.get('eof-reached')===true,10000);
    return {resized,position:await page.evaluate(()=>player.properties.get('time-pos'))};
  });
  await check('reopen a local fixture in the same instance',async()=>{
    const before=await page.evaluate(()=>player.audioDiagnostics().mediaFrames);
    await page.evaluate(async()=>{const bytes=await(await fetch('/fixtures/m0.mkv')).arrayBuffer();await player.open(bytes);await player.play();});
    await page.waitForFunction(before=>player.audioDiagnostics().mediaFrames>before+4096,before,{timeout:15000});
    const position=await page.evaluate(()=>player.properties.get('time-pos'));assert.ok(position<3);
    return {position,audio:await page.evaluate(()=>player.audioDiagnostics())};
  });
  await check('graceful destroy and rejected use after destruction',async()=>{
    await page.evaluate(()=>player.destroy());await page.evaluate(()=>player.destroy());
    const message=await page.evaluate(()=>player.play().then(()=>'',e=>e.message));assert.ok(message.length);
    return {audio:await page.evaluate(()=>player.audioDiagnostics()),rejected:message};
  });
  await check('ten complete player lifecycles',async()=>{
    const cycles=[];
    for(let i=0;i<10;i++) {
      await page.evaluate(async()=>{window.playerEvents=[];const p=await createPlayer();const bytes=await(await fetch('/fixtures/m0.mkv')).arrayBuffer();await p.open(bytes);await p.play();});
      await wait(()=>player.diagnostics?.rendered>3&&player.audioDiagnostics().mediaFrames>4096,30000);
      cycles.push(await page.evaluate(()=>({video:player.diagnostics,audio:player.audioDiagnostics()})));
      await page.evaluate(()=>player.destroy());
      for(let n=0;n<30&&page.workers().length;n++)await page.waitForTimeout(100);
      assert.equal(page.workers().length,0,'Dedicated workers retained after destroy');
    }
    return cycles;
  });
  await check('invalid media rejection and cleanup during initialization',async()=>{
    const invalid=await page.evaluate(async()=>{const p=await createPlayer();try{await p.open(new Uint8Array([0,1,2,3]).buffer);return null;}catch(error){return error.message;}finally{await p.destroy();}});
    assert.ok(invalid);
    const cancelled=await page.evaluate(async()=>{
      const {BrowserPlayer}=await import('/web/generated/player.js');
      const canvas=document.createElement('canvas');
      const p=new BrowserPlayer(canvas,{disableBrowserCodecs:true});
      const rejection=p.ready.then(()=>null,error=>error.message);
      await p.destroy();return await rejection;
    });
    assert.ok(cancelled);await page.waitForTimeout(100);assert.equal(page.workers().length,0);
    return {invalid,cancelled};
  });
  assert.deepEqual(errors,[]);
  result.passed=true;
} catch(error) {
  result.failure=String(error.stack||error);
  result.pageStatus=await page.locator('#status').textContent().catch(()=>null);
  result.playerState=await page.evaluate(()=>({events:window.playerEvents,diagnostics:window.player?.diagnostics,audio:window.player?.audioDiagnostics()})).catch(()=>null);
  await page.screenshot({path:`${output}/m0-failure.png`}).catch(()=>{});
  console.error(result.failure);
  process.exitCode=1;
} finally {
  result.errors=errors;result.logs=logs;result.finished=new Date().toISOString();
  result.fixtureSha256=createHash('sha256').update(await readFile('fixtures/m0.mkv')).digest('hex');
  result.browserArtifactHashes={};
  for(const file of ['web/engine/player.mjs','web/generated/player.js','web/engine-worker.js','web/audio-worklet.js']) result.browserArtifactHashes[file]=createHash('sha256').update(await readFile(file)).digest('hex');
  result.wasmSha256=createHash('sha256').update(await readFile('web/engine/player.wasm')).digest('hex');
  await writeFile(`${output}/m0-browser.json`,JSON.stringify(result,null,2)+'\n');
  await browser.close();
}
