const sleep = ms => new Promise(resolve => setTimeout(resolve, Math.max(0, ms)));
const now = () => performance.now();
const percentile = (values, p) => {
  const sorted = [...values].sort((a,b) => a-b);
  return sorted.length ? sorted[Math.min(sorted.length-1,Math.ceil(sorted.length*p)-1)] : null;
};

self.onmessage = async ({data}) => {
  try { postMessage({type:'done',result:await run(data)}); }
  catch(error) { postMessage({type:'error',error:String(error.stack || error)}); }
};

async function run({options,manifest:m,packets,canvas,transferAt}) {
  const receivedAt = performance.timeOrigin + now();
  const {path,passes=3,quality=false,seek=false,transport='direct',warmupPasses=0} = options;
  const variant=path==='software'?'software':`copyback-${transport}`;
  if(!['software','copyback','retained'].includes(path)) throw Error('Unknown path');
  const result = {path,variant,transport,warmupPasses,passes,quality,seek,packetTransferMs:receivedAt-transferAt,
    packetBytes:packets.byteLength,hardwareAcceleration:'unknown',formats:[],runs:[],warmupRuns:[]};
  const ctx = canvas.getContext('2d',{alpha:false});
  const frameImage = path==='retained'?null:new ImageData(m.width,m.height);
  const copyBuffer = path==='copyback'?new Uint8Array(m.width*m.height*3/2):null;
  let bytes = new Uint8Array(packets);
  const extra = new Uint8Array(m.description);
  const loadAt = now();
  let engine, input, yuv, browserDecoder, fatal, corpus, bridge;
  let chain = Promise.resolve(), sent = 0, delivered = 0, outstandingPeak = 0;
  if(path !== 'retained') {
    const create = (await import('./engine/decoder.mjs')).default;
    engine = await create();
    const ptr = engine._malloc(extra.length);
    engine.HEAPU8.set(extra,ptr);
    const code = engine._bench_init(ptr,extra.length,m.width,m.height);
    engine._free(ptr);
    if(code<0) throw Error(`bench_init ${code}`);
    input = engine._malloc(Math.max(...m.packets.map(p=>p.size)));
    yuv = engine._malloc(m.width*m.height*3/2);
    if(!input || !yuv) throw Error('Allocation failed');
  }
  corpus=engine._malloc(bytes.length);
  if(!corpus) throw Error('Corpus allocation failed');
  engine.HEAPU8.set(bytes,corpus); bytes=null; packets=null;
  if(transport==='bridge') {
    const {PacketBridge}=await import('./packet-bridge.js');
    bridge=new PacketBridge(engine.HEAPU8.buffer,corpus,m.packets);
    await bridge.ready;
  }
  const config = {codec:m.codec,description:extra,codedWidth:m.width,codedHeight:m.height,
    colorSpace:m.colorSpace,hardwareAcceleration:'no-preference',optimizeForLatency:false};
  if(path !== 'software') {
    const support = await VideoDecoder.isConfigSupported(config);
    result.configuration = {supported:support.supported,codec:support.config.codec,
      hardwareAcceleration:support.config.hardwareAcceleration};
    if(!support.supported) throw Error(`Unsupported ${m.codec}`);
    browserDecoder = new VideoDecoder({error:e=>{fatal=e;}, output:frame=>{
      chain = chain.then(async()=>{
        try { if(!fatal) await present(frame.timestamp,frame); }
        finally {frame.close();}
      }).catch(error=>{fatal=error;});
    }});
    browserDecoder.configure(config);
  }
  result.moduleAndConfigureMs = now()-loadAt;
  let record, clockStart, passStart, target;
  const samplePTS = new Set([0,1000000,17500000,31000000]);
  async function present(pts,frame) {
    if(fatal) throw fatal;
    record.timestamps.push(pts);
    if(target !== null && pts < target) {delivered++; return;}
    if(record.firstOutputMs === null) record.firstOutputMs=now()-passStart;
    const preparedAt=now();
    let pixels;
    if(path === 'copyback') {
      if(!result.formats.includes(frame.format)) result.formats.push(frame.format);
      if(!['I420','NV12'].includes(frame.format)) throw Error(`Unsupported copy-back format ${frame.format}`);
      const layout = frame.format==='NV12'
        ? [{offset:0,stride:m.width},{offset:m.width*m.height,stride:m.width}]
        : [{offset:0,stride:m.width},{offset:m.width*m.height,stride:m.width/2},
          {offset:m.width*m.height*5/4,stride:m.width/2}];
      const copyAt=now();
      // A real browser readback and upload into Wasm, followed by the same scaler.
      const data = copyBuffer;
      await frame.copyTo(data,{layout});
      record.copyMs += now()-copyAt;
      const uploadAt=now(); engine.HEAPU8.set(data,yuv);record.uploadMs += now()-uploadAt;
      const convertAt=now(), ptr=frame.format==='NV12'?engine._bench_nv12(yuv):engine._bench_i420(yuv);
      if(!ptr) throw Error('I420 conversion failed');
      frameImage.data.set(engine.HEAPU8.subarray(ptr,ptr+m.width*m.height*4));pixels=frameImage;
      record.convertMs += now()-convertAt;
    } else if(path === 'software') {
      const convertAt=now(), ptr=engine._bench_rgba();
      if(!ptr) throw Error('Software conversion failed');
      frameImage.data.set(engine.HEAPU8.subarray(ptr,ptr+m.width*m.height*4));pixels=frameImage;
      record.convertMs += now()-convertAt;
    } else if(!result.formats.includes(frame.format)) result.formats.push(frame.format);
    record.prepareMs += now()-preparedAt;
    if(clockStart === null) clockStart=now()-(pts-(target??0))/1000;
    const due = clockStart+(pts-(target??0))/1000;
    if(!quality && !seek) {
      while(now()<due-1) await sleep(due-now());
    }
    const drawAt=now();
    if(pixels) ctx.putImageData(pixels,0,0); else ctx.drawImage(frame,0,0,m.width,m.height);
    record.drawMs += now()-drawAt;
    if(!quality && !seek && pts>=1000000) record.latenessMs.push(Math.max(0,now()-due));
    record.presented++;
    if(record.firstPresentedPTS === null) {record.firstPresentedPTS=pts;record.firstPresentedMs=now()-passStart;}
    if(quality && samplePTS.has(pts)) {
      // Fixed grid from the actual full-resolution canvas; measurement runs omit readback.
      const full=ctx.getImageData(0,0,m.width,m.height).data, rgb=[];
      for(let y=4;y<m.height;y+=16) for(let x=4;x<m.width;x+=16) {
        const at=(y*m.width+x)*4;rgb.push(full[at],full[at+1],full[at+2]);
      }
      record.samples.push({pts,rgb});
    }
    delivered++;
    if(delivered%30===0) postMessage({type:'progress',phase:record.warmup?'warmup':'playback',variant,path,pass:record.pass,
      frames:record.presented,heapBytes:engine?.HEAPU8.length??0});
  }
  async function receiveSoftware() {
    for(;;) {
      const code=engine._bench_receive();
      if(code===0 || code===2) return code;
      if(code!==1) throw Error(`bench_receive ${code}`);
      await present(engine._bench_pts(),null);
    }
  }
  async function checkWait() {
    if(fatal) throw fatal;
    if(now()-passStart > (quality||seek?120000:m.durationUs/1000+30000)) throw Error('Decoder watchdog');
    await sleep(1);
  }
  try {
    for(let iteration=0;iteration<warmupPasses+passes;iteration++) {
      const warmup=iteration<warmupPasses,pass=iteration-warmupPasses;
      target=seek?17500000:null;
      let selected=m.packets;
      if(seek) {
        const key=m.packets.filter(p=>p.key&&p.pts<=target).at(-1);
        const start=m.packets.indexOf(key), end=m.packets.findIndex((p,i)=>i>start&&p.key);
        selected=m.packets.slice(start,end<0?undefined:end);
      }
      record={pass,warmup,bridgeRTT:[],bridgeCopyMs:0,packetHashesVerified:0,presented:0,timestamps:[],latenessMs:[],samples:[],firstOutputMs:null,
        firstPresentedMs:null,firstPresentedPTS:null,copyMs:0,uploadMs:0,convertMs:0,
        prepareMs:0,drawMs:0,submitMs:0};
      (warmup?result.warmupRuns:result.runs).push(record);
      sent=0;delivered=0;clockStart=null;passStart=now();
      if(engine) engine._bench_reset();
      if(browserDecoder) {browserDecoder.reset();browserDecoder.configure(config);}
      postMessage({type:'progress',phase:warmup?'warmup':'playback',variant,path,pass,frames:0,heapBytes:engine?.HEAPU8.length??0});
      for(const p of selected) {
        if(fatal) throw fatal;
        if(path!=='software')while(sent-delivered>=8)await checkWait();
        let packet;
        if(bridge) {
          const reply=await bridge.read(m.packets.indexOf(p),iteration);
          packet=new Uint8Array(reply.data);
          record.bridgeRTT.push(reply.roundTripMs);record.bridgeCopyMs+=reply.copyMs;
        } else packet=engine.HEAPU8.subarray(corpus+p.offset,corpus+p.offset+p.size);
        if(quality) {
          const digest=await crypto.subtle.digest('SHA-256',new Uint8Array(packet));
          const hex=Array.from(new Uint8Array(digest),v=>v.toString(16).padStart(2,'0')).join('');
          if(hex!==p.sha256)throw Error('Packet bytes differ');
          record.packetHashesVerified++;
        }
        if(path === 'software') {
          const at=now();engine.HEAPU8.set(packet,input);
          const code=engine._bench_send(input,p.size,p.pts,p.dts);
          record.submitMs+=now()-at;
          if(code<0) throw Error(`bench_send ${code}`);
          sent++;outstandingPeak=Math.max(outstandingPeak,sent-delivered);
          await receiveSoftware();
        } else {
          while(sent-delivered>=8) await checkWait();
          const at=now();browserDecoder.decode(new EncodedVideoChunk({type:p.key?'key':'delta',
            timestamp:p.pts,duration:p.duration,data:packet}));
          record.submitMs+=now()-at;
          sent++;outstandingPeak=Math.max(outstandingPeak,sent-delivered);
        }
      }
      if(browserDecoder) {await browserDecoder.flush();await chain;if(fatal) throw fatal;}
      else {
        const code=engine._bench_send(0,0,0,0);
        if(code<0) throw Error(`drain send ${code}`);
        if(await receiveSoftware()!==2) throw Error('Missing software EOF');
      }
      record.elapsedMs=now()-passStart;
      const expected=selected.map(p=>p.pts).sort((a,b)=>a-b);
      record.exactPTS=JSON.stringify(record.timestamps)===JSON.stringify(expected);
      record.lateFraction=record.latenessMs.filter(x=>x>33.334).length/Math.max(1,record.latenessMs.length);
      record.p95LatenessMs=percentile(record.latenessMs,.95);
      record.maxLatenessMs=record.latenessMs.length?Math.max(...record.latenessMs):null;
      if(!record.exactPTS) throw Error('Decoded PTS mismatch');
      if(seek && record.firstPresentedPTS!==target) throw Error('Seek target mismatch');
    }
    result.bridge=bridge?.stats??null;
    result.outstandingPeak=outstandingPeak;
    result.heapBytes=engine?.HEAPU8.length??0;
    result.checks={exactPTS:result.runs.every(r=>r.exactPTS),boundedQueue:outstandingPeak<=8,
      frameDelivery:quality||seek||result.runs.every(r=>r.lateFraction<=.01),
      heap:result.heapBytes<=536870912};
    return result;
  } finally {
    bridge?.close();
    if(browserDecoder && browserDecoder.state!=='closed')browserDecoder.close();
    if(engine) {engine._free(corpus);engine._free(input);engine._free(yuv);engine._bench_close();}
  }
}
