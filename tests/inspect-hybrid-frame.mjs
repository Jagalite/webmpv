// Compare two presenters using the very same retained VideoFrame; not performance evidence.
import {chromium} from 'playwright';
import {spawn} from 'node:child_process';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {PNG} from '../node_modules/playwright-core/lib/utilsBundle.js';
const out=`results/playback-performance/frame-color-${new Date().toISOString().replaceAll(':','-')}`;await mkdir(out,{recursive:true});console.log(out);
const source=await readFile(process.env.WORKER||'build/playback-performance/webgpu/worker.js','utf8');
const hook=`\nself.inspectRetainedColor=async()=>{
 const reference=new OffscreenCanvas(canvas.width,canvas.height),ctx=reference.getContext('2d',{alpha:false});
 drawRetainedVideo(ctx,heldFrame,canvas,videoTrack);
 const encode=async source=>new FileReaderSync().readAsDataURL(await source.convertToBlob({type:'image/png'}));
 return {metadata:{timestamp:heldFrame.timestamp,colorSpace:heldFrame.colorSpace.toJSON(),format:heldFrame.format,visibleRect:heldFrame.visibleRect.toJSON(),displayWidth:heldFrame.displayWidth,displayHeight:heldFrame.displayHeight,track:videoTrack},reference:await encode(reference)};
};\n`;
await writeFile(out+'/worker.js',source+hook);
const config=JSON.parse(await readFile(process.env.SERVER_CONFIG||'build/playback-performance/api-webgpu.json'));config.candidate['web/filter-retained-engine-worker.js']=out+'/worker.js';await writeFile(out+'/server-config.json',JSON.stringify(config));
const server=spawn(process.execPath,['experiments/playback-performance/serve.mjs',out+'/server-config.json'],{env:{...process.env,PORT:'0',DEFAULT_MOUNT:'candidate'},stdio:['ignore','pipe','inherit']});let browser;
try{
 const origin=await new Promise(resolve=>server.stdout.on('data',bytes=>{const match=/http:\/\/127\.0\.0\.1:\d+/.exec(String(bytes));if(match)resolve(match[0]);}));
 browser=await chromium.launch({channel:'chrome',headless:true,args:['--autoplay-policy=no-user-gesture-required']});const page=await browser.newPage({viewport:{width:2048,height:1280}});
 const cdp=await browser.newBrowserCDPSession();const trace=[];cdp.on('Tracing.dataCollected',event=>trace.push(...event.value));
 await cdp.send('Tracing.start',{categories:'disabled-by-default-webgpu,media',options:'record-as-much-as-possible',transferMode:'ReportEvents'});
 await page.goto(origin+'/web/hybrid-performance.html');await page.setInputFiles('#file',process.env.INPUT||'build/hybrid-performance/sample.mp4');await page.evaluate(()=>start('hybrid'));await page.waitForTimeout(500);await page.evaluate(()=>player.pause());await page.evaluate(()=>player.seek(5));await page.waitForTimeout(250);
 const worker=page.workers().find(worker=>worker.url().includes('filter-retained-engine-worker'));
 const capture=await worker.evaluate(()=>self.inspectRetainedColor());
 capture.candidate=await page.evaluate(()=>player.surface.toDataURL());
 await page.evaluate(()=>{player.surface.style.width='1920px';player.surface.style.height='1080px';});
 await page.locator('canvas').screenshot({path:out+'/candidate-display.png'});
 const nativeMetadata=await page.evaluate(async()=>{
  const video=document.createElement('video');video.id='native-reference';video.muted=true;video.style.cssText='display:block;width:1920px;height:1080px';
  video.src=URL.createObjectURL(document.querySelector('#file').files[0]);document.body.append(video);
  await new Promise((resolve,reject)=>{video.onloadedmetadata=resolve;video.onerror=reject;});
  const presented=new Promise(resolve=>video.requestVideoFrameCallback((now,metadata)=>resolve(metadata)));
  await new Promise(resolve=>{video.onseeked=resolve;video.currentTime=5;});
  await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));
  return presented;
 });
 await page.locator('#native-reference').screenshot({path:out+'/native-display.png'});
 const images={};for(const name of ['reference','candidate']){const bytes=Buffer.from(capture[name].split(',')[1],'base64');await writeFile(out+'/'+name+'.png',bytes);images[name]=PNG.sync.read(bytes);}
 images.native=PNG.sync.read(await readFile(out+'/native-display.png'));
 const nativeComparison={changedPixels:0,max:0,total:0,above1:0,above3:0};
 if(images.native.width!==images.candidate.width||images.native.height!==images.candidate.height)throw Error('Native screenshot dimensions differ');
 for(let i=0;i<images.native.data.length;i+=4){let changed=false;for(let c=0;c<3;c++){const delta=Math.abs(images.native.data[i+c]-images.candidate.data[i+c]);nativeComparison.max=Math.max(nativeComparison.max,delta);nativeComparison.total+=delta;nativeComparison.above1+=delta>1;nativeComparison.above3+=delta>3;changed||=delta>0;}nativeComparison.changedPixels+=changed;}
 nativeComparison.mean=nativeComparison.total/(images.native.width*images.native.height*3);
 const comparison={changedPixels:0,max:0,total:0,above1:0,above3:0};
 for(let i=0;i<images.reference.data.length;i+=4){let changed=false;for(let c=0;c<4;c++){const delta=Math.abs(images.reference.data[i+c]-images.candidate.data[i+c]);comparison.max=Math.max(comparison.max,delta);comparison.total+=delta;comparison.above1+=delta>1;comparison.above3+=delta>3;changed||=delta>0;}comparison.changedPixels+=changed;}
 comparison.mean=comparison.total/images.reference.data.length;
 const stopped=new Promise(resolve=>cdp.once('Tracing.tracingComplete',resolve));await cdp.send('Tracing.end');await stopped;
 const externalTextures=trace.filter(event=>event.name==='CreateExternalTexture');await writeFile(out+'/trace.json',JSON.stringify({traceEvents:trace}));
 const result={metadata:capture.metadata,nativeMetadata,nativeComparison,comparison,externalTextures,serverSnapshot:await(await fetch(origin+'/__metadata')).json()};await writeFile(out+'/result.json',JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify({metadata:capture.metadata,nativeMetadata,nativeComparison,comparison,externalTextures:externalTextures.slice(0,2)}));await page.evaluate(()=>player.destroy());
}finally{await browser?.close();server.kill();}
