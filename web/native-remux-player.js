// Native execution plan. MSE stays in the window; demux/mux and
// bounded source reads use separate workers, so synchronous Wasm AVIO cannot
// block the event loop responsible for completing its reads.
export class RemuxPlayer {
 constructor(video){
  this.video=video;this.timelineBias=1;this.generation=0;this.stopped=false;this.stats={fragments:[],generatedBytes:0,discardedBytes:0,peakQueueDepth:0,bufferedBytesUpperBound:0,peakBufferedBytesUpperBound:0,peakBufferedSeconds:0,seeks:[],sessions:[],errors:[],workers:0};
  this.segments=[];this.sourceStats={};this.remuxStats={};this.timer=setInterval(()=>this.pump(),50);
 }
 async open(source,target=0){
  if(this.source&&(this.source.file!==source.file||this.source.options?.url!==source.options?.url)){this.identity=undefined;this.duration=undefined;}
  this.source=source;return this.restart(target);
 }
 async restart(target){
  if(this.stopped)throw Error('Remux player is destroyed');
  if(!Number.isFinite(target)||target<0||(this.duration!==undefined&&target>=this.duration))throw Error('Seek target out of range');
  const serial=(this.restartSerial??0)+1;this.restartSerial=serial;this.starting=true;
  const rejected=new Set();
  try{
   for(;;){
    this.packagingFailure=false;
    try{return await this.start(target,rejected);}catch(error){
     if(serial!==this.restartSerial||this.stopped)throw error;
     this.stopWorkers();
     if(!this.packagingFailure||!this.mime||rejected.has(this.mime)||rejected.size>=1)throw error;
     rejected.add(this.mime);
    }
   }
  }finally{if(serial===this.restartSerial)this.starting=false;}
 }
 async start(target,rejected=new Set()){
  if(this.stopped)throw Error('Remux player is destroyed');
  const begun=performance.now(),generation=++this.generation;this.stopWorkers();
  this.stats.errors=[];this.stats.seeks.push({target,started:begun});if(this.stats.seeks.length>64)this.stats.seeks.shift();this.target=target;this.targetReady=false;this.lastEviction=-Infinity;this.raps=[];this.busy=true;this.eof=false;this.pending=null;this.receipt=null;this.segments=[];this.sourceStats={};this.remuxStats={};
  this.video.pause();this.video.removeAttribute('src');this.video.load();if(this.objectURL)URL.revokeObjectURL(this.objectURL);
  this.media=new MediaSource();this.objectURL=URL.createObjectURL(this.media);this.video.src=this.objectURL;
  await new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(Error('MSE sourceopen timeout')),10000);this.cancelWait=e=>{clearTimeout(timer);reject(e);};this.media.addEventListener('sourceopen',()=>{clearTimeout(timer);resolve();},{once:true});});
  if(generation!==this.generation)throw new DOMException('Superseded','AbortError');
  this.mailbox=new SharedArrayBuffer(64+262144);this.sourceWorker=new Worker(new URL('./native-remux-source-worker.js',import.meta.url),{type:'module'});this.stats.workers++;
  const ready=await new Promise((resolve,reject)=>{
   const timer=setTimeout(()=>finish(Error('Remux source initialization timed out')),10000);
   const finish=(error,data)=>{clearTimeout(timer);this.cancelWait=null;error?reject(error):resolve(data);};
   this.cancelWait=error=>finish(error);this.watchWorker(this.sourceWorker,generation,'source');this.sourceWorker.onmessage=({data})=>{if(generation!==this.generation)return;if(data.type==='refresh'){Promise.resolve().then(()=>{if(!this.source.refreshAuthorization)throw Error('Authorization refresh unavailable');return this.source.refreshAuthorization(data.resource);}).then(update=>{if(generation===this.generation)this.sourceWorker?.postMessage({type:'refreshed',update});},error=>{if(generation===this.generation)this.sourceWorker?.postMessage({type:'refreshed',error:String(error)});});}if(data.type==='ready')finish(null,data);if(data.type==='stats')this.sourceStats=data.stats;if(data.type==='error'){const message='Source transport: '+data.message;finish(Error(message));this.fail(message);}};
   const {refreshAuthorization,...source}=this.source;this.sourceWorker.postMessage({type:'init',mailbox:this.mailbox,...source,identity:this.identity});
  });
  if(generation!==this.generation)throw new DOMException('Superseded','AbortError');
  this.identity??=ready.identity;this.total=ready.size;this.worker=new Worker(new URL('./native-remux-worker.js',import.meta.url),{type:'module'});this.stats.workers++;this.watchWorker(this.worker,generation,'mux');
  this.cancelWait=null;const session={generation,target,sourceSize:ready.size,firstPlayableMs:null,firstPlayableSourceBytes:null};this.stats.sessions.push(session);if(this.stats.sessions.length>64)this.stats.sessions.shift();
  this.worker.onmessage=({data})=>{
   if(generation!==this.generation){this.stats.discardedBytes+=data.buffer?.byteLength||0;return;}
   if(data.type==='error'){this.fail(data.message);return;}
   if(data.type==='log'){(this.logs??=[]).push(data.message);if(this.logs.length>32)this.logs.shift();return;}
   if(data.stats)this.remuxStats=data.stats;if(data.buffer)this.stats.generatedBytes+=data.buffer.byteLength;
   if(data.type==='negotiate'){
    session.packaging=[];
    for(const candidate of data.candidates){
     const attempt={...candidate};session.packaging.push(attempt);
     if(rejected.has(candidate.mime)){attempt.rejected='Initialization append failed';continue;}
     if(!MediaSource.isTypeSupported(candidate.mime)){attempt.rejected='MSE type unsupported';continue;}
     try{this.sb=this.media.addSourceBuffer(candidate.mime);}
     catch(error){attempt.rejected=String(error);continue;}
     attempt.selected=true;this.mime=candidate.mime;
     this.worker.postMessage({type:'select-container',container:candidate.container});return;
    }
    this.fail('Unsupported MSE packaging for selected codecs');return;
   }
   if(data.type==='ready'){
    try{
     if(target<0||target>=data.duration)throw Error('Seek target out of range');
     if(!MediaSource.isTypeSupported(data.mime))throw Error(`Unsupported MSE ${data.mime}`);
     this.duration=data.duration;this.tracks=data.tracks;this.mime=data.mime;this.media.duration=data.duration+this.timelineBias;this.sb.mode='segments';this.sb.timestampOffset=0;
     this.sb.addEventListener('updateend',()=>{if(generation!==this.generation)return;if(this.receipt){this.receipt.end=this.ranges().at(-1)?.[1]??Infinity;this.receipt=null;}this.busy=false;this.pump();});this.sb.addEventListener('error',()=>{if(generation===this.generation){this.packagingFailure=true;this.fail('MSE SourceBuffer error');}});
     try{this.sb.appendBuffer(data.buffer);}catch(error){this.packagingFailure=error.name!=='QuotaExceededError';throw error;}
    }catch(e){this.fail(String(e));}
   }else if(data.type==='fragment'){
    this.raps.push(...data.raps);if(this.raps.length>256)this.raps.splice(0,this.raps.length-256);
    this.pending=data.buffer;this.eof=!data.more;this.busy=false;this.stats.peakQueueDepth=Math.max(this.stats.peakQueueDepth,1);this.pump();
   }
  };
  this.worker.postMessage({type:'init',mailbox:this.mailbox,size:ready.size,target,videoTrack:this.source.videoTrack,audioTrack:this.source.audioTrack});
  await new Promise((resolve,reject)=>{
   const deadline=performance.now()+20000;const check=()=>{
    if(generation!==this.generation){reject(new DOMException('Superseded','AbortError'));return;}
    if(this.stats.errors.length){reject(Error(this.stats.errors.at(-1)));return;}
    // Initial decoder preroll can leave a short leading gap in the playable range.
    if(this.ranges().some(([a,b])=>a<=target+0.5&&b>target+0.02)){
     this.targetReady=true;this.video.currentTime=target+this.timelineBias;
     session.firstPlayableMs=performance.now()-begun;session.firstPlayableSourceBytes=this.sourceStats.fetchedBytes;
     session.generatedBytes=this.remuxStats.generatedBytes;session.fetchedBytesAtLeastSourceSize=(this.sourceStats.fetchedBytes>=ready.size);
     resolve();return;
    }
    if(performance.now()>deadline){reject(Error('Remux target buffer timeout'));return;}setTimeout(check,20);
   };check();
  });
  return session;
 }
 contains(t){t+=this.timelineBias;const b=this.sb?.buffered;if(!b)return false;for(let i=0;i<b.length;i++)if(t>=b.start(i)&&t<b.end(i))return true;return false;}
 ranges(){const b=this.sb?.buffered;return b?Array.from({length:b.length},(_,i)=>[b.start(i)-this.timelineBias,b.end(i)-this.timelineBias]):[];}
 pump(){
  if(this.stopped||!this.sb||this.busy||this.sb.updating||this.media.readyState!=='open')return;
  try{
   const now=Math.max(this.video.currentTime-this.timelineBias,this.target),ranges=this.ranges();
   const seconds=ranges.reduce((s,[a,b])=>s+b-a,0);this.stats.peakBufferedSeconds=Math.max(this.stats.peakBufferedSeconds,seconds);
   // Evict old complete intervals. Retain three seconds behind playback; browser
   // codec dependencies may keep internal resources beyond the coded ranges.
   // MSE removal can extend through dependent frames to the next RAP. Never
   // remove through the GOP currently decoding; evict at known source RAPs.
   const cut=this.raps.filter(t=>t<=now-3).at(-1);
   if(this.targetReady&&cut!==undefined&&ranges.length&&ranges[0][0]<cut-.001&&cut>this.lastEviction){this.busy=true;this.lastEviction=cut;this.sb.remove(0,cut+this.timelineBias-.00001);this.segments=this.segments.filter(s=>s.end>cut);return;}
   const bufferedBytes=this.segments.reduce((s,v)=>s+v.bytes,0);this.stats.bufferedBytesUpperBound=bufferedBytes;this.stats.peakBufferedBytesUpperBound=Math.max(this.stats.peakBufferedBytesUpperBound,bufferedBytes);
   if(this.pending){
    const buffer=this.pending;this.pending=null;
    if(buffer.byteLength){this.busy=true;this.receipt={bytes:buffer.byteLength,end:Infinity};this.segments.push(this.receipt);this.stats.fragments.push({bytes:buffer.byteLength,at:performance.now(),generation:this.generation});if(this.stats.fragments.length>256)this.stats.fragments.shift();this.sb.appendBuffer(buffer);return;}
   }
   // Account for the same short leading codec-preroll gap admitted by start().
   // Otherwise a sub-millisecond gap can look like zero buffered data while paused
   // and drain the entire source before the media element advances into the range.
   const ahead=ranges.find(([a,b])=>a<=now+0.5&&now<=b)?.[1]-now||0;
   if(ahead<5&&ranges.at(-1)?.[1]>now+12){this.fail('Remux timeline gap exceeds forward buffer budget');return;}
   if(this.eof&&!this.pending){this.media.endOfStream();return;}
   if(!this.eof&&ahead<5&&bufferedBytes<12*1024*1024){this.busy=true;this.worker.postMessage({type:'next'});}
  }catch(e){this.fail(String(e));}
 }
 watchWorker(worker,generation,label){
  const failed=event=>{if(generation!==this.generation||this.stopped)return;event.preventDefault?.();this.fail(`Remux ${label} worker failed: ${event.message||event.type}`);};
  worker.onerror=failed;worker.onmessageerror=failed;
 }
 fail(message){this.stats.errors.push(message);this.cancelWait?.(Error(message));this.cancelWait=null;this.stopWorkers();if(!this.starting)this.onError?.(message);}
 stopWorkers(){
  if(this.worker){(this.stats.cancellations??=[]).push({generatedBytes:this.remuxStats.generatedBytes||0,pendingBytes:this.pending?.byteLength||0,retainedCompressedBytesUpperBound:this.segments.reduce((n,s)=>n+s.bytes,0),sourceFetchedBytes:this.sourceStats.fetchedBytes||0,inFlightOutputUpperBound:8*1024*1024});if(this.stats.cancellations.length>64)this.stats.cancellations.shift();}
  this.cancelWait?.(new DOMException('Superseded','AbortError'));this.cancelWait=null;
  if(this.pending)this.stats.discardedBytes+=this.pending.byteLength;
  if(this.mailbox){const h=new Int32Array(this.mailbox,0,16);Atomics.store(h,4,1);Atomics.store(h,0,3);Atomics.notify(h,0);}
  this.sourceWorker?.postMessage({type:'close'});this.sourceWorker?.terminate();this.worker?.terminate();this.sourceWorker=this.worker=null;this.stats.workers=0;this.sb=null;
 }
 async seek(t){return this.restart(t);}
 async play(){return this.video.play();}
 pause(){this.video.pause();}
 snapshot(){return {stats:structuredClone(this.stats),source:{...this.sourceStats},remux:{...this.remuxStats},ranges:this.ranges(),timelineBias:this.timelineBias,position:Math.max(0,this.video.currentTime-this.timelineBias),quality:this.video.getVideoPlaybackQuality(),readyState:this.video.readyState,logs:this.logs,videoError:this.video.error?.message};}
 async destroy(){this.stopped=true;++this.generation;clearInterval(this.timer);this.stopWorkers();this.video.pause();this.video.removeAttribute('src');this.video.load();if(this.objectURL)URL.revokeObjectURL(this.objectURL);}
}
