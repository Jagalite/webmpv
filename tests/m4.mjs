import {chromium} from 'playwright';
import assert from 'node:assert/strict';
import {mkdir,writeFile,readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
const output=`results/m4/browser-${new Date().toISOString().replaceAll(':','-')}`;await mkdir(output,{recursive:true});
const browser=await chromium.launch({channel:'chrome',headless:false,ignoreDefaultArgs:['--mute-audio'],args:['--autoplay-policy=no-user-gesture-required']});
const page=await browser.newPage(),result={scope:'M4 integrated copy-back and fallback',tests:[],passed:false},logs=[];
page.on('console',m=>logs.push(m.text()));page.on('pageerror',e=>logs.push(String(e)));
async function check(name,fn){console.log(`RUN ${name}`);const evidence=await fn();result.tests.push({name,passed:true,evidence});console.log(`PASS ${name}`);}
async function open(options){await page.evaluate(async options=>{
 const {BrowserPlayer}=await import('/web/generated/player.js');const canvas=document.createElement('canvas');canvas.width=640;canvas.height=360;document.body.append(canvas);window.activeCanvas=canvas;
 window.player=new BrowserPlayer(canvas,{decoder:'webcodecs',...options});window.events=[];player.addEventListener('log',e=>console.log(e.detail));player.addEventListener('mpv',e=>events.push(e.detail));
 await player.ready;await player.open(await(await fetch('/fixtures/m0.mkv')).arrayBuffer());await player.play();
},options);}
async function pixels(){return page.evaluate(()=>{const c=document.createElement('canvas');c.width=640;c.height=360;const ctx=c.getContext('2d');ctx.drawImage(activeCanvas,0,0,640,360);const bytes=ctx.getImageData(0,0,640,360).data,grid=[];for(let y=0;y<360;y+=4)for(let x=0;x<640;x+=4){const i=(y*640+x)*4;grid.push(bytes[i],bytes[i+1],bytes[i+2]);}return grid;});}
async function at(position){await page.evaluate(async position=>{await player.pause();await player.seek(position);},position);await page.waitForFunction(position=>!player.diagnostics.seeking&&Math.abs(player.diagnostics.presentedPosition-position)<0.2,position,{timeout:15000});await page.waitForTimeout(300);}
async function cleanup(){await page.evaluate(()=>player.destroy());for(let i=0;i<50&&page.workers().length;i++)await page.waitForTimeout(100);assert.equal(page.workers().length,0);const stats=await page.evaluate(()=>player.diagnostics?.decoderStats);if(stats){assert.equal(stats.active,false);assert.equal(stats.queued,0);assert.equal(stats.outstanding,0);assert.equal(stats.closedFrames,stats.receivedFrames);}}
try{
 await page.goto('http://127.0.0.1:4179/');
 for(const options of [{},{disableBrowserCodecs:true},{decoderFaultAfter:12}]){
  await check(JSON.stringify(options),async()=>{
   await open(options);
   await page.waitForFunction(()=>player.diagnostics?.rendered>30&&player.audioDiagnostics().rms>0.005,null,{timeout:30000});
   const initial=await page.evaluate(()=>player.diagnostics);
   assert.equal(initial.decoder,options.disableBrowserCodecs||options.decoderFaultAfter?'software':'webcodecs');
   if(!options.disableBrowserCodecs)assert.ok(initial.decoderStats.frames>0);
   for(const position of [7,2,9]){
    await page.evaluate(async position=>{await player.pause();await player.seek(position);},position);
    await page.waitForFunction(position=>!player.diagnostics.seeking&&Math.abs(player.diagnostics.presentedPosition-position)<0.2,position,{timeout:15000});
   }
   await page.evaluate(()=>player.play());await page.waitForFunction(()=>player.properties.get('eof-reached')===true,null,{timeout:15000});
   const final=await page.evaluate(()=>player.diagnostics);await cleanup();return {initial,final};
  });
 }
 await check('software/copy-back pixel equivalence and ASS visibility',async()=>{
  const images=[];
  for(const decoder of ['software','webcodecs']){
   await open({decoder});await page.evaluate(()=>player.selectTrack('sub','1'));await at(3);const on=await pixels();await page.evaluate(()=>player.subtitleVisible(false));await page.waitForTimeout(300);const off=await pixels();
   assert.notDeepEqual(on,off);images.push({decoder,on,off,diagnostics:await page.evaluate(()=>player.diagnostics)});await cleanup();
  }
  await writeFile(`${output}/pixel-grids.json`,JSON.stringify(images)+'\n');
  const scores={};for(const state of ['on','off']){const errors=images[0][state].map((x,i)=>Math.abs(x-images[1][state][i])).sort((a,b)=>a-b);const mae=errors.reduce((a,b)=>a+b,0)/errors.length,p99=errors[Math.ceil(errors.length*.99)-1];scores[state]={mae,p99};assert.ok(mae<=3&&p99<=16,JSON.stringify(scores));}
  return scores;
 });
 await check('twenty optional-decoder lifecycles and bounded ownership',async()=>{
  const cycles=[];for(let i=0;i<20;i++){
   await open({});await page.waitForFunction(()=>player.diagnostics?.decoderStats?.frames>5,null,{timeout:20000});
   const diagnostics=await page.evaluate(()=>player.diagnostics);assert.ok(diagnostics.decoderStats.peakOutstanding<=8);assert.ok(diagnostics.decoderStats.peakFrames<=8);cycles.push(diagnostics);await cleanup();
  }return cycles;
 });
 result.passed=true;
}catch(error){result.failure=String(error.stack||error);console.error(result.failure);try{result.diagnostics=await page.evaluate(()=>player?.diagnostics);result.workers=page.workers().map(w=>w.url());}catch{}process.exitCode=1;}
finally{
 for(const f of ['web/engine-m4/player.wasm','web/engine-m4/player.mjs','native/vd_browser.c','web/browser-decoder-worker.js','web/engine-worker.js']) (result.hashes??={})[f]=createHash('sha256').update(await readFile(f)).digest('hex');
 await writeFile(`${output}/result.json`,JSON.stringify(result,null,2)+'\n');await writeFile(`${output}/console.json`,JSON.stringify(logs,null,2)+'\n');await browser.close();console.log(output);
}
