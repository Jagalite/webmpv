import {chromium} from 'playwright';
import assert from 'node:assert/strict';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
const out=`results/filter-routing/pressure-${new Date().toISOString().replaceAll(':','-')}`;await mkdir(out,{recursive:true});console.log(out);
const hash=async()=>createHash('sha256').update(await readFile('web/filter-retained-engine-worker.js')).digest('hex');const result={started:new Date().toISOString(),passed:false,workerHash:await hash(),scope:'Headless injected 900 ms engine-worker stall; not performance evidence'};
const browser=await chromium.launch({channel:'chrome',headless:true,args:['--autoplay-policy=no-user-gesture-required']});const page=await browser.newPage();
try{
 await page.goto('http://127.0.0.1:4179/web/filter-perf.html');await page.evaluate(()=>startBenchmark('retained','http://127.0.0.1:4183/media?id=retained-pressure'));
 await page.waitForFunction(()=>benchmarkState().rendered>20);result.before=await page.evaluate(()=>benchmarkState());
 const worker=page.workers().find(w=>w.url().includes('/filter-retained-engine-worker.js'));assert.ok(worker);
 await worker.evaluate(()=>{const end=performance.now()+900;while(performance.now()<end){/* deliberate scheduling stall */}});
 await page.waitForTimeout(2200);result.after=await page.evaluate(()=>benchmarkState());assert.deepEqual(result.after.errors,[]);assert.ok(result.after.diagnostics.presentation.peakRetained<=16);assert.equal(result.after.diagnostics.presentation.missing,0);assert.ok(result.after.rendered>result.before.rendered+30);assert.ok(result.after.audio.mediaFrames>result.before.audio.mediaFrames);
 result.cleanup=await page.evaluate(()=>stopBenchmark());for(let i=0;i<50&&page.workers().length;i++)await page.waitForTimeout(100);assert.equal(page.workers().length,0);assert.equal(result.cleanup.presentation.received,result.cleanup.presentation.closed);assert.equal(result.cleanup.presentation.retained,0);result.passed=true;
}catch(e){result.failure=String(e.stack);result.state=await page.evaluate(()=>benchmarkState()).catch(()=>null);console.error(result.failure);process.exitCode=1;}
finally{await page.evaluate(()=>stopBenchmark()).catch(()=>{});result.workerHashAfter=await hash();assert.equal(result.workerHash,result.workerHashAfter);result.finished=new Date().toISOString();await writeFile(`${out}/result.json`,JSON.stringify(result,null,2)+'\n');await browser.close();}
