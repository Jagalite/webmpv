// Exact differential pixels for omitting redundant clears on opaque full frames.
import {chromium} from 'playwright';
import {spawn} from 'node:child_process';
import {writeFile,mkdir} from 'node:fs/promises';
import assert from 'node:assert/strict';
const out=`results/playback-performance/canvas-opaque-${new Date().toISOString().replaceAll(':','-')}`;
await mkdir(out,{recursive:true});console.log(out);
await writeFile(out+'/config.json',JSON.stringify({candidate:{'web/test-opaque.js':'experiments/playback-performance/canvas/retained-video.js'}}));
const server=spawn(process.execPath,['experiments/playback-performance/serve.mjs',out+'/config.json'],{env:{...process.env,PORT:'0',DEFAULT_MOUNT:'candidate'},stdio:['ignore','pipe','inherit']});
let browser,origin;const result={cases:[]};
try{
 origin=await new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(Error('Server timeout')),10000);server.once('error',reject);server.stdout.on('data',bytes=>{const match=/http:\/\/127\.0\.0\.1:\d+/.exec(String(bytes));if(match){clearTimeout(timer);resolve(match[0]);}});});
 browser=await chromium.launch({channel:'chrome',headless:true});const page=await browser.newPage();await page.goto(origin+'/web/hybrid-performance.html');result.browser=browser.version();
 result.cases=await page.evaluate(async()=>{
  const {drawRetainedVideo:original}=await import('./retained-video.js');
  const {drawRetainedVideo:optimized}=await import('./test-opaque.js');
  const cases=[],width=48,height=32;
  for(const format of ['RGBX','BGRX','RGBA','BGRA','NV12','I420']){
   const bytes=new Uint8Array(width*height*(format==='NV12'||format==='I420'?1.5:4));
   if(format==='NV12'||format==='I420'){
    for(let y=0;y<height;y++)for(let x=0;x<width;x++)bytes[y*width+x]=16+(x*3+y*2)%220;
    for(let i=width*height;i<bytes.length;i++)bytes[i]=format==='NV12'?(i%2?170:90):(i<width*height*1.25?90:170);
   }else for(let y=0;y<height;y++)for(let x=0;x<width;x++)bytes.set([x*5,y*7,(x+y)*3,(x*17+y*7)%256],(y*width+x)*4);
   const frame=new VideoFrame(bytes,{format,codedWidth:width,codedHeight:height,timestamp:0});
   for(const dimensions of [[192,128],[192,144]])for(const rotation of [0,90,180,270])for(const par of [1,.75])for(const alpha of [true,false]){
    const canvases=[new OffscreenCanvas(...dimensions),new OffscreenCanvas(...dimensions)],contexts=canvases.map(canvas=>canvas.getContext('2d',{alpha}));
    const track={'demux-rotation':rotation,'demux-par':par};
    for(let n=0;n<2;n++){
     const context=contexts[n];context.fillStyle='#d930fa';context.fillRect(0,0,...dimensions);
     context.fillStyle='#fff8';context.fillRect(23,89,120,17);
     (n?optimized:original)(context,frame,canvases[n],track);
     context.fillStyle='#f508';context.fillRect(-8,115,150,20);
    }
    const expected=contexts[0].getImageData(0,0,...dimensions).data,actual=contexts[1].getImageData(0,0,...dimensions).data;
    let differences=0,max=0;for(let i=0;i<actual.length;i++){const error=Math.abs(actual[i]-expected[i]);differences+=error!==0;max=Math.max(max,error);}
    cases.push({format,actualFormat:frame.format,dimensions,rotation,par,alpha,differences,max});
   }
   frame.close();
  }
  return cases;
 });
 for(const test of result.cases)assert.equal(test.differences,0,JSON.stringify(test));result.passed=true;
}catch(error){result.error=String(error.stack);process.exitCode=1;console.error(error);}
finally{if(origin)result.assets=await(await fetch(origin+'/__metadata')).json();await browser?.close();server.kill();await writeFile(out+'/result.json',JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify({passed:result.passed,cases:result.cases.length}));}
