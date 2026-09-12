import {chromium, firefox} from 'playwright';
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {readFile,stat,mkdir,writeFile} from 'node:fs/promises';
import {createReadStream} from 'node:fs';
import path from 'node:path';
const root=path.resolve(process.env.PAGES_DIR||'build/pages-site');
const kind=process.env.BROWSER||'chrome';
const out=`results/pages/${kind}-${new Date().toISOString().replaceAll(':','-')}`;
await mkdir(out,{recursive:true});console.log(out);
let server;
let origin=process.env.PAGES_URL;
if(!origin){
 server=createServer(async(req,res)=>{
  try {
   const url=new URL(req.url,'http://localhost');
   if(!url.pathname.startsWith('/webmpv/')){res.writeHead(404).end();return;}
   const name=decodeURIComponent(url.pathname.slice('/webmpv/'.length));
   let file=path.resolve(root,name||'index.html');
   if(!file.startsWith(root+path.sep))throw Error();
   if((await stat(file)).isDirectory())file=path.join(file,'index.html');
   const info=await stat(file);let start=0,end=info.size-1,status=200;
   const range=/^bytes=(\d+)-(\d*)$/.exec(req.headers.range||'');
   if(range){start=Number(range[1]);end=range[2]?Math.min(end,Number(range[2])):end;status=206;res.setHeader('Content-Range',`bytes ${start}-${end}/${info.size}`);}
   const types={'.html':'text/html','.js':'text/javascript','.mjs':'text/javascript','.wasm':'application/wasm','.css':'text/css','.json':'application/json','.mp4':'video/mp4','.ttf':'font/ttf'};
   res.setHeader('Content-Type',types[path.extname(file)]||'application/octet-stream');
   res.setHeader('Content-Length',end-start+1);res.setHeader('Accept-Ranges','bytes');res.setHeader('Cache-Control','no-store');
   // Intentionally no isolation headers: this models GitHub Pages.
   res.writeHead(status);if(req.method==='HEAD'){res.end();return;}
   createReadStream(file,{start,end}).pipe(res);
  }catch{res.writeHead(404).end();}
 });
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));origin=`http://127.0.0.1:${server.address().port}/webmpv/`;
}
const browser=kind==='firefox'?await firefox.launch():await chromium.launch({channel:'chrome'});
const page=await browser.newPage({viewport:{width:1280,height:900}});
page.setDefaultTimeout(60000);
const result={passed:false,url:origin,browser:kind,checks:[],requests:[]};const errors=[];
const check=name=>{result.checks.push(name);console.log('PASS',name);};
page.on('pageerror',error=>errors.push(String(error)));
page.on('request',req=>{if(/^https?:/.test(req.url()))result.requests.push({url:req.url(),method:req.method()});});
try {
 await page.goto(origin);
 await page.waitForFunction(()=>crossOriginIsolated && window.player,{},{timeout:60000});
 assert.equal(await page.evaluate(()=>typeof SharedArrayBuffer),'function');
 assert.equal(await page.locator('#pages-startup').count(),0);
 assert.ok(await page.evaluate(()=>navigator.serviceWorker.controller?.scriptURL.endsWith('/webmpv/pages-isolation-sw.js')));
 check('Fresh visit becomes cross-origin isolated through the scoped service worker');
 for(const mode of ['native','hybrid','software']){
   await page.click('#settings-toggle');await page.uncheck('#automatic');
   await page.waitForFunction(()=>!document.querySelector('#file').disabled);
   await page.selectOption('#mode',mode);await page.waitForFunction(()=>!document.querySelector('#file').disabled);
   await page.click('#settings-close');
   await page.click('#demo');await page.waitForFunction(()=>!document.querySelector('#file').disabled);
   await page.waitForFunction(()=>player.properties.get('time-pos')>.3);
   assert.equal(await page.evaluate(()=>player.mode),mode);
   await page.click('#pause');await page.waitForFunction(()=>!document.querySelector('#file').disabled);
   await page.locator('#timeline').fill('2');await page.locator('#timeline').dispatchEvent('change');await page.waitForFunction(()=>!document.querySelector('#file').disabled);
   assert.ok(Math.abs(await page.evaluate(()=>player.properties.get('time-pos'))-2)<.3);
   assert.equal(await page.locator('#playback-error').isVisible(),false);
   await page.screenshot({path:`${out}/${mode}.png`});
   await page.click('#close');await page.waitForFunction(()=>!document.querySelector('#file').disabled);
   check(`${mode} plays and seeks with assets beneath the project subpath`);
 }
 const range=await page.evaluate(async()=>{const response=await fetch('./fixtures/example.mp4',{headers:{Range:'bytes=10-29'}});return {status:response.status,length:(await response.arrayBuffer()).byteLength};});
 assert.deepEqual(range,{status:206,length:20});check('Service worker preserves ranged media responses');
 await page.reload();await page.waitForFunction(()=>crossOriginIsolated && window.player);
 assert.equal(await page.locator('#pages-startup').count(),0);check('Returning visit starts directly with isolation enabled');
 assert.deepEqual(errors,[]);
 assert.equal(result.requests.some(r=>r.method!=='GET'),false);
 assert.equal(result.requests.some(r=>!r.url.startsWith(origin)),false);
 check('No external asset requests, uploads or uncaught page errors');
 const response=await page.request.get(new URL('source/source-manifest.json',origin).href);assert.ok(response.ok());
 result.source=await response.json();assert.ok(result.source['webmpv-source.tar.gz']);assert.ok(result.source['emscripten-source.tar.gz']);
 check('Source downloads and license materials accompany the demo');
 result.passed=true;
}catch(error){result.failure=String(error.stack);console.error(error);process.exitCode=1;await page.screenshot({path:`${out}/failure.png`,fullPage:true}).catch(()=>{});result.state=await page.evaluate(()=>({isolated:crossOriginIsolated,status:document.querySelector('#status')?.textContent,startup:document.querySelector('#pages-startup')?.textContent})).catch(()=>null);}
finally{await browser.close();await new Promise(resolve=>server?server.close(resolve):resolve());await writeFile(`${out}/result.json`,JSON.stringify(result,null,2)+'\n');}
