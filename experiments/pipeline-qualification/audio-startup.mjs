// First non-silent decoded audio callback, not physical speaker onset or CPU measurement.
import {chromium} from 'playwright';
import {mkdir,writeFile} from 'node:fs/promises';
import assert from 'node:assert/strict';
import {serve} from './server.mjs';
const out=`results/pipeline-qualification/audio-startup-${new Date().toISOString().replaceAll(':','-')}`;
await mkdir(out,{recursive:true});console.log(out);const server=await serve(),result={method:'First non-silent AudioWorklet message received after open begins; callback latency included; preloaded probe; headless; no acoustic claim',trials:[]};
try{for(const variant of ['native','remux','software','yuv','yuv','software','remux','native']){
 const browser=await chromium.launch({channel:'chrome',headless:true,args:['--autoplay-policy=no-user-gesture-required']}),r={variant,browserVersion:browser.version()};result.trials.push(r);
 try{const page=await browser.newPage();await page.goto(server.origin+'/experiment/page.html');
  await page.evaluate(async()=>{
   window.firstAudio=null;window.firstVideoCallback=null;
   const Original=AudioWorkletNode;
   window.AudioWorkletNode=class extends Original{constructor(ctx,name,options){if(name==='webmpv-pcm')options={...options,processorOptions:{...options.processorOptions,measureOutput:true}};super(ctx,name,options);this.port.addEventListener('message',()=>{window.firstAudio??=performance.now();});this.port.start();}};
   const ctx=window.probeContext=new AudioContext({latencyHint:'interactive'});await ctx.resume();
   const url=URL.createObjectURL(new Blob([`class Probe extends AudioWorkletProcessor{constructor(){super();this.sent=false;}process(inputs,outputs){const a=inputs[0]?.[0];if(a){if(!this.sent&&a.some(x=>Math.abs(x)>.12)){this.sent=true;this.port.postMessage('onset');}for(let c=0;c<outputs[0].length;c++)outputs[0][c].set(inputs[0][c]||a);}return true;}}registerProcessor('onset',Probe);`],{type:'text/javascript'}));await ctx.audioWorklet.addModule(url);URL.revokeObjectURL(url);
   const create=document.createElement.bind(document);document.createElement=(tag,...args)=>{const element=create(tag,...args);if(tag.toLowerCase()==='video'){const source=ctx.createMediaElementSource(element),node=new Original(ctx,'onset');node.port.onmessage=()=>{window.firstAudio??=performance.now();};source.connect(node).connect(ctx.destination);element.requestVideoFrameCallback(()=>{window.firstVideoCallback??=performance.now();});}return element;};
  });
  r.observed=await page.evaluate(async o=>{window.openBegun=performance.now();const opened=await start(o);const deadline=performance.now()+10000;while(window.firstAudio===null&&performance.now()<deadline)await new Promise(r=>setTimeout(r,10));return {firstAudioCallbackMs:window.firstAudio===null?null:window.firstAudio-window.openBegun,firstVideoCallbackMs:window.firstVideoCallback===null?null:window.firstVideoCallback-window.openBegun,firstFrameCounterMs:opened.firstFrameMs,state:snapshot()};},{variant,url:server.origin+'/media/sync'});
  assert.ok(r.observed.firstAudioCallbackMs!==null&&r.observed.firstAudioCallbackMs>=0);assert.deepEqual(r.observed.state.errors,[]);await page.evaluate(async()=>{await stop();await probeContext.close();});await page.waitForTimeout(150);assert.equal(page.workers().length,0);r.passed=true;
 }catch(e){r.error=String(e.stack);process.exitCode=1;}finally{await browser.close();await writeFile(out+'/result.json',JSON.stringify(result,null,2)+'\n');}
}}finally{await server.close();result.passed=result.trials.every(t=>t.passed);await writeFile(out+'/result.json',JSON.stringify(result,null,2)+'\n');console.log(out,result.passed);}
