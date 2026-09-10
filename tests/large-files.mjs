import {chromium,firefox} from 'playwright';import assert from 'node:assert/strict';import {mkdir,writeFile} from 'node:fs/promises';import {serve} from '../experiments/pipeline-qualification/server.mjs';
const server=await serve(),family=process.env.BROWSER||'chrome',browser=await(family==='chrome'?chromium:firefox).launch({headless:true,...(family==='chrome'?{channel:'chrome',args:['--autoplay-policy=no-user-gesture-required']}:{})});
const out=`results/routing-completion/large-files-${new Date().toISOString().replaceAll(':','-')}`;await mkdir(out,{recursive:true});const result={family,browser:browser.version(),cases:[]};console.log(out);
async function setup(p,options){await p.goto(server.origin+'/experiment/page.html');await p.evaluate(async options=>{const {Player}=await import('/web/generated/index.js');window.player=new Player(document.querySelector('#surface'),options);window.errors=[];player.addEventListener('error',e=>errors.push(String(e.detail)));const input=document.createElement('input');input.type='file';input.id='file';document.body.append(input);File.prototype.arrayBuffer=()=>{throw Error('Whole-file materialization forbidden');};},options);}
async function open(p,path){await p.locator('#file').setInputFiles(path);return p.evaluate(()=>player.open(document.querySelector('#file').files[0]));}
async function check(name,options,run){const p=await browser.newPage();p.setDefaultTimeout(45000);const r={name};result.cases.push(r);try{await setup(p,options);const start=Date.now();await run(p,r);r.elapsedMs=Date.now()-start;r.state=await p.evaluate(()=>({mode:player.mode,properties:Object.fromEntries(player.properties),diagnostics:player.diagnostics,errors}));assert.deepEqual(r.state.errors,[]);await p.screenshot({path:out+'/'+name+'.png'});await p.evaluate(()=>player.destroy());await p.waitForTimeout(100);assert.equal(p.workers().length,0);r.passed=true;console.log('PASS',name);}catch(e){r.error=String(e.stack);r.state=await p.evaluate(()=>({mode:player.mode,properties:Object.fromEntries(player.properties),diagnostics:player.diagnostics,errors})).catch(()=>null);console.log('FAIL',name,String(e));process.exitCode=1;}finally{await p.evaluate(()=>player.destroy()).catch(()=>{});await p.close();await writeFile(out+'/result.json',JSON.stringify(result,null,2)+'\n');}}
try{
 if(!process.env.RECOVERY_ONLY)for(const mode of ['hybrid','software'])for(const name of ['64m','1g','4g'])await check(mode+'-'+name,{mode},async(p,r)=>{
  const start=Date.now();await open(p,`build/routing-completion/fixtures/${name}.mp4`);r.openMs=Date.now()-start;assert.ok(r.openMs<25000);
  await p.evaluate(()=>player.play());await p.waitForFunction(()=>player.properties.get('time-pos')>.3);await p.evaluate(()=>player.pause());
  r.seeks=[];for(const target of [2.5,.5]){const at=Date.now();await p.evaluate(t=>player.seek(t),target);const position=await p.evaluate(()=>player.properties.get('time-pos'));r.seeks.push({target,position,ms:Date.now()-at});assert.ok(Math.abs(position-target)<.15);assert.ok(Date.now()-at<10000);}
  const io=await p.evaluate(()=>player.diagnostics.backend.io);assert.ok(io.fetchedBytes<8*1024*1024);assert.ok(io.peakActiveBytes<=262144);assert.ok(io.peakOwnedBytes<=524288);assert.equal(io.cacheBytes,0);
 });
 await check('large-movie-recovery',{},async(p,r)=>{
  r.phase='open';await open(p,'build/routing-completion/fixtures/large-subtitles.mkv');assert.equal(await p.evaluate(()=>player.mode),'hybrid');
  r.phase='configure';await p.evaluate(async()=>{await player.selectTrack('audio','2');await player.volume(37);await player.rate(1.25);await player.play();});
  r.phase='recover';await p.waitForFunction(()=>player.properties.get('time-pos')>.2);assert.equal(await p.evaluate(()=>player.mode),'hybrid');await p.evaluate(()=>player.current.backend.dispatchEvent(new CustomEvent('error',{detail:'Injected browser decoder failure'})));await p.waitForFunction(()=>player.mode==='software');
  r.phase='verify-recovery';await p.evaluate(()=>player.pause());const props=await p.evaluate(()=>Object.fromEntries(player.properties));assert.equal(props.volume,37);assert.equal(props.speed,1.25);assert.equal(props['track-list'].find(t=>t.type==='audio'&&t.selected).lang,'jpn');assert.ok(props['time-pos']>=.2);
  r.phase='distant-seek';await p.evaluate(()=>player.seek(120));await p.evaluate(()=>player.seek(500));await p.evaluate(()=>player.seek(2));
  // Five bursts stay within the public 32-operation queue contract.
  r.phase='seek-bursts';const start=Date.now();for(let batch=0;batch<5;batch++)await p.evaluate(batch=>Promise.all(Array.from({length:20},(_,i)=>player.seek(1+((batch*20+i)%5)))),batch);
  r.hundredSeeksMs=Date.now()-start;assert.ok(Math.abs(await p.evaluate(()=>player.properties.get('time-pos'))-5)<.15);
 });
 await check('destroy-during-file-read',{mode:'hybrid'},async(p,r)=>{
  await open(p,'build/routing-completion/fixtures/4g.mp4');const state=await p.evaluate(async()=>{const seeking=player.seek(2).catch(()=>{});const start=performance.now();await player.destroy();await seeking;return {destroyMs:performance.now()-start};});assert.ok(state.destroyMs<5000);r.cleanup=state;
 });
}finally{await browser.close();await server.close();result.passed=result.cases.every(c=>c.passed);await writeFile(out+'/result.json',JSON.stringify(result,null,2)+'\n');}
