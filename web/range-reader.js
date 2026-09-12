// Original bounded, single-flight VOD range reader. No decoder dependency.
export class RangeReader {
  constructor(options, refresh) {
    this.options={credentials:'omit',cacheBytes:16*1024*1024,blockBytes:256*1024,immutable:false,...options};
    this.allow=new Set(options.allowedOrigins || [new URL(options.url).origin]);
    this.refresh=refresh;this.cache=new Map();this.epoch=0;this.closed=false;this.busy=false;
    this.stats={fetchedBytes:0,requests:0,retries:0,aborts:0,cacheBytes:0,peakCacheBytes:0,activeBytes:0,peakActiveBytes:0};
    if(options.identity){this.etag=options.identity.etag;this.total=BigInt(options.identity.size);}
    this.checkURL(this.options.url);
    if(!Number.isInteger(this.options.blockBytes)||this.options.blockBytes<1024||this.options.blockBytes>262144||!Number.isInteger(this.options.cacheBytes)||this.options.cacheBytes<this.options.blockBytes||this.options.cacheBytes>16777216)throw Error('Invalid range budgets');
  }
  checkURL(value){const u=new URL(value);if(!['http:','https:'].includes(u.protocol)||u.username||u.password||!this.allow.has(u.origin))throw Error('Media origin is not allowed');}
  async open(){await this.read(0n,1);return {size:String(this.total),etag:this.etag};}
  beginEpoch(){this.epoch++;this.operation?.abort(new DOMException('Superseded','AbortError'));this.controller?.abort();this.retryWake?.();this.stats.aborts++;}
  close(){this.closed=true;this.beginEpoch();this.cache.clear();this.stats.cacheBytes=0;}
  async read(offset,capacity){
    if(this.closed)throw Error('Range reader closed');
    if(this.busy)throw Error('Concurrent reads are not allowed');
    if(typeof offset!=='bigint'||offset<0n||!Number.isInteger(capacity)||capacity<1||capacity>262144)throw Error('Invalid read');
    if(this.total!==undefined&&offset>=this.total)return new Uint8Array();
    this.busy=true;const epoch=this.epoch;
    try{
      // Anchor misses at the requested position, avoiding an unused prefix on
      // distant index/seek reads. Cached windows can still satisfy inner reads.
      let start=offset,key=String(start);
      let bytes=this.cache.get(key);
      if(!bytes)for(const [cachedKey,cachedBytes] of this.cache){
        const cachedStart=BigInt(cachedKey);
        if(offset>=cachedStart&&offset<cachedStart+BigInt(cachedBytes.length)){
          start=cachedStart;key=cachedKey;bytes=cachedBytes;break;
        }
      }
      if(bytes){this.cache.delete(key);this.cache.set(key,bytes);}
      else{
        bytes=await this.fetchBlock(start,epoch);
        if(epoch!==this.epoch||this.closed)throw new DOMException('Superseded','AbortError');
        while(this.stats.cacheBytes+bytes.buffer.byteLength>this.options.cacheBytes&&this.cache.size){const oldest=this.cache.keys().next().value;this.stats.cacheBytes-=this.cache.get(oldest).buffer.byteLength;this.cache.delete(oldest);}
        this.cache.set(key,bytes);this.stats.cacheBytes+=bytes.buffer.byteLength;this.stats.peakCacheBytes=Math.max(this.stats.peakCacheBytes,this.stats.cacheBytes);
      }
      if(epoch!==this.epoch||this.closed)throw new DOMException('Superseded','AbortError');
      const at=Number(offset-start);return bytes.subarray(at,Math.min(bytes.length,at+capacity));
    }finally{this.busy=false;this.stats.activeBytes=0;}
  }
  async fetchBlock(start,epoch){
    const buffer=new Uint8Array(this.options.blockBytes);let received=0,refreshed=false;
    const deadline=performance.now()+15000;
    const operation=this.operation=new AbortController();
    const timeout=()=>operation.abort(Error('Media read retry deadline exceeded'));
    // A separate, non-resetting deadline covers headers, successful body progress,
    // backoff and credential refresh. Race pending work too: refresh callbacks do
    // not receive a signal and need not settle when the transport is cancelled.
    const deadlineTimer=setTimeout(timeout,15000);
    operation.signal.addEventListener('abort',()=>{
      this.controller?.abort();this.retryWake?.();
    },{once:true});
    const check=()=>{
      if(this.closed||epoch!==this.epoch)operation.abort(new DOMException('Superseded','AbortError'));
      if(performance.now()>=deadline)timeout();
      if(operation.signal.aborted)throw operation.signal.reason;
    };
    const waitFor=promise=>new Promise((resolve,reject)=>{
      const signal=operation.signal;
      const cleanup=()=>signal.removeEventListener('abort',onAbort);
      const onAbort=()=>{cleanup();reject(signal.reason);};
      signal.addEventListener('abort',onAbort,{once:true});
      Promise.resolve(promise).then(value=>{
        cleanup();try{check();resolve(value);}catch(error){reject(error);}
      },error=>{cleanup();reject(error);});
      if(signal.aborted)onAbort();
    });
    try{
    this.stats.activeBytes=buffer.length;this.stats.peakActiveBytes=Math.max(this.stats.peakActiveBytes,buffer.length);
    for(let attempt=0;attempt<10;attempt++){
      check();
      const controller=this.controller=new AbortController();let timer,reader,response;
      const touch=()=>{clearTimeout(timer);timer=setTimeout(()=>controller.abort(),1200);};
      try{
        const offset=start+BigInt(received);
        let end=start+BigInt(buffer.length)-1n;if(this.total!==undefined&&end>=this.total)end=this.total-1n;
        const headers=new Headers(this.options.headers);headers.set('Range',`bytes=${offset}-${end}`);if(this.etag)headers.set('If-Range',this.etag);
        this.checkURL(this.options.url);touch();this.stats.requests++;
        response=await waitFor(fetch(this.options.url,{headers,credentials:this.options.credentials,redirect:'error',cache:'no-store',signal:controller.signal}));
        if(response.status===401&&!refreshed&&this.refresh){
          await waitFor(response.body?.cancel());clearTimeout(timer);const update=await waitFor(this.refresh());
          this.checkURL(update.url||this.options.url);this.options={...this.options,...update};refreshed=true;continue;
        }
        if([408,429,500,502,503,504].includes(response.status)){const e=Error(`Retryable HTTP ${response.status}`);e.retry=true;throw e;}
        if(response.status===416){
          const match=/^bytes \*\/(\d+)$/.exec(response.headers.get('Content-Range')||'');
          if(match&&this.total!==undefined&&BigInt(match[1])===this.total&&offset>=this.total){await waitFor(response.body?.cancel());return buffer.subarray(0,received);}
          throw Error('Unexpected range EOF');
        }
        if(response.status!==206)throw Error(`Expected HTTP 206; received ${response.status}`);
        const match=/^bytes (\d+)-(\d+)\/(\d+)$/.exec(response.headers.get('Content-Range')||'');
        if(!match)throw Error('Missing or invalid Content-Range');
        const [lo,hi,total]=match.slice(1).map(BigInt),expectedEnd=end<total?end:total-1n;
        if(lo!==offset||hi!==expectedEnd||hi<lo||total<=hi||this.total!==undefined&&total!==this.total)throw Error('Incoherent media range or changed length');
        const encoding=response.headers.get('Content-Encoding');if(encoding&&encoding!=='identity')throw Error('Encoded range representation is unsupported');
        const etag=response.headers.get('ETag');
        if(this.etag&&etag!==this.etag)throw Error('Media representation changed');
        if(!this.etag){if(etag&&/^"[^\r\n]*"$/.test(etag))this.etag=etag;else if(!this.options.immutable)throw Error('A strong ETag or explicit immutable contract is required');}
        this.total=total;
        const expected=Number(hi-lo+1n),length=response.headers.get('Content-Length');
        if(length!==null&&BigInt(length)!==BigInt(expected))throw Error('Content-Length does not match range');
        reader=response.body.getReader();let bodyBytes=0;
        while(true){touch();const {done,value}=await waitFor(reader.read());if(done)break;
          this.stats.fetchedBytes+=value.length;
          if(bodyBytes+value.length>expected||received+value.length>buffer.length)throw Error('Range body exceeded its bound');
          buffer.set(value,received);received+=value.length;bodyBytes+=value.length;
        }
        if(bodyBytes!==expected){const e=Error('Truncated range body');e.retry=true;throw e;}
        if(epoch!==this.epoch||this.closed)throw new DOMException('Superseded','AbortError');
        return buffer.subarray(0,received);
      }catch(error){
        controller.abort();void reader?.cancel().catch(()=>{});void response?.body?.cancel().catch(()=>{});
        check();
        if(epoch!==this.epoch||this.closed)throw new DOMException('Superseded','AbortError');
        const retry=error.retry||error.name==='AbortError'||error instanceof TypeError;
        if(!retry||attempt===9||performance.now()>=deadline)throw Error(retry?'Media read retry deadline exceeded':error.message);
        this.stats.retries++;
        const retryAfter=response?.headers.get('Retry-After');const serverWait=retryAfter ? (/^\d+$/.test(retryAfter)?Number(retryAfter)*1000:Math.max(0,Date.parse(retryAfter)-Date.now())) : 0;
        const backoff=80*2**Math.min(attempt,3)*(0.75+Math.random()*0.5);
        const wait=Math.min(Math.max(0,deadline-performance.now()),Math.max(Number.isFinite(serverWait)?serverWait:0,backoff));
        await waitFor(new Promise(resolve=>{const timer=setTimeout(done,wait);const self=this;function done(){clearTimeout(timer);self.retryWake=null;resolve();}this.retryWake=done;}));
      }finally{clearTimeout(timer);if(this.controller===controller)this.controller=null;}
    }
    throw Error('Media read failed');
    }finally{clearTimeout(deadlineTimer);if(this.operation===operation)this.operation=null;}
  }
}
