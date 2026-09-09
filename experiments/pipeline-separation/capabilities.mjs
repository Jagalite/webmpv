// Capability/ownership evidence only; this does not measure hardware decode or playback.
import {chromium} from 'playwright';
import {mkdir,writeFile} from 'node:fs/promises';
import {serve} from './server.mjs';
const out=`results/pipeline-separation/capabilities-${new Date().toISOString().replaceAll(':','-')}`;await mkdir(out,{recursive:true});
const server=await serve(),browser=await chromium.launch({channel:'chrome',headless:true});
try{const page=await browser.newPage();await page.goto(server.origin+'/experiment/page.html');
const result=await page.evaluate(async()=>{
 const mimes=['video/mp4; codecs="avc1.640028,mp4a.40.2"','video/mp4; codecs="hvc1.1.6.L120.B0"','video/mp4; codecs="av01.0.08M.08"','video/mp4; codecs="vp09.00.40.08"','audio/mp4; codecs="opus"','audio/mp4; codecs="ac-3"','audio/mp4; codecs="ec-3"','audio/webm; codecs="vorbis"'];
 const v=document.createElement('video'),caps={userAgent:navigator.userAgent,mseWorker:MediaSource.canConstructInDedicatedWorker,window:{VideoTrackGenerator:typeof VideoTrackGenerator,MediaStreamTrackGenerator:typeof MediaStreamTrackGenerator},mimes:Object.fromEntries(mimes.map(m=>[m,{mse:MediaSource.isTypeSupported(m),direct:v.canPlayType(m)}]))};
 caps.worker=await new Promise(resolve=>{const url=URL.createObjectURL(new Blob([`postMessage({VideoTrackGenerator:typeof VideoTrackGenerator,MediaStreamTrackGenerator:typeof MediaStreamTrackGenerator,VideoDecoder:typeof VideoDecoder,AudioEncoder:typeof AudioEncoder,MediaSource:typeof MediaSource});`],{type:'text/javascript'}));const w=new Worker(url);w.onmessage=e=>{resolve(e.data);w.terminate();URL.revokeObjectURL(url);};});
 if(typeof MediaStreamTrackGenerator==='function'){
 const g=new MediaStreamTrackGenerator({kind:'video'}),writer=g.writable.getWriter(),canvas=new OffscreenCanvas(32,32);canvas.getContext('2d').fillRect(0,0,32,32);const original=new VideoFrame(canvas,{timestamp:123456}),clone=original.clone();
 caps.ownership={before:{original:original.codedWidth,clone:clone.codedWidth},desiredSizeBefore:writer.desiredSize};await writer.write(clone);caps.ownership.after={original:original.codedWidth,clone:clone.codedWidth};v.srcObject=new MediaStream([g]);caps.stream={duration:String(v.duration),seekable:v.seekable.length};original.close();await writer.close();g.stop();v.srcObject=null;
 }
 return caps;
});await writeFile(out+'/result.json',JSON.stringify(result,null,2)+'\n');console.log(out,JSON.stringify(result));}finally{await browser.close();await server.close();}
