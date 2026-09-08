import assert from 'node:assert/strict';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';

const configuration={
 baseline:{build:process.env.BASELINE||'baseline',threads:Number(process.env.BASELINE_THREADS||process.env.THREADS||2)},
 candidate:{build:process.env.CANDIDATE||'chroma',threads:Number(process.env.CANDIDATE_THREADS||process.env.THREADS||2)},
};
for(const value of Object.values(configuration)){
 assert.match(value.build,/^(reference|maintained|baseline|chroma|biweight|simd|qpel|simd-qpel|simd-qpel-deblock|simd-qpel-deblock-h|simd-qpel-deblock-packed|lto|lto-chroma|lto-simd)$/);
 assert.ok(Number.isInteger(value.threads)&&value.threads>=1&&value.threads<=4);
}
const cycles=Number(process.env.CYCLES||2);assert.ok(Number.isInteger(cycles)&&cycles>=1&&cycles<=20);
const out=`results/playback-performance/decode-${new Date().toISOString().replaceAll(':','-')}`;
await mkdir(out,{recursive:true});console.log(out);
const input=process.env.INPUT||'build/hybrid-performance/sample.mp4',bytes=await readFile(input);
const manifests={};
const paths=new Set(['tests/decode-performance.mjs','experiments/playback-performance/decode-benchmark.c',input]);
for(const {build} of Object.values(configuration)){
 const folder=`build/playback-performance/decode-${build}`;
 for(const name of ['decoder.mjs','decoder.wasm'])paths.add(`${folder}/${name}`);
 // Older preserved baselines predate link manifests. Record that explicitly.
 try{const manifestPath=`${folder}/manifest.json`;const manifest=JSON.parse(await readFile(manifestPath,'utf8'));manifests[build]=manifest;for(const file of ['decoder.mjs','decoder.wasm'])assert.equal(createHash('sha256').update(await readFile(`${folder}/${file}`)).digest('hex'),manifest[`${folder}/${file}`],`Built artifact changed: ${folder}/${file}`);paths.add(manifestPath);for(const path of Object.keys(manifest))paths.add(path);}catch(error){if(error.code!=='ENOENT')throw error;}
}
const hashes=async()=>Object.fromEntries(await Promise.all([...paths].map(async path=>[path,createHash('sha256').update(await readFile(path)).digest('hex')])));
const result={scope:'Isolated FFmpeg Wasm decode throughput and full-frame checksums; rendering and audio excluded',configuration,hashes:await hashes(),input,cycles,trials:[]};
result.buildManifests=manifests;
if(process.env.MATCH_BUILD_INPUTS==='1'){
 const a=manifests[configuration.baseline.build],b=manifests[configuration.candidate.build];
 assert.ok(a&&b,'Matching-build comparison requires both build manifests');
 const benchmark='experiments/playback-performance/decode-benchmark.c';
 assert.equal(a[benchmark],b[benchmark]);assert.equal(a[benchmark],result.hashes[benchmark]);
 const archives=Object.keys(a).filter(path=>path.endsWith('.a')).sort();
 assert.ok(archives.length>0);assert.deepEqual(archives,Object.keys(b).filter(path=>path.endsWith('.a')).sort());
 for(const path of archives){assert.equal(a[path],b[path],path);assert.equal(a[path],result.hashes[path],path);}
 result.matchingBuildInputs={benchmarkSha256:a[benchmark],archives:Object.fromEntries(archives.map(path=>[path,a[path]])),verified:true};
}
const engines={};let current;
try{
 for(const [name,{build}] of Object.entries(configuration)){
  const {default:create}=await import(`../build/playback-performance/decode-${build}/decoder.mjs`);
  engines[name]=await create({print:line=>{try{current.measurement=JSON.parse(line);}catch{}},printErr:line=>console.error(name,line)});
  engines[name].FS.writeFile('/source',bytes);
 }
 async function run(variant,verify,warmup=false){
  current={variant,...configuration[variant],verify,warmup};result.trials.push(current);
  const cpu=process.cpuUsage(),start=performance.now();
  assert.equal(engines[variant].ccall('decode_benchmark','number',['string','number','number'],['/source',configuration[variant].threads,+verify]),0);
  current.wallMilliseconds=performance.now()-start;current.cpuMicroseconds=process.cpuUsage(cpu);
  assert.ok(current.measurement.frames>0);assert.equal(current.measurement.threads,configuration[variant].threads);
  console.log(JSON.stringify(current));await writeFile(out+'/result.json',JSON.stringify(result,null,2)+'\n');
 }
 for(const variant of ['baseline','candidate'])await run(variant,false,true);
 for(let cycle=0;cycle<cycles;cycle++)for(const variant of ['baseline','candidate','candidate','baseline'])await run(variant,false);
 for(const variant of ['baseline','candidate'])await run(variant,true);
 const verified=result.trials.filter(trial=>trial.verify);
 assert.equal(verified[0].measurement.pixelMD5,verified[1].measurement.pixelMD5);
 for(const trial of result.trials)assert.equal(trial.measurement.frames,verified[0].measurement.frames);
 result.hashesAfter=await hashes();assert.deepEqual(result.hashesAfter,result.hashes);
 const average=values=>values.reduce((sum,value)=>sum+value,0)/values.length;
 result.assessment=Object.fromEntries(['baseline','candidate'].map(variant=>{
  const trials=result.trials.filter(trial=>trial.variant===variant&&!trial.verify&&!trial.warmup);
  return [variant,{milliseconds:average(trials.map(trial=>trial.measurement.milliseconds)),cpuMicroseconds:average(trials.map(trial=>trial.cpuMicroseconds.user+trial.cpuMicroseconds.system)),trials:trials.length}];
 }));
 result.assessment.elapsedReductionPercent=100*(1-result.assessment.candidate.milliseconds/result.assessment.baseline.milliseconds);
 result.assessment.cpuReductionPercent=100*(1-result.assessment.candidate.cpuMicroseconds/result.assessment.baseline.cpuMicroseconds);
 result.passed=true;
}catch(error){result.error=String(error.stack);process.exitCode=1;console.error(error);}
finally {
 const workers=[...new Set(Object.values(engines).flatMap(engine=>[...engine.PThread.runningWorkers,...engine.PThread.unusedWorkers]))];
 for(const engine of Object.values(engines))engine.PThread.terminateAllThreads();
 await Promise.all(workers.map(worker=>worker.terminate()));
 await new Promise(resolve=>setTimeout(resolve,100));
 result.cleanup={workersTerminated:workers.length,remainingResources:process.getActiveResourcesInfo()};
 await writeFile(out+'/result.json',JSON.stringify(result,null,2)+'\n');
 // These Emscripten modules deliberately use EXIT_RUNTIME=0. The benchmark
 // owns its Node process; all measurements and explicit worker teardown are done.
 process.exit(process.exitCode||0);
}
