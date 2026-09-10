import {chromium,firefox} from 'playwright';
import {readFile,mkdir,writeFile} from 'node:fs/promises';
import assert from 'node:assert/strict';
import {serve} from '../experiments/pipeline-qualification/server.mjs';
const out=`results/broad-routing/run-${new Date().toISOString().replaceAll(':','-')}`;await mkdir(out,{recursive:true});
const server=await serve(),family=process.env.BROWSER||'chrome';
const browser=await (family==='firefox'?firefox:chromium).launch({headless:true,...(family==='chrome'?{channel:'chrome',args:['--autoplay-policy=no-user-gesture-required']}:{})});
const result={browser:browser.version(),family,cases:[]};console.log(out);
const cases=[
 ...['hevc-aac','vp9-aac','h264-opus','h264-flac16','h264-51','h264-4k'].map(name=>({name,file:`build/broad-routing/fixtures/${name}.mp4`,mode:'native'})),
 {name:'av1-video-only',file:'build/fixtures/format-matrix/av1.mp4',mode:'native'},
 ...['ac3','eac3','flac','mp3'].map(codec=>({name:`platform-${codec}`,file:`build/broad-routing/fixtures/h264-${codec}.mp4`,automatic:true})),
 {name:'hybrid-4k',file:'build/broad-routing/fixtures/h264-4k.mp4',mode:'hybrid'},
 {name:'unsupported-video-software',file:'build/fixtures/software-full/mpeg4-mp3.avi',automatic:true,expect:'software'}
];
try{for(const c of cases.filter(c=>!process.env.CASES||process.env.CASES.split(',').includes(c.name))){
 const p=await browser.newPage();p.setDefaultTimeout(40000);const r={...c};result.cases.push(r);
 try{
  await p.goto(server.origin+'/experiment/page.html');await p.evaluate(async c=>{const {Player}=await import('/web/generated/index.js');window.errors=[];window.player=new Player(document.querySelector('#surface'),{...(c.automatic?{}:{mode:c.mode}),nativeRemux:'always'});player.addEventListener('error',e=>errors.push(String(e.detail)));},c);
  const bytes=await readFile(c.file),start=Date.now();await p.evaluate(b=>player.open(new File([Uint8Array.from(atob(b),x=>x.charCodeAt(0))],'media')),bytes.toString('base64'));r.openMs=Date.now()-start;
  await p.evaluate(()=>player.play());await p.waitForFunction(()=>Number(player.properties.get('time-pos'))>.5);await p.evaluate(()=>player.pause());
  const duration=await p.evaluate(()=>Number(player.properties.get('duration')));
  for(const target of [duration*.6,duration*.1,duration*.7]){const start=Date.now();await p.evaluate(t=>player.seek(t),target);(r.seeks??=[]).push({target,ms:Date.now()-start,position:await p.evaluate(()=>player.properties.get('time-pos'))});assert.ok(Math.abs(r.seeks.at(-1).position-target)<.15);}
  await p.evaluate(()=>player.play());await p.waitForTimeout(400);await p.evaluate(()=>player.pause());
  r.state=await p.evaluate(()=>({mode:player.mode,diagnostics:player.diagnostics,properties:Object.fromEntries(player.properties),errors}));
  assert.equal(r.state.mode,c.expect||c.mode||r.state.mode);assert.deepEqual(r.state.errors,[]);
  if(c.mode==='native')assert.equal(r.state.diagnostics.backend.plan,'remux');
  if(c.mode==='hybrid'){assert.equal(r.state.diagnostics.backend.decoder,'webcodecs');assert.equal(r.state.diagnostics.backend.decoderStats.copyMs,0);assert.equal(r.state.diagnostics.backend.decoderStats.actualWidth,3840);}
  await p.screenshot({path:`${out}/${c.name}.png`});await p.evaluate(()=>player.destroy());await p.waitForTimeout(100);assert.equal(p.workers().length,0);r.passed=true;console.log('PASS',c.name,r.state.mode);
 }catch(error){r.error=String(error.stack);r.state=await p.evaluate(()=>({mode:player.mode,diagnostics:player.diagnostics,errors})).catch(()=>null);console.log('FAIL',c.name,String(error));process.exitCode=1;}
 finally{await p.evaluate(()=>player.destroy()).catch(()=>{});await p.close();await writeFile(out+'/result.json',JSON.stringify(result,null,2)+'\n');}
}}finally{await browser.close();await server.close();result.passed=result.cases.every(c=>c.passed);await writeFile(out+'/result.json',JSON.stringify(result,null,2)+'\n');}
