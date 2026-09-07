import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import vm from 'node:vm';

// Exercise the real harness adaptation without launching a browser or writing
// qualification records. Only filesystem/process effects are substituted.
async function adaptedCheck(matched,{headless=false,stage='functional'}={}){
 const generator=(await readFile(new URL('../scripts/qualify-development.mjs',import.meta.url),'utf8'))
  .replace(/^import .*;\n/gm,'').replaceAll('import.meta.url',JSON.stringify(new URL('../scripts/qualify-development.mjs',import.meta.url).href));
 const original=await readFile(new URL(`./m2-${stage}.mjs`,import.meta.url),'utf8');
 const written=new Map();
 await vm.runInNewContext(`(async()=>{${generator}})()`,{
  URL,createHash,console:{log(){}},process:{argv:['node','runner','webcodecs',stage,...(headless?['--headless-diagnostic']:[])]},
  readFile:async path=>path===`tests/m2-${stage}.mjs`?original:Buffer.from('fixed runtime'),
  mkdir:async()=>{},writeFile:async(path,data)=>written.set(path,data),
  spawn:()=>({on(){}}),
 });
 const harness=[...written].find(([path])=>path.endsWith('.mjs'))[1];
 if(headless)return {harness,metadata:JSON.parse([...written].find(([path])=>path.endsWith('/harness.json'))[1])};
 const start=harness.indexOf('async function check('),end=harness.indexOf('async function open(',start);
 assert.ok(start>=0&&end>start);
 const result={tests:[]};
 const check=vm.runInNewContext(`${harness.slice(start,end)};check`,{
  result,console:{log(){}},page:{},browser:{},
  focusForQualification:async()=>({matched:true}),
  observeForeground:async()=>({matched}),
 });
 return {check,result};
}

test('completed case evidence survives a failed foreground guard without passing',async()=>{
 const {check,result}=await adaptedCheck(false),evidence={cycles:100,retainedWorkers:0};
 await assert.rejects(check('100 complete lifecycles',async()=>evidence),/Foreground browser condition changed/);
 assert.equal(result.tests[0].passed,false);
 assert.equal(result.foregroundChecks[0].completedCaseEvidence,evidence);
 assert.equal(result.foregroundChecks[0].after.matched,false);
});
test('matching foreground retains the normal passing evidence',async()=>{
 const {check,result}=await adaptedCheck(true),evidence={cycles:100};
 await check('100 complete lifecycles',async()=>evidence);
 assert.equal(result.tests[0].passed,true);assert.equal(result.tests[0].evidence,evidence);
});
test('startup assertion remains failed while allowing subsequent independent cases',async()=>{
 const {check,result}=await adaptedCheck(true);
 await check('front index: shaped startup and distant seek',async()=>assert.ok(false,'startup 3100 ms'));
 await check('independent case',async()=>({ok:true}));
 assert.equal(result.tests[0].passed,false);assert.equal(result.tests[1].passed,true);
});

test('headless supplemental diagnostics remain explicitly ineligible for qualification',async()=>{
 const {harness,metadata}=await adaptedCheck(false,{headless:true,stage:'supplemental'});
 assert.equal(metadata.qualificationEligible,false);
 assert.equal(metadata.executionMode,'headless-diagnostic');
 assert.match(harness,/headless:true/);
 assert.match(harness,/qualificationEligible:false/);
 assert.ok(!harness.includes('before:await focusForQualification'));
});
test('headless mode rejects the full long-run harness',async()=>{
 await assert.rejects(adaptedCheck(false,{headless:true,stage:'long'}),/restricted to supplemental/);
});
