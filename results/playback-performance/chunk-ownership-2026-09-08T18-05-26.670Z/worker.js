
let chunk;
onmessage=({data})=>{
 try{
  if(data.operation==='construct'){
   const bytes=new Uint8Array(data.memory,data.offset,data.size);
   chunk=new EncodedVideoChunk({type:'key',timestamp:-33333,duration:33333,data:bytes});
   postMessage({constructed:true,byteLength:chunk.byteLength});
  }else if(data.operation==='copy'){
   const bytes=new Uint8Array(chunk.byteLength);chunk.copyTo(bytes);
   postMessage({bytes,timestamp:chunk.timestamp,duration:chunk.duration},[bytes.buffer]);chunk=null;
  }else if(data.operation==='measure'){
   const bytes=new Uint8Array(new SharedArrayBuffer(data.size));bytes.fill(83);
   const results=[];
   for(let n=0;n<100;n++)for(const sliced of [true,false])new EncodedVideoChunk({type:'delta',timestamp:n,data:sliced?bytes.slice():bytes});
   for(let trial=0;trial<8;trial++){
    const sliced=[true,false,false,true,true,false,false,true][trial],start=performance.now();let total=0;
    for(let n=0;n<data.iterations;n++){const value=new EncodedVideoChunk({type:'delta',timestamp:n,data:sliced?bytes.slice():bytes});total+=value.byteLength;}
    results.push({sliced,milliseconds:performance.now()-start,total});
   }
   postMessage({results});
  }
 }catch(error){postMessage({error:String(error.stack)});}
};