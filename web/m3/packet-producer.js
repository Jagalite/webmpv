// Stand-in for a packet owner on another thread; reads the actual shared Wasm heap.
self.onmessage=({data:{heap,base,packets,port}})=>{
  const view=new Uint8Array(heap);
  let previousID=0,previousGeneration=-1;
  port.onmessage=({data:{id,generation,index}})=>{
    try {
      if(id!==previousID+1||generation<previousGeneration||!Number.isInteger(index)||!packets[index])throw Error('Invalid packet request');
      previousID=id;previousGeneration=generation;
      const packet=packets[index],start=performance.now();
      const data=new Uint8Array(packet.size);
      data.set(view.subarray(base+packet.offset,base+packet.offset+packet.size));
      const copyMs=performance.now()-start;
      port.postMessage({id,generation,index,packet,data:data.buffer,copyMs},[data.buffer]);
    }catch(error){port.postMessage({id,generation,error:String(error)});}
  };
  port.start();port.postMessage({ready:true});
};
