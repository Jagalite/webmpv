import {chromium,firefox} from 'playwright';import assert from 'node:assert/strict';import {mkdir,writeFile} from 'node:fs/promises';import {serve} from '../experiments/pipeline-qualification/server.mjs';
const server=await serve(),family=process.env.BROWSER||'chrome',browser=await(family==='chrome'?chromium:firefox).launch({headless:false,...(family==='chrome'?{channel:'chrome',args:['--autoplay-policy=no-user-gesture-required']}:{})});
const out=`results/packaging-negotiation/${family}-${new Date().toISOString().replaceAll(':','-')}`;await mkdir(out,{recursive:true});const result={browser:browser.version(),cases:[]};console.log(out);
const cases=[
 {name:'mp4-probe-rejection',file:'vp9-opus.mkv',deny:'mp4',expect:'webm'},
 {name:'mp4-buffer-rejection',file:'vp9-opus.mkv',rejectAdd:'mp4',expect:'webm'},
 {name:'mp4-initialization-rejection',file:'vp9-opus.mkv',rejectAppend:'mp4',expect:'webm'},
 {name:'opus-mp4-alternative',file:'audio-opus.ogg',deny:'webm',expect:'mp4'},
 {name:'both-rejected-fallback',file:'vp9-opus.mkv',deny:'both',automatic:true,expectMode:'hybrid'},
];
try{for(const c of cases){const p=await browser.newPage();p.setDefaultTimeout(35000);const r={...c};result.cases.push(r);try{
 await p.goto(server.origin+'/experiment/page.html');await p.evaluate(async c=>{
  const supported=MediaSource.isTypeSupported.bind(MediaSource),add=MediaSource.prototype.addSourceBuffer,append=SourceBuffer.prototype.appendBuffer,types=new WeakMap();
  MediaSource.isTypeSupported=m=>c.deny==='both'||m.includes('/'+c.deny+';')?false:supported(m);
  MediaSource.prototype.addSourceBuffer=function(m){if(m.includes('/'+c.rejectAdd+';'))throw new DOMException('Injected packaging rejection','NotSupportedError');const sb=add.call(this,m);types.set(sb,m);return sb;};
  SourceBuffer.prototype.appendBuffer=function(b){if(types.get(this)?.includes('/'+c.rejectAppend+';')){queueMicrotask(()=>this.dispatchEvent(new Event('error')));return;}return append.call(this,b);};
  const {Player}=await import('/web/generated/index.js');window.player=new Player(document.querySelector('#surface'),{...(c.automatic?{}:{mode:'native'}),nativeRemux:'always'});window.errors=[];player.addEventListener('error',e=>errors.push(String(e.detail)));const input=document.createElement('input');input.type='file';input.id='file';document.body.append(input);
 },c);
 await p.locator('#file').setInputFiles('build/routing-completion/fixtures/'+c.file);await p.evaluate(()=>player.open(document.querySelector('#file').files[0]));
 assert.equal(await p.evaluate(()=>player.mode),c.expectMode||'native');
 if(c.expect)assert.ok(await p.evaluate(x=>player.current.backend.remux.mime.includes('/'+x+';'),c.expect));
 await p.evaluate(()=>player.play());await p.waitForFunction(()=>Number(player.properties.get('time-pos'))>.5);await p.evaluate(()=>player.pause());
 r.seeks=[];for(const t of [40,2]){const start=Date.now();await p.evaluate(t=>player.seek(t),t);const pos=await p.evaluate(()=>Number(player.properties.get('time-pos')));assert.ok(Math.abs(pos-t)<.15);await p.evaluate(()=>player.play());await p.waitForFunction(t=>Number(player.properties.get('time-pos'))>t+.2,t);await p.evaluate(()=>player.pause());r.seeks.push({t,pos,ms:Date.now()-start});}
 r.state=await p.evaluate(()=>({diagnostics:player.diagnostics,errors}));assert.deepEqual(r.state.errors,[]);await p.screenshot({path:out+'/'+c.name+'.png'});await p.evaluate(()=>player.destroy());await p.waitForTimeout(100);assert.equal(p.workers().length,0);r.passed=true;console.log('PASS',c.name);
 }catch(e){r.error=String(e.stack);r.state=await p.evaluate(()=>({diagnostics:player.diagnostics,errors})).catch(()=>null);process.exitCode=1;console.log('FAIL',c.name,String(e));}finally{await p.evaluate(()=>player.destroy()).catch(()=>{});await p.close();await writeFile(out+'/result.json',JSON.stringify(result,null,2)+'\n');}}
}finally{await browser.close();await server.close();result.passed=result.cases.every(c=>c.passed);await writeFile(out+'/result.json',JSON.stringify(result,null,2)+'\n');}
