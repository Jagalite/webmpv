import {chromium} from 'playwright';
import assert from 'node:assert/strict';
import {mkdir,writeFile,readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {serve} from '../experiments/pipeline-qualification/server.mjs';
const server=await serve(),out=`results/media-routing-integration/review-fixes-${new Date().toISOString().replaceAll(':','-')}`;
await mkdir(out,{recursive:true});const result={tests:[],sources:{}};
for(const f of ['web/native-remux-player.js','web/native-remux-source-worker.js'])result.sources[f]=createHash('sha256').update(await readFile(f)).digest('hex');
const browser=await chromium.launch({channel:'chrome',headless:true,args:['--autoplay-policy=no-user-gesture-required']});result.browser=browser.version();
async function check(name,run){
 const page=await browser.newPage();page.setDefaultTimeout(20000);
 try{
  await page.goto(server.origin+'/experiment/page.html');await page.evaluate(async()=>{const {Player}=await import('/web/generated/index.js');window.player=new Player(document.querySelector('#surface'),{mode:'native',nativeRemux:'always'});});
  const evidence=await run(page);await page.evaluate(()=>player.destroy());await page.waitForTimeout(150);assert.equal(page.workers().length,0);result.tests.push({name,passed:true,evidence});console.log('PASS',name);
 }catch(e){result.tests.push({name,passed:false,error:String(e.stack)});process.exitCode=1;console.log('FAIL',name,String(e));}
 finally{await page.evaluate(()=>player.destroy()).catch(()=>{});await page.close();await writeFile(out+'/result.json',JSON.stringify(result,null,2)+'\n');}
}
const open=(p,name='ts')=>p.evaluate(url=>player.openRemote({url}),server.origin+'/media/'+name);
try{
 for(const [file,silent] of [['native-remux-source-worker.js',false],['native-remux-worker.js',false],['native-remux-source-worker.js',true]])await check(`${file}: ${silent?'silent initialization deadline':'load failure rollback'}`,async page=>{
  await open(page);await page.evaluate(()=>{window.oldSurface=player.surface;});
  await page.route('**/'+file,route=>silent?route.fulfill({status:200,contentType:'text/javascript',headers:{'Cross-Origin-Embedder-Policy':'require-corp','Cross-Origin-Resource-Policy':'same-origin'},body:'self.onmessage=()=>{};'}):route.abort());
  const started=Date.now();const error=await page.evaluate(async url=>{try{await player.openRemote({url});return null;}catch(e){return String(e);}},server.origin+'/media/mkv');
  assert.match(error,silent?/initialization timed out/:/worker failed/);assert.ok(Date.now()-started<(silent?15000:5000));
  assert.equal(await page.evaluate(()=>player.surface===oldSurface),true);
  await page.evaluate(()=>player.play());await page.waitForFunction(()=>player.properties.get('time-pos')>.2);return {error,elapsedMs:Date.now()-started,rolledBack:true};
 });
 await check('invalid seeks preserve the live session, including the end boundary',async page=>{
  await open(page);const evidence=await page.evaluate(async()=>{
   const backend=player.current.backend,controller=backend.remux,src=player.surface.src,generation=controller.generation,duration=player.properties.get('duration');const errors=[];
   for(const t of [-1,NaN,Infinity,duration,duration+1])try{await player.seek(t);errors.push(null);}catch(e){errors.push(String(e));}
   return {errors,sameSource:src===player.surface.src,sameGeneration:generation===controller.generation,workers:controller.stats.workers,ready:player.surface.readyState};
  });assert.ok(evidence.errors.every(e=>e&&/seek/i.test(e)));assert.equal(evidence.sameSource,true);assert.equal(evidence.sameGeneration,true);assert.equal(evidence.workers,2);assert.ok(evidence.ready>=2);
  await page.evaluate(()=>player.play());await page.waitForFunction(()=>player.properties.get('time-pos')>.2);return evidence;
 });
 for(const change of ['etag','length'])await check(`seek rejects changed remote ${change}`,async page=>{
  let changed=false;const requests=[];
  await page.route('**/media/mkv',async route=>{requests.push({changed,ifRange:route.request().headers()['if-range']});const response=await route.fetch();const headers={...response.headers(),etag:changed&&change==='etag'?'"review-v2"':'"review-v1"'};
   if(changed&&change==='length')headers['content-range']=headers['content-range'].replace(/\/(\d+)$/,(_,n)=>'/'+(BigInt(n)+1n));
   await route.fulfill({response,headers});});
  await open(page,'mkv');await page.waitForTimeout(300);changed=true;
  const error=await page.evaluate(async()=>{try{await player.seek(120);return null;}catch(e){return String(e);}});
  assert.match(error,change==='etag'?/representation changed/:/changed length/);assert.equal(requests.find(r=>r.changed).ifRange,'"review-v1"');
  if(change==='etag'){await open(page,'mkv');await page.evaluate(()=>player.play());await page.waitForFunction(()=>player.properties.get('time-pos')>.2);}
  return {error,firstRequestAfterChange:requests.find(r=>r.changed),newExplicitOpenAccepted:change==='etag'};
 });
}finally{await browser.close();await server.close();result.passed=result.tests.every(t=>t.passed);await writeFile(out+'/result.json',JSON.stringify(result,null,2)+'\n');console.log(out);}
