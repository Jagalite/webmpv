// Reuse the accepted G1 harnesses without overwriting their release evidence.
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {spawn} from 'node:child_process';
import {createHash} from 'node:crypto';
const [backend='software',stage='functional']=process.argv.slice(2);
if(!['software','webcodecs'].includes(backend)||!['functional','supplemental','long'].includes(stage))throw Error('Expected software|webcodecs and functional|supplemental|long');
const headless=process.argv.includes('--headless-diagnostic');
if(headless&&stage!=='supplemental')throw Error('Headless diagnostics are restricted to supplemental checks');
const stamp=new Date().toISOString().replaceAll(':','-');
const output=`results/development/${backend}/${headless?'headless-':''}${stage}-${stamp}`;
await mkdir(output,{recursive:true});await mkdir('build/qualification',{recursive:true});
const engine=backend==='webcodecs'?'web/engine-m4':'web/engine';
const runtimeFiles=[`${engine}/player.wasm`,`${engine}/player.mjs`,'web/index.html','web/generated/player.js','web/engine-worker.js','web/audio-worklet.js','web/io-worker.js','web/range-reader.js','web/resource-loader.js','web/vod-manifest.js','web/browser-decoder-worker.js','scripts/qualification-foreground.mjs'];
const hashRuntime=async()=>Object.fromEntries(await Promise.all(runtimeFiles.map(async file=>[file,createHash('sha256').update(await readFile(file)).digest('hex')])));
const runtimeSha256=await hashRuntime();
const original=await readFile(`tests/m2-${stage}.mjs`,'utf8');
let source=original.replaceAll('results/m2',output);
function rewrite(needle,replacement){
 if(!source.includes(needle))throw Error(`Qualification harness pattern changed: ${needle}`);
 source=source.replace(needle,replacement);
}
source=`import {focusForQualification,observeForeground} from ${JSON.stringify(new URL('./qualification-foreground.mjs',import.meta.url).href)};\n`+source;
if(headless){
 rewrite('headless:false','headless:true');
 rewrite('JSON.stringify(result,null,2)', 'JSON.stringify({...result,executionMode:"headless-diagnostic",qualificationEligible:false},null,2)');
}else if(stage==='long'){
 rewrite("await page.waitForFunction(()=>typeof createPlayer==='function');","await page.waitForFunction(()=>typeof createPlayer==='function');result.foregroundAtStart=await focusForQualification(page,browser);");
 rewrite('const start=Date.now();result.measurementStarted=start;', 'result.foregroundAtMeasurement=await focusForQualification(page,browser);const start=Date.now();result.measurementStarted=start;');
 rewrite('sample.elapsedSeconds=', 'sample.foreground=await observeForeground(page,browser);sample.elapsedSeconds=');
 rewrite('if(i%12===0)console.log', "if(!sample.foreground.matched)throw Error('Foreground condition changed during long measurement');if(i%12===0)console.log");
 rewrite('result.checks={','result.checks={foreground:samples.every(s=>s.foreground.matched),');
}else{
 rewrite('const evidence=await fn();',"const foreground={name,before:await focusForQualification(page,browser)};(result.foregroundChecks??=[]).push(foreground);const evidence=await fn();foreground.after=await observeForeground(page,browser);if(!foreground.after.matched){foreground.completedCaseEvidence=evidence;throw Error('Foreground browser condition changed during '+name);}");
}
if(stage==='functional'){
 // Startup cases destroy their player before checking timing gates, so the
 // remaining independent cases can run safely after a recorded timing failure.
 rewrite('throw error;}}',"if(!(/^(front|tail) index:/.test(name)&&error.code==='ERR_ASSERTION'&&String(error.message).startsWith('startup ')))throw error;}}");
 rewrite('result.passed=true;',"result.passed=result.tests.every(test=>test.passed);if(!result.passed)process.exitCode=1;");
}
if(backend==='webcodecs'){
 source=source.replaceAll('?no-codecs','?decoder=webcodecs').replaceAll('web/engine/','web/engine-m4/');
 // Same numerical G1 gates. Only the expected decoder identity changes.
 if(stage==='long')rewrite('softwareOnly:samples.every(s=>s.browserCodecsAbsent)',"decoderProfile:samples.every(s=>s.video.decoder==='webcodecs')");
}
const harness=`build/qualification/${backend}-${stage}-${stamp}.mjs`;
await writeFile(harness,source);
await writeFile(`${output}/harness.json`,JSON.stringify({backend,stage,executionMode:headless?'headless-diagnostic':'foreground',qualificationEligible:!headless,original:`tests/m2-${stage}.mjs`,originalSha256:createHash('sha256').update(original).digest('hex'),adaptedSha256:createHash('sha256').update(source).digest('hex'),adaptations:['Separate output directory',headless?'Headless supplemental diagnostics only; ineligible for qualification':'Explicit focus and foreground-condition recording',...(stage==='functional'?['Continue independent cases after recorded startup-case failure; retain failed overall status']:[]),...(backend==='webcodecs'?['Optional artifact URL and hash path','Long-run decoder identity replaces software-only identity; numerical gates unchanged']:[])]},null,2)+'\n');
console.log(output);
const child=spawn(process.execPath,[harness],{stdio:'inherit'});
child.on('exit',async code=>{
 try{
  const after=await hashRuntime(),unchanged=JSON.stringify(runtimeSha256)===JSON.stringify(after);
  await writeFile(`${output}/runtime.json`,JSON.stringify({before:runtimeSha256,after,unchanged},null,2)+'\n');
  process.exitCode=unchanged?(code??1):1;
  if(!unchanged)console.error('Runtime changed during qualification; this run cannot qualify the current artifacts');
 }catch(error){console.error(error);process.exitCode=1;}
});
