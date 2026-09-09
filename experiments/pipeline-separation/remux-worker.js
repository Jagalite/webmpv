import createRemux from '/experiment/remux-engine/remux.mjs';
let engine,chunks=[],bytes=0;
const stats={calls:0,remuxMs:0,generatedBytes:0,peakBatchBytes:0,heapBytes:0};
const flush=()=>{const output=new Uint8Array(bytes);let at=0;for(const b of chunks){output.set(b,at);at+=b.length;}chunks=[];bytes=0;stats.generatedBytes+=output.length;stats.peakBatchBytes=Math.max(stats.peakBatchBytes,output.length);return output;};
const check=n=>{if(n<0)throw Error(`FFmpeg error ${n}`);return n;};
self.onmessage=async({data})=>{
 try{
  const start=performance.now();
  if(data.type==='init'){
   engine=await createRemux({printErr:message=>postMessage({type:'log',message})});engine.io=data.mailbox;engine.raps=[];
   engine.emit=b=>{bytes+=b.length;if(bytes>8*1024*1024)throw Error('Fragment budget exceeded');chunks.push(b);};
   check(engine._rm_open(data.size));const duration=engine._rm_duration();
   const mime=`video/mp4; codecs="${engine.UTF8ToString(engine._rm_video_codec())},${engine.UTF8ToString(engine._rm_audio_codec())}"`;
   check(engine._rm_start(data.target||0));const buffer=flush().buffer;stats.remuxMs+=performance.now()-start;stats.heapBytes=engine.HEAPU8.byteLength;
   postMessage({type:'ready',duration,mime,buffer,stats:{...stats}},[buffer]);
  }else if(data.type==='next'){
   const more=check(engine._rm_step()),buffer=flush().buffer;stats.calls++;stats.remuxMs+=performance.now()-start;stats.heapBytes=engine.HEAPU8.byteLength;
   const raps=engine.raps.splice(0);postMessage({type:'fragment',more,buffer,raps,stats:{...stats}},[buffer]);
  }else if(data.type==='close'){engine?._rm_close();postMessage({type:'closed'});close();}
 }catch(e){postMessage({type:'error',message:String(e.stack||e)});}
};
