// Isolated compositor experiment; does not change the public Player surface.
import {chromium} from 'playwright';
import {spawn} from 'node:child_process';
import {writeFile,mkdir} from 'node:fs/promises';
import assert from 'node:assert/strict';
const out=`results/playback-performance/track-probe-${new Date().toISOString().replaceAll(':','-')}`;
await mkdir(out,{recursive:true});console.log(out);await writeFile(out+'/config.json',JSON.stringify({candidate:{}}));
const server=spawn(process.execPath,['experiments/playback-performance/serve.mjs',out+'/config.json'],{env:{...process.env,PORT:'0',DEFAULT_MOUNT:'candidate'},stdio:['ignore','pipe','inherit']});
let browser;const result={scope:'Synthetic live-video compositor capability and frame ownership probe; not player qualification'};
try{
 const origin=await new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(Error('Server timeout')),10000);server.once('error',reject);server.stdout.on('data',bytes=>{const match=/http:\/\/127\.0\.0\.1:\d+/.exec(String(bytes));if(match){clearTimeout(timer);resolve(match[0]);}});});
 browser=await chromium.launch({channel:'chrome',headless:true,args:['--autoplay-policy=no-user-gesture-required']});const page=await browser.newPage();await page.goto(origin+'/web/hybrid-performance.html');result.browser=browser.version();
 result.probe=await page.evaluate(async()=>{
  const capability=Object.fromEntries(['MediaStreamTrackGenerator','VideoTrackGenerator','VideoFrame'].map(name=>[name,typeof globalThis[name]]));
  const video=document.createElement('video');video.autoplay=true;video.muted=true;video.width=320;video.height=240;document.querySelector('#surface').replaceChildren(video);
  const track=new MediaStreamTrackGenerator({kind:'video'});video.srcObject=new MediaStream([track]);
  const presented=[];let callback;const observe=(now,metadata)=>{presented.push({now,...metadata});callback=video.requestVideoFrameCallback(observe);};callback=video.requestVideoFrameCallback(observe);
  const code=`onmessage=async({data})=>{try{const writer=data.getWriter();const capability=Object.fromEntries(['MediaStreamTrackGenerator','VideoTrackGenerator','VideoFrame'].map(name=>[name,typeof globalThis[name]]));const records=[];for(let n=0;n<60;n++){const pixels=new Uint8Array(64*48*4);for(let i=0;i<pixels.length;i+=4)pixels.set([n%2?220:30,70,120,255],i);const frame=new VideoFrame(pixels,{format:'RGBA',codedWidth:64,codedHeight:48,timestamp:Math.round((performance.timeOrigin+performance.now())*1000)});const start=performance.now();await writer.write(frame);records.push({n,milliseconds:performance.now()-start,closed:frame.format===null});await new Promise(resolve=>setTimeout(resolve,33));}postMessage({capability,records});}catch(error){postMessage({error:String(error.stack)});}}`;
  const url=URL.createObjectURL(new Blob([code],{type:'text/javascript'})),worker=new Worker(url);
  try{
   const done=new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(Error('Track probe timeout')),15000);worker.onmessage=({data})=>{clearTimeout(timer);data.error?reject(Error(data.error)):resolve(data);};worker.onerror=event=>{clearTimeout(timer);reject(Error(event.message));};});
   worker.postMessage(track.writable,[track.writable]);await video.play();const producer=await done;await new Promise(resolve=>setTimeout(resolve,100));
   const canvas=document.createElement('canvas');canvas.width=64;canvas.height=48;const context=canvas.getContext('2d');context.drawImage(video,0,0,64,48);
   return {capability,producer,presented,quality:video.getVideoPlaybackQuality().toJSON?.()||{totalVideoFrames:video.getVideoPlaybackQuality().totalVideoFrames,droppedVideoFrames:video.getVideoPlaybackQuality().droppedVideoFrames},size:[video.videoWidth,video.videoHeight],pixel:Array.from(context.getImageData(20,20,1,1).data)};
  }finally{video.cancelVideoFrameCallback(callback);video.pause();track.stop();video.srcObject=null;worker.terminate();URL.revokeObjectURL(url);}
 });
 assert.ok(result.probe.producer.records.every(record=>record.closed),'Track must close written frames');assert.ok(result.probe.presented.length>=50,'Compositor should deliver most generated frames');assert.deepEqual(result.probe.size,[64,48]);assert.ok(result.probe.pixel[0]>200);result.passed=true;
}catch(error){result.error=String(error.stack);process.exitCode=1;console.error(error);}
finally{await browser?.close();server.kill();await writeFile(out+'/result.json',JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify({passed:result.passed,error:result.error,capability:result.probe?.capability,worker:result.probe?.producer.capability,presented:result.probe?.presented.length}));}
