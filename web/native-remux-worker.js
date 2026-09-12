import {videoCodecConfig,vp9RemuxConfig} from './video-codec-config.js';
import {remuxPackaging} from './remux-packaging.js';
import createRemux from './engine-remux/remux.mjs';
let engine,chunks=[],bytes=0,emptyBatches=0,negotiation;
const stats={calls:0,remuxMs:0,generatedBytes:0,peakBatchBytes:0,heapBytes:0};
const flush=()=>{const output=new Uint8Array(bytes);let at=0;for(const b of chunks){output.set(b,at);at+=b.length;}chunks=[];bytes=0;stats.generatedBytes+=output.length;stats.peakBatchBytes=Math.max(stats.peakBatchBytes,output.length);return output;};
const check=n=>{if(n<0)throw Error(`FFmpeg error ${n}: ${engine.UTF8ToString(engine._rm_error())}`);return n;};
self.onmessage=async({data})=>{
 try{
  const start=performance.now();
  if(data.type==='init'||data.type==='probe'){
   engine=await createRemux({printErr:message=>postMessage({type:'log',message})});engine.parseVP9=vp9RemuxConfig;engine.io=data.mailbox;engine.raps=[];engine.tracks=[];
   if(data.type==='probe'){check(engine._rm_probe(data.size));postMessage({type:'probed',tracks:engine.tracks,duration:engine._rm_duration()});return;}
   engine.emit=b=>{bytes+=b.length;if(bytes>8*1024*1024)throw Error('Fragment budget exceeded');chunks.push(b);};
   check(engine._rm_open(data.size,data.videoTrack??-1,data.audioTrack??-1));const duration=engine._rm_duration();
   const video=engine.videoConfig?videoCodecConfig({...engine.videoConfig,maxWidth:8192,maxHeight:8192}).configuration.codec:engine.UTF8ToString(engine._rm_video_codec());
   const audio=engine.UTF8ToString(engine._rm_audio_codec());
   const candidates=remuxPackaging(video,audio,engine.container);
   if(!candidates.length)throw Error('Selected codecs have no common browser remux packaging');
   negotiation={candidates,duration,target:data.target||0};stats.remuxMs+=performance.now()-start;
   postMessage({type:'negotiate',candidates,duration});
  }else if(data.type==='select-container'){
   const selected=negotiation?.candidates.find(c=>c.container===data.container);
   if(!selected)throw Error('Invalid remux container selection');
   const {duration,target}=negotiation;negotiation=null;
   check(engine._rm_set_container(selected.container==='webm'?1:0));
   check(engine._rm_start(target));const buffer=flush().buffer;stats.remuxMs+=performance.now()-start;stats.heapBytes=engine.HEAPU8.byteLength;
   postMessage({type:'ready',duration,mime:selected.mime,tracks:engine.tracks,buffer,stats:{...stats}},[buffer]);
  }else if(data.type==='next'){
   const more=check(engine._rm_step()),buffer=flush().buffer;stats.calls++;stats.remuxMs+=performance.now()-start;stats.heapBytes=engine.HEAPU8.byteLength;
   emptyBatches=buffer.byteLength?0:emptyBatches+1;
   if(more&&emptyBatches>24)throw Error('Remux random-access interval exceeds fragment production budget');
   const raps=engine.raps.splice(0);postMessage({type:'fragment',more,buffer,raps,stats:{...stats}},[buffer]);
  }else if(data.type==='close'){engine?._rm_close();postMessage({type:'closed'});close();}
 }catch(e){postMessage({type:'error',message:`${e.message||e}\n${e.stack||''}`});}
};
