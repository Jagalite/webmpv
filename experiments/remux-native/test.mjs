// Isolated host-FFmpeg experiment; no changes to the public playback modes.
import http from 'node:http';
import path from 'node:path';
import {readFile, writeFile, mkdir, stat} from 'node:fs/promises';
import {createReadStream} from 'node:fs';
import {spawn, execFileSync} from 'node:child_process';
import {chromium} from 'playwright';
import assert from 'node:assert/strict';

const root=path.resolve(process.env.MEDIA_ROOT||'.'), out=`results/remux-native/${new Date().toISOString().replaceAll(':','-')}`;
await mkdir(out,{recursive:true});
const mp4=path.join(root,'build/hybrid-performance/sample.mp4'), mkv=process.env.SOURCE?path.resolve(process.env.SOURCE):path.join(root,'build/remux-native/sample.mkv');
const result={scope:'Short headless Chrome, local unthrottled source, host FFmpeg remux; not browser-Wasm remux or independent acoustic A/V qualification',trials:[],jobs:[]};
result.ffmpeg=execFileSync('ffmpeg',['-version'],{encoding:'utf8'}).split('\n')[0];
result.commit=execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim();
result.mediaRoot=root;
result.probe=JSON.parse(execFileSync('ffprobe',['-v','error','-show_streams','-show_format','-of','json',mkv],{encoding:'utf8'}));
const children=new Set();
function stopChild(child){
 if(child.exitCode!==null||child.signalCode!==null)return;
 child.kill();
 const timer=setTimeout(()=>{if(child.exitCode===null&&child.signalCode===null)child.kill('SIGKILL');},1000);
 child.once('close',()=>clearTimeout(timer));
}
const server=http.createServer(async(req,res)=>{
 res.setHeader('Cross-Origin-Opener-Policy','same-origin');res.setHeader('Cross-Origin-Embedder-Policy','require-corp');res.setHeader('Cross-Origin-Resource-Policy','same-origin');res.setHeader('Cache-Control','no-store');
 try{
  const url=new URL(req.url,'http://localhost');
  if(url.pathname==='/remux.mp4'){
   const start=Number(url.searchParams.get('start')||0);assert.ok(start>=0&&start<24);
   const args=['-hide_banner','-loglevel','error','-readrate','1','-readrate_initial_burst','3',...(start?['-ss',String(start)]:[]),'-i',mkv,'-map','0:v:0','-map','0:a:0','-c','copy',...(result.probe.format.format_name==='mpegts'?['-bsf:a','aac_adtstoasc']:[]),'-avoid_negative_ts','make_zero','-movflags','empty_moov+default_base_moof+frag_keyframe','-frag_duration','500000','-flush_packets','1','-f','mp4','pipe:1'];
   const child=spawn('ffmpeg',args,{stdio:['ignore','pipe','pipe']});children.add(child);
   const job={id:url.searchParams.get('id'),start,pid:child.pid,started:Date.now(),bytes:0,args,stderr:''};result.jobs.push(job);
   child.stdout.on('data',b=>{job.firstByteAt??=Date.now();job.bytes+=b.length;});
   child.stderr.on('data',b=>job.stderr+=b.toString());
   child.on('error',e=>{job.error=String(e);res.destroy(e);});
   child.on('close',(code,signal)=>{children.delete(child);Object.assign(job,{code,signal,closed:Date.now()});});
   res.on('close',()=>stopChild(child));
   res.writeHead(200,{'Content-Type':'video/mp4'});child.stdout.pipe(res);return;
  }
  let file;
  if(url.pathname==='/source.mkv')file=mkv;
  else if(url.pathname==='/source.mp4')file=mp4;
  else if(url.pathname.startsWith('/web/')||url.pathname.startsWith('/fixtures/'))file=path.resolve(root,'.'+url.pathname);
  else {res.writeHead(404).end();return;}
  assert.ok(file.startsWith(root+path.sep));
  const info=await stat(file);let start=0,end=info.size-1,status=200;
  if(req.headers.range){const m=/^bytes=(\d+)-(\d*)$/.exec(req.headers.range);assert.ok(m);start=Number(m[1]);if(m[2])end=Math.min(end,Number(m[2]));assert.ok(start<=end);status=206;res.setHeader('Content-Range',`bytes ${start}-${end}/${info.size}`);}
  const types={'.html':'text/html','.js':'text/javascript','.mjs':'text/javascript','.wasm':'application/wasm','.mp4':'video/mp4','.mkv':'video/x-matroska','.ts':'video/mp2t'};
  res.writeHead(status,{'Content-Type':types[path.extname(file)]||'application/octet-stream','Content-Length':end-start+1,'Accept-Ranges':'bytes'});
  const input=createReadStream(file,{start,end});res.on('close',()=>input.destroy());input.pipe(res);
 }catch(e){if(!res.headersSent)res.writeHead(500);res.end(String(e));}
});
await new Promise(r=>server.listen(0,'127.0.0.1',r));
const origin=`http://127.0.0.1:${server.address().port}`;
const variants=(process.env.VARIANTS||'native,remux,hybrid,software,software,hybrid,remux,native').split(',');
const ps=(pids)=>{try{return execFileSync('/bin/ps',['-o','pid=,rss=,time=','-p',pids.join(',')],{encoding:'utf8'}).trim().split('\n').filter(Boolean).map(line=>{const [pid,rss,t]=line.trim().split(/\s+/);const parts=t.split(':').map(Number);return {pid:Number(pid),rssKiB:Number(rss),cpu:parts.reduce((s,v)=>s*60+v,0)};});}catch{return [];}};
try{
 for(const [index,variant] of variants.entries()){
  const trial={variant,index,samples:[]};result.trials.push(trial);console.log('Starting',index,variant);
  const browser=await chromium.launch({channel:'chrome',headless:true,ignoreDefaultArgs:['--mute-audio'],args:['--autoplay-policy=no-user-gesture-required','--disable-background-timer-throttling','--disable-renderer-backgrounding']});
  try{
   result.browser=browser.version();const page=await browser.newPage();page.setDefaultTimeout(20000);
   await page.goto(origin+'/web/hybrid-performance.html');
   const cdp=await browser.newBrowserCDPSession();
   const url=origin+(variant==='remux'?`/remux.mp4?id=${index}`:variant==='native'?'/source.mp4':'/source.mkv');
   trial.startup=await page.evaluate(async({variant,url})=>{
    const {Player}=await import('/web/generated/index.js');window.errors=[];window.player=new Player(document.querySelector('#surface'),{mode:['native','native-mkv','native-source','remux'].includes(variant)?'native':variant,width:1920,height:1080});player.addEventListener('error',e=>errors.push(e.detail));
    const begin=performance.now();await player.openRemote({url,...(['hybrid','software'].includes(variant)?{immutable:true}:{})});await player.play();
    await new Promise((resolve,reject)=>{const deadline=performance.now()+15000;const check=()=>{const d=player.diagnostics.backend;if((d.rendered||d.presentation?.drawn||0)>0)resolve();else if(performance.now()>deadline)reject(Error('No presented frame'));else setTimeout(check,10);};check();});
    return {firstFrameMs:performance.now()-begin,state:snapshot()};
   },{variant,url});
   trial.atFirstFrame=Date.now();trial.remuxAtFirstFrame=result.jobs.filter(j=>j.id===String(index)).map(j=>({...j}));
   await page.waitForTimeout(2000);
   for(let n=0;n<=8;n++){
    const processes=(await cdp.send('SystemInfo.getProcessInfo')).processInfo;
    trial.samples.push({at:Date.now(),processes,host:ps([...processes.map(p=>p.id),...result.jobs.filter(j=>j.id===String(index)&&!j.closed).map(j=>j.pid)]),state:await page.evaluate(()=>snapshot())});
    if(n<8)await page.waitForTimeout(1000);
   }
   const first=trial.samples[0],last=trial.samples.at(-1),elapsed=(last.at-first.at)/1000;
   let cpu=0;trial.processChurn=[];
   for(let i=1;i<trial.samples.length;i++){const a=new Map(trial.samples[i-1].processes.map(p=>[p.id,p.cpuTime])),b=new Map(trial.samples[i].processes.map(p=>[p.id,p.cpuTime]));for(const [id,time] of b){if(a.has(id))cpu+=time-a.get(id);else trial.processChurn.push(id);}for(const id of a.keys())if(!b.has(id))trial.processChurn.push(id);}
   const frames=s=>s.diagnostics.backend.rendered??s.diagnostics.backend.presentation?.drawn;
   const rss=trial.samples.map(s=>s.host.filter(p=>s.processes.some(b=>b.id===p.pid)).reduce((sum,p)=>sum+p.rssKiB,0)/1024);
   const ffpid=result.jobs.find(j=>j.id===String(index))?.pid,fa=first.host.find(p=>p.pid===ffpid),fb=last.host.find(p=>p.pid===ffpid);
   trial.summary={firstFrameMs:trial.startup.firstFrameMs,browserCpuPercent:cpu/elapsed*100,browserRssMeanMiB:rss.reduce((a,b)=>a+b)/rss.length,ffmpegCpuPercent:fa&&fb?(fb.cpu-fa.cpu)/elapsed*100:null,ffmpegRssPeakMiB:ffpid?Math.max(...trial.samples.flatMap(s=>s.host.filter(p=>p.pid===ffpid).map(p=>p.rssKiB/1024))):null,elapsed,positionAdvance:last.state.position-first.state.position,fps:(frames(last.state)-frames(first.state))/elapsed,mpvAvsyncMax:variant==='hybrid'||variant==='software'?Math.max(...trial.samples.map(s=>Math.abs(s.state.quality.avsync))):null};
   const seekBegin=Date.now();
   if(variant==='remux'){
    // Restart a progressively generated stream at a source keyframe. This is
    // deliberately not pretending that arbitrary exact seeking is implemented.
    await page.evaluate(async url=>{await player.openRemote({url});await player.play();},origin+`/remux.mp4?id=${index}-seek&start=18`);
   }else await page.evaluate(async()=>{await player.seek(18);await player.play();});
   await page.waitForFunction(remux=>{const d=player.diagnostics.backend;return (d.rendered||d.presentation?.drawn||0)>0&&player.properties.get('time-pos')>(remux?0.1:17.9);},variant==='remux');
   trial.seek={readyMs:Date.now()-seekBegin,kind:variant==='remux'?'restart at source 18s, timestamps reset; keyframe accurate only':'player.seek(18)',state:await page.evaluate(()=>snapshot())};
   await page.waitForTimeout(1000);await page.screenshot({path:`${out}/${index}-${variant}.png`});
   await page.evaluate(()=>player.destroy());await page.waitForTimeout(300);trial.workersAfterDestroy=page.workers().length;
   console.log('Measured',variant,JSON.stringify(trial.summary));
   assert.equal(trial.workersAfterDestroy,0);assert.deepEqual(trial.processChurn,[]);
   for(const s of trial.samples)assert.deepEqual(s.state.errors,[]);
   assert.ok(trial.summary.fps>28,'Frame throughput');assert.ok(Math.abs(trial.summary.positionAdvance-elapsed)<0.5,'Playback clock drift');
   if(['native','native-mkv','native-source','remux'].includes(variant)){
    trial.summary.droppedFrames=last.state.diagnostics.backend.dropped-first.state.diagnostics.backend.dropped;
   }else{
    trial.summary.droppedFrames=(last.state.quality.frameDrops+last.state.quality.decoderDrops)-(first.state.quality.frameDrops+first.state.quality.decoderDrops);
    trial.summary.audioUnderruns=last.state.audio.underruns-first.state.audio.underruns;
    assert.equal(trial.summary.audioUnderruns,0);assert.ok(trial.summary.mpvAvsyncMax<0.12,'mpv internal sync estimate');
   }
   assert.equal(trial.summary.droppedFrames,0);
   if(variant==='remux'){assert.ok(trial.remuxAtFirstFrame.length>0);assert.ok(trial.remuxAtFirstFrame.every(j=>!j.closed),'First frame before remux completes');}
   trial.passed=true;console.log(variant,JSON.stringify(trial.summary));
  }catch(e){trial.error=String(e.stack);console.error(trial.error);process.exitCode=1;}
  finally{await writeFile(out+'/result.json',JSON.stringify(result,null,2)+'\n');await Promise.race([browser.close(),new Promise(r=>setTimeout(r,5000))]);}
 }
}finally{const stopped=[...children].map(child=>new Promise(r=>{child.once('close',r);stopChild(child);}));server.closeAllConnections();await new Promise(r=>server.close(r));await Promise.all(stopped);result.passed=result.trials.every(t=>t.passed);result.activeFfmpegAfter=children.size;await writeFile(out+'/result.json',JSON.stringify(result,null,2)+'\n');console.log(out);}
