import {videoCodecConfig,vp9PacketConfig} from './video-codec-config.js';
let pendingConfiguration;
let packetPrefix,needsKey=true;
const noCopy=true;
// Dedicated service: native decoder pthread waits never block this event loop.
let memory,pointer,header,view,decoder,configuration,queue=[],generation=0,busy=false;
let draining=false,flushed=false,failure=null,submitted=0,consumed=0,lastProgress=0;
let faultAfter=0,disabled=false,copiesInFlight=0;
const copying=new Set(),closed=new WeakSet();
const packetOffset=80,frameOffset=80+8*1024*1024;
// errno values are from the pinned Emscripten WASI ABI.
const AGAIN=-6,EOF=-541478725,IO=-29;
const stats={submitted:0,frames:0,receivedFrames:0,closedFrames:0,peakOutstanding:0,peakFrames:0,resets:0,errors:0,copyMs:0};
const color={bt709:1,bt470bg:5,smpte170m:6,bt2020:9,'bt2020-ncl':9,smpte2084:16,'iec61966-2-1':13};
function closeFrame(frame){if(closed.has(frame))return;closed.add(frame);frame.close();stats.closedFrames++;}
function clear(){generation++;if(decoder&&decoder.state!=='closed')decoder.close();decoder=null;for(const frame of queue)closeFrame(frame);for(const frame of copying)closeFrame(frame);queue=[];draining=flushed=false;submitted=consumed=0;failure=null;}
function configure(){
 if(copiesInFlight)throw Error('Previous copy still pending; use software');
 const current=generation;
 decoder=new VideoDecoder({error:error=>{if(current===generation){failure=String(error);stats.errors++;postMessage({wakeup:true});}},output:frame=>{
  stats.receivedFrames++;
  if(current!==generation){closeFrame(frame);return;}
  // Decode completion may release a reorder burst after decodeQueueSize falls.
  // Stop submitting at eight queued frames; retain bounded burst headroom.
  if(queue.length>=32){closeFrame(frame);failure='Frame queue limit';stats.errors++;return;}
  queue.push(frame);postMessage({wakeup:true});stats.peakFrames=Math.max(stats.peakFrames,queue.length);lastProgress=performance.now();
 }});
 decoder.addEventListener('dequeue',()=>{if(current===generation)postMessage({wakeup:true});});
 needsKey=true;decoder.configure(configuration);lastProgress=performance.now();
}
self.onmessage=({data})=>{
 if(data.type==='cancel'){
  disabled=true;clear();
  if(header){const ticket=Atomics.load(header,0);if((ticket&3)===1){header[3]=IO;Atomics.store(header,0,ticket+1);Atomics.notify(header,0);}}
  postMessage({stats:{...stats,outstanding:0,queued:0,active:false}});
  return;
 }
 memory=data.memory;pointer=data.pointer;header=new Int32Array(memory,pointer,16);view=new DataView(memory,pointer);
 faultAfter=data.faultAfter??0;disabled=!!data.disabled;
 if(typeof Atomics.waitAsync==='function')void (async()=>{
  const channel=new MessageChannel();
  const yieldTask=()=>new Promise(resolve=>{channel.port1.onmessage=resolve;channel.port2.postMessage(0);});
  for(;;){
   void pump();
   const state=Atomics.load(header,0);
   // The native thread can publish its next request before this load. Do not
   // wait for another notification when that request is already ready.
   if((state&3)===1&&!busy){await yieldTask();continue;}
   await Atomics.waitAsync(header,0,state,1000).value;
   await yieldTask();
  }
 })();
 else setInterval(pump,1);
 postMessage({ready:true});
};
async function pump(){
 if(!header)return;
 const ticket=Atomics.load(header,0);if((ticket&3)!==1)return;
 if(busy){
  if(header[2]===5||header[2]===6){clear();header[3]=header[2]===5?0:IO;Atomics.store(header,0,ticket+1);Atomics.notify(header,0);}
  return;
 }
 busy=true;let result=0;
 const operation=header[2],current=generation;
 const valid=()=>Atomics.load(header,0)===ticket;
 try{
  if(operation===1){
   clear();if(disabled||typeof VideoDecoder==='undefined')throw Error('VideoDecoder unavailable');
   const size=header[4],w=header[5],h=header[6];
   if(size<0||size>65536)throw Error('Invalid decoder configuration size');
   const description=new Uint8Array(memory,pointer+packetOffset,size).slice();
   stats.input={kind:header[13]||1,width:w,height:h,profile:header[14],level:header[15],depth:header[8],descriptionBytes:size};
   pendingConfiguration=null;
   if(stats.input.kind===4&&(stats.input.profile<0||!stats.input.depth)){
    pendingConfiguration={...stats.input,description};configuration=null;return;
   }
   const adapted=videoCodecConfig({...stats.input,description,depth:header[8]||8});
   configuration=adapted.configuration;packetPrefix=adapted.prefix;stats.codec=configuration.codec;
   const support=await VideoDecoder.isConfigSupported(configuration);
   if(!valid())return;if(!support.supported)throw Error('Unsupported browser configuration');
   configure();
  }else if(operation===5){clear();}
  else if(operation===6){clear();if(configuration)configure();stats.resets++;}
  else{
   if(failure)throw Error(failure);
   if(!decoder&&pendingConfiguration){
    if(operation===4){result=AGAIN;return;}
    if(operation!==2)throw Error('VP9 source ended before initialization');
    const bytes=new Uint8Array(memory,pointer+packetOffset,header[4]);
    const adapted=videoCodecConfig({...pendingConfiguration,...vp9PacketConfig(bytes)});
    configuration=adapted.configuration;packetPrefix=adapted.prefix;stats.codec=configuration.codec;
    const support=await VideoDecoder.isConfigSupported(configuration);
    if(!valid())return;if(!support.supported)throw Error('Unsupported browser configuration');
    configure();pendingConfiguration=null;
   }
   if(!decoder)throw Error('Decoder is closed');
   if(operation===2){
    if(decoder.decodeQueueSize+queue.length>=8)result=AGAIN;
    else{
     const size=header[4];if(size<1||size>8*1024*1024)throw Error('Packet size limit');
     let bytes=new Uint8Array(memory,pointer+packetOffset,size).slice();
     if(needsKey&&header[7]&&packetPrefix?.length){const joined=new Uint8Array(packetPrefix.length+bytes.length);joined.set(packetPrefix);joined.set(bytes,packetPrefix.length);bytes=joined;}
     const timestamp=view.getFloat64(64,true),duration=view.getFloat64(72,true);
     if(!Number.isSafeInteger(timestamp)||!Number.isSafeInteger(duration)||duration<0)throw Error(`Invalid timestamps: ${timestamp}, duration ${duration}`);
     decoder.decode(new EncodedVideoChunk({type:header[7]?'key':'delta',timestamp,...(duration?{duration}:{}),data:bytes}));
     needsKey=false;submitted++;stats.submitted++;stats.peakOutstanding=Math.max(stats.peakOutstanding,decoder.decodeQueueSize);
    }
   }else if(operation===3){
    draining=true;const epoch=generation;
    decoder.flush().then(()=>{if(epoch===generation){flushed=true;postMessage({wakeup:true});}},error=>{if(epoch===generation){failure=String(error);postMessage({wakeup:true});}});
   }else if(operation===4){
    if(faultAfter&&stats.frames>=faultAfter)throw Error('Injected decoder failure');
    if(queue.length){
     const frame=queue.shift();
     try{
      const actualWidth=frame.visibleRect.width,actualHeight=frame.visibleRect.height;
      stats.actualWidth=actualWidth;stats.actualHeight=actualHeight;stats.pixelFormat=frame.format;
      const w=noCopy?2:actualWidth,h=noCopy?2:actualHeight;
      if((!noCopy&&!['I420','NV12'].includes(frame.format))||actualWidth<1||actualHeight<1||actualWidth>1920||actualHeight>1080||w<1||h<1||w>1920||h>1080||(w&1)||(h&1))throw Error('Unsupported decoded frame');
      const nv12=frame.format==='NV12';
      const layout=nv12?[{offset:0,stride:w},{offset:w*h,stride:w}]:[{offset:0,stride:w},{offset:w*h,stride:w/2},{offset:w*h*5/4,stride:w/2}];
      if(!noCopy){
      const bytes=new Uint8Array(w*h*3/2),started=performance.now();
      copying.add(frame);copiesInFlight++;
      try{await frame.copyTo(bytes,{layout,rect:frame.visibleRect});}
      finally{copiesInFlight--;copying.delete(frame);}
      stats.copyMs+=performance.now()-started;
      if(!valid()||current!==generation)return;
      new Uint8Array(memory,pointer+frameOffset,bytes.length).set(bytes);
      stats.pixelCopies=(stats.pixelCopies??0)+1;
      }else{
       new Uint8Array(memory,pointer+frameOffset,6).set([16,16,16,16,128,128]);
       stats.placeholderFrames=(stats.placeholderFrames??0)+1;
      }
      header[5]=w;header[6]=h;header[8]=+nv12;
      header[9]=color[frame.colorSpace.primaries]??2;header[10]=color[frame.colorSpace.transfer]??2;
      header[11]=color[frame.colorSpace.matrix]??2;header[12]=+!!frame.colorSpace.fullRange;
      view.setFloat64(64,frame.timestamp,true);view.setFloat64(72,frame.duration??0,true);
      postMessage({retainedFrame:frame,pts:frame.timestamp,generation},[frame]);
      stats.transferredFrames=(stats.transferredFrames??0)+1;
      consumed++;stats.frames++;lastProgress=performance.now();result=1;
     }finally{closeFrame(frame);}
    }else if(draining)result=flushed?EOF:0;
    else result=decoder.decodeQueueSize+queue.length>=8?0:AGAIN;
    if(!queue.length&&(draining||decoder.decodeQueueSize>=8)&&submitted>consumed&&performance.now()-lastProgress>3000)throw Error('Decoder output watchdog');
   }else throw Error('Unknown decoder operation');
  }
 }catch(error){failure=String(error);stats.errors++;result=IO;postMessage({error:failure});}
 finally{
  if(valid()){header[3]=result;Atomics.store(header,0,ticket+1);Atomics.notify(header,0);}
  if(operation!==4||stats.frames%30===0)postMessage({stats:{...stats,outstanding:decoder?.decodeQueueSize??0,queued:queue.length,active:!!decoder}});
  busy=false;
 }
}
