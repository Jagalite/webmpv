import {chromium} from 'playwright';
import {writeFile,mkdir} from 'node:fs/promises';
import {PNG} from '../../node_modules/playwright-core/lib/utilsBundle.js';
import {serve} from './server.mjs';
const out=`results/pipeline-separation/fidelity-${new Date().toISOString().replaceAll(':','-')}`;await mkdir(out,{recursive:true});
const server=await serve(),result={scope:'Paused exact-seek RGB comparison; not performance or all-color qualification',cases:[]};
try{
 for(const test of [{media:'bt709'},{media:'bt601'},{media:'ass',subtitles:true},{media:'ass',subtitles:true,filters:'hflip,eq=brightness=0.1'},{media:'sample',filters:'vflip'}]){
  const pair={...test,images:[]};result.cases.push(pair);
  for(const variant of ['software','yuv']){
   const browser=await chromium.launch({channel:'chrome',headless:true,args:['--autoplay-policy=no-user-gesture-required']});
   try{
    const page=await browser.newPage({viewport:{width:1100,height:700},deviceScaleFactor:1});await page.goto(server.origin+'/experiment/page.html');
    await page.evaluate(o=>start(o),{variant,url:server.origin+`/media/${test.media}`,subtitles:!!test.subtitles,filters:test.filters||''});
    await page.evaluate(async()=>{await player.pause();await player.seek(5);});await page.waitForTimeout(500);
    const data=await page.evaluate(()=>({png:document.querySelector('canvas').toDataURL(),state:snapshot()}));
    const buffer=Buffer.from(data.png.split(',')[1],'base64');await writeFile(`${out}/${result.cases.length}-${variant}.png`,buffer);pair.images.push({variant,state:data.state,buffer});
    await page.evaluate(()=>stop());
   }catch(e){pair.error=String(e.stack);}finally{await browser.close();}
  }
  if(pair.images.length===2){const[a,b]=pair.images.map(i=>PNG.sync.read(i.buffer));let sum=0,max=0,count=0,over8=0;for(let i=0;i<a.data.length;i++){if(i%4===3)continue;const d=Math.abs(a.data[i]-b.data[i]);sum+=d;max=Math.max(max,d);count++;if(d>8)over8++;}pair.difference={meanAbsolute:sum/count,max,fractionOver8:over8/count};}
  pair.images=pair.images.map(({buffer,...rest})=>rest);console.log(test,pair.difference||pair.error);
 }
}finally{await server.close();await writeFile(out+'/result.json',JSON.stringify(result,null,2)+'\n');console.log(out);}
