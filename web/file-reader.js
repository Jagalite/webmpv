// Bounded local-file adapter for the existing AVIO source contract.
// File handles are cloned to workers; complete media never enters an ArrayBuffer.
export class LocalFileReader {
 constructor(file){
  if(!file||!Number.isSafeInteger(file.size)||file.size<=0||typeof file.slice!=='function')throw Error('Invalid local File source');
  this.file=file;this.total=BigInt(file.size);this.epoch=0;this.closed=false;this.busy=false;
  this.stats={fetchedBytes:0,requests:0,aborts:0,discardedBytes:0,cacheBytes:0,peakCacheBytes:0,activeBytes:0,peakActiveBytes:0,peakChunkBytes:0,peakOwnedBytes:0};
 }
 async open(){if(this.closed)throw Error('File reader closed');return {size:String(this.total),kind:'file'};}
 beginEpoch(){this.epoch++;this.stats.aborts++;void this.active?.cancel().catch(()=>{});}
 close(){if(this.closed)return;this.closed=true;this.beginEpoch();this.file=null;}
 async read(offset,capacity){
  if(this.closed)throw Error('File reader closed');
  if(this.busy)throw Error('Concurrent reads are not allowed');
  if(typeof offset!=='bigint'||offset<0n||!Number.isInteger(capacity)||capacity<1||capacity>262144)throw Error('Invalid read');
  if(offset>=this.total)return new Uint8Array();
  const size=Number(this.total-offset<BigInt(capacity)?this.total-offset:BigInt(capacity));
  const epoch=this.epoch;this.busy=true;let at=0,stream,output;
  try{
   output=new Uint8Array(size);this.stats.activeBytes=size;this.stats.peakActiveBytes=Math.max(this.stats.peakActiveBytes,size);
   stream=this.active=this.file.slice(Number(offset),Number(offset)+size).stream().getReader();this.stats.requests++;
   for(;;){
    const {value,done}=await stream.read();
    if(value){this.stats.fetchedBytes+=value.length;this.stats.peakChunkBytes=Math.max(this.stats.peakChunkBytes,value.length);this.stats.peakOwnedBytes=Math.max(this.stats.peakOwnedBytes,size+value.length);}
    if(epoch!==this.epoch||this.closed){this.stats.discardedBytes+=at+(value?.length??0);throw new DOMException('Superseded','AbortError');}
    if(done)break;
    if(at+value.length>size)throw Error('Local read exceeds requested slice');output.set(value,at);at+=value.length;
   }
   if(at!==size)throw Error('Local file changed or truncated');
  }finally{await stream?.cancel().catch(()=>{});stream?.releaseLock();this.active=null;this.busy=false;this.stats.activeBytes=0;}
  if(epoch!==this.epoch||this.closed){this.stats.discardedBytes+=at;throw new DOMException('Superseded','AbortError');}
  return output;
 }
}
