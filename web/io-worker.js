import {RangeReader} from './range-reader.js';
let reader,resources,header,bytes,view,extra,urlBytes,busy=false,timer,stopped=false;
const refreshes=new Map();
self.onmessage=async({data})=>{
  try{
    if(data.type==='init'){
      header=new Int32Array(data.memory,data.pointer,16);bytes=new Uint8Array(data.memory,data.pointer+64,262144);view=new DataView(data.memory,data.pointer,64);
      const refresh=data.canRefresh?(resource)=>new Promise((resolve,reject)=>{const id=crypto.randomUUID();const timeout=setTimeout(()=>{refreshes.delete(id);reject(Error('Authorization refresh timed out'));},5000);refreshes.set(id,{resolve,reject,timeout});postMessage({type:'refresh',id,resource});}):undefined;
      if(data.options.format&&data.options.format!=='file'){
        if(!['hls','dash'].includes(data.options.format))throw Error('Unknown remote source format');
        const {ResourceLoader}=await import('./resource-loader.js');
        if(stopped)return;
        resources=new ResourceLoader(data.options,refresh);
        extra=new DataView(data.memory,data.pointer+64+262144,24);
        urlBytes=new Uint8Array(data.memory,data.pointer+64+262144+24,4096);
        const info=await resources.open(data.options.url,{manifest:true});
        postMessage({type:'ready',info:{...info,resource:info.id}});startPump();return;
      }
      reader=new RangeReader(data.options,refresh);
      const info=await reader.open();postMessage({type:'ready',info});startPump();
    }else if(data.type==='epoch'){reader?.beginEpoch();resources?.beginEpoch();}
    else if(data.type==='close'){stopped=true;if(header)Atomics.notify(header,0);reader?.close();resources?.close();clearInterval(timer);for(const r of refreshes.values()){clearTimeout(r.timeout);r.reject(Error('Closed'));}refreshes.clear();postMessage({type:'closed'});}
    else if(data.type==='refreshed'){const r=refreshes.get(data.id);if(r){clearTimeout(r.timeout);refreshes.delete(data.id);data.error?r.reject(Error('Authorization refresh failed')):r.resolve(data.update);}}
  }catch(error){postMessage({type:'error',message:error.message});}
};
async function pump(){
  if(busy||(Atomics.load(header,0)&7)!==1)return;
  busy=true;const requestState=Atomics.load(header,0);const serial=Atomics.load(header,1),epoch=Atomics.load(header,3);
  try{
    let output=new Uint8Array(),result=0,opened;
    if(resources){
      const operation=Atomics.load(header,15),id=extra.getInt32(0,true);
      if(operation===1){
        const zero=urlBytes.indexOf(0);if(zero<0)throw Error('Resource URL exceeds mailbox capacity');
        const url=new TextDecoder('utf-8',{fatal:true}).decode(urlBytes.slice(0,zero));
        const start=extra.getBigInt64(8,true),end=extra.getBigInt64(16,true);
        opened=await resources.open(url,start<0?{}:{start,end});result=opened.id;
      }else if(operation===2){output=resources.read(id,view.getBigUint64(32,true),Atomics.load(header,4));result=output.length;}
      else if(operation===3)resources.closeHandle(id);
      else throw Error('Invalid resource operation');
    }else{output=await reader.read(view.getBigUint64(32,true),Atomics.load(header,4));result=output.length;}
    if((Atomics.load(header,0)&7)!==1||Atomics.load(header,1)!==serial||Atomics.load(header,3)!==epoch){if(opened)resources.closeHandle(opened.id);return;}
    if(opened)view.setBigInt64(40,BigInt(opened.size),true);
    bytes.set(output);Atomics.store(header,5,result);if(Atomics.compareExchange(header,0,requestState,requestState+1)===requestState)Atomics.notify(header,0);
  }catch(error){
    if(Atomics.load(header,0)===requestState&&Atomics.load(header,1)===serial&&Atomics.load(header,3)===epoch){Atomics.store(header,5,-1);if(Atomics.compareExchange(header,0,requestState,requestState+2)===requestState)Atomics.notify(header,0);if(error.name!=='AbortError')postMessage({type:'error',message:error.message});}
  }finally{busy=false;postMessage({type:'stats',stats:{...(resources??reader).stats,size:String(reader?.total??0),reads:Atomics.load(header,12),seeks:Atomics.load(header,13),interruptions:Atomics.load(header,14)}});}
}

function startPump(){
  if(typeof Atomics.waitAsync!=='function'){timer=setInterval(pump,2);return;}
  void (async()=>{
    while(!stopped){
      await pump();
      if(stopped)break;
      const state=Atomics.load(header,0);
      if((state&7)===1)continue;
      await Atomics.waitAsync(header,0,state,1000).value;
    }
  })();
}
