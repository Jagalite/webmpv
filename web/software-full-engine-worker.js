let audioChannels=2;
let YUVPresenter,uploader,gpuPauseIntent;
function installPresenter(canvas,prior){
 uploader=new YUVPresenter(canvas);
 if(prior)uploader.stats={...prior,liveTextures:4,contextRestores:(prior.contextRestores||0)+1};
 uploader.onLost=()=>{gpuPauseIntent=paused;internalCommand(['set','pause','yes'],()=>{});post({type:'output',data:{kind:'gpu-context-lost'}});};
 uploader.onRestore=()=>{if(closing)return;const old=uploader,stats={...old.stats};old.destroy(true);const intent=gpuPauseIntent;gpuPauseIntent=undefined;installPresenter(canvas,stats);internalCommand(['set','pause',intent?'yes':'no'],()=>{});force=true;schedulePump(0);post({type:'output',data:{kind:'gpu-context-restored'}});};
}
let decoderWorker,decoderStats;


let engine, canvas, context, timer, audio, pcm, nativeAudio, epoch = -1, forwarded = 0;
let renderMs=0,copyMs=0,maxRenderMs=0;
let rendered = 0, sourceRendered = 0, ticks = 0, force = true, closing = false, presentedPosition=0, frameImage, measureOutput=false, wasWhite=false;
let ioWorker,ioStats,ioReady,ioClose,ioSession=0,pendingTarget=null,restarted=false,position=0;
let internalId=0x80000000,demuxFormat='',seekPrerollSeconds=0;
const internalCommands=new Map();
function internalCommand(args,done){const id=internalId++;internalCommands.set(id,done);submit(id,args);}
const CAPACITY = 8192;
let paused=true,busyUntil=0,pumpFailed=false,nextDiagnostics=0;
function schedulePump(delay=5){
 clearTimeout(timer);if(closing||pumpFailed||!engine)return;
 timer=setTimeout(()=>{
  schedulePump(paused&&pendingTarget===null&&performance.now()>=busyUntil?100:5);
  tick();
 },delay);
}

