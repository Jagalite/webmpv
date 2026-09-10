export type PlayerEvent = {event:string; id?:number; name?:string; data?:unknown; error?:string; [key:string]:unknown};
export type RemoteSource = {url:string;format?:'file'|'hls'|'dash';headers?:Record<string,string>;credentials?:RequestCredentials;allowedOrigins?:string[];immutable?:boolean;refreshAuthorization?:(resource?:{url:string})=>Promise<{url?:string;headers?:Record<string,string>}>};
export type PlayerDiagnostics = {path:'wasm';presentation?:{position?:number;pts?:number[];retained?:number;pending?:number;received?:number;closed?:number};decoder?:'software'|'webcodecs';decoderStats?:Record<string,number|boolean>; rendered:number; heapBytes:number; queuedFrames:number; epoch:number;io?:Record<string,number|string>;seeking?:boolean;position?:number;presentedPosition?:number;ioPending?:boolean;interruptions?:number;renderMs?:number;copyMs?:number};

/** One isolated software engine per player; bounded remote ranges and local File reads; ArrayBuffer inputs remain capped. */
export class WasmPlayer extends EventTarget {
  private worker: Worker;
  private workerOwner: HTMLIFrameElement;
  private audioContext: AudioContext;
  private audioNode?: AudioWorkletNode;
  private analyser?: AnalyserNode;
  private timing?: ReturnType<typeof setInterval>;
  private lastTiming?: {latencyUs:number;running:boolean};
  private nextId = 100;
  private pending = new Map<number,{resolve:()=>void;reject:(error:Error)=>void;timer:ReturnType<typeof setTimeout>}>();
  private destroyed = false;
  private destruction?: Promise<void>;
  private onDestroyed?: () => void;
  private readyTimer?: ReturnType<typeof setTimeout>;
  private rejectReady?: (error:Error)=>void;
  private eventWaiters=new Set<(error:Error)=>void>();
  private hasFile=false;
  private opening=false;
  private refreshAuthorization?:RemoteSource['refreshAuthorization'];
  private audioHeader: Int32Array;
  diagnostics?: PlayerDiagnostics;
  browserCodecsAbsent = false;
  properties = new Map<string, unknown>();
  readonly ready: Promise<void>;

