import {chromium} from 'playwright';
import {spawn} from 'node:child_process';
import {writeFile,mkdir} from 'node:fs/promises';
import assert from 'node:assert/strict';
const out=`results/playback-performance/rgbx-pixels-${new Date().toISOString().replaceAll(':','-')}`;
await mkdir(out,{recursive:true});console.log(out);
await writeFile(out+'/config.json',JSON.stringify({candidate:{'web/test-rgbx.js':'experiments/playback-performance/rgbx-frame/uploader.js'}}));
const server=spawn(process.execPath,['experiments/playback-performance/serve.mjs',out+'/config.json'],{env:{...process.env,PORT:'0',DEFAULT_MOUNT:'candidate'},stdio:['ignore','pipe','inherit']});
let browser,origin;const result={cases:[]};
try{
 origin=await new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(Error('Server timeout')),10000);server.once('error',reject);server.stdout.on('data',bytes=>{const match=/http:\/\/127\.0\.0\.1:\d+/.exec(String(bytes));if(match){clearTimeout(timer);resolve(match[0]);}});});
 browser=await chromium.launch({channel:'chrome',headless:true});const page=await browser.newPage();await page.goto(origin+'/web/hybrid-performance.html');result.browser=browser.version();
 result.cases=await page.evaluate(async()=>{
  const {RGBXFrameUploader}=await import('./test-rgbx.js'),uploader=new RGBXFrameUploader(),cases=[];
  for(const [width,height] of [[3,5],[64,32],[192,108]])for(const shared of [false,true])for(let pattern=0;pattern<4;pattern++){
   const length=width*height*4,buffer=new (shared?SharedArrayBuffer:ArrayBuffer)(length+64),bytes=new Uint8Array(buffer,17,length);
   for(let i=0;i<length;i++)bytes[i]=pattern===0?0:pattern===1?255:pattern===2?i%256:(i*37+(i>>>8))%256;
   const original=new OffscreenCanvas(width,height),candidate=new OffscreenCanvas(width,height),reference=original.getContext('2d',{alpha:false}),actual=candidate.getContext('2d',{alpha:false});
   const image=new ImageData(width,height);image.data.set(bytes);for(let i=3;i<length;i+=4)image.data[i]=255;reference.putImageData(image,0,0);
   if(!uploader.draw(actual,bytes,width,height,pattern*33333))throw Error(JSON.stringify(uploader.stats));
   // mpv may immediately reuse its source pixels after draw/close. The displayed
   // frame must already own its content rather than alias the shared input.
   bytes.fill(83);
   const expected=reference.getImageData(0,0,width,height).data,observed=actual.getImageData(0,0,width,height).data;
   let differences=0,max=0;for(let i=0;i<length;i++){const delta=Math.abs(expected[i]-observed[i]);differences+=delta!==0;max=Math.max(max,delta);}
   cases.push({width,height,shared,pattern,differences,max,stats:{...uploader.stats}});
  }
  return cases;
 });
 for(const item of result.cases){assert.equal(item.differences,0,JSON.stringify(item));assert.equal(item.stats.created,item.stats.closed);assert.equal(item.stats.failures,0);}result.passed=true;
}catch(error){result.error=String(error.stack);process.exitCode=1;console.error(error);}
finally{if(origin)result.assets=await(await fetch(origin+'/__metadata')).json();await browser?.close();server.kill();await writeFile(out+'/result.json',JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify({passed:result.passed,cases:result.cases.length}));}
