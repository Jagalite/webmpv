import {RangeReader} from '/web/range-reader.js';
let reader,file,h,view,buffer,stopped=false;
let localStats={fetchedBytes:0,requests:0,cacheBytes:0,peakCacheBytes:0,peakActiveBytes:0};
self.onmessage=async({data})=>{
 if(data.type==='close'){stopped=true;reader?.close();if(h){Atomics.store(h,4,1);Atomics.store(h,0,3);Atomics.notify(h,0);}return;}
 if(data.type!=='init')return;
 try{
  h=new Int32Array(data.mailbox,0,16);view=new DataView(data.mailbox);buffer=new Uint8Array(data.mailbox,64);
  file=data.file;
  let size;
  if(file)size=file.size;
  else{reader=new RangeReader({...data.options,cacheBytes:2*1024*1024,blockBytes:65536});size=Number((await reader.open()).size);}
  postMessage({type:'ready',size});
  while(!stopped){
   if(Atomics.load(h,0)!==1){await Atomics.waitAsync(h,0,Atomics.load(h,0),100).value;continue;}
   const offset=view.getFloat64(32,true),n=Atomics.load(h,2);let bytes;
   if(file){bytes=new Uint8Array(await file.slice(offset,offset+n).arrayBuffer());localStats.fetchedBytes+=bytes.length;localStats.requests++;localStats.peakActiveBytes=Math.max(localStats.peakActiveBytes,bytes.length);}
   else bytes=await reader.read(BigInt(offset),n);
   if(stopped)break;buffer.set(bytes);Atomics.store(h,3,bytes.length);Atomics.store(h,0,2);Atomics.notify(h,0);
   postMessage({type:'stats',stats:reader?.stats??localStats});
  }
 }catch(e){if(h){Atomics.store(h,3,-1);Atomics.store(h,0,3);Atomics.notify(h,0);}postMessage({type:'error',message:String(e)});}
};