  constructor(canvas:HTMLCanvasElement, {disableBrowserCodecs=false,measureOutput=false,mode='software',softwarePresenter='rgb'}:{disableBrowserCodecs?:boolean;measureOutput?:boolean;mode?:'hybrid'|'software';softwarePresenter?:'rgb'|'experimental-yuv'}={}) {
    super();
    const decoder=mode==='hybrid'?'webcodecs':'software';
    if(!crossOriginIsolated) throw new Error('This player requires a secure, cross-origin isolated page.');
    this.audioContext = new AudioContext({latencyHint:'interactive'});
    // A disposable same-origin owner gives the browser a complete worker-tree
    // teardown boundary, including native pthread workers and decoder resources.
    this.workerOwner=canvas.ownerDocument.createElement('iframe');
    this.workerOwner.hidden=true;this.workerOwner.setAttribute('aria-hidden','true');
    canvas.ownerDocument.body.append(this.workerOwner);
    const owner=this.workerOwner.contentWindow as Window & typeof globalThis;
    try {this.worker = new owner.Worker(new URL(mode==='hybrid'?'../../filter-retained-engine-worker.js?mode=retained':'../../software-full-engine-worker.js',import.meta.url),{type:'module'});}
    catch(error){this.workerOwner.remove();void this.audioContext.close();throw error;}
    const audio = new SharedArrayBuffer(64 + 8192 * 2 * 4);
    this.audioHeader = new Int32Array(audio,0,16);
    this.ready = new Promise<void>((resolve,reject) => {
      this.rejectReady=reject;
      const timeout=this.readyTimer=setTimeout(()=>reject(new Error('Player initialization timed out')),60000);
      this.worker.onerror = event => { clearTimeout(timeout);reject(new Error(event.message));this.fail(new Error(event.message)); };
      this.worker.onmessage = ({data}) => {
        if(data.type==='ready') {clearTimeout(timeout);this.browserCodecsAbsent=data.browserCodecsAbsent;this.sendTiming(true);resolve();}
        else if(data.type==='error') {clearTimeout(timeout);const error=new Error(data.message);reject(error);this.fail(error,data.id);}
        else if(data.type==='destroyed') {if(this.diagnostics){this.diagnostics.decoderStats=data.decoderStats;if(data.presentation)this.diagnostics.presentation=data.presentation;}this.onDestroyed?.();}
        else if(data.type==='refresh'){void this.refreshAuthorization?.(data.resource).then(update=>this.worker.postMessage({type:'refreshed',id:data.id,update}),()=>this.worker.postMessage({type:'refreshed',id:data.id,error:true}));}
        else if(data.type==='output')this.dispatchEvent(new CustomEvent('output',{detail:data.data}));
        else if(data.type==='source')this.dispatchEvent(new CustomEvent('source',{detail:data.info}));
        else if(data.type==='diagnostics') this.diagnostics=data.data;
        else if(data.type==='log') this.dispatchEvent(new CustomEvent('log',{detail:data.message}));
        else if(data.type==='event') {
          const event=data.event as PlayerEvent;
          if(event.event==='start-file') this.hasFile=true;
          if(event.event==='end-file') this.hasFile=false;
          if(event.event==='property-change' && event.name==='track-list' && Array.isArray(event.data))
            event.data=event.data.map(track=>({...track,id:String(track.id)}));
          if(event.event==='command-reply' && event.id) {
            const pending=this.pending.get(event.id);
            if(pending) {clearTimeout(pending.timer);this.pending.delete(event.id);event.error?pending.reject(new Error(event.error)):pending.resolve();}
          }
          if(event.event==='property-change' && event.name) this.properties.set(event.name,event.data);
          this.dispatchEvent(new CustomEvent('mpv',{detail:event}));
        }
      };
      void (async()=>{
        await this.audioContext.audioWorklet.addModule(new URL('../../audio-worklet.js',import.meta.url));
        if(this.destroyed) throw new Error('Player destroyed during initialization');
        this.audioNode=new AudioWorkletNode(this.audioContext,'webmpv-pcm',{numberOfInputs:0,numberOfOutputs:1,outputChannelCount:[2],processorOptions:{buffer:audio,capacity:8192,measureOutput}});
        this.audioNode.port.onmessage=({data})=>{const stamp=this.audioContext.getOutputTimestamp();const wallTime=stamp.performanceTime!==undefined&&stamp.contextTime!==undefined?performance.timeOrigin+stamp.performanceTime+(data.audioFrame/data.sampleRate-stamp.contextTime)*1000:null;this.dispatchEvent(new CustomEvent('output',{detail:{...data,wallTime,stamp}}));};
        this.analyser=this.audioContext.createAnalyser();
        this.audioNode.connect(this.analyser);this.analyser.connect(this.audioContext.destination);
        const response=await fetch(new URL('../../../fixtures/DejaVuSans.ttf',import.meta.url));
        if(!response.ok) throw new Error('Could not load the bundled subtitle font');
        const font=await response.arrayBuffer();
        if(this.destroyed) throw new Error('Player destroyed during initialization');
        const offscreen=canvas.transferControlToOffscreen();
        this.worker.postMessage({type:'init',canvas:offscreen,audio,font,sampleRate:this.audioContext.sampleRate,disableBrowserCodecs,measureOutput,decoder,softwarePresenter,decoderFaultAfter:0},[offscreen,font]);
        this.timing=setInterval(()=>this.sendTiming(),20);
        this.sendTiming();
      })().catch(error=>{clearTimeout(timeout);reject(error);});
    });
  }
  private sendTiming(force=false) {
    if(this.destroyed)return;
    // Fallback latency estimate, explicitly not an independent A/V sync measurement.
    const latency=(this.audioContext.baseLatency||0)+(this.audioContext.outputLatency||0);
    const latencyUs=Math.round(latency*1e6),running=this.audioContext.state==='running';
    if(!force&&this.lastTiming?.latencyUs===latencyUs&&this.lastTiming.running===running)return;
    this.lastTiming={latencyUs,running};
    this.worker.postMessage({type:'timing',latencyUs,running});
  }
  private fail(error:Error,id?:number,report=true) {
    for(const [key,p] of this.pending) if(!id||key===id) {clearTimeout(p.timer);p.reject(error);this.pending.delete(key);}
    if(report)for(const cancel of this.eventWaiters)cancel(error);
    if(report) this.dispatchEvent(new CustomEvent('error',{detail:error.message}));
  }
  private request(message:Record<string,unknown>,transfer:Transferable[]=[]):Promise<void> {
    if(this.destroyed) return Promise.reject(new Error('Player is destroyed'));
    if(this.pending.size>=128) return Promise.reject(new Error('Command queue is full'));
    const id=this.nextId++;
    return new Promise((resolve,reject)=>{
      const timer=setTimeout(()=>{this.pending.delete(id);reject(new Error('Command timed out'));},15000);
      this.pending.set(id,{resolve,reject,timer});
      this.worker.postMessage({...message,id},transfer);
    });
  }
  async open(file:File|ArrayBuffer):Promise<void> {
    if(this.destroyed) throw new Error('Player is destroyed');
    if(this.opening) throw new Error('Another open is in progress');
    this.opening=true;
    try {await this.openLocal(file);} finally {this.opening=false;}
  }
  async openRemote(source:RemoteSource):Promise<void>{
    if(this.destroyed)throw new Error('Player is destroyed');
    if(this.opening)throw new Error('Another open is in progress');
    this.opening=true;
    try{
      await this.ready;
      if(this.hasFile)await Promise.all([this.waitForEvent(e=>e.event==='end-file'),this.command('stop')]);
      else await this.command('stop');
      const {refreshAuthorization,...options}=source;this.refreshAuthorization=refreshAuthorization;
      const loaded=this.waitForEvent(e=>e.event==='file-loaded'||(e.event==='end-file'&&e.reason==='error'?new Error(String(e.file_error)):false));
      await Promise.all([loaded,this.request({type:'open-remote',options,canRefresh:!!refreshAuthorization})]);
    }finally{this.opening=false;}
  }
  private waitForEvent(predicate:(event:PlayerEvent)=>boolean|Error):Promise<void> {
    return new Promise<void>((resolve,reject)=>{
      const finish=(error?:Error)=>{clearTimeout(timeout);this.removeEventListener('mpv',listener);this.eventWaiters.delete(cancel);error?reject(error):resolve();};
      const cancel=(error:Error)=>finish(error);
      const listener=(event:Event)=>{const result=predicate((event as CustomEvent<PlayerEvent>).detail);if(result)finish(result instanceof Error?result:undefined);};
      const timeout=setTimeout(()=>finish(new Error('Media operation timed out')),25000);
      this.eventWaiters.add(cancel);this.addEventListener('mpv',listener);
    });
  }
  private async openLocal(file:File|ArrayBuffer):Promise<void> {
    await this.ready;
    const size=file instanceof File?file.size:file.byteLength;
    if(!(file instanceof File)&&size>32*1024*1024) throw new Error('ArrayBuffer sources are limited to 32 MiB');
    if(this.hasFile) await Promise.all([this.waitForEvent(event=>event.event==='end-file'),this.command('stop')]);
    else await this.command('stop');
    const loaded=this.waitForEvent(event=>event.event==='file-loaded'||(event.event==='end-file'&&event.reason==='error'?new Error(String(event.file_error)):false));
    if(file instanceof File)await Promise.all([loaded,this.request({type:'open-file',file})]);
    else {const bytes=file.slice(0);await Promise.all([loaded,this.request({type:'open',bytes},[bytes])]);}
  }
  async command(...args:string[]):Promise<void> {await this.ready;return this.request({type:'command',args});}
  private async setPause(paused:boolean) {
    if(this.properties.get('pause')===paused){await this.command('set','pause',paused?'yes':'no');return;}
    await Promise.all([this.waitForEvent(e=>e.event==='property-change'&&e.name==='pause'&&e.data===paused),this.command('set','pause',paused?'yes':'no')]);
  }
  async play() {await this.audioContext.resume();this.sendTiming();await this.setPause(false);}
  pause() {return this.setPause(true);}
  seek(seconds:number) {if(!Number.isFinite(seconds)||seconds<0) throw new Error('Invalid seek time');Atomics.store(this.audioHeader,2,0);return this.ready.then(()=>this.request({type:'seek',seconds}));}
  rate(rate:number){if(!Number.isFinite(rate)||rate<0.5||rate>2)throw new Error('Playback rate must be 0.5 to 2');return this.command('set','speed',String(rate));}
  volume(percent:number) {if(!Number.isFinite(percent)||percent<0||percent>100) throw new Error('Invalid volume');return this.command('set','volume',String(percent));}
  selectTrack(type:'audio'|'sub',id:string) {
    if(!['audio','sub'].includes(type)||!/^(?:[1-9][0-9]*|auto|no)$/.test(id)) throw new Error('Invalid track selection');
    return this.command('set',type==='audio'?'aid':'sid',id);
  }
  subtitleVisible(visible:boolean) {return this.command('set','sub-visibility',visible?'yes':'no');}
  resize(width:number,height:number) {if(this.destroyed) throw new Error('Player is destroyed');if(!Number.isInteger(width)||!Number.isInteger(height)||width<1||height<1||width>1920||height>1080) throw new Error('Invalid output dimensions');this.worker.postMessage({type:'resize',width,height});}
  audioDiagnostics() {
    const samples=new Float32Array(this.analyser?.fftSize||2048);
    this.analyser?.getFloatTimeDomainData(samples);
    return {state:this.audioContext.state,sampleRate:this.audioContext.sampleRate,mediaFrames:Atomics.load(this.audioHeader,5),underruns:Atomics.load(this.audioHeader,6),rms:Math.sqrt(samples.reduce((sum,v)=>sum+v*v,0)/samples.length),latencyConfidence:'reported-latency estimate'};
  }
  destroy():Promise<void> {
    if(this.destruction) return this.destruction;
    this.destroyed=true;
    clearTimeout(this.readyTimer);
    this.rejectReady?.(new Error('Player destroyed'));
    for(const cancel of this.eventWaiters) cancel(new Error('Player destroyed'));
    this.fail(new Error('Player destroyed'),undefined,false);
    clearInterval(this.timing);
    Atomics.store(this.audioHeader,2,0);
    this.audioNode?.port.postMessage('close');this.audioNode?.disconnect();this.audioNode?.port.close();this.analyser?.disconnect();
    this.destruction=(async()=>{
      let timeout:ReturnType<typeof setTimeout>;
      try {
        await new Promise<void>((resolve,reject)=>{
          this.onDestroyed=resolve;
          timeout=setTimeout(()=>reject(new Error('Native cleanup timed out; worker containment applied')),10000);
          this.worker.postMessage({type:'destroy'});
        });
      } finally {
        clearTimeout(timeout!);
        this.worker.terminate();
        this.workerOwner.remove();
        await this.audioContext.close();
      }
    })();
    return this.destruction;
  }
}
