// Sequential regression closeout for the maintained performance changes.
import {spawn} from 'node:child_process';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {createWriteStream} from 'node:fs';
import {once} from 'node:events';
import assert from 'node:assert/strict';

const out=`results/playback-performance/final-checks-${new Date().toISOString().replaceAll(':','-')}`;
await mkdir(out,{recursive:true});console.log(out);
const result={scope:'Sequential final source/build regressions; no CPU comparison',checks:[],passed:false};
const save=()=>writeFile(out+'/result.json',JSON.stringify(result,null,2)+'\n');
let media;
async function run(name,args,env={}){
 const check={name,args,env,started:new Date().toISOString(),log:`${out}/${name}.log`};
 result.checks.push(check);await save();console.log('RUN',name);
 const log=createWriteStream(check.log);
 const child=spawn(process.execPath,args,{env:{...process.env,...env},stdio:['ignore','pipe','pipe']});
 child.stdout.pipe(log,{end:false});child.stderr.pipe(log,{end:false});
 const [code,signal]=await once(child,'close');log.end();await once(log,'finish');
 check.exitCode=code;check.signal=signal;check.finished=new Date().toISOString();
 console.log(code===0?'PASS':'CHECK EXIT',name,code,signal||'');await save();return check;
}
async function stop(child){
 if(!child||child.exitCode!==null||child.signalCode!==null)return;
 const closed=once(child,'exit');child.kill();
 let timer;await Promise.race([closed,new Promise(resolve=>{timer=setTimeout(()=>{child.kill('SIGKILL');resolve();},3000);})]);clearTimeout(timer);
}
try{
 await run('typescript',['node_modules/typescript/bin/tsc','--noEmit']);
 media=spawn(process.execPath,['scripts/media-server.mjs'],{stdio:['ignore','pipe','pipe']});
 let output='';media.stderr.on('data',bytes=>process.stderr.write(bytes));
 await new Promise((resolve,reject)=>{
  const timer=setTimeout(()=>reject(Error('Owned media origins did not start')),10000);
  media.once('error',error=>{clearTimeout(timer);reject(error);});
  media.once('exit',code=>{clearTimeout(timer);reject(Error(`Owned media origins exited ${code}`));});
  media.stdout.on('data',bytes=>{output+=bytes;if(output.includes(':4180')&&output.includes(':4181')){clearTimeout(timer);resolve();}});
 });
 await run('units',['--test','tests/audio-worklet.mjs','tests/browser-decoder-worker.mjs','tests/range-reader.mjs','tests/resource-loader.mjs','tests/retained-video.mjs','tests/timing-coalescing.mjs']);
 await stop(media);media=null;
 await run('rgbx-experiment-units',['--test','tests/rgbx-frame-uploader.mjs']);
 for(const variant of ['simd','no-simd']){
  const check=await run(`m4-${variant}`,['tests/m4.mjs'],{HEADLESS:'1',WEBMPV_PERFORMANCE_CONFIG:`build/playback-performance/m4-${variant}.json`});
  const directory=(await readFile(check.log,'utf8')).trim().split('\n').at(-1);
  const evidence=JSON.parse(await readFile(directory+'/result.json'));
  const manifest=JSON.parse(await readFile(`results/playback-performance/narrow-${variant}/build-manifest.json`));
  assert.equal(manifest.decoderSimd,variant==='simd');assert.equal(evidence.passed,true);
  check.loadedArtifacts={};
  for(const engine of ['engine','engine-m4'])for(const extension of ['mjs','wasm']){
   const asset=`web/${engine}/player.${extension}`,actual=evidence.assetSnapshotFinal.candidate[asset];
   assert.ok(actual.hits>0,`Expected actual load: ${asset}`);
   assert.equal(actual.sha256,manifest.artifacts[actual.source]);check.loadedArtifacts[asset]=actual;
  }
  check.evidence=directory+'/result.json';await save();
 }
 await writeFile(out+'/current.json',JSON.stringify({candidate:{}})+'\n');
 await run('software-full',['tests/software-full.mjs'],{WEBMPV_PERFORMANCE_CONFIG:out+'/current.json'});
 const matrix=await run('format-matrix',['tests/format-matrix.mjs']);
 // The matrix intentionally exits 1 for existing gaps. Preserve that exit and
 // separately require identical outcomes for every identical baseline fixture.
 const comparison={name:'format-baseline-comparison',started:new Date().toISOString()};result.checks.push(comparison);
 const child=spawn('python3',['experiments/playback-performance/compare-format-baseline.py',matrix.log],{stdio:'inherit'});
 [comparison.exitCode,comparison.signal]=await once(child,'close');comparison.finished=new Date().toISOString();
 result.passed=result.checks.every(check=>check.name==='format-matrix'?[0,1].includes(check.exitCode):check.exitCode===0);
 if(!result.passed)process.exitCode=1;
}catch(error){result.error=String(error.stack);console.error(error);process.exitCode=1;}
finally{await stop(media);await save();console.log(JSON.stringify({passed:result.passed,checks:result.checks.map(({name,exitCode})=>({name,exitCode}))}));}
