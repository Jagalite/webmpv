import {PLAYBACK_MODES} from './types.js';
import {nativeRejection} from './internal/selection.js';
import type {Probe, SelectionAttempt} from './internal/selection.js';
import type {AudioOutput, ToneMapping, FontAsset, SubtitleAsset, SubtitleOptions, ResourceLimits, MediaInputOptions, PlaybackMode, PlayerOptions, RemoteSource, TextTrackSource, Capabilities, Diagnostics, TrackType, PlaybackEvent} from './types.js';
import type {Backend, Session} from './internal/backend.js';

type Source = {kind: 'local'; file: File | ArrayBuffer; input?: MediaInputOptions} | {kind: 'remote'; options: RemoteSource & {identity?: {size: string; etag?: string}}};
type Settings = {pause: boolean; volume: number; speed: number; aid: string; sid: string; subtitles: boolean; vf: string; af: string};
const filterChain = (value: string) => {
  if (typeof value !== 'string' || value.length > 4096 || value.includes('\0')) throw new Error('Invalid filter chain');
  return value.trim();
};
const terminalSourceFailure = (error: unknown) => /Source transport:|representation changed|changed length|origin is not allowed|Authorization refresh|HTTP (?:401|403)|received (?:401|403)/i.test(String(error));
const modeValue = (mode: PlaybackMode) => {
  if (!PLAYBACK_MODES.includes(mode)) throw new Error('Mode must be native, hybrid or software');
  return mode;
};
const dimensions = (width: number, height: number) => {
  if (!Number.isInteger(width) || !Number.isInteger(height) || width < 1 || height < 1 || width > 1920 || height > 1080) throw new Error('Output dimensions must be within 1920×1080');
};

/** Three explicit playback modes. Mode/filter changes reopen transactionally. */
export class Player extends EventTarget {
  readonly ready = Promise.resolve();
  private currentMode: PlaybackMode;
  private automatic: boolean;
  private attempts: SelectionAttempt[] = [];
  private inspection?: AbortController;
  private recovering = false;
  private lifetime = new AbortController();
  private recoveredSessions = new WeakSet<Session>();
  private nativeRemux: 'auto' | 'never' | 'always';
  private softwarePresenter: 'rgb' | 'experimental-yuv';
  private settings: Settings;
  private audioOutput: AudioOutput;
  private audioFallback: 'stereo' | 'reject';
  private toneMapping: ToneMapping;
  private resourceLimits: ResourceLimits;
  private fonts: FontAsset[] = [];
  private subtitleAssets: SubtitleAsset[] = [];
  private root: HTMLDivElement;
  private width: number;
  private height: number;
  private current?: Session;
  private candidate?: Session;
  private source?: Source;
  private nativeTracks: TextTrackSource[] = [];
  private queue: Promise<void> = Promise.resolve();
  private queued = 0;
  private destroyed = false;
  private destruction?: Promise<void>;
  private busy = false;
  private empty = new Map<string, unknown>();
  private monitor?: ReturnType<typeof setInterval>;

