import {chromium} from 'playwright';
import {mkdir,writeFile} from 'node:fs/promises';
const results=[];
const builds=process.env.MIXED?['old-js-new-engine','new-js-old-engine']:['accepted-0.2.0','s1'];
for(const build of builds)for(const headless of [true,false]){
 const browser=await chromium.launch({channel:'chrome',headless,ignoreDefaultArgs:['--mute-audio'],args:['--autoplay-policy=no-user-gesture-required']});
 const page=await browser.newPage();const result={build,headless,browser:browser.version(),cycles:[]};
 try{
  await page.goto(`http://127.0.0.1:${({'s1':4179,'accepted-0.2.0':4183,'old-js-new-engine':4184,'new-js-old-engine':4185})[build]}/?no-codecs`);
  for(let i=0;i<3;i++){
   await page.evaluate(async()=>{const p=await createPlayer();await p.open(await(await fetch('/fixtures/m0.mkv')).arrayBuffer());await p.play();});
   await page.waitForFunction(()=>player.diagnostics?.rendered>3&&player.audioDiagnostics().mediaFrames>4096);
   await page.evaluate(()=>player.destroy());for(let n=0;n<40&&page.workers().length;n++)await page.waitForTimeout(100);
   const workers=page.workers().map(w=>w.url());result.cycles.push({i,workers});if(workers.length)break;
  }
 }catch(error){result.error=String(error.stack||error);}
 results.push(result);console.log(JSON.stringify(result));await browser.close();
}
await mkdir('results/s1',{recursive:true});await writeFile(`results/s1/worker-control${process.env.MIXED?'-mixed':''}.json`,JSON.stringify(results,null,2)+'\n');
