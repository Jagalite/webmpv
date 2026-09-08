// Differential renderer checks using controlled pixels, independent of codec color guesses.
import {chromium} from 'playwright';
import {spawn} from 'node:child_process';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import assert from 'node:assert/strict';
const out=`results/playback-performance/gpu-presenter-${new Date().toISOString().replaceAll(':','-')}`;
await mkdir(out,{recursive:true});console.log(out);
const helper=await readFile('experiments/playback-performance/webgpu/presenter.js','utf8');
await writeFile(out+'/presenter.js',helper+'\nexport {ExternalFramePresenter};\n');
await writeFile(out+'/config.json',JSON.stringify({candidate:{'web/test-presenter.js':out+'/presenter.js'}}));
const server=spawn(process.execPath,['experiments/playback-performance/serve.mjs',out+'/config.json'],{env:{...process.env,PORT:'0',DEFAULT_MOUNT:'candidate'},stdio:['ignore','pipe','inherit']});
let browser;const result={cases:[]};
try{
 const origin=await new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(Error('Server timeout')),10000);server.once('error',reject);server.stdout.on('data',bytes=>{const match=/http:\/\/127\.0\.0\.1:\d+/.exec(String(bytes));if(match){clearTimeout(timer);resolve(match[0]);}});});
 browser=await chromium.launch({channel:'chrome',headless:true});const page=await browser.newPage();await page.goto(origin+'/web/hybrid-performance.html');
 result.browser=browser.version();
 result.cases=await page.evaluate(async()=>{
  const {ExternalFramePresenter}=await import('./test-presenter.js');
  const {drawRetainedVideo}=await import('./retained-video.js');
  const cases=[],failures=[],canvas=document.createElement('canvas');canvas.width=192;canvas.height=144;document.body.append(canvas);
  const target=canvas.transferControlToOffscreen();
  const presenter=await ExternalFramePresenter.create(target,error=>failures.push(error));if(!presenter)throw Error('WebGPU unavailable for renderer qualification');
  const reference=document.createElement('canvas');reference.width=canvas.width;reference.height=canvas.height;const ctx=reference.getContext('2d',{alpha:false});
  const capture=document.createElement('canvas');capture.width=canvas.width;capture.height=canvas.height;const captured=capture.getContext('2d',{willReadFrequently:true});
  const rgba=new Uint8Array(48*32*4);for(let y=0;y<32;y++)for(let x=0;x<48;x++){const at=(y*48+x)*4;rgba.set([x*5,y*7,(x+y)*3,255],at);}
  const nv12=new Uint8Array(48*32*3/2);for(let y=0;y<32;y++)for(let x=0;x<48;x++)nv12[y*48+x]=16+(x*3+y*2)%220;for(let i=48*32;i<nv12.length;i+=2){nv12[i]=90;nv12[i+1]=170;}
  // Build an independent limited-range BT.709 reference. Canvas2D's software
  // NV12 conversion can approximate the blue coefficient, so it is not an exact oracle.
  const converted=new Uint8Array(rgba.length),kr=.2126,kb=.0722,kg=1-kr-kb;
  for(let i=0;i<48*32;i++){const y=(nv12[i]-16)/219,u=(90-128)/224,v=(170-128)/224,r=y+2*(1-kr)*v,b=y+2*(1-kb)*u,g=(y-kr*r-kb*b)/kg;converted.set([r,g,b].map(value=>Math.max(0,Math.min(255,Math.round(value*255)))).concat(255),i*4);}
  const tile=new OffscreenCanvas(24,8),tileContext=tile.getContext('2d'),pixels=tileContext.createImageData(24,8);for(let i=0;i<24*8;i++)pixels.data.set([255,40,80,(i%24)*11],i*4);tileContext.putImageData(pixels,0,0);
  const overlays=[{parts:[]},{parts:[{tile,x:30,y:105,dw:120,dh:32}]},{parts:[{tile,x:-8,y:128,dw:72,dh:24}]}];
  for(const format of ['RGBA','NV12'])for(const rotation of [0,90,180,270]){
   const frame=new VideoFrame(format==='RGBA'?rgba:nv12,{format,codedWidth:48,codedHeight:32,timestamp:0,colorSpace:format==='RGBA'?{primaries:'bt709',transfer:'iec61966-2-1',matrix:'rgb',fullRange:true}:{primaries:'bt709',transfer:'iec61966-2-1',matrix:'bt709',fullRange:false}});
   const referenceFrame=format==='RGBA'?frame:new VideoFrame(converted,{format:'RGBA',codedWidth:48,codedHeight:32,timestamp:0});
   const track={'demux-rotation':rotation,'demux-par':rotation===180?.75:1};
   for(const [overlayIndex,overlay] of overlays.entries()){
    drawRetainedVideo(ctx,referenceFrame,reference,track);for(const part of overlay.parts)ctx.drawImage(part.tile,part.x,part.y,part.dw,part.dh);
    presenter.draw(frame,track,overlay);await presenter.device.queue.onSubmittedWorkDone();await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));
    captured.drawImage(canvas,0,0);const actual=captured.getImageData(0,0,canvas.width,canvas.height).data,expected=ctx.getImageData(0,0,canvas.width,canvas.height).data;
    let total=0,max=0,above3=0,changed=0;for(let i=0;i<actual.length;i++){const d=Math.abs(actual[i]-expected[i]);total+=d;max=Math.max(max,d);above3+=d>3;changed+=d>0;}
    const center=(72*canvas.width+96)*4;
    cases.push({format,rotation,overlay:overlayIndex,mean:total/actual.length,max,above3,changed,center:{actual:Array.from(actual.slice(center,center+4)),expected:Array.from(expected.slice(center,center+4))},stats:{...presenter.stats}});
   }
   frame.close();if(referenceFrame!==frame)referenceFrame.close();
  }
  presenter.destroy();presenter.destroy();if(failures.length)throw Error(failures.join('; '));return cases;
 });
 for(const test of result.cases){assert.ok(test.mean<1.5,JSON.stringify(test));assert.ok(test.above3<192*144*.03,JSON.stringify(test));}
 result.passed=true;
}catch(error){result.error=String(error.stack);process.exitCode=1;console.error(error);}
finally{await browser?.close();server.kill();await writeFile(out+'/result.json',JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify(result));}
