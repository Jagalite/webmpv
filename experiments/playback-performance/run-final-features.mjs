// Run after other benchmarks/stability tests have finished; never in parallel.
import {spawn} from 'node:child_process';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {createWriteStream} from 'node:fs';
import {once} from 'node:events';

const out=`results/playback-performance/final-features-${new Date().toISOString().replaceAll(':','-')}`;
await mkdir(out,{recursive:true});console.log(out);
const fixtures='build/fixtures/playback-performance/';
const cases=[
 {name:'software-1080p60',mode:'software',input:fixtures+'h264-1080p60.mp4',idleSeconds:15},
 {name:'software-h264-10bit',mode:'software',input:fixtures+'h264-10bit.mkv'},
 {name:'software-hevc-10bit',mode:'software',input:fixtures+'hevc-10bit.mkv'},
 {name:'software-vp9',mode:'software',input:fixtures+'vp9-30fps.webm'},
 {name:'software-filters-subs',mode:'software',input:fixtures+'sample-ass.mkv',env:{SUBTITLE:'1',VIDEO_FILTERS:'hflip,eq=brightness=0.1',AUDIO_FILTERS:'volume=0.5'}},
 {name:'hybrid-subs',mode:'hybrid',input:fixtures+'sample-ass.mkv',env:{SUBTITLE:'1'}},
 {name:'hybrid-plain',mode:'hybrid',input:'build/hybrid-performance/sample.mp4',idleSeconds:15},
];
const result={scope:'Short feature CPU screens against the preserved original runtime, including its earlier Hybrid scheduler. Fifteen-second paused intervals for plain Software/Hybrid; two seconds for other feature checks. Not foreground qualification.',cases:[],passed:false};
const save=()=>writeFile(out+'/result.json',JSON.stringify(result,null,2)+'\n');
async function command(executable,args,options){
 const child=spawn(executable,args,options);return once(child,'close');
}
for(const entry of cases){
 const current={...entry,started:new Date().toISOString(),log:`${out}/${entry.name}.log`};result.cases.push(current);await save();console.log('RUN',entry.name);
 const log=createWriteStream(current.log);
 const env={...process.env,MODE:entry.mode,INPUT:entry.input,PREWARM_SECONDS:'0',START_SECONDS:'0',WARMUP_SECONDS:'6',MEASURE_SECONDS:'12',SAMPLE_SECONDS:'2',IDLE_SECONDS:String(entry.idleSeconds||2),REUSE_BROWSER:'1',REUSE_PAGE:'1',VARIANTS:'baseline,candidate,candidate,baseline,baseline,candidate,candidate,baseline',...entry.env};
 // Keep every case against the preserved runtime, even when invoked from a
 // shell previously used for experiments with custom worker substitutions.
 for(const name of ['REMOTE_INPUT','BASELINE_MANIFEST','CANDIDATE_MANIFEST','EXTRA_INPUTS','EXPECTED_FPS','DECODER_IDENTITIES','EXPECTED_PRESENTERS','WIDTH','HEIGHT'])delete env[name];
 for(const name of ['SUBTITLE','VIDEO_FILTERS','AUDIO_FILTERS'])if(!(name in (entry.env||{})))delete env[name];
 const child=spawn(process.execPath,['tests/playback-performance.mjs'],{env,stdio:['ignore','pipe','pipe']});
 child.stdout.pipe(log,{end:false});child.stderr.pipe(log,{end:false});
 [current.exitCode,current.signal]=await once(child,'close');log.end();await once(log,'finish');
 const directory=(await readFile(current.log,'utf8')).split('\n')[0];current.evidence=directory+'/result.json';
 [current.assessmentExit]=await command('python3',['experiments/playback-performance/assess-playback.py',current.log],{stdio:'inherit'});
 current.assessment=JSON.parse(await readFile(directory+'/assessment.json'));
 current.passed=current.exitCode===0&&current.assessment.allChecksPassed;
 if(current.passed)[current.processCostsExit]=await command('python3',['experiments/playback-performance/process-costs.py',current.log],{stdio:'inherit'});
 current.finished=new Date().toISOString();await save();console.log(current.passed?'PASS':'CHECK FAILED',entry.name);
}
result.passed=result.cases.every(entry=>entry.passed);await save();if(!result.passed)process.exitCode=1;
console.log(JSON.stringify({passed:result.passed,cases:result.cases.map(({name,passed})=>({name,passed}))}));
