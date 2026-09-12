import {Player} from '../unified-player.js';
import {PLAYER_EVENTS} from '../types.js';
import type {MediaSourceInput, OpenOptions, PlayerState, MediaTrack, SessionError, SubtitleOptions} from '../types.js';
import {PlayerError, playerError} from '../internal/errors.js';
import {formatTime, outputDimensions, shortcut} from './interaction.js';
import {styles} from './styles.js';
const Base = (typeof HTMLElement==='undefined'?class {}:HTMLElement) as typeof HTMLElement;
export const defaultLabels = Object.freeze({play:'Play',pause:'Pause',mute:'Mute',unmute:'Unmute',seek:'Playback position',volume:'Volume',settings:'Playback settings',closeSettings:'Close settings',speed:'Playback speed',audio:'Audio',subtitles:'Subtitles',automatic:'Automatic',off:'Off',fullscreen:'Fullscreen',exitFullscreen:'Exit fullscreen',open:'Open media',addSubtitle:'Add subtitles',empty:'Something good to watch?',drop:'Open a video or audio file from your device.',loading:'Opening media…',switching:'Updating playback…',seeking:'Seeking…',buffering:'Buffering…',live:'LIVE',unknown:'Unknown duration',retry:'Retry',resume:'Press Play to continue',shortcuts:'K / Space: play · ← → / J L: seek · ↑ ↓: volume · M: mute · C: subtitles · [ ]: speed · 0–9 / Home / End: position · F: fullscreen',noFullscreen:'Fullscreen is unavailable here. Open this page in a browser tab.',noWindow:'Live playback · seek window unavailable',mediaFile:'Media file',subtitleFile:'Subtitle file'});
export type PlayerLabels = Partial<Record<keyof typeof defaultLabels,string>>;
export class WebmpvPlayerElement extends Base {
  static observedAttributes=['src','controls','poster','autoplay','muted','asset-base'];
  private core?:Player;
  private terminal=false;
  private cleanup:Promise<void>=Promise.resolve();
  private connecting?:Promise<void>;
  private connection=0;
  private unsubscribe?:()=>void;
  private sourceAbort?:AbortController;
  private sourceVersion=0;
  private lastSource?:MediaSourceInput;
  private lastOptions?:OpenOptions;
  private resolveReady!:(p:Player)=>void;
  private rejectReady!:(error:Error)=>void;
  private readiness!:Promise<Player>;
  private overrides:PlayerLabels={};
  private dragging=false;
  private dimensions='';
  private trackSignature='';
  private reflected=false;
  private attributeScheduled=false;
  private configuredAsset:string|null=null;
  private resizeObserver?:ResizeObserver;
  private lastAnnouncement='';
  private lastFailure?:SessionError;
  private fullscreenChanged=()=>{this.$('fullscreen').textContent=document.fullscreenElement===this?this.labels.exitFullscreen:this.labels.fullscreen;};
  constructor(){super();this.newReady();this.attachShadow({mode:'open'});this.renderShell();}
  private newReady(){this.readiness=new Promise((resolve,reject)=>{this.resolveReady=resolve;this.rejectReady=reject;});void this.readiness.catch(()=>{});}
  get ready(){return this.readiness;}
  get player():Player|undefined{return this.core;}
  get src(){return this.getAttribute('src')??'';} set src(value:string){if(value)this.setAttribute('src',String(value));else this.removeAttribute('src');}
  get controls(){return this.hasAttribute('controls');} set controls(value:boolean){this.toggleAttribute('controls',!!value);}
  get autoplay(){return this.hasAttribute('autoplay');} set autoplay(value:boolean){this.toggleAttribute('autoplay',!!value);}
  get muted(){return this.hasAttribute('muted');} set muted(value:boolean){this.toggleAttribute('muted',!!value);}
  get poster(){return this.getAttribute('poster')??'';} set poster(value:string){if(value)this.setAttribute('poster',value);else this.removeAttribute('poster');}
  get assetBase(){return this.getAttribute('asset-base')??undefined;} set assetBase(value:string|undefined){if(this.core)throw new PlayerError('INVALID_ARGUMENT','assetBase is fixed after initialization');if(value)this.setAttribute('asset-base',value);else this.removeAttribute('asset-base');}
  get labels():Record<keyof typeof defaultLabels,string>{return {...defaultLabels,...this.overrides} as Record<keyof typeof defaultLabels,string>;} set labels(value:PlayerLabels){const next:PlayerLabels={};for(const [key,text]of Object.entries(value)){if(!(key in defaultLabels)||text===undefined)continue;if(typeof text!=='string'||text.length>1024)throw new PlayerError('INVALID_ARGUMENT','Labels must be strings up to 1024 characters');next[key as keyof typeof defaultLabels]=text;}this.overrides=next;this.labelControls();if(this.core)this.update(this.core.state);}
  private $(id:string){return this.shadowRoot!.getElementById(id)!;}
  private input(id:string){return this.$(id) as HTMLInputElement;}
  connectedCallback(){
    const token=++this.connection;if(this.terminal)return;
    for(const name of ['assetBase','labels','controls','poster','autoplay','muted','src'])if(Object.prototype.hasOwnProperty.call(this,name)){const value=(this as any)[name];delete (this as any)[name];(this as any)[name]=value;}
    if(this.core)return;
    this.connecting=(async()=>{await this.cleanup;if(!this.isConnected||token!==this.connection||this.terminal)return;
      try {this.configuredAsset=this.getAttribute('asset-base');const core=this.core=new Player(this.$('surface'),{assetBase:this.assetBase});this.dimensions='';this.trackSignature='';
        for(const type of [...PLAYER_EVENTS,'modechange','selectionchange','mpv','log','source','output'])core.addEventListener(type,event=>{
          if(this.core!==core||this.terminal)return;const detail=(event as CustomEvent).detail;
          if(type==='error')this.showError(detail);
          this.dispatchEvent(new CustomEvent(type,{detail}));
        });
        const initiallyMuted=this.muted;this.unsubscribe=core.subscribe(state=>this.update(state));
        if(initiallyMuted)await core.setMuted(true);
        this.resizeObserver=new ResizeObserver(()=>{if(this.core)this.geometry(this.core.state);});this.resizeObserver.observe(this.$('stage'));document.addEventListener('fullscreenchange',this.fullscreenChanged);
        this.resolveReady(core);if(this.src)this.scheduleSource();
      } catch(error){this.rejectReady(playerError(error));this.componentError(error);}
    })();
  }
  disconnectedCallback(){const token=++this.connection;queueMicrotask(()=>{
    if(this.isConnected||token!==this.connection||this.terminal)return;
    this.sourceVersion++;this.sourceAbort?.abort();this.lastSource=undefined;this.lastOptions=undefined;this.unsubscribe?.();this.resizeObserver?.disconnect();document.removeEventListener('fullscreenchange',this.fullscreenChanged);
    const old=this.core;this.core=undefined;this.rejectReady(new PlayerError('ABORTED','Player element disconnected'));this.newReady();
    this.cleanup=Promise.all([this.connecting,old?.destroy()]).then(()=>{});
  });}
  attributeChangedCallback(name:string,old:string|null,value:string|null){
    if(old===value||this.reflected)return;
    if(name==='asset-base'&&this.core){this.reflected=true;if(this.configuredAsset===null)this.removeAttribute(name);else this.setAttribute(name,this.configuredAsset);this.reflected=false;this.componentError(new PlayerError('INVALID_ARGUMENT','asset-base is fixed after initialization'));return;}
    if(name==='src'&&this.core)this.scheduleSource();
    if(name==='muted'&&this.core)this.run(this.core.setMuted(value!==null));
    if(name==='poster'){const img=this.$('poster') as HTMLImageElement;if(value)img.src=value;else img.removeAttribute('src');}
    if(this.core)this.update(this.core.state);else this.$('controls').hidden=!this.controls;
  }
  private scheduleSource(){if(this.attributeScheduled)return;this.attributeScheduled=true;queueMicrotask(()=>{this.attributeScheduled=false;if(!this.core||this.terminal)return;this.run(this.src?this.open(this.src):this.close());});}
  private waitReady(signal:AbortSignal):Promise<Player>{
    if(signal.aborted)return Promise.reject(new PlayerError('ABORTED','Open aborted'));
    return new Promise((resolve,reject)=>{const abort=()=>{signal.removeEventListener('abort',abort);reject(new PlayerError('ABORTED','Open aborted'));};signal.addEventListener('abort',abort,{once:true});this.ready.then(p=>{signal.removeEventListener('abort',abort);resolve(p);},e=>{signal.removeEventListener('abort',abort);reject(e);});});
  }
  async open(source:MediaSourceInput,options:OpenOptions={}) {
    if(this.terminal)throw new PlayerError('ABORTED','Player element is destroyed');
    const version=++this.sourceVersion;this.sourceAbort?.abort();const controller=this.sourceAbort=new AbortController();
    const abort=()=>controller.abort();options.signal?.addEventListener('abort',abort,{once:true});if(options.signal?.aborted)abort();
    try {const core=this.core??await this.waitReady(controller.signal);if(this.terminal||version!==this.sourceVersion||controller.signal.aborted)throw new PlayerError('ABORTED','Open aborted');
      this.lastSource=source;this.lastOptions={...options,signal:undefined};this.clearError();
      await core.open(source,{...options,signal:controller.signal});
      if(version===this.sourceVersion&&this.autoplay)await core.play();
    }finally{options.signal?.removeEventListener('abort',abort);}
  }
  close(){this.sourceVersion++;this.sourceAbort?.abort();this.lastSource=undefined;this.lastOptions=undefined;this.clearError();return this.core?this.core.close():this.terminal?Promise.reject(new PlayerError('ABORTED','Player element is destroyed')):Promise.resolve();}
  play(){return this.core?this.core.play():this.ready.then(p=>p.play());}
  pause(){return this.core?this.core.pause():this.ready.then(p=>p.pause());}
  seek(seconds:number){return this.ready.then(p=>p.seek(seconds));}
  setVolume(value:number){return this.ready.then(p=>p.setVolume(value));}
  setMuted(value:boolean){return this.ready.then(p=>p.setMuted(value));}
  setPlaybackRate(value:number){return this.ready.then(p=>p.setPlaybackRate(value));}
  selectAudioTrack(id:string|null){return this.ready.then(p=>p.selectAudioTrack(id));}
  selectSubtitleTrack(id:string|null){return this.ready.then(p=>p.selectSubtitleTrack(id));}
  addSubtitle(file:File,options?:SubtitleOptions){return this.ready.then(p=>p.addSubtitle(file,options));}
  destroy():Promise<void>{
    if(this.terminal)return this.cleanup;this.terminal=true;this.connection++;this.sourceVersion++;this.sourceAbort?.abort();this.lastSource=undefined;this.lastOptions=undefined;this.unsubscribe?.();this.resizeObserver?.disconnect();document.removeEventListener('fullscreenchange',this.fullscreenChanged);
    this.rejectReady(new PlayerError('ABORTED','Player element is destroyed'));const old=this.core;this.core=undefined;
    this.cleanup=Promise.all([this.cleanup,this.connecting,old?.destroy()]).then(()=>{this.$('surface').replaceChildren();this.$('controls').hidden=true;this.$('empty').hidden=true;});return this.cleanup;
  }
  private run(work:Promise<unknown>){void work.catch(error=>{if(!this.terminal&&playerError(error).code!=='ABORTED')this.showError(playerError(error).toJSON());});}
  private componentError(error:unknown){const detail=playerError(error).toJSON();this.showError(detail);this.dispatchEvent(new CustomEvent('error',{detail}));}
  private showError(error:SessionError){if(error.code==='ABORTED')return;this.lastFailure=error;this.$('error').hidden=false;this.$('error-text').textContent=error.message;this.$('retry').hidden=!error.retryable;this.$('retry').textContent=error.code==='AUTOPLAY_BLOCKED'?this.labels.play:this.labels.retry;this.announce(error.message);}
  private clearError(){this.lastFailure=undefined;this.$('error').hidden=true;}
  private announce(text:string){if(text===this.lastAnnouncement)return;this.lastAnnouncement=text;this.$('status').textContent=text;}
  private geometry(state:PlayerState){const ratio=state.mediaInfo.aspectRatio;if(!ratio){this.$('stage').style.removeProperty('--media-aspect');return;}this.$('stage').style.setProperty('--media-aspect',String(ratio));if(state.pendingOperation)return;const {width,height}=outputDimensions(ratio),key=`${width}x${height}`;if(this.dimensions!==key){this.dimensions=key;this.core?.resize(width,height);}}
  private update(state:PlayerState){
    const labels=this.labels,pending=state.pendingOperation!==null;
    this.$('controls').hidden=!this.controls;this.$('empty').hidden=!!state.sourceId;this.$('poster').hidden=!this.poster||!!state.sourceId;
    this.$('play').textContent=state.playbackIntent==='play'?labels.pause:labels.play;(this.$('play') as HTMLButtonElement).disabled=!state.sourceId||pending;
    this.$('mute').textContent=state.muted?labels.unmute:labels.mute;this.$('mute').setAttribute('aria-pressed',String(state.muted));
    this.reflected=true;this.toggleAttribute('muted',state.muted);this.reflected=false;
    if(this.shadowRoot!.activeElement!==this.$('volume'))this.input('volume').value=String(state.volume);
    const window=state.seekable;this.input('timeline').disabled=pending||!window?.length;
    if(window?.length){this.input('timeline').min=String(window[0].start);this.input('timeline').max=String(window.at(-1)!.end);}
    if(!this.dragging){this.input('timeline').value=String(state.currentTime);this.input('timeline').setAttribute('aria-valuetext',formatTime(state.currentTime));this.$('time').textContent=`${formatTime(state.currentTime)} / ${state.streamType==='live'?labels.live:state.duration===null?labels.unknown:formatTime(state.duration)}`;}
    const signature=JSON.stringify([state.audioTracks,state.subtitleTracks]);if(signature!==this.trackSignature){this.trackSignature=signature;this.trackOptions('audio',state.audioTracks);this.trackOptions('subtitles',state.subtitleTracks);}
    (this.$('speed') as HTMLSelectElement).value=String(state.playbackRate);
    const activity=state.pendingOperation?.kind==='opening'?labels.loading:state.pendingOperation?.kind==='switching'?labels.switching:state.pendingOperation?.kind==='seeking'?labels.seeking:state.status==='buffering'?labels.buffering:'';
    this.$('busy').hidden=!activity;this.$('busy').textContent=activity;
    if(!this.lastFailure)this.announce(activity||(state.streamType==='live'&&!window?.length?labels.noWindow:''));
    this.geometry(state);
  }
  private trackOptions(id:string,list:readonly MediaTrack[]){const select=this.$(id) as HTMLSelectElement;select.replaceChildren(new Option(this.labels.automatic,'auto'),new Option(this.labels.off,''));for(const t of list)select.add(new Option(t.label,t.id));select.value=list.find(t=>t.selected)?.id??(list.length?'':'auto');select.disabled=!list.length;}
  private settings(open:boolean){this.$('settings').hidden=!open;this.$('settings-toggle').setAttribute('aria-expanded',String(open));if(open)this.$('settings-close').focus();else this.$('settings-toggle').focus();}
  private fullscreen(){const active=document.fullscreenElement===this;const request=active?document.exitFullscreen():this.requestFullscreen?.();if(!request){this.announce(this.labels.noFullscreen);return;}void request.then(()=>{this.$('fullscreen').textContent=document.fullscreenElement===this?this.labels.exitFullscreen:this.labels.fullscreen;},()=>this.announce(this.labels.noFullscreen));}
  private labelControls(){for(const [id,key]of Object.entries({mute:'mute','settings-toggle':'settings','settings-close':'closeSettings',fullscreen:'fullscreen','open':'open','retry':'retry'}))this.$(id).textContent=this.labels[key as keyof typeof defaultLabels];for(const [id,key]of Object.entries({timeline:'seek',volume:'volume',file:'open',subtitleFile:'addSubtitle'}))this.$(id).setAttribute('aria-label',this.labels[key as keyof typeof defaultLabels]);this.$('empty-title').textContent=this.labels.empty;this.$('empty-description').textContent=this.labels.drop;this.$('help').textContent=this.labels.shortcuts;for(const id of ['speed','audio','subtitles'])this.$(id+'-label').textContent=this.labels[id as 'speed'|'audio'|'subtitles'];this.$('settings-title').textContent=this.labels.settings;this.$('media-file-label').textContent=this.labels.mediaFile;this.$('subtitle-file-label').textContent=this.labels.subtitleFile;}
  private renderShell(){this.shadowRoot!.innerHTML=`<style>${styles}</style><section class="shell" part="container" aria-label="Media player"><div id="stage" class="stage" part="stage" tabindex="0"><div id="surface" class="surface"></div><img id="poster" class="poster" alt="" hidden><div id="empty" class="empty"><div class="emblem" aria-hidden="true">▷</div><strong id="empty-title"></strong><p id="empty-description"></p><button id="open"></button></div><div id="busy" class="busy" hidden></div></div><div id="controls" class="controls" part="controls"><slot name="before-controls"></slot><input id="timeline" class="timeline" type="range" min="0" max="1" step="0.1" value="0" disabled><div class="row"><button id="play" class="play" disabled>Play</button><span id="time" class="time">0:00 / —</span><span class="space"></span><button id="mute" aria-pressed="false"></button><input id="volume" class="volume" type="range" min="0" max="1" step=".01" value="1"><button id="settings-toggle" aria-expanded="false" aria-controls="settings"></button><button id="fullscreen"></button></div><slot name="after-controls"></slot></div><section id="settings" class="settings" part="settings" aria-labelledby="settings-title" hidden><header><strong id="settings-title"></strong><button id="settings-close"></button></header><label><span id="speed-label"></span><select id="speed">${[.5,.75,1,1.25,1.5,1.75,2].map(n=>`<option value="${n}">${n}×</option>`).join('')}</select></label><label><span id="audio-label"></span><select id="audio" disabled></select></label><label><span id="subtitles-label"></span><select id="subtitles" disabled></select></label><label><span id="media-file-label"></span><input id="file" type="file"></label><label><span id="subtitle-file-label"></span><input id="subtitleFile" type="file" accept=".srt,.ass,.ssa,.vtt"></label><p class="help" id="help"></p></section><div id="error" class="notice" part="error" hidden><span id="error-text"></span><button id="retry"></button></div><div id="status" class="status" part="status" role="status" aria-live="polite" aria-atomic="true"></div></section>`;
    this.labelControls();this.$('controls').hidden=!this.controls;
    this.$('play').onclick=()=>{if(this.core)this.run(this.core.state.playbackIntent==='play'?this.pause():this.play());};
    this.$('mute').onclick=()=>{if(this.core)this.run(this.setMuted(!this.core.state.muted));};
    this.input('volume').onchange=()=>this.run(this.setVolume(Number(this.input('volume').value)));
    this.input('timeline').oninput=()=>{this.dragging=true;const text=formatTime(Number(this.input('timeline').value));this.$('time').textContent=text;this.input('timeline').setAttribute('aria-valuetext',text);};
    this.input('timeline').onchange=()=>{const value=Number(this.input('timeline').value);this.dragging=false;this.run(this.seek(value));};
    this.input('timeline').onpointercancel=()=>{this.dragging=false;if(this.core)this.update(this.core.state);};
    this.$('settings-toggle').onclick=()=>this.settings(this.$('settings').hidden);this.$('settings-close').onclick=()=>this.settings(false);
    this.$('speed').onchange=()=>this.run(this.setPlaybackRate(Number((this.$('speed') as HTMLSelectElement).value)));
    this.$('audio').onchange=()=>this.run(this.selectAudioTrack((this.$('audio') as HTMLSelectElement).value||null));
    this.$('subtitles').onchange=()=>this.run(this.selectSubtitleTrack((this.$('subtitles') as HTMLSelectElement).value||null));
    this.$('fullscreen').onclick=()=>this.fullscreen();this.$('stage').ondblclick=()=>this.fullscreen();
    this.$('open').onclick=()=>this.input('file').click();this.input('file').onchange=()=>{const file=this.input('file').files?.[0];this.input('file').value='';if(file)this.run(this.open(file));};
    this.input('subtitleFile').onchange=()=>{const file=this.input('subtitleFile').files?.[0];this.input('subtitleFile').value='';if(file)this.run(this.addSubtitle(file));};
    this.$('retry').onclick=()=>{const error=this.lastFailure;this.clearError();if(error?.code==='AUTOPLAY_BLOCKED')this.run(this.play());else if(this.lastSource)this.run(this.open(this.lastSource,this.lastOptions));};
    this.addEventListener('keydown',event=>{
      if(event.key==='Escape'&&!this.$('settings').hidden){event.preventDefault();this.settings(false);return;}
      if(!this.$('settings').hidden)return;const key=shortcut(event),p=this.core;if(!key||!p)return;
      if(event.repeat&&[' ','k','m','f'].includes(key))return;
      let action:Promise<unknown>|undefined;const state=p.state;
      if(key==='f'){event.preventDefault();this.fullscreen();return;}
      if(key==='?' ){event.preventDefault();this.settings(true);return;}
      if(key==='m')action=p.setMuted(!state.muted);
      if(key==='arrowup'||key==='arrowdown')action=p.setVolume(Math.max(0,Math.min(1,state.volume+(key==='arrowup'?.05:-.05))));
      if(key==='['||key===']')action=p.setPlaybackRate(Math.max(.5,Math.min(2,state.playbackRate+(key===']'?.25:-.25))));
      if(!state.pendingOperation&&state.sourceId){if(key==='c')action=p.subtitleVisible(!state.subtitlesVisible);const ranges=state.seekable;if(ranges?.length){const start=ranges[0].start,end=Math.max(start,ranges.at(-1)!.end-.1);if(key==='home')action=p.seek(start);if(key==='end')action=p.seek(end);if(/^[0-9]$/.test(key))action=p.seek(start+(end-start)*Number(key)/10);}
      if(key===' '||key==='k')action=state.playbackIntent==='play'?p.pause():p.play();const delta=key==='arrowleft'?-5:key==='arrowright'?5:key==='j'?-10:key==='l'?10:0;const window=state.seekable;if(delta&&window?.length)action=p.seek(Math.max(window[0].start,Math.min(window.at(-1)!.end-.05,state.currentTime+delta)));}
      if(action){event.preventDefault();this.run(action);}
    });
  }
}
export function definePlayerElement(name='webmpv-player'):typeof WebmpvPlayerElement {
  if(typeof customElements==='undefined')throw new PlayerError('INVALID_ARGUMENT','Custom element registration requires a browser');
  const existing=customElements.get(name);if(existing&&existing!==WebmpvPlayerElement)throw new PlayerError('INVALID_ARGUMENT',`Custom element ${name} is already registered with another implementation`);
  if(!existing)customElements.define(name,WebmpvPlayerElement);return WebmpvPlayerElement;
}
