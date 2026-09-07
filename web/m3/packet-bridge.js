export function validateReply(reply,request,packet){
  if(reply.error)throw Error(reply.error);
  if(reply.id!==request.id||reply.generation!==request.generation||reply.index!==request.index)throw Error('Stale or mismatched bridge reply');
  for(const key of ['offset','size','pts','dts','duration','key','sha256'])if(reply.packet?.[key]!==packet[key])throw Error(`Packet metadata mismatch: ${key}`);
  if(!(reply.data instanceof ArrayBuffer)||reply.data.byteLength!==packet.size)throw Error('Packet size mismatch');
  if(!Number.isFinite(reply.copyMs)||reply.copyMs<0)throw Error('Invalid copy timing');
}
export class PacketBridge {
  constructor(heap,base,packets){
    this.packets=packets;this.nextID=0;this.pending=null;this.closed=false;
    this.stats={requests:0,replies:0,bytes:0,peakPending:0,errors:0};
    const {port1,port2}=new MessageChannel();this.port=port1;
    this.worker=new Worker('./packet-producer.js',{type:'module'});
    this.ready=new Promise((resolve,reject)=>{
      this.rejectReady=reject;
      this.readyTimer=setTimeout(()=>reject(Error('Bridge setup timeout')),10000);
      this.port.onmessage=({data})=>{
        if(data.ready){clearTimeout(this.readyTimer);resolve();return;}
        const pending=this.pending;
        if(!pending){this.stats.errors++;this.failure=Error('Unsolicited bridge reply');return;}
        this.pending=null;clearTimeout(pending.timer);
        try {
          validateReply(data,pending.request,this.packets[pending.request.index]);
          this.stats.replies++;this.stats.bytes+=data.data.byteLength;
          pending.resolve({...data,roundTripMs:performance.now()-pending.started});
        }catch(error){this.stats.errors++;this.failure=error;pending.reject(error);}
      };
      this.worker.onerror=error=>{this.failure=Error(error.message);reject(this.failure);this.pending?.reject(this.failure);};
      this.port.start();this.worker.postMessage({heap,base,packets,port:port2},[port2]);
    });
  }
  async read(index,generation){
    await this.ready;
    if(this.failure)throw this.failure;
    if(this.closed||this.pending)throw Error('Bridge is closed or busy');
    const request={id:++this.nextID,index,generation};
    return new Promise((resolve,reject)=>{
      const timer=setTimeout(()=>{this.failure=Error('Packet bridge timeout');reject(this.failure);},10000);
      this.pending={request,resolve,reject,timer,started:performance.now()};
      this.stats.requests++;this.stats.peakPending=1;this.port.postMessage(request);
    });
  }
  close(){
    this.closed=true;clearTimeout(this.readyTimer);
    if(this.pending){clearTimeout(this.pending.timer);this.pending.reject(Error('Bridge closed'));this.pending=null;}
    this.port.close();this.worker.terminate();
  }
}
