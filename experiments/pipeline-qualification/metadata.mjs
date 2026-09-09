import {chromium} from 'playwright';
import {mkdir,writeFile} from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
import assert from 'node:assert/strict';
import {serve} from './server.mjs';
const out=`results/pipeline-qualification/metadata-${new Date().toISOString().replaceAll(':','-')}`;
await mkdir(out,{recursive:true});console.log(out);const server=await serve(),result={cases:[]};
const probe=p=>JSON.parse(execFileSync('ffprobe',['-v','error','-select_streams','v:0','-show_streams','-of','json',p])).streams[0];
try{for(const media of ['rotation','sar','bt709','bt601']){
 const browser=await chromium.launch({channel:'chrome',headless:true,args:['--autoplay-policy=no-user-gesture-required']}),r={media,browserVersion:browser.version()};result.cases.push(r);
 try{const page=await browser.newPage();await page.addInitScript(()=>{window.parts=[];let size=0;const append=SourceBuffer.prototype.appendBuffer;SourceBuffer.prototype.appendBuffer=function(b){size+=b.byteLength;if(size>16*1024*1024)throw Error('Capture bound');parts.push(b.slice(0));return append.call(this,b);};});
  await page.goto(server.origin+'/experiment/page.html');await page.evaluate(o=>start(o),{variant:'remux',url:server.origin+'/media/'+media});await page.evaluate(()=>player.pause());await page.waitForTimeout(500);
  const parts=await page.evaluate(()=>window.parts.map(b=>{let s='';for(const x of new Uint8Array(b))s+=String.fromCharCode(x);return btoa(s);}));const file=out+'/'+media+'.mp4';await writeFile(file,Buffer.concat(parts.map(p=>Buffer.from(p,'base64'))));r.source=probe(server.media[media]);r.output=probe(file);
  for(const key of ['codec_name','profile','width','height','pix_fmt','sample_aspect_ratio','color_range','color_space','color_transfer','color_primaries'])assert.equal(r.output[key],r.source[key],key);
  const rotation=s=>s.side_data_list?.find(d=>d.side_data_type==='Display Matrix')?.rotation??0;assert.equal(rotation(r.output),rotation(r.source),'rotation');
  await page.evaluate(()=>stop());await page.waitForTimeout(150);assert.equal(page.workers().length,0);r.passed=true;
 }catch(e){r.error=String(e.stack);process.exitCode=1;}finally{await browser.close();await writeFile(out+'/result.json',JSON.stringify(result,null,2)+'\n');}
}}finally{await server.close();result.passed=result.cases.every(c=>c.passed);await writeFile(out+'/result.json',JSON.stringify(result,null,2)+'\n');console.log(out,result.passed);}
