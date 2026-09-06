import {RangeReader} from './range-reader.js';
let reader,header,bytes,view,busy=false,timer;
const refreshes=new Map();
self.onmessage=async({data})=>{
  try{
    if(data.type==='init'){
      header=new Int32Array(data.memory,data.pointer,16);bytes=new Uint8Array(data.memory,data.pointer+64,262144);view=new DataView(data.memory,data.pointer,64);
      reader=new RangeReader(data.options,data.canRefresh?()=>new Promise((resolve,reject)=>{const id=crypto.randomUUID();const timeout=setTimeout(()=>{refreshes.delete(id);reject(Error('Authorization refresh timed out'));},5000);refreshes.set(id,{resolve,reject,timeout});postMessage({type:'refresh',id});}):undefined);
      const info=await reader.open();postMessage({type:'ready',info});timer=setInterval(pump,2);
    }else if(data.type==='epoch')reader?.beginEpoch();
    else if(data.type==='close'){reader?.close();clearInterval(timer);for(const r of refreshes.values()){clearTimeout(r.timeout);r.reject(Error('Closed'));}refreshes.clear();postMessage({type:'closed'});}
    else if(data.type==='refreshed'){const r=refreshes.get(data.id);if(r){clearTimeout(r.timeout);refreshes.delete(data.id);data.error?r.reject(Error('Authorization refresh failed')):r.resolve(data.update);}}
  }catch(error){postMessage({type:'error',message:error.message});}
};
async function pump(){
  if(busy||(Atomics.load(header,0)&7)!==1)return;
  busy=true;const requestState=Atomics.load(header,0);const serial=Atomics.load(header,1),epoch=Atomics.load(header,3);
  try{
    const output=await reader.read(view.getBigUint64(32,true),Atomics.load(header,4));
    if((Atomics.load(header,0)&7)!==1||Atomics.load(header,1)!==serial||Atomics.load(header,3)!==epoch)return;
    bytes.set(output);Atomics.store(header,5,output.length);if(Atomics.compareExchange(header,0,requestState,requestState+1)===requestState)Atomics.notify(header,0);
  }catch(error){
    if(Atomics.load(header,0)===requestState&&Atomics.load(header,1)===serial&&Atomics.load(header,3)===epoch){Atomics.store(header,5,-1);if(Atomics.compareExchange(header,0,requestState,requestState+2)===requestState)Atomics.notify(header,0);if(error.name!=='AbortError')postMessage({type:'error',message:error.message});}
  }finally{busy=false;postMessage({type:'stats',stats:{...reader.stats,size:String(reader.total),reads:Atomics.load(header,12),seeks:Atomics.load(header,13),interruptions:Atomics.load(header,14)}});}
}
