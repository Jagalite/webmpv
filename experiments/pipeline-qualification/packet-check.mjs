import assert from 'node:assert/strict';
import {chromium} from 'playwright';
import {mkdir,writeFile} from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
import {serve} from './server.mjs';
const media=process.env.MEDIA||'movie',target=Number(process.env.TARGET??236.9);
const server=await serve(),browser=await chromium.launch({channel:'chrome',headless:true,args:['--autoplay-policy=no-user-gesture-required']});
const out=`results/pipeline-qualification/packets-${new Date().toISOString().replaceAll(':','-')}`;await mkdir(out,{recursive:true});
try{
 const page=await browser.newPage();await page.addInitScript(()=>{window.captured=[];let total=0;const append=SourceBuffer.prototype.appendBuffer;SourceBuffer.prototype.appendBuffer=function(b){total+=b.byteLength;if(total>32*1024*1024)throw Error('Capture limit');captured.push(new Uint8Array(b).slice());return append.call(this,b);};});
 await page.goto(server.origin+'/experiment/page.html');await page.evaluate(o=>start(o),{variant:'remux',url:server.origin+'/media/'+media,target});await page.waitForTimeout(4000);await page.evaluate(()=>player.pause());
 const capture=await page.evaluate(()=>({parts:captured.map(b=>{let s='';for(let i=0;i<b.length;i++)s+=String.fromCharCode(b[i]);return btoa(s);}),state:snapshot()}));
 const file=out+'/capture.mp4';await writeFile(file,Buffer.concat(capture.parts.map(b=>Buffer.from(b,'base64'))));
 const packets=(p,extra=[])=>JSON.parse(execFileSync('ffprobe',['-v','error',...extra,'-show_packets','-show_data_hash','sha256','-show_entries','packet=stream_index,pts_time,dts_time,duration_time,data_hash','-of','json',p],{maxBuffer:20*1024*1024})).packets;
 let reference=server.media[media],referenceCommand=null;if(media==='ts'){reference=out+'/canonical-source.mp4';referenceCommand=['-v','error','-i',server.media[media],'-map','0:v:0','-map','0:a:0','-c','copy',reference];execFileSync('ffmpeg',referenceCommand);}
 const format=JSON.parse(execFileSync('ffprobe',['-v','error','-show_entries','format=start_time','-of','json',reference])).format;const origin=Number(format.start_time||0);const source=packets(reference,['-read_intervals',`${Math.max(0,target-10)}%${target+20}`]),output=packets(file);const map=new Map();for(const p of source){const key=p.stream_index+":"+p.data_hash;if(!map.has(key))map.set(key,[]);map.get(key).push(p);}
 const comparison=output.map(p=>{const candidates=map.get(p.stream_index+":"+p.data_hash)||[];candidates.sort((a,b)=>Math.abs(Number(a.pts_time)-origin-(Number(p.pts_time)-1))-Math.abs(Number(b.pts_time)-origin-(Number(p.pts_time)-1)));const s=candidates.shift();return {stream:p.stream_index,pts:Number(p.pts_time)-1,dts:Number(p.dts_time)-1,sourcePts:s?Number(s.pts_time)-origin:null,sourceDts:s?Number(s.dts_time)-origin:null,ptsError:s?Number(p.pts_time)-1-Number(s.pts_time)+origin:null,dtsError:s?Number(p.dts_time)-1-Number(s.dts_time)+origin:null};});
 const summary={packets:comparison.length,unmatched:comparison.filter(p=>p.sourcePts===null).length,maxPtsError:Math.max(...comparison.filter(p=>Number.isFinite(p.ptsError)).map(p=>Math.abs(p.ptsError))),maxKnownDtsError:Math.max(...comparison.filter(p=>Number.isFinite(p.dtsError)).map(p=>Math.abs(p.dtsError)))};const passed=summary.unmatched===0&&summary.maxPtsError<=.0011&&summary.maxKnownDtsError<=.0011;await writeFile(out+'/result.json',JSON.stringify({media,target,origin,referenceCommand,state:capture.state,comparison,summary,passed},null,2)+'\n');assert.ok(passed,'Compressed payload and timestamp preservation');await page.evaluate(()=>stop());console.log(out,comparison.slice(0,8));
}finally{await browser.close();await server.close();}