  constructor(container: HTMLElement, options: PlayerOptions = {}) {
    super();
    if (!(container instanceof HTMLElement) || container instanceof HTMLCanvasElement || container instanceof HTMLVideoElement) throw new Error('Pass a container element; Player owns its video/canvas surface');
    this.currentMode = modeValue(options.mode ?? 'native');
    this.automatic = options.automaticSelection ?? options.mode === undefined;
    if(typeof this.automatic !== 'boolean')throw Error('Invalid automatic selection policy');
    this.audioOutput=options.audioOutput??'stereo';this.audioFallback=options.audioFallback??'stereo';
    this.toneMapping=options.toneMapping??'off';
    if(!['stereo','5.1','7.1','auto'].includes(this.audioOutput)||!['stereo','reject'].includes(this.audioFallback))throw Error('Invalid audio output policy');
    if(!['off','hdr-to-sdr'].includes(this.toneMapping))throw Error('Invalid tone mapping policy');
    this.resourceLimits={maxDecodePixels:options.resourceLimits?.maxDecodePixels??8294400,maxAllocationBytes:options.resourceLimits?.maxAllocationBytes??134217728};
    if(!Number.isInteger(this.resourceLimits.maxDecodePixels)||this.resourceLimits.maxDecodePixels!<1||this.resourceLimits.maxDecodePixels!>8294400||!Number.isInteger(this.resourceLimits.maxAllocationBytes)||this.resourceLimits.maxAllocationBytes!<33554432||this.resourceLimits.maxAllocationBytes!>268435456)throw Error('Invalid decode resource limits');
    this.nativeRemux=options.nativeRemux ?? 'auto';
    this.softwarePresenter=options.softwarePresenter??'rgb';
    if(!['rgb','experimental-yuv'].includes(this.softwarePresenter))throw Error('Invalid software presenter');
    if(!['auto','never','always'].includes(this.nativeRemux))throw Error('Invalid native remux policy');
    this.width = options.width ?? 640;this.height = options.height ?? 360;dimensions(this.width, this.height);
    this.settings = {pause: true, volume: 100, speed: 1, aid: 'auto', sid: 'auto', subtitles: true, vf: filterChain(options.videoFilters ?? ''), af: filterChain(options.audioFilters ?? '')};
    if(this.automatic&&(this.settings.vf||this.settings.af||this.toneMapping!=='off'))this.currentMode='software';
    this.validateFilters(this.currentMode, this.settings);
    this.root = document.createElement('div');this.root.className = 'webmpv-player';container.append(this.root);
  }
  get mode() {return this.currentMode;}
  get automaticSelection() {return this.automatic;}
  get surface() {return this.current?.surface;}
  get properties(): ReadonlyMap<string, unknown> {return this.current?.backend.properties ?? this.empty;}
  get capabilities(): Capabilities {
    return {videoFilters: this.automatic || this.mode === 'software', audioFilters: this.automatic || this.mode === 'software', mpvSubtitles: this.mode !== 'native', externalTextTracks: this.mode === 'native', externalSubtitles: this.automatic || this.mode !== 'native', customFonts: this.automatic || this.mode !== 'native', customRequestHeaders: this.mode !== 'native' || (this.nativeRemux !== 'never' && crossOriginIsolated && typeof MediaSource !== 'undefined')};
  }
  get diagnostics(): Diagnostics {
    return {mode: this.mode, selection:{automatic:this.automatic,attempts:this.attempts.map(a=>({...a}))}, switching: this.busy, videoFilters: this.settings.vf, audioFilters: this.settings.af, toneMapping:this.toneMapping, resourceLimits:{...this.resourceLimits}, backend: this.current?.backend.diagnostics as Record<string, unknown> | undefined};
  }
  audioDiagnostics() {return this.current?.backend.audioDiagnostics();}
  private emit(type: string, detail: unknown) {this.dispatchEvent(new CustomEvent(type, {detail}));}
  private validateFilters(mode: PlaybackMode, settings: Settings) {
    if (mode !== 'software' && (settings.vf || settings.af || this.toneMapping!=='off')) throw new Error('Filters require software mode. Clear filters before leaving software mode.');
  }
  private enqueue(operation: () => Promise<void>): Promise<void> {
    if (this.destroyed) return Promise.reject(new Error('Player is destroyed'));
    if (this.queued >= 32) return Promise.reject(new Error('Player operation queue is full'));
    this.queued++;
    const result = this.queue.then(() => {if (this.destroyed) throw new Error('Player is destroyed');return operation();});
    this.queue = result.catch(() => {}).finally(() => {this.queued--;});return result;
  }
  private async interruptible<T>(work: Promise<T>): Promise<T> {
    const signal=this.lifetime.signal;
    if(signal.aborted)throw Error('Player is destroyed');
    let cancel!: () => void;
    try{return await Promise.race([work,new Promise<never>((_,reject)=>{
      cancel=()=>reject(Error('Player is destroyed'));signal.addEventListener('abort',cancel,{once:true});
    })]);}finally{signal.removeEventListener('abort',cancel);}
  }
  private async dispose(session?: Session) {
    if (!session) return;
    try {await session.backend.destroy();} finally {session.surface.remove();}
  }
  private async create(mode: PlaybackMode): Promise<Session> {
    let backend: Backend;
    const surface = document.createElement(mode === 'native' ? 'video' : 'canvas');
    surface.width = this.width;surface.height = this.height;
    surface.style.cssText = 'display:none;width:100%;background:#000';
    // Import before allocating workers; destroy during import cannot orphan an engine.
    const module = mode === 'native' ? await this.interruptible(import('./internal/native-player.js')) : await this.interruptible(import('./internal/wasm-player.js'));
    if (this.destroyed) throw new Error('Player is destroyed');
    this.root.append(surface);
    try {
      backend = 'NativePlayer' in module ? new module.NativePlayer(surface as HTMLVideoElement, this.nativeRemux) : new module.WasmPlayer(surface as HTMLCanvasElement, {mode: mode as 'hybrid' | 'software',softwarePresenter:this.softwarePresenter,audioOutput:this.audioOutput,audioFallback:this.audioFallback,resourceLimits:this.resourceLimits,fonts:this.fonts});
    } catch (error) {surface.remove();throw error;}
    const session: Session = {backend, surface};
    for (const type of ['mpv', 'error', 'log', 'output', 'source']) backend.addEventListener(type, event => {
      const detail = (event as CustomEvent).detail;
      if (type === 'error') session.error = new Error(String(detail));
      if (type === 'mpv' && detail.event === 'end-file' && detail.reason === 'error') session.error = new Error(String(detail.file_error));
      if (this.current === session && !this.busy && !this.destroyed) {
        if(session.error&&(type==='error'||(type==='mpv'&&detail.event==='end-file'))&&this.automatic&&this.mode!=='software'){this.recover(session);return;}
        this.emit(type, detail);
      }
    });
    return session;
  }
  private async settled(session: Session, mode: PlaybackMode, target: number) {
    if (mode === 'native') return;
    const deadline = performance.now() + 25000;
    while (performance.now() < deadline) {
      if (this.destroyed) throw new Error('Player is destroyed');
      if (session.error) throw session.error;
      const d = session.backend.diagnostics as {rendered?: number; seeking?: boolean; decoder?: string; presentation?: {position?: number}; presentedPosition?: number} | undefined;
      const tracks = session.backend.properties.get('track-list') as Array<{type: string; codec?: string; selected?: boolean}> | undefined;
      // Selection is transiently empty while mpv initializes a video track.
      const hasVideo = tracks?.some(t => t.type === 'video');
      if (hasVideo === false && tracks?.length) return;
      if (mode === 'hybrid' && tracks?.some(t => t.type === 'video' && t.selected && !['h264','hevc','vp8','vp9','av1'].includes(t.codec ?? ''))) throw new Error('Hybrid mode has no browser bridge for this video codec. Choose software mode for this source.');
      const position = mode === 'hybrid' ? d?.presentation?.position : d?.presentedPosition;
      if (d?.rendered && (mode !== 'hybrid' || d.decoder === 'webcodecs') && !d.seeking && position !== undefined && Math.abs(position - target) < .15) return;
      await new Promise(resolve => setTimeout(resolve, 25));
    }
    throw new Error(`${mode} mode did not present the requested position`);
  }
  private async replace(source: Source, mode: PlaybackMode, settings: Settings, preserve: boolean, nativeTracks: TextTrackSource[], requestedTarget?: number) {
    this.validateFilters(mode, settings);
    const attachments=preserve?this.subtitleAssets:[];
    if(mode==='native'&&attachments.length)throw Error('External mpv subtitles require Hybrid or Software');
    if(mode==='native'&&this.audioOutput!=='stereo')throw Error('Explicit PCM output layout requires Hybrid or Software');
    if (source.kind === 'local' && source.file instanceof ArrayBuffer && source.file.byteLength > 32 * 1024 * 1024) throw new Error('ArrayBuffer sources are limited to 32 MiB');
    const old = this.current;
    const wasPaused = this.settings.pause;
    const desired = {...settings, pause: preserve ? !!wasPaused : true};
    const target = requestedTarget ?? (preserve ? Math.max(0, Number(old?.backend.properties.get('time-pos')) || 0) : 0);
    if ((!preserve && old) || (preserve && (mode === 'native') !== (this.mode === 'native'))) {desired.aid = preserve&&settings.aid==='no'?'no':'auto';desired.sid = preserve&&settings.sid==='no'?'no':'auto';}
    const crossing=preserve&&this.automatic&&(mode==='native')!==(this.mode==='native');
    const trackIndexes=new Map<TrackType,number>();
    if(crossing){
      for(const type of ['audio','sub'] as const){
        const id=settings[type==='audio'?'aid':'sid'];
        if(['auto','no'].includes(id))continue;
        const list=old?.backend.properties.get('track-list') as Array<{id:string|number;type:string;'ff-index'?:number}>|undefined;
        const track=list?.find(t=>t.type===type&&String(t.id)===id);
        const index=this.mode==='native'&&(old?.backend.diagnostics as {plan?:string})?.plan==='remux'?Number(id)-1:track?.['ff-index'];
        if(index===undefined)throw Error('Cannot preserve selected track across playback modes');
        trackIndexes.set(type,index);
      }
    }
    this.busy = true;this.emit('modechange', {phase: 'loading', mode});
    let candidate: Session | undefined;
    try {
      if (old && !old.error) await old.backend.pause();
      candidate = this.candidate = await this.create(mode);const p = candidate.backend;await p.ready;
      if (this.destroyed) throw new Error('Player is destroyed');
      const tone=this.toneMapping==='hdr-to-sdr'?'zscale=transfer=linear:npl=100,format=gbrpf32le,zscale=primaries=bt709,tonemap=tonemap=mobius:desat=0,zscale=transfer=bt709:matrix=bt709:range=limited,format=yuv420p':'';
      const vf=[tone?`lavfi=[${tone}]`:'',desired.vf].filter(Boolean).join(',');
      if(vf)await p.command!('set','vf',vf);
      if (desired.af) await p.command!('set', 'af', desired.af);
      await p.volume(desired.volume);await p.rate(desired.speed);
      // Native numeric track IDs only exist after metadata/text-track loading.
      if (mode !== 'native') {await p.selectTrack('audio', desired.aid);await p.selectTrack('sub', desired.sid);await p.subtitleVisible(desired.subtitles);}
      if (source.kind === 'local') await p.open(source.file,source.input);else await p.openRemote(source.options);
      if(mode!=='native'){for(const subtitle of attachments)await p.addSubtitle!(subtitle);if(attachments.length&&desired.sid!=='auto')await p.selectTrack('sub',desired.sid);}
      if (mode === 'native') {
        for (const track of nativeTracks) await p.addTextTrack!(track);
        await p.selectTrack('audio', desired.aid);await p.selectTrack('sub', desired.sid);await p.subtitleVisible(desired.subtitles);
      }
      for(const [type,index] of trackIndexes){
        const list=p.properties.get('track-list') as Array<{id:string|number;type:string;'ff-index'?:number}>|undefined;
        const track=list?.find(t=>t.type===type&&(mode==='native'?(p.diagnostics as {plan?:string})?.plan==='remux'&&Number(t.id)-1===index:t['ff-index']===index));
        if(!track)throw Error('Cannot preserve selected track across playback modes');
        const id=String(track.id);await p.selectTrack(type,id);desired[type==='audio'?'aid':'sid']=id;
      }
      await this.settled(candidate, mode, 0);
      if (target > 0) {await p.seek(target);await this.settled(candidate, mode, target);}
      if (candidate.error) throw candidate.error;
      if (!desired.pause) await p.play();
      if (this.destroyed) throw new Error('Player is destroyed');
      this.current = candidate;this.candidate = undefined;this.source = source;this.currentMode = mode;this.settings = desired;this.nativeTracks = nativeTracks;if(!preserve)this.subtitleAssets=[];
      candidate.surface.style.display = 'block';if (old) old.surface.style.display = 'none';
      clearInterval(this.monitor);
      let inactiveSamples = 0;
      if (mode === 'hybrid') this.monitor = setInterval(() => {
        const d = p.diagnostics as {decoder?: string} | undefined;
        const hasVideo = (p.properties.get('track-list') as Array<{type: string; selected?: boolean}> | undefined)?.some(t => t.type === 'video' && t.selected);
        inactiveSamples = hasVideo && !this.busy && this.queued === 0 && d?.decoder === 'software' ? inactiveSamples + 1 : 0;
        if (inactiveSamples >= 4) {
          clearInterval(this.monitor);
          if(this.automatic){candidate!.error=new Error('Hybrid browser decoder became inactive for four consecutive checks');this.recover(candidate!);return;}
          this.settings.pause = true;void p.pause().catch(() => {});this.emit('error', 'Hybrid decoder stopped. Reopen in software mode.');
        }
      }, 250);
      // The new session is committed. Cleanup failures must not pretend to roll it back.
      try {await this.dispose(old);} catch (error) {this.emit('error', `Previous player cleanup: ${String(error)}`);}
      for (const [name, data] of p.properties) this.emit('mpv', {event: 'property-change', name, data} satisfies PlaybackEvent);
      this.emit('mpv', {event: 'file-loaded'});this.emit('modechange', {phase: 'ready', mode, position: target});
    } catch (error) {
      if (candidate && candidate !== this.current) await this.dispose(candidate).catch(() => {});
      this.candidate = undefined;
      if (old && !old.error && this.current === old && !wasPaused && !this.destroyed) await old.backend.play().catch(() => {});
      this.emit('modechange', {phase: 'failed', mode, rolledBack: this.current === old, message: String(error)});
      throw error;
    } finally {this.busy = false;}
  }
  private record(attempt: SelectionAttempt){
    this.attempts.push(attempt);if(this.attempts.length>32)this.attempts.shift();
    this.emit('selectionchange',{...attempt});
  }
  private async select(source: Source, settings: Settings, preserve: boolean, tracks: TextTrackSource[], start=0, target?: number, priorAttempts:SelectionAttempt[]=[]){
    if(!this.automatic)return this.replace(source,this.mode,settings,preserve,tracks,target);
    this.attempts=[];
    for(const attempt of priorAttempts)this.record(attempt);
    let nativeReason: string | undefined;
    if(start===0&&!(settings.vf||settings.af||this.toneMapping!=='off')){
      if((source.kind==='local'&&source.input?.demuxer)||(source.kind==='remote'&&(source.options.demuxer||(source.options.format&&source.options.format!=='file')))){
        nativeReason='Manifest track requirements require mpv inspection';
      }else{
        const controller=this.inspection=new AbortController();
        try{
          let probe:Probe|undefined;
          // Immutable local bytes permit bounded inspection without an engine download.
          // Remote identity/permission enforcement continues through the existing inspector.
          if(source.kind==='local'&&this.nativeRemux!=='always'){
            const {cheapMP4Probe}=await this.interruptible(import(new URL('../cheap-mp4-probe.js',import.meta.url).href));
            const local=source.file instanceof File?source.file:new File([source.file],'media');
            const cheap=await cheapMP4Probe(local,controller.signal,document.createElement('video'));
            probe=cheap.probe;
            this.record({mode:'probe',outcome:probe?'selected':'skipped',reason:`Local MP4 metadata: ${cheap.bytesRead} bytes; ${probe?'no inspector Wasm required':cheap.reason}`});
          }
          if(this.destroyed)throw Error('Player is destroyed');
          const transport=source.kind==='local'?{file:source.file instanceof File?source.file:new File([source.file],'media')}:(()=>{const {refreshAuthorization,...options}=source.options;return {options:{...options,url:new URL(options.url,location.href).href},refreshAuthorization};})();
          if(!probe){
            const {probeSource}=await this.interruptible(import(new URL('../source-probe.js',import.meta.url).href));
            probe=await probeSource(transport,controller.signal);
          }
          if(!probe)throw Error('Source inspection returned no metadata');
          if(source.kind==='remote'&&probe.identity)source.options.identity??=probe.identity;
          // Cross-mode track IDs reset to auto in replace(); preflight that same selection.
          let aid=preserve&&(this.mode==='native'||settings.aid==='no')?settings.aid:'auto';
          const sid=tracks.length?'no':preserve&&(this.mode==='native'||settings.sid==='no')?settings.sid:'auto';
          if(preserve&&this.mode==='native'&&(this.current?.backend.diagnostics as {plan?:string})?.plan==='remux'&&!['auto','no'].includes(aid))aid=probe.tracks.find(t=>t.type==='audio'&&t.index===Number(aid)-1)?.id??aid;
          nativeReason=nativeRejection(probe,{...settings,aid,sid},document.createElement('video'));
        }catch(error){
          if(this.destroyed||terminalSourceFailure(error))throw error;
          nativeReason='Native eligibility could not be established: '+String(error);
          this.record({mode:'probe',outcome:'failed',reason:String(error)});
        }finally{controller.abort();if(this.inspection===controller)this.inspection=undefined;}
      }
    }
    const errors:string[]=[];
    for(const mode of PLAYBACK_MODES.slice(start)){
      if(this.destroyed)throw Error('Player is destroyed');
      const reason=(settings.vf||settings.af||this.toneMapping!=='off')&&mode!=='software'?'CPU filters or tone mapping require Software':mode==='native'?(preserve&&this.subtitleAssets.length?'External mpv subtitles require mpv':this.audioOutput!=='stereo'?'Explicit PCM layout requires mpv':nativeReason):tracks.length?'External browser text tracks cannot be silently discarded':undefined;
      if(reason){this.record({mode,outcome:'skipped',reason});continue;}
      try{await this.replace(source,mode,settings,preserve,tracks,target);this.record({mode,outcome:'selected',reason:'Playback requirements and actual presentation accepted'});if(this.current?.error&&!this.recovering)this.recover(this.current);return;}
      catch(error){if(this.destroyed||terminalSourceFailure(error))throw error;errors.push(`${mode}: ${String(error)}`);this.record({mode,outcome:'failed',reason:String(error)});}
    }
    throw Error('No playback route satisfied the source: '+(errors.join('; ')||this.attempts.map(a=>a.reason).join('; ')));
  }
  private recover(session: Session){
    if(this.recovering||this.recoveredSessions.has(session)||this.destroyed||!this.automatic||!this.source||this.mode==='software')return;
    this.recoveredSessions.add(session);
    if(terminalSourceFailure(session.error)){void session.backend.pause().catch(()=>{});this.emit('error',String(session.error));return;}
    this.recovering=true;
    void this.enqueue(async()=>{
      if(this.current!==session||!this.automatic)return;
      await session.backend.pause().catch(()=>{});
      const policy=this.nativeRemux;
      const tryRemux=this.mode==='native'&&(session.backend.diagnostics as {plan?:string})?.plan==='direct'&&policy!=='never';
      const priorAttempts:SelectionAttempt[]=[...this.attempts.filter(attempt=>attempt.outcome!=='selected'),{mode:this.mode,outcome:'failed',reason:`Runtime playback failure: ${session.error?.message??'Playback backend became unavailable'}`}];
      try{
        if(tryRemux)this.nativeRemux='always';
        await this.select(this.source!,this.settings,true,this.nativeTracks,tryRemux?0:PLAYBACK_MODES.indexOf(this.mode)+1,undefined,priorAttempts);
      }finally{this.nativeRemux=policy;}
    }).catch(error=>{if(!this.destroyed)this.emit('error',String(error));}).finally(()=>{this.recovering=false;if(this.current?.error&&this.current!==session)this.recover(this.current);});
  }
  setAutomaticSelection(enabled=true){
    if(typeof enabled!=='boolean')throw Error('Invalid automatic selection policy');
    return this.enqueue(async()=>{
      const previous=this.automatic;this.automatic=enabled;
      try{if(enabled&&this.source)await this.select(this.source,this.settings,true,this.nativeTracks);}
      catch(error){this.automatic=previous;throw error;}
    });
  }
  open(file: File | ArrayBuffer, input:MediaInputOptions={}) {
    if (!(file instanceof File) && !(file instanceof ArrayBuffer)) return Promise.reject(new Error('Expected File or ArrayBuffer'));
    if (file instanceof ArrayBuffer && file.byteLength > 32 * 1024 * 1024) return Promise.reject(new Error('ArrayBuffer sources are limited to 32 MiB; use File for larger sources'));
    const source: Source = {kind: 'local', file: file instanceof File ? file : file.slice(0), input:{...input}};
    return this.enqueue(() => this.select(source, this.settings, false, []));
  }
  openRemote(options: RemoteSource) {
    const source: Source = {kind: 'remote', options: {...options, streaming:options.streaming?{...options.streaming}:undefined, headers: options.headers ? {...options.headers} : undefined, allowedOrigins: options.allowedOrigins?.slice()}};
    return this.enqueue(() => this.select(source, this.settings, false, []));
  }
  setMode(mode: PlaybackMode) {
    modeValue(mode);
    return this.enqueue(async () => {
      this.validateFilters(mode, this.settings);
      if (mode === this.mode) {this.automatic=false;return;}
      if (this.source) await this.replace(this.source, mode, this.settings, true, this.nativeTracks);
      else {this.currentMode = mode;this.emit('modechange', {phase: 'ready', mode, position: 0});}
      this.automatic=false;
    });
  }
  private filters(key: 'vf' | 'af', value: string) {
    const chain = filterChain(value);
    return this.enqueue(async () => {
      if (!this.automatic&&this.mode !== 'software') throw new Error('Filters require software mode. Call setMode("software") first.');
      if (chain === this.settings[key]) return;
      const settings = {...this.settings, [key]: chain};
      if (this.source) await this.select(this.source, settings, true, this.nativeTracks);else {this.settings=settings;if(this.automatic&&(settings.vf||settings.af))this.currentMode='software';}
    });
  }
  setVideoFilters(value: string) {return this.filters('vf', value);}
  setAudioFilters(value: string) {return this.filters('af', value);}
  private setting(action: (p: Backend) => Promise<void>, update: () => void) {
    return this.enqueue(async () => {if (this.current) await action(this.current.backend);update();});
  }
  play() {return this.setting(p => p.play(), () => {this.settings.pause = false;});}
  pause() {return this.setting(p => p.pause(), () => {this.settings.pause = true;});}
  seek(seconds: number) {
    if (!Number.isFinite(seconds) || seconds < 0) throw new Error('Invalid seek time');
    return this.enqueue(async () => {
      if (!this.current) throw new Error('No source');
      try{await this.current.backend.seek(seconds);await this.settled(this.current,this.mode,seconds);}
      catch(error){
        if(!this.automatic||this.mode==='software'||terminalSourceFailure(error)||/out of range|Invalid seek/i.test(String(error)))throw error;
        await this.select(this.source!,this.settings,true,this.nativeTracks,PLAYBACK_MODES.indexOf(this.mode)+1,seconds);
      }
    });
  }
  volume(value: number) {
    if (!Number.isFinite(value) || value < 0 || value > 100) throw new Error('Invalid volume');
    return this.setting(p => p.volume(value), () => {this.settings.volume = value;});
  }
  rate(value: number) {
    if (!Number.isFinite(value) || value < .5 || value > 2) throw new Error('Playback rate must be 0.5 to 2');
    return this.setting(p => p.rate(value), () => {this.settings.speed = value;});
  }
  selectTrack(type: TrackType, id: string) {
    if (!['audio', 'sub'].includes(type) || !/^(?:[1-9][0-9]*|auto|no)$/.test(id)) throw new Error('Invalid track selection');
    return this.setting(p => p.selectTrack(type, id), () => {this.settings[type === 'audio' ? 'aid' : 'sid'] = id;});
  }
  subtitleVisible(visible: boolean) {
    return this.enqueue(async()=>{
      const settings={...this.settings,subtitles:visible};
      if(this.automatic&&this.source&&this.mode==='native'&&visible&&!this.settings.subtitles)await this.select(this.source,settings,true,this.nativeTracks);
      else {if(this.current)await this.current.backend.subtitleVisible(visible);this.settings=settings;}
    });
  }
  addSubtitle(file:File, options:SubtitleOptions={}) {
    if(!(file instanceof File))return Promise.reject(Error('Expected a subtitle File'));
    const format=file.name.split('.').at(-1)?.toLowerCase();
    if(!['ass','ssa','srt','vtt'].includes(format??'')||file.size>8*1024*1024) return Promise.reject(Error('Expected an SRT, ASS, SSA or WebVTT file up to 8 MiB'));
    return this.enqueue(async()=>{
      if(!this.source)throw Error('Open a movie before adding subtitles');
      if(this.subtitleAssets.length>=16||this.subtitleAssets.reduce((n,a)=>n+a.bytes.byteLength,0)+file.size>16*1024*1024)throw Error('Subtitle budget exceeded');
      const bytes=await this.interruptible(file.arrayBuffer());
      const old=this.subtitleAssets;
      this.subtitleAssets=[...old,{bytes,format:format as SubtitleAsset['format'],label:options.label??file.name,language:options.language,select:options.select??true}];
      try {await this.select(this.source,{...this.settings,sid:options.select===false?this.settings.sid:'auto'},true,this.nativeTracks);}
      catch(error){this.subtitleAssets=old;throw error;}
    });
  }
  addFont(file:File) {
    if(!(file instanceof File)||! /\.(ttf|otf)$/i.test(file.name)||file.size>8*1024*1024)return Promise.reject(Error('Expected a TTF/OTF font up to 8 MiB'));
    return this.enqueue(async()=>{
      if(this.fonts.length>=16||this.fonts.reduce((n,a)=>n+a.bytes.byteLength,0)+file.size>32*1024*1024)throw Error('Font budget exceeded');
      const bytes=await this.interruptible(file.arrayBuffer()),old=this.fonts;
      this.fonts=[...old,{name:'user-'+old.length+'.'+file.name.split('.').at(-1)!.toLowerCase(),bytes}];
      try {if(this.source&&this.mode!=='native')await this.replace(this.source,this.mode,this.settings,true,this.nativeTracks);}
      catch(error){this.fonts=old;throw error;}
    });
  }
  setToneMapping(value:ToneMapping) {
    if(!['off','hdr-to-sdr'].includes(value))throw Error('Invalid tone mapping policy');
    return this.enqueue(async()=>{const old=this.toneMapping;this.toneMapping=value;try{if(this.source)await this.select(this.source,this.settings,true,this.nativeTracks);else if(this.automatic&&value!=='off')this.currentMode='software';else this.validateFilters(this.mode,this.settings);}catch(error){this.toneMapping=old;throw error;}});
  }
  addTextTrack(track: TextTrackSource) {
    const source = {...track};
    return this.enqueue(async () => {
      if (this.mode !== 'native' || !this.current) throw new Error('External browser text tracks require an open native player');
      await this.current.backend.addTextTrack!(source);this.nativeTracks.push(source);
    });
  }
  resize(width: number, height: number) {
    if (this.destroyed) throw new Error('Player is destroyed');dimensions(width, height);
    this.width = width;this.height = height;this.current?.backend.resize(width, height);this.candidate?.backend.resize(width, height);
  }
  destroy(): Promise<void> {
    if (this.destruction) return this.destruction;
    this.destroyed = true;this.lifetime.abort();this.inspection?.abort();clearInterval(this.monitor);
    this.destruction = (async () => {
      await Promise.all([this.candidate, this.current].map(session => session?.backend.destroy().catch(() => {})));
      await this.queue;
      try {await this.dispose(this.current);} finally {this.current = undefined;this.source = undefined;this.nativeTracks = [];this.subtitleAssets=[];this.fonts=[];this.root.remove();}
    })();return this.destruction;
  }
}
