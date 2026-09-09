// Experimental Native execution plan. MSE stays in the window; demux/mux and
// bounded source reads use separate workers, so synchronous Wasm AVIO cannot
// block the event loop responsible for completing its reads.
export class RemuxPlayer {
 constructor(video){
  this.video=video;this.generation=0;this.stopped=false;this.stats={fragments:[],generatedBytes:0,discardedBytes:0,peakQueueDepth:0,bufferedBytesUpperBound:0,peakBufferedBytesUpperBound:0,peakBufferedSeconds:0,seeks:[],sessions:[],errors:[],workers:0};
  this.segments=[];this.sourceStats={};this.remuxStats={};this.timer=setInterval(()=>this.pump(),50);
 }
 async open(source,target=0){this.source=source;return this.restart(target);}
 async restart(target){
  const begun=performance.now(),generation=++this.generation;this.stopWorkers();
  this.stats.seeks.push({target,started:begun});if(this.stats.seeks.length>64)this.stats.seeks.shift();this.target=target;this.targetReady=false;this.lastEviction=-Infinity;this.raps=[];this.busy=true;this.eof=false;this.pending=null;this.segments=[];this.sourceStats={};this.remuxStats={};
  this.video.pause();this.video.removeAttribute('src');this.video.load();if(this.objectURL)URL.revokeObjectURL(this.objectURL);
  this.media=new MediaSource();this.objectURL=URL.createObjectURL(this.media);this.video.src=this.objectURL;
  await new Promise((resolve,reject)=>{this.cancelWait=reject;const timer=setTimeout(()=>reject(Error('MSE sourceopen timeout')),10000);this.media.addEventListener('sourceopen',()=>{clearTimeout(timer);resolve();},{once:true});});
  if(generation!==this.generation)throw new DOMException('Superseded','AbortError');
  this.mailbox=new SharedArrayBuffer(64+262144);this.sourceWorker=new Worker('/experiment/source-worker.js',{type:'module'});this.stats.workers++;
  const ready=await new Promise((resolve,reject)=>{
   this.cancelWait=reject;this.sourceWorker.onmessage=({data})=>{if(generation!==this.generation)return;if(data.type==='ready')resolve(data);if(data.type==='stats')this.sourceStats=data.stats;if(data.type==='error'){reject(Error(data.message));this.fail(data.message);}};
   this.sourceWorker.postMessage({type:'init',mailbox:this.mailbox,...this.source});
  });
  if(generation!==this.generation)throw new DOMException('Superseded','AbortError');
  this.total=ready.size;this.worker=new Worker('/experiment/remux-worker.js',{type:'module'});this.stats.workers++;
  this.cancelWait=null;const session={generation,target,sourceSize:ready.size,firstPlayableMs:null,firstPlayableSourceBytes:null};this.stats.sessions.push(session);if(this.stats.sessions.length>64)this.stats.sessions.shift();
  this.worker.onmessage=({data})=>{
   if(generation!==this.generation){this.stats.discardedBytes+=data.buffer?.byteLength||0;return;}
   if(data.type==='error'){this.fail(data.message);return;}
   if(data.type==='log'){(this.logs??=[]).push(data.message);if(this.logs.length>32)this.logs.shift();return;}
   if(data.stats)this.remuxStats=data.stats;if(data.buffer)this.stats.generatedBytes+=data.buffer.byteLength;
   if(data.type==='ready'){
    try{
     if(!MediaSource.isTypeSupported(data.mime))throw Error(`Unsupported MSE ${data.mime}`);
     this.mime=data.mime;this.media.duration=data.duration;this.sb=this.media.addSourceBuffer(data.mime);this.sb.mode='segments';this.sb.timestampOffset=-1;
     this.sb.addEventListener('updateend',()=>{if(generation!==this.generation)return;if(this.receipt){this.receipt.end=this.ranges().at(-1)?.[1]??Infinity;this.receipt=null;}this.busy=false;this.pump();});this.sb.addEventListener('error',()=>this.fail('MSE SourceBuffer error'));
     this.sb.appendBuffer(data.buffer);
    }catch(e){this.fail(String(e));}
   }else if(data.type==='fragment'){
    this.raps.push(...data.raps);if(this.raps.length>256)this.raps.splice(0,this.raps.length-256);
    this.pending=data.buffer;this.eof=!data.more;this.busy=false;this.stats.peakQueueDepth=Math.max(this.stats.peakQueueDepth,1);this.pump();
   }
  };
  this.worker.postMessage({type:'init',mailbox:this.mailbox,size:ready.size,target});
  await new Promise((resolve,reject)=>{
   const deadline=performance.now()+20000;const check=()=>{
    if(generation!==this.generation){reject(new DOMException('Superseded','AbortError'));return;}
    if(this.stats.errors.length){reject(Error(this.stats.errors.at(-1)));return;}
    // Initial decoder preroll can leave a short leading gap in the playable range.
    if(this.contains(target+0.1)){
     this.targetReady=true;this.video.currentTime=target;
     session.firstPlayableMs=performance.now()-begun;session.firstPlayableSourceBytes=this.sourceStats.fetchedBytes;
     session.generatedBytes=this.remuxStats.generatedBytes;session.fullyConsumed=(this.sourceStats.fetchedBytes>=ready.size);
     resolve();return;
    }
    if(performance.now()>deadline){reject(Error('Remux target buffer timeout'));return;}setTimeout(check,20);
   };check();
  });
  return session;
 }
 contains(t){const b=this.sb?.buffered;if(!b)return false;for(let i=0;i<b.length;i++)if(t>=b.start(i)&&t<b.end(i))return true;return false;}
 ranges(){const b=this.sb?.buffered;return b?Array.from({length:b.length},(_,i)=>[b.start(i),b.end(i)]):[];}
 pump(){
  if(this.stopped||!this.sb||this.busy||this.sb.updating||this.media.readyState!=='open')return;
  try{
   const now=Math.max(this.video.currentTime,this.target),ranges=this.ranges();
   const seconds=ranges.reduce((s,[a,b])=>s+b-a,0);this.stats.peakBufferedSeconds=Math.max(this.stats.peakBufferedSeconds,seconds);
   // Evict old complete intervals. Retain three seconds behind playback; browser
   // codec dependencies may keep internal resources beyond the coded ranges.
   // MSE removal can extend through dependent frames to the next RAP. Never
   // remove through the GOP currently decoding; evict at known source RAPs.
   const cut=this.raps.filter(t=>t<=now-3).at(-1);
   if(this.targetReady&&cut!==undefined&&ranges.length&&ranges[0][0]<cut-.001&&cut>this.lastEviction){this.busy=true;this.lastEviction=cut;this.sb.remove(0,cut-.00001);this.segments=this.segments.filter(s=>s.end>cut);return;}
   const bufferedBytes=this.segments.reduce((s,v)=>s+v.bytes,0);this.stats.bufferedBytesUpperBound=bufferedBytes;this.stats.peakBufferedBytesUpperBound=Math.max(this.stats.peakBufferedBytesUpperBound,bufferedBytes);
   if(this.pending){
    const buffer=this.pending;this.pending=null;
    if(buffer.byteLength){this.busy=true;this.receipt={bytes:buffer.byteLength,end:Infinity};this.segments.push(this.receipt);this.stats.fragments.push({bytes:buffer.byteLength,at:performance.now(),generation:this.generation});if(this.stats.fragments.length>256)this.stats.fragments.shift();this.sb.appendBuffer(buffer);return;}
   }
   const ahead=ranges.find(([a,b])=>now>=a&&now<=b)?.[1]-now||0;
   if(!this.eof&&ahead<5&&bufferedBytes<12*1024*1024){this.busy=true;this.worker.postMessage({type:'next'});}
  }catch(e){this.fail(String(e));}
 }
 fail(message){this.stats.errors.push(message);this.stopWorkers();}
 stopWorkers(){
  this.cancelWait?.(new DOMException('Superseded','AbortError'));this.cancelWait=null;
  if(this.pending)this.stats.discardedBytes+=this.pending.byteLength;
  if(this.mailbox){const h=new Int32Array(this.mailbox,0,16);Atomics.store(h,4,1);Atomics.store(h,0,3);Atomics.notify(h,0);}
  this.sourceWorker?.postMessage({type:'close'});this.sourceWorker?.terminate();this.worker?.terminate();this.sourceWorker=this.worker=null;this.stats.workers=0;this.sb=null;
 }
 async seek(t){return this.restart(t);}
 async play(){return this.video.play();}
 pause(){this.video.pause();}
 snapshot(){return {stats:structuredClone(this.stats),source:{...this.sourceStats},remux:{...this.remuxStats},ranges:this.ranges(),position:this.video.currentTime,quality:this.video.getVideoPlaybackQuality(),readyState:this.video.readyState,logs:this.logs,videoError:this.video.error?.message};}
 async destroy(){this.stopped=true;++this.generation;clearInterval(this.timer);this.stopWorkers();this.video.pause();this.video.removeAttribute('src');this.video.load();if(this.objectURL)URL.revokeObjectURL(this.objectURL);}
}
