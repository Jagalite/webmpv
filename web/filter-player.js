import {BrowserPlayer as RetainedPlayer} from './generated/filter-retained-player.js';
import {BrowserPlayer as CopybackPlayer} from './generated/filter-copyback-player.js';

// Transactional compatibility routing. A filter change reloads at the current
// position; the original paused engine stays available until the candidate works.
export class FilterPlayer extends EventTarget {
 constructor(container,{width=1920,height=1080}={}) {
  super();this.container=container;this.width=width;this.height=height;
  this.player=null;this.candidate=null;this.source=null;this.filters='';
  this.settings={pause:true,speed:1,volume:100,sid:'auto',aid:'auto','sub-visibility':true,af:''};
  this.queue=Promise.resolve();this.queued=0;this.destroyed=false;this.busy=false;
  this.history=[];this.ready=Promise.resolve();this.emptyProperties=new Map();
 }
 get properties(){return this.player?.properties??this.emptyProperties;}
 get diagnostics(){return {...this.player?.diagnostics,route:this.filters?'copyback':'retained',videoFilters:this.filters,switching:this.busy};}
 audioDiagnostics(){return this.player?.audioDiagnostics();}
 _enqueue(operation){
  if(this.destroyed)return Promise.reject(Error('Player is destroyed'));
  if(this.queued>=32)return Promise.reject(Error('Player operation queue is full'));
  this.queued++;
  const promise=this.queue.then(()=>{if(this.destroyed)throw Error('Player is destroyed');return operation();});
  this.queue=promise.catch(()=>{}).finally(()=>{this.queued--;});return promise;
 }
 async _dispose(player){
  if(!player)return;
  try{await player.destroy();}finally{
   this.history.push({diagnostics:player.diagnostics,audio:player.audioDiagnostics()});
   if(this.history.length>16)this.history.shift();player.surface.remove();
  }
 }
 _create(filters){
  const canvas=document.createElement('canvas');canvas.width=this.width;canvas.height=this.height;
  canvas.style.display='none';this.container.append(canvas);
  let p;try{p=new (filters?CopybackPlayer:RetainedPlayer)(canvas,{decoder:'webcodecs'});}catch(e){canvas.remove();throw e;}
  p.surface=canvas;p.routingError=null;p.routingLogs=[];
  for(const type of ['mpv','error','log','output','source'])p.addEventListener(type,event=>{
   if(type==='mpv'&&event.detail.event==='log-message'){p.routingLogs.push(event.detail);if(p.routingLogs.length>16)p.routingLogs.shift();}
   if(type==='error')p.routingError=Error(String(event.detail));
   if(type==='mpv'&&event.detail.event==='end-file'&&event.detail.reason==='error')p.routingError=Error(String(event.detail.file_error));
   if(this.player===p&&!this.busy&&!this.destroyed)this.dispatchEvent(new CustomEvent(type,{detail:event.detail}));
  });
  return p;
 }
 async _settled(p,target,filters){
  const deadline=performance.now()+25000;
  while(performance.now()<deadline){
   if(this.destroyed)throw Error('Player is destroyed');
   if(p.routingError)throw p.routingError;
   const d=p.diagnostics,pts=filters?d?.presentedPosition:d?.presentation?.pts?.at(-1)/1e6;
   if(d?.rendered>0&&!d.seeking&&Number.isFinite(pts)&&Math.abs(pts-target)<.15)return;
   await new Promise(resolve=>setTimeout(resolve,25));
  }
  throw Error('Filtered source did not present the requested position');
 }
 async _replace(source,filters,{preserve=false}={}){
  const old=this.player,wasPaused=this.settings.pause;
  const target=preserve?Math.max(0,Number(old?.properties.get('time-pos'))||0):0;
  const desired={...this.settings,pause:preserve?wasPaused:true};
  // Track IDs are strings in BrowserPlayer properties. Capture actual selected IDs
  // so an automatic choice stays the same across an engine replacement.
  if(preserve)for(const [kind,key] of [['audio','aid'],['sub','sid']]){
   const selected=old?.properties.get('track-list')?.find(t=>t.type===kind&&t.selected);
   if(selected)desired[key]=String(selected.id);
  }
  this.busy=true;this.dispatchEvent(new CustomEvent('routing',{detail:{phase:'loading',route:filters?'copyback':'retained'}}));
  let candidate;
  try{
   if(old)await old.pause();
   candidate=this.candidate=this._create(filters);await candidate.ready;
   if(this.destroyed)throw Error('Player is destroyed');
   if(filters)await candidate.command('set','vf',filters);
   if(desired.af)await candidate.command('set','af',desired.af);
   await candidate.volume(desired.volume);await candidate.rate(desired.speed);
   await candidate.selectTrack('audio',desired.aid);await candidate.selectTrack('sub',desired.sid);
   await candidate.subtitleVisible(desired['sub-visibility']);
   if(source.kind==='local')await candidate.open(source.file);else await candidate.openRemote(source.options);
   // Finish paused startup before seeking, so no startup decoder generation
   // overlaps the restoration seek.
   await this._settled(candidate,0,filters);
   if(target>0)await candidate.seek(target);
   await this._settled(candidate,target,filters);
   // The retained presenter cannot display software recovery frames yet.
   if(!filters&&candidate.diagnostics?.decoder!=='webcodecs')throw Error('Retained playback requires WebCodecs; recovery needs the copy-back route');
   if(!desired.pause)await candidate.play();
   this.player=candidate;this.candidate=null;this.source=source;this.filters=filters;this.settings=desired;
   candidate.surface.style.display='block';if(old)old.surface.style.display='none';
   await this._dispose(old);
   this.dispatchEvent(new CustomEvent('routing',{detail:{phase:'ready',route:filters?'copyback':'retained',position:target}}));
  }catch(error){
   if(candidate&&candidate!==this.player)await this._dispose(candidate).catch(()=>{});
   this.candidate=null;
   if(old&&this.player===old&&!wasPaused&&!this.destroyed)await old.play();
   this.dispatchEvent(new CustomEvent('routing',{detail:{phase:'failed',message:String(error),rolledBack:this.player===old}}));
   throw new Error(`Could not apply video filters: ${error.message}`,{cause:error});
  }finally{this.busy=false;}
 }
 open(file){
  const size=file instanceof File?file.size:file?.byteLength;
  if(!Number.isFinite(size)||size>32*1024*1024)return Promise.reject(Error('Local file limit is 32 MiB'));
  const source={kind:'local',file:file instanceof File?file:file.slice(0)};
  return this._enqueue(()=>this._replace(source,this.filters));
 }
 openRemote(options){
  const source={kind:'remote',options:{...options,headers:options.headers?{...options.headers}:undefined,allowedOrigins:options.allowedOrigins?.slice()}};
  return this._enqueue(()=>this._replace(source,this.filters));
 }
 setVideoFilters(value){
  if(typeof value!=='string'||value.length>4096||value.includes('\0'))return Promise.reject(Error('Invalid video filter chain'));
  const filters=value.trim();
  return this._enqueue(async()=>{
   if(filters===this.filters)return;
   if(!this.source){this.filters=filters;return;}
   await this._replace(this.source,filters,{preserve:true});
  });
 }
 _setting(name,value,args){return this._enqueue(async()=>{
  if(this.player)await this.player.command(...args);
  this.settings[name]=value;
 });}
 play(){return this._enqueue(async()=>{if(this.player)await this.player.play();this.settings.pause=false;});}
 pause(){return this._setting('pause',true,['set','pause','yes']);}
 seek(seconds){if(!Number.isFinite(seconds)||seconds<0)return Promise.reject(Error('Invalid seek time'));return this._enqueue(async()=>{if(!this.player)throw Error('No source');await this.player.seek(seconds);await this._settled(this.player,seconds,this.filters);});}
 volume(value){if(!Number.isFinite(value)||value<0||value>100)return Promise.reject(Error('Invalid volume'));return this._setting('volume',value,['set','volume',String(value)]);}
 rate(value){if(!Number.isFinite(value)||value<.5||value>2)return Promise.reject(Error('Invalid playback rate'));return this._setting('speed',value,['set','speed',String(value)]);}
 selectTrack(type,id){if(!['audio','sub'].includes(type)||!/^(?:[1-9][0-9]*|auto|no)$/.test(id))return Promise.reject(Error('Invalid track selection'));const key=type==='audio'?'aid':'sid';return this._setting(key,id,['set',key,id]);}
 subtitleVisible(visible){return this._setting('sub-visibility',!!visible,['set','sub-visibility',visible?'yes':'no']);}
 command(...args){
  if((args[0]==='set'&&args[1]==='vf')||(args[0]==='vf'&&args[1]==='set'))return this.setVideoFilters(args[2]);
  if(args[0]==='vf'&&args[1]==='clr')return this.setVideoFilters('');
  // Restrict this facade to commands whose state survives an engine replacement.
  if(args[0]==='set'&&args.length===3){
   const [,key,value]=args;
   if(key==='volume')return this.volume(Number(value));if(key==='speed')return this.rate(Number(value));
   if(key==='pause'&&['yes','no'].includes(value))return value==='yes'?this.pause():this.play();
   if(key==='sid'||key==='aid')return this.selectTrack(key==='sid'?'sub':'audio',value);
   if(key==='sub-visibility'&&['yes','no'].includes(value))return this.subtitleVisible(value==='yes');
   if(key==='af')return this._setting('af',value,args);
  }
  return Promise.reject(Error('Unsupported routed command; use setVideoFilters() for video filters'));
 }
 resize(width,height){
  if(this.destroyed)throw Error('Player is destroyed');
  if(!Number.isInteger(width)||!Number.isInteger(height)||width<1||height<1||width>1920||height>1080)throw Error('Invalid output dimensions');
  this.width=width;this.height=height;this.player?.resize(width,height);this.candidate?.resize(width,height);
 }
 destroy(){
  if(this.destruction)return this.destruction;
  this.destroyed=true;
  this.destruction=(async()=>{
   // Interrupt a candidate's open/seek so shutdown does not wait for its timeout.
   const candidate=this.candidate;if(candidate)await candidate.destroy().catch(()=>{});
   await this.queue;await this._dispose(this.player);this.player=null;this.source=null;
  })();return this.destruction;
 }
}
