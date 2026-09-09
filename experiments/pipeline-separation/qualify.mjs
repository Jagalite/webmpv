// Correctness matrix, deliberately separate from visible CPU measurements.
import {chromium} from 'playwright';
import {mkdir,writeFile} from 'node:fs/promises';
import {serve} from './server.mjs';
import assert from 'node:assert/strict';
const out=`results/pipeline-separation/qualification-${new Date().toISOString().replaceAll(':','-')}`;await mkdir(out,{recursive:true});console.log(out);
const server=await serve(),result={scope:'Headless targeted correctness; no performance claim',cases:[]};
const bounded=async(p,ms=25000)=>{let timer;try{return await Promise.race([p,new Promise((_,reject)=>timer=setTimeout(()=>reject(Error('Case deadline exceeded')),ms))]);}finally{clearTimeout(timer);}};
const cases=[{name:'indexed-mkv',media:'mkv',target:236.9,seeks:[400,30,500,1]},{name:'tail-index-mp4',media:'tail',target:236.9,seeks:[500,30]},{name:'long-gop',media:'long',target:19,seeks:[35,1,18]},{name:'retry',media:'sample',retry:true},{name:'seek-storm',media:'movie',storm:true},{name:'paused-backpressure',media:'movie',pause:true},{name:'local-large-file',media:'mkv',local:true,target:236.9},{name:'local-large-mp4',media:'tail',local:true,target:236.9},{name:'audio-offset',media:'offset'},{name:'rotation',media:'rotation'},{name:'sample-aspect',media:'sar'},{name:'single-ts',media:'ts'},{name:'configuration-change',media:'config',target:7},{name:'unsupported-10bit',media:'tenbit',expectReject:true},{name:'subtitle-feature-rejection',media:'ass',subtitles:true,expectReject:true}];
try{
 for(const c of cases){
  const record={...c};result.cases.push(record);console.log('Checking',c.name);
  const browser=await chromium.launch({channel:'chrome',headless:true,args:['--autoplay-policy=no-user-gesture-required']});let page;
  try{
   page=await browser.newPage();await page.goto(server.origin+'/experiment/page.html');
   const options={variant:'remux',url:server.origin+`/media/${c.media}?id=${c.name}${c.retry?'&retry=1':''}${c.storm?'&delay=40':''}`,target:c.target||0,subtitles:!!c.subtitles};
   if(c.local){await page.evaluate(()=>{const input=document.createElement('input');input.type='file';input.id='file';document.body.append(input);});await page.locator('#file').setInputFiles(server.media[c.media]);record.open=await bounded(page.evaluate(o=>start({...o,file:document.querySelector('#file').files[0]}),options));}
   else record.open=await bounded(page.evaluate(o=>start(o),options));
   if(c.expectReject)throw Error('Expected explicit rejection, but playback opened');
   if(c.seeks){record.seeks=[];for(const t of c.seeks)record.seeks.push(await bounded(page.evaluate(t=>seek(t),t)));}
   if(c.storm){record.storm=await bounded(page.evaluate(async()=>{const pending=[];for(const t of [400,10,500,50,300,40]){pending.push(player.seek(t).then(()=>({target:t,status:'ready'}),e=>({target:t,status:e.name,error:String(e)})));await new Promise(r=>setTimeout(r,20));}return Promise.all(pending);}));await bounded(page.evaluate(()=>player.play()));assert.equal(record.storm.at(-1).status,'ready');assert.ok(record.storm.slice(0,-1).every(r=>r.status==='AbortError'));}
   await page.waitForTimeout(1000);record.before=await page.evaluate(()=>snapshot());
   if(c.pause){await page.evaluate(()=>player.pause());await page.waitForTimeout(2000);record.pausedA=await page.evaluate(()=>snapshot());await page.waitForTimeout(3000);record.pausedB=await page.evaluate(()=>snapshot());assert.equal(record.pausedA.remux.source.fetchedBytes,record.pausedB.remux.source.fetchedBytes,'Paused source production must stop at forward budget');}
   else{await page.waitForTimeout(2000);record.after=await page.evaluate(()=>snapshot());assert.ok(record.after.position-record.before.position>1.5,'Playback must advance');assert.ok(record.after.frames-record.before.frames>45,'Decoded video must advance');assert.deepEqual(record.after.errors,[]);}
   await page.screenshot({path:`${out}/${c.name}.png`});record.passed=true;
  }catch(e){record.error=String(e.stack);record.state=await page?.evaluate(()=>typeof snapshot==='function'?snapshot():null).catch(()=>null);record.passed=!!c.expectReject&&!record.open;console.log(c.name,record.error.split('\n')[0]);}
  finally{await page?.evaluate(()=>window.player?.destroy()).catch(()=>{});await page?.waitForTimeout(150);record.workersAfter=page?.workers().length;record.passed=record.passed&&record.workersAfter===0;await browser.close();await writeFile(out+'/result.json',JSON.stringify(result,null,2)+'\n');}
 }
}finally{result.origin=Object.fromEntries(server.states);await server.close();result.passed=result.cases.every(c=>c.passed);await writeFile(out+'/result.json',JSON.stringify(result,null,2)+'\n');console.log(out);if(!result.passed)process.exitCode=1;}
