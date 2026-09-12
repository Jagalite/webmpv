import {validateVODManifest} from './vod-manifest.js';
import {prepareDASH,selectHLS} from './streaming-manifest.js';
import {subtitleSegments,mergeWebVTT} from './segmented-subtitles.js';
// Bounded resource transport. FFmpeg, not this loader, interprets media timelines.
const MiB=1024*1024;
const abort=()=>new DOMException('Resource request cancelled','AbortError');
export class ResourceLoader {
  constructor(options,refresh){
    this.options={credentials:'omit',...options};this.refresh=refresh;
    this.allow=new Set(options.allowedOrigins??[new URL(options.url).origin]);
    this.virtual=new Map();this.subtitlePlaylists=new Set();this.subtitleMedia=new Set();
    this.handles=new Map();this.nextId=1;this.epoch=0;this.closed=false;this.busy=false;
    this.stats={opens:0,requests:0,retries:0,aborts:0,handles:0,retainedBytes:0,peakRetainedBytes:0,fetchedBytes:0};
    this.resolve(options.url);
  }
  resolve(value,base=this.options.url){
    const u=new URL(value,base);
    if(u.href.length>4095||!['http:','https:'].includes(u.protocol)||u.username||u.password||!this.allow.has(u.origin))throw Error('Resource URL is not allowed');
    u.hash='';return u.href;
  }
  storeVirtual(additions){
    const next=new Map([...this.virtual,...additions]);
    if(next.size>1024||[...next.values()].reduce((n,b)=>n+b.byteLength,0)>4*MiB)throw Error('Virtual resource budget exceeded');
    this.virtual=next;
  }
  beginEpoch(){this.epoch++;this.controller?.abort();this.retryWake?.();this.stats.aborts++;}
  closeHandle(id){const item=this.handles.get(id);if(!item)return;this.stats.retainedBytes-=item.bytes.byteLength;this.handles.delete(id);this.stats.handles=this.handles.size;}
  close(){this.closed=true;this.beginEpoch();for(const id of this.handles.keys())this.closeHandle(id);this.subtitlePlaylists.clear();this.subtitleMedia.clear();this.virtual.clear();}
  read(id,offset,capacity){
    if(this.closed)throw Error('Resource loader closed');
    const item=this.handles.get(id);
    if(!item||typeof offset!=='bigint'||offset<item.start||!Number.isInteger(capacity)||capacity<1||capacity>262144)throw Error('Invalid resource read');
    const at=offset-item.start;if(at>=BigInt(item.bytes.length))return new Uint8Array();
    return item.bytes.subarray(Number(at),Number(at)+capacity);
  }
  async open(value,{start,end,manifest=false,base}={}){
    if(this.closed)throw Error('Resource loader closed');
    if(this.busy)throw Error('Concurrent resource opens are not allowed');
    if(this.handles.size>=16||(!this.options.streaming?.live&&this.stats.opens>=10000))throw Error('Resource count limit exceeded');
    if(start!==undefined&&(typeof start!=='bigint'||start<0n||typeof end!=='bigint'||end<=start))throw Error('Invalid resource range');
    if(start===undefined&&end!==undefined)throw Error('Invalid resource range');
    const virtual=this.virtual.get(this.resolve(value,base));
    if(virtual){
      const total=BigInt(virtual.byteLength),offset=start??0n;
      if(offset>=total||(end!==undefined&&end>total))throw Error('Invalid virtual resource range');
      const bytes=start===undefined?virtual:virtual.subarray(Number(start),Number(end));
      if(this.stats.retainedBytes+bytes.byteLength>16*MiB)throw Error('Resource memory budget exceeded');
      const id=this.nextId++,url=this.resolve(value,base);this.handles.set(id,{id,url,bytes,start:offset,total});
      this.stats.opens++;this.stats.retainedBytes+=bytes.byteLength;this.stats.handles=this.handles.size;this.stats.peakRetainedBytes=Math.max(this.stats.peakRetainedBytes,this.stats.retainedBytes);
      return {id,url,size:String(total),start:String(offset),length:bytes.byteLength};
    }
    manifest=manifest||/\.(m3u8?|mpd)$/i.test(new URL(this.resolve(value,base)).pathname);
    const isSubtitlePlaylist=this.subtitlePlaylists.has(this.resolve(value,base));
    const isSubtitleMedia=this.subtitleMedia.has(this.resolve(value,base));
    const limit=manifest||isSubtitleMedia?MiB:8*MiB;
    if(start!==undefined&&end-start>BigInt(limit))throw Error('Resource size limit exceeded');
    let url=this.resolve(value,base);manifest=manifest||/\.(m3u8?|mpd)$/i.test(new URL(url).pathname);const epoch=this.epoch;this.busy=true;this.stats.opens++;
    const controller=this.controller=new AbortController();
    const timeout=setTimeout(()=>controller.abort(),15000);
    let refreshed=false;
    try{
      for(let attempt=0;attempt<4;attempt++){
        if(this.closed||epoch!==this.epoch||controller.signal.aborted)throw abort();
        let response;
        try{
          const headers=new Headers(this.options.headers);
          // Transport owns range semantics, never inherit an unrelated caller range.
          headers.delete('Range');headers.delete('If-Range');
          if(start!==undefined)headers.set('Range',`bytes=${start}-${end-1n}`);
          this.stats.requests++;
          response=await fetch(url,{headers,credentials:this.options.credentials,redirect:'error',cache:'no-store',signal:controller.signal});
          if(response.status===401&&this.refresh&&!refreshed){
            await response.body?.cancel();refreshed=true;
            const update=await new Promise((resolve,reject)=>{
              const cancel=()=>reject(abort());controller.signal.addEventListener('abort',cancel,{once:true});
              Promise.resolve().then(()=>this.refresh({url})).then(resolve,reject).finally(()=>controller.signal.removeEventListener('abort',cancel));
            });
            if(this.closed||epoch!==this.epoch||controller.signal.aborted)throw abort();
            if(update?.url)url=this.resolve(update.url);
            if(update?.headers)this.options.headers={...this.options.headers,...update.headers};
            continue;
          }
          if([408,429,500,502,503,504].includes(response.status)){
            await response.body?.cancel();throw Object.assign(Error(`Retryable resource HTTP ${response.status}`),{retryable:true});
          }
          if(response.status!==(start===undefined?200:206))throw Error(`Unexpected resource HTTP ${response.status}`);
          const encoding=response.headers.get('Content-Encoding');
          if(encoding&&encoding!=='identity')throw Error('Encoded resource bodies are unsupported');
          let total,expected;
          if(start!==undefined){
            const match=/^bytes (\d+)-(\d+)\/(\d+)$/.exec(response.headers.get('Content-Range')??'');
            if(!match||BigInt(match[1])!==start||BigInt(match[2])+1n!==end||BigInt(match[3])<end)throw Error('Invalid resource Content-Range');
            total=BigInt(match[3]);expected=Number(end-start);
          }
          const length=response.headers.get('Content-Length');
          if(length!==null){
            if(!/^\d+$/.test(length)||BigInt(length)>BigInt(limit))throw Error('Resource size limit exceeded');
            if(expected!==undefined&&Number(length)!==expected)throw Error('Resource length mismatch');
            expected=Number(length);
          }
          if(!response.body)throw Error('Missing resource body');
          const chunks=[];let count=0;
          const body=response.body.getReader();
          try{
            for(;;){
              const {value,done}=await body.read();if(done)break;
              count+=value.byteLength;this.stats.fetchedBytes+=value.byteLength;
              if(count>limit||(expected!==undefined&&count>expected))throw Error('Resource size limit exceeded');
              chunks.push(value);
            }
          }finally{await body.cancel().catch(()=>{});}
          if(expected!==undefined&&count!==expected)throw Object.assign(Error('Truncated resource body'),{retryable:true});
          if(!count)throw Error('Empty resource body');
          if(this.closed||epoch!==this.epoch||controller.signal.aborted)throw abort();
          if(this.stats.retainedBytes+count>16*MiB)throw Error('Resource memory budget exceeded');
          let bytes=new Uint8Array(count);let at=0;for(const chunk of chunks){bytes.set(chunk,at);at+=chunk.length;}
          const prefix=new TextDecoder().decode(bytes.subarray(0,512)).trimStart();
          const looksManifest=prefix.startsWith('#EXTM3U')||/^<\?xml\b|^<MPD\b/.test(prefix);
          if(manifest||looksManifest){
            if(count>MiB)throw Error('Manifest size limit exceeded');
            const format=prefix.startsWith('#EXTM3U')?'hls':'dash';
            if(format==='dash'){
              const prepared=prepareDASH(new TextDecoder().decode(bytes),url,this.options.streaming);
              bytes=prepared.bytes;if(prepared.url)url=prepared.url;
              this.storeVirtual(prepared.resources);
            }else bytes=new TextEncoder().encode(selectHLS(new TextDecoder().decode(bytes),this.options.streaming));
            count=bytes.byteLength;if(count>MiB||this.stats.retainedBytes+count>16*MiB)throw Error('Manifest memory budget exceeded');
            const preparedFormat=new TextDecoder().decode(bytes.subarray(0,7))==='#EXTM3U'?'hls':'dash';
            const policy=validateVODManifest(bytes,preparedFormat,this.options.streaming);
            if(policy){
              const additions=policy.subtitlePlaylists.map(uri=>this.resolve(uri,url));
              if(new Set([...this.subtitlePlaylists,...additions]).size>16)throw Error('HLS subtitle track limit exceeded');
              for(const uri of additions)this.subtitlePlaylists.add(uri);
              if(isSubtitlePlaylist){
                const parsed=subtitleSegments(new TextDecoder().decode(bytes),url);
                const parts=[];let totalBytes=0;
                const nested=new ResourceLoader({...this.options,format:'file'},this.refresh);
                const cancelled=()=>nested.close();controller.signal.addEventListener('abort',cancelled,{once:true});
                try{
                  for(const segment of parsed.segments){
                    const info=await nested.open(this.resolve(segment.url));const body=nested.handles.get(info.id).bytes;
                    totalBytes+=body.byteLength;if(totalBytes>MiB)throw Error('Subtitle window exceeds 1 MiB');
                    parts.push({...segment,text:new TextDecoder('utf-8',{fatal:true}).decode(body)});nested.closeHandle(info.id);
                  }
                }finally{controller.signal.removeEventListener('abort',cancelled);nested.close();this.stats.requests+=nested.stats.requests;this.stats.fetchedBytes+=nested.stats.fetchedBytes;}
                const subtitle=mergeWebVTT(parts),virtualURL=new URL(url);virtualURL.searchParams.set('__webmpv_subtitles','1');
                const uri=virtualURL.href;this.storeVirtual([[uri,new TextEncoder().encode(subtitle)]]);
                bytes=new TextEncoder().encode(`#EXTM3U\n#EXT-X-TARGETDURATION:${Math.ceil(parsed.duration)}\n#EXTINF:${parsed.duration},\n${uri}\n#EXT-X-ENDLIST\n`);count=bytes.byteLength;
              }
            }
          }
          if(isSubtitleMedia){
            const subtitle=new TextDecoder('utf-8',{fatal:true}).decode(bytes);
            if(!subtitle.startsWith('WEBVTT')||subtitle.includes('X-TIMESTAMP-MAP'))throw Error('Only full-timeline WebVTT without timestamp maps is supported');
          }
          if(this.closed||epoch!==this.epoch||controller.signal.aborted)throw abort();
          const id=this.nextId++;const item={id,url,bytes,start:start??0n,total:total??BigInt(count)};
          this.handles.set(id,item);this.stats.handles=this.handles.size;this.stats.retainedBytes+=count;
          this.stats.peakRetainedBytes=Math.max(this.stats.peakRetainedBytes,this.stats.retainedBytes);
          return {id,url,size:String(item.total),start:String(item.start),length:count};
        }catch(error){
          // Abort response consumption even when validation fails before getReader().
          await response?.body?.cancel().catch(()=>{});
          if(this.closed||epoch!==this.epoch||controller.signal.aborted)throw abort();
          if(attempt===3||!(error.retryable||error instanceof TypeError))throw error;
          this.stats.retries++;
          await new Promise(resolve=>{const timer=setTimeout(done,100*(attempt+1));const self=this;function done(){clearTimeout(timer);self.retryWake=null;resolve();}this.retryWake=done;});
        }
      }
      throw Error('Resource request attempts exhausted');
    }finally{clearTimeout(timeout);this.busy=false;if(this.controller===controller)this.controller=null;}
  }
}
