import {chromium} from 'playwright';
import {mkdir,writeFile} from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
import {serve} from './server.mjs';
const server=await serve(),browser=await chromium.launch({channel:'chrome',headless:true,args:['--autoplay-policy=no-user-gesture-required']});
const out=`results/pipeline-separation/packets-${new Date().toISOString().replaceAll(':','-')}`;await mkdir(out,{recursive:true});
try{
 const page=await browser.newPage();await page.addInitScript(()=>{window.captured=[];let total=0;const append=SourceBuffer.prototype.appendBuffer;SourceBuffer.prototype.appendBuffer=function(b){total+=b.byteLength;if(total>32*1024*1024)throw Error('Capture limit');captured.push(new Uint8Array(b).slice());return append.call(this,b);};});
 await page.goto(server.origin+'/experiment/page.html');await page.evaluate(o=>start(o),{variant:'remux',url:server.origin+'/media/movie',target:236.9});await page.waitForTimeout(4000);await page.evaluate(()=>player.pause());
 const capture=await page.evaluate(()=>({parts:captured.map(b=>{let s='';for(let i=0;i<b.length;i++)s+=String.fromCharCode(b[i]);return btoa(s);}),state:snapshot()}));
 const file=out+'/capture.mp4';await writeFile(file,Buffer.concat(capture.parts.map(b=>Buffer.from(b,'base64'))));
 const packets=(p,extra=[])=>JSON.parse(execFileSync('ffprobe',['-v','error',...extra,'-show_packets','-show_data_hash','sha256','-show_entries','packet=stream_index,pts_time,dts_time,duration_time,data_hash','-of','json',p],{maxBuffer:20*1024*1024})).packets;
 const source=packets(server.media.movie,['-read_intervals','230%260']),output=packets(file);const map=new Map(source.map(p=>[p.data_hash,p]));
 const comparison=output.map(p=>{const s=map.get(p.data_hash);return {stream:p.stream_index,pts:Number(p.pts_time)-1,dts:Number(p.dts_time)-1,sourcePts:s?Number(s.pts_time):null,sourceDts:s?Number(s.dts_time):null,ptsError:s?Number(p.pts_time)-1-Number(s.pts_time):null,dtsError:s?Number(p.dts_time)-1-Number(s.dts_time):null};});
 await writeFile(out+'/result.json',JSON.stringify({state:capture.state,comparison},null,2)+'\n');await page.evaluate(()=>stop());console.log(out,comparison.slice(0,8));
}finally{await browser.close();await server.close();}
