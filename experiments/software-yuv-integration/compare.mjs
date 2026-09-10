import {chromium} from 'playwright';
import {writeFile,mkdir,readFile} from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
import os from 'node:os';
import assert from 'node:assert/strict';
import {serve} from './server.mjs';
import {focusForQualification,observeForeground} from '../../scripts/qualification-foreground.mjs';
const smoke=process.env.SMOKE==='1',variants=(process.env.VARIANTS||'software,yuv,yuv,software').split(',');
const media=process.env.MEDIA||'movie',target=Number(process.env.TARGET||0),measure=Number(process.env.MEASURE||30),warmup=Number(process.env.WARMUP||8);
const out=`results/software-yuv-integration/${smoke?'smoke':'visible'}-${new Date().toISOString().replaceAll(':','-')}`;await mkdir(out,{recursive:true});console.log(out);
const host={platform:os.platform(),arch:os.arch(),cpu:os.cpus()[0].model,memory:os.totalmem(),power:execFileSync('pmset',['-g','batt'],{encoding:'utf8'})};
const result={scope:smoke?'headless correctness only':'foreground visible playback; CDP browser process CPU excludes WindowServer/VideoToolbox/HTTP origin',host,variants,media,target,warmup,measure,trials:[]};
const server=await serve();
const save=()=>writeFile(out+'/result.json',JSON.stringify(result,null,2)+'\n');
const bounded=async(p,ms=45000)=>{let timer;try{return await Promise.race([p,new Promise((_,reject)=>timer=setTimeout(()=>reject(Error('Operation deadline exceeded')),ms))]);}finally{clearTimeout(timer);}};
try{
 for(const [index,variant] of variants.entries()){
  const t={variant,index,samples:[]};result.trials.push(t);console.log('Starting',index,variant);
  const browser=await chromium.launch({channel:'chrome',headless:smoke,ignoreDefaultArgs:['--mute-audio'],args:['--autoplay-policy=no-user-gesture-required','--disable-background-timer-throttling','--disable-renderer-backgrounding','--disable-backgrounding-occluded-windows']});
  t.browserVersion=browser.version();
  let page;
  try{
   page=await browser.newPage({viewport:{width:1100,height:700},deviceScaleFactor:1});page.setDefaultTimeout(30000);page.on('pageerror',e=>(t.pageErrors??=[]).push(String(e)));
   await page.addInitScript(()=>{window.workerCleanup=[];const Original=Worker;window.Worker=class extends Original{constructor(...args){super(...args);this.addEventListener('message',({data})=>{if(data.type==='output'&&data.data?.kind==='yuv-cleanup')workerCleanup.push(data.data);});}};});
   await page.goto(server.origin+'/experiment/page.html');await page.waitForFunction(()=>typeof start==='function');
   if(!smoke)t.foregroundBefore=await focusForQualification(page,browser);
   const id=`${index}-${variant}`,url=server.origin+`/media/${media}?id=${id}${process.env.RETRY?'&retry=1':''}${process.env.DELAY?'&delay='+process.env.DELAY:''}`;
   const progressTimer=setInterval(()=>{void page.evaluate(()=>typeof snapshot==='function'?snapshot():null).then(s=>{t.startupProgress=s;void save();}).catch(()=>{});},5000);
   try{t.startup=await bounded(page.evaluate(o=>start(o),{variant,url,target,subtitles:process.env.SUBTITLES==='1',filters:process.env.FILTERS||''}));}finally{clearInterval(progressTimer);}
   await page.evaluate(s=>document.querySelector('#phase').textContent=s,`${index+1}/${variants.length}: ${variant}, ${warmup}s warmup then ${measure}s measurement`);
   await page.waitForTimeout(warmup*1000);const cdp=await browser.newBrowserCDPSession();
   const sample=async()=>{
    const processes=(await cdp.send('SystemInfo.getProcessInfo')).processInfo;
    const rss=execFileSync('/bin/ps',['-o','rss=','-p',processes.map(p=>p.id).join(',')],{encoding:'utf8'}).trim().split(/\s+/).map(Number).reduce((a,b)=>a+b,0)*1024;
    const s={at:Date.now(),processes,rss,state:await page.evaluate(()=>snapshot())};if(!smoke)s.foreground=await observeForeground(page,browser);t.samples.push(s);if(measure>=60&&t.samples.length%30===0)console.log('Progress',variant,JSON.stringify({position:s.state.position,rssMiB:rss/1048576,frames:s.state.frames,drops:s.state.drops,bufferedSeconds:s.state.remux?.stats.peakBufferedSeconds,bufferedBytes:s.state.remux?.stats.bufferedBytesUpperBound}));return s;
   };
   const first=await sample();let last=first;while(last.at-first.at<measure*1000){await page.waitForTimeout(Math.max(1,Math.min(1000,measure*1000-(Date.now()-first.at))));last=await sample();}
   let cpu=0;t.churn=[];for(let i=1;i<t.samples.length;i++){const a=new Map(t.samples[i-1].processes.map(p=>[p.id,p.cpuTime])),b=new Map(t.samples[i].processes.map(p=>[p.id,p.cpuTime]));for(const[id,v]of b){if(a.has(id))cpu+=v-a.get(id);else t.churn.push(id);}for(const id of a.keys())if(!b.has(id))t.churn.push(id);}
   const elapsed=(last.at-first.at)/1000;
   t.summary={cpuPercent:cpu/elapsed*100,rssMeanMiB:t.samples.reduce((s,v)=>s+v.rss,0)/t.samples.length/1048576,elapsed,fps:(last.state.frames-first.state.frames)/elapsed,positionAdvance:last.state.position-first.state.position,drops:last.state.drops-first.state.drops,audioUnderruns:last.state.audio?.underruns===undefined?null:last.state.audio.underruns-first.state.audio.underruns,avsyncMax:last.state.avsync===undefined?null:Math.max(...t.samples.map(s=>Math.abs(s.state.avsync))),firstFrameMs:t.startup.firstFrameMs};
   await page.screenshot({path:`${out}/${index}-${variant}.png`});
   if(process.env.SEEKS){t.seeks=[];for(const pos of process.env.SEEKS.split(',').map(Number))t.seeks.push(await bounded(page.evaluate(t=>seek(t),pos)));}
   t.cleanup=await page.evaluate(()=>stop());await page.waitForTimeout(300);t.workerCleanup=await page.evaluate(()=>workerCleanup);t.workersAfter=page.workers().length;if(variant==='yuv')assert.equal(t.workerCleanup.at(-1)?.liveTextures,0,'GPU texture cleanup');
   assert.equal(t.workersAfter,0);assert.deepEqual(t.churn,[]);assert.ok(t.summary.fps>28,'Frame throughput');assert.ok(Math.abs(t.summary.positionAdvance-elapsed)<.5,'Playback clock');assert.equal(t.summary.drops,0,'Presentation drops');
   if(t.summary.audioUnderruns!==null)assert.equal(t.summary.audioUnderruns,0);if(t.summary.avsyncMax!==null)assert.ok(t.summary.avsyncMax<.12);
   for(const s of t.samples){assert.deepEqual(s.state.errors,[]);if(!smoke)assert.ok(s.foreground.matched,'Lost visible foreground condition');}
   t.passed=true;console.log('Passed',variant,JSON.stringify(t.summary));
  }catch(e){t.error=String(e.stack);t.failureState=await page?.evaluate(()=>typeof snapshot==='function'?snapshot():null).catch(()=>null);console.error(t.error);process.exitCode=1;}
  finally{await page?.evaluate(()=>window.player?.destroy()).catch(()=>{});await save();await browser.close();await save();}
 }
}finally{result.origin=Object.fromEntries(server.states);await server.close();result.passed=result.trials.every(t=>t.passed);await save();console.log(out);}