function releaseSeek(){if(pendingTarget!==null&&restarted&&Math.abs(position-pendingTarget)<0.15){pendingTarget=null;force=true;post({type:'seek-complete',position});}}
async function closeIO(){if(!ioWorker)return;const old=ioWorker;engine._web_io_cancel();await new Promise(resolve=>{ioClose=resolve;old.postMessage({type:'close'});setTimeout(resolve,1500);});old.terminate();ioWorker=null;ioClose=null;engine.ccall('web_io_root',null,['number','string'],[0,'']);}
async function openRemote(data){
  sourceRendered=0;
  await closeIO();
  const pointer=engine._web_io_ptr();
  ioWorker=new Worker(new URL('./io-worker.js',import.meta.url),{type:'module'});
  const info=await new Promise((resolve,reject)=>{
    const timeout=setTimeout(()=>reject(Error('Remote open timed out')),20000);
    ioWorker.onmessage=({data:message})=>{
      if(message.type==='ready'){clearTimeout(timeout);resolve(message.info);}
      else if(message.type==='error'){clearTimeout(timeout);reject(Error(message.message));post({type:'error',id:data.id,message:message.message});}
      else if(message.type==='stats')ioStats=message.stats;
      else if(message.type==='refresh')post({type:'refresh',id:message.id,resource:message.resource});
      else if(message.type==='closed')ioClose?.();
    };
    ioWorker.onerror=event=>{clearTimeout(timeout);reject(Error(event.message));};
    ioWorker.postMessage({type:'init',memory:engine.HEAPU8.buffer,pointer,options:data.options??{},file:data.file,canRefresh:data.canRefresh});
  });
  if(closing)throw Error('Player closed');
  engine._web_io_configure(++ioSession,BigInt(info.size));
  engine.ccall('web_io_root',null,['number','string'],[info.resource??0,info.url??'']);
  post({type:'source',info});submit(data.id,['loadfile','brange://source','replace']);
}
const post = message => self.postMessage(message);
function pumpAudio() {
  // Refresh views after every possible Wasm memory growth.
  const h = engine.HEAPU32;
  const at = nativeAudio >>> 2;
  const nextEpoch = Atomics.load(h, at + 3);
  if (nextEpoch & 1) return;
  if (epoch !== nextEpoch) {
    epoch = nextEpoch;
    forwarded = 0;
    Atomics.store(audio, 2, 0);
    Atomics.store(audio, 0, 0);
    Atomics.store(audio, 3, epoch);
    return;
  }
  if (Atomics.load(audio, 4) !== epoch) return;
  const consumed = Atomics.load(audio, 1) >>> 0;
  Atomics.store(h, at + 7, 0);
  Atomics.store(h, at + 1, consumed);
  Atomics.store(h, at + 7, epoch);
  const written = Atomics.load(h, at);
  const count = (written - forwarded) >>> 0;
  if (Atomics.load(h, at + 3) !== epoch) return;
  if (count > CAPACITY) throw new Error('PCM capacity invariant violated');
  const source = (nativeAudio + 32) >>> 2;
  for (let i = 0; i < count; i++) {
    const index = ((forwarded + i) % CAPACITY) * audioChannels;
    for(let c=0;c<audioChannels;c++)pcm[index+c]=engine.HEAPF32[source+index+c];
  }
  // A reset during the copy discards this batch before publishing it.
  if (Atomics.load(h, at + 3) !== epoch) return;
  forwarded = written;
  Atomics.store(audio, 0, written);
  Atomics.store(audio, 2, pendingTarget===null?Atomics.load(h, at + 2):0);
}
function tick() {
  if (closing) return;
  try {
    pumpAudio();
    for (let i = 0; i < 64; i++) {
      const ptr = engine._web_event();
      if (!ptr) break;
      const event = JSON.parse(engine.UTF8ToString(ptr));
      engine._free(ptr);
      if(event.event==='command-reply'&&internalCommands.has(event.id)){
        const done=internalCommands.get(event.id);internalCommands.delete(event.id);
        if(event.error)throw Error(`Playback configuration failed: ${event.error}`);
        done(event.result);continue;
      }
      if(event.event==='property-change'&&event.name==='pause'){paused=!!event.data;busyUntil=performance.now()+300;}
      if(event.event==='file-loaded'){
        // Configure from mpv's detected format before resolving the host's open.
        internalCommand(['expand-text','${file-format}'],format=>{
          demuxFormat=String(format);seekPrerollSeconds=1;
          internalCommand(['set','hr-seek-demuxer-offset',String(seekPrerollSeconds)],()=>post({type:'event',event}));
        });continue;
      }
      // Let mpv discard obsolete demux packets after this bounded read completes.
      // Interrupting stream_cb read_fn mid-packet returns a truncated packet to FFmpeg.
      // Source replacement/destroy still cancel I/O through closeIO().
      if(event.event==='property-change'&&event.name==='time-pos'){position=event.data;releaseSeek();}
      if(event.event==='playback-restart'){restarted=true;releaseSeek();}
      if(event.event==='log-message')post({type:'log',message:event.prefix+': '+event.text});
      post({type:'event', event});
    }
    if(uploader?.lost)return;
    const renderStart=performance.now();
    const ptr = engine._web_render(canvas.width, canvas.height, +force);
    const renderDuration=performance.now()-renderStart;
    force = false;
    if (ptr && pendingTarget===null) {
      renderMs+=renderDuration;maxRenderMs=Math.max(maxRenderMs,renderDuration);const copyStart=performance.now();
      if(!uploader){
      if(!frameImage||frameImage.width!==canvas.width||frameImage.height!==canvas.height)frameImage=new ImageData(canvas.width,canvas.height);
      const bytes=frameImage.data;bytes.set(engine.HEAPU8.subarray(ptr,ptr+bytes.length));
      for (let i = 3; i < bytes.length; i += 4) bytes[i] = 255;
      context.putImageData(frameImage, 0, 0);
      if(measureOutput){const at=(8*canvas.width+8)*4;const white=bytes[at]>225&&bytes[at+1]>225&&bytes[at+2]>225;if(white&&!wasWhite)post({type:'output',data:{kind:'flash',wallTime:performance.timeOrigin+performance.now(),position}});wasWhite=white;}
      }
      copyMs+=performance.now()-copyStart;engine._web_presented();
      rendered++;sourceRendered++;presentedPosition=position;
    }
    ticks++;
    if(performance.now()>=nextDiagnostics||(ptr&&sourceRendered<=5)){nextDiagnostics=performance.now()+200;post({type:'diagnostics', data:{softwarePresenter:uploader?'experimental-yuv':'rgb',yuv:uploader?{...uploader.stats}:undefined,pumpTicks:ticks,rendered,renderMs,copyMs,maxRenderMs, heapBytes:engine.HEAPU8.byteLength, epoch, path:'wasm', decoder:decoderStats?.active?'webcodecs':'software',decoderStats, demuxFormat,seekPrerollSeconds,presentedPosition, ioPending:(Atomics.load(engine.HEAPU32,engine._web_io_ptr()>>>2)&7)===1, ioSerial:Atomics.load(engine.HEAPU32,(engine._web_io_ptr()>>>2)+1), interruptions:Atomics.load(engine.HEAPU32,(engine._web_io_ptr()>>>2)+14), io:ioStats, seeking:pendingTarget!==null, position, queuedFrames:(Atomics.load(audio,0)-Atomics.load(audio,1))>>>0}});}
  } catch (error) {pumpFailed=true;clearInterval(timer);post({type:'error',message:String(error.stack || error)}); }
}
self.onmessage = async ({data}) => {
  try {
    if (data.type === 'init') {
      if (data.disableBrowserCodecs) for (const name of ['VideoDecoder','AudioDecoder','VideoFrame']) Object.defineProperty(globalThis,name,{value:undefined, configurable:true});
      measureOutput=!!data.measureOutput;
      canvas = data.canvas;
      if(data.softwarePresenter==='experimental-yuv'){({YUVPresenter}=await import('./yuv-presenter.js'));installPresenter(canvas);}else context=canvas.getContext('2d',{alpha:false});
      audio = new Int32Array(data.audio, 0, 16);
      pcm = new Float32Array(data.audio, 64);
      if(data.decoder!=='software')throw Error('This build supports software decoding only');
      const createEngine=(await import(uploader?'./engine-software-yuv/player.mjs':'./engine-software-full/player.mjs')).default;
      engine = await createEngine({printErr:message=>post({type:'log',message}),print:message=>post({type:'log',message})});
      if(uploader){engine.failOutput=message=>{pumpFailed=true;post({type:'error',message});};engine.drawYUV=d=>{try{uploader.draw(engine,d);}catch(e){engine.failOutput(String(e));}};engine.drawRGB=(...a)=>{try{uploader.drawRGB(engine,...a);}catch(e){engine.failOutput(String(e));}};}
      if (closing) return;
      engine.FS.mkdir('/fonts');
      engine.FS.writeFile('/fonts/DejaVuSans.ttf', new Uint8Array(data.font));
      for(const font of data.fonts??[])engine.FS.writeFile('/fonts/'+font.name,new Uint8Array(font.bytes));
      const fontSize=engine.FS.stat('/fonts/DejaVuSans.ttf').size;
      if(Number(fontSize) !== data.font.byteLength) throw new Error('Subtitle font write failed');
      if(data.decoder==='webcodecs'){
        decoderWorker=new Worker(new URL('./browser-decoder-worker.js',import.meta.url),{type:'module'});
        await new Promise((resolve,reject)=>{
          const deadline=setTimeout(()=>reject(Error('Decoder service initialization timed out')),5000);
          decoderWorker.onmessage=({data:message})=>{
            if(message.ready){clearTimeout(deadline);resolve();}
            if(message.stats)decoderStats=message.stats;
            if(message.wakeup&&!closing)engine._web_decoder_wakeup();
            if(message.error)post({type:'log',message:message.error});
          };
          decoderWorker.onerror=error=>{clearTimeout(deadline);reject(Error(error.message));};
          decoderWorker.postMessage({memory:engine.HEAPU8.buffer,pointer:engine._web_decoder_ptr(),disabled:data.disableBrowserCodecs,faultAfter:data.decoderFaultAfter});
        });
        engine._web_decoder_enable(1);
      }
      audioChannels=data.audioChannels??2;
      if(engine._web_audio_configure(audioChannels)<0)throw Error("Invalid output channel count");
      if(engine._web_configure(data.maxDecodePixels??8294400,data.maxAllocationBytes??134217728)<0)throw Error("Invalid decode resource limits");
      const result = engine._web_create(data.sampleRate);
      if (result < 0) throw new Error(`mpv initialization failed: ${result}`);
      nativeAudio = engine._web_audio_ptr();
      schedulePump();
      post({type:'ready', browserCodecsAbsent:['VideoDecoder','AudioDecoder','VideoFrame'].every(name=>typeof globalThis[name]==='undefined')});
    } else if(data.type==='experimental-context-loss'&&uploader){const ext=uploader.gl.getExtension('WEBGL_lose_context');if(!ext)throw Error('Context loss test unavailable');ext.loseContext();setTimeout(()=>{if(!closing)ext.restoreContext();},250);
    } else if (data.type === 'timing' && engine) {
      Atomics.store(engine.HEAPU32, (nativeAudio >>> 2) + 5, data.latencyUs);
      Atomics.store(engine.HEAPU32, (nativeAudio >>> 2) + 6, +data.running);
    } else if (data.type === 'open-remote' || data.type === 'open-file') {await openRemote(data);
    } else if(data.type==='refreshed'){ioWorker?.postMessage(data);
    } else if(data.type==='seek'){sourceRendered=0;pendingTarget=data.seconds;restarted=false;Atomics.store(audio,2,0);submit(data.id,['seek',String(data.seconds),'absolute+exact']);
    } else if (data.type === 'open') {
      sourceRendered=0;
      await closeIO();
      if (data.bytes.byteLength > 32 * 1024 * 1024) throw new Error('M0 local fixture limit is 32 MiB');
      try {engine.FS.unlink('/media.mkv');} catch { /* First open. */ }
      engine.FS.writeFile('/media.mkv', new Uint8Array(data.bytes));
      if(Number(engine.FS.stat('/media.mkv').size) !== data.bytes.byteLength) throw new Error('Local media write failed');
      submit(data.id, ['loadfile','/media.mkv','replace']);
    } else if(data.type==='subtitle'){
      const path='/subtitle-'+data.id+'.'+data.format;
      engine.FS.writeFile(path,new Uint8Array(data.bytes));
      const result=engine.ccall('web_add_subtitle','number',['number','string','string','string','number'],[data.id,path,data.label??'',data.language??'',+data.select]);
      if(result<0)throw Error('Could not add subtitle: '+result);
      busyUntil=performance.now()+300;schedulePump(0);
    } else if (data.type === 'command') {if(uploader?.lost&&data.args[0]==='set'&&data.args[1]==='pause')gpuPauseIntent=data.args[2]==='yes';submit(data.id,data.args);}
    else if (data.type === 'resize') {busyUntil=performance.now()+300;schedulePump(0);canvas.width=data.width;canvas.height=data.height;force=true;}
    else if (data.type === 'destroy') {
      closing = true;
      internalCommands.clear();
      clearInterval(timer);
      if (audio) Atomics.store(audio,2,0);
      await closeIO();
      decoderWorker?.postMessage({type:'cancel'});
      engine?._web_destroy();if(uploader){uploader.destroy();post({type:'output',data:{kind:'yuv-cleanup',...uploader.stats}});}
      // Native joins precede the queued pthread pool-return messages.
      const deadline=performance.now()+2000;
      while(engine?.PThread.runningWorkers.length&&performance.now()<deadline)
        await new Promise(resolve=>setTimeout(resolve,10));
      if(engine?.PThread.runningWorkers.length)throw Error('Native thread cleanup did not settle');
      engine?.PThread.terminateAllThreads();
      decoderWorker?.terminate();decoderWorker=null;
      // Let child termination and queued cleanup run before closing their owner.
      await new Promise(resolve=>setTimeout(resolve,50));
      post({type:'destroyed',decoderStats});
      self.close();
    }
  } catch (error) {post({type:'error',id:data.id,message:String(error.stack || error)});}
};
function submit(id,args) {
  if (!engine || closing) throw new Error('Player is unavailable');
  if (args.length > 4 || !args.length) throw new Error('Invalid command arity');
  busyUntil=performance.now()+300;schedulePump(0);
  const padded = [...args];
  while (padded.length < 4) padded.push(null);
  const result = engine.ccall('web_command_args','number',['number','string','string','string','string'],[id,...padded]);
  if (result < 0) throw new Error(`mpv command failed: ${result}`);
}
