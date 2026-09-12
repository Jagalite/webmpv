import {chromium, firefox} from 'playwright';
import assert from 'node:assert/strict';
import {mkdir, writeFile} from 'node:fs/promises';
const kind=process.env.BROWSER||'chrome';
const out=`results/player-api/interaction-${kind}-${new Date().toISOString().replaceAll(':','-')}`;
await mkdir(out,{recursive:true});
console.log(out);
const browser=kind==='firefox'?await firefox.launch():await chromium.launch({channel:'chrome'});
const page=await browser.newPage({viewport:{width:1280,height:1000}});
page.setDefaultTimeout(30000);
const result={passed:false,browser:kind,checks:[],geometry:[]};
const errors=[];
page.on('pageerror',error=>errors.push(String(error)));
const check=name=>{result.checks.push(name);console.log('PASS',name);};
const idle=()=>page.waitForFunction(()=>!document.querySelector('#file').disabled);
const key=async value=>{await page.locator('#player-frame').focus();await page.keyboard.press(value);await idle();};
try {
 await page.goto(process.env.DEMO_URL||'http://127.0.0.1:4179/');
 await page.waitForFunction(()=>window.player);
 for(const mode of ['native','hybrid','software']) {
   await page.click('#settings-toggle');await page.uncheck('#automatic');await idle();
   await page.selectOption('#mode',mode);await idle();assert.equal(await page.evaluate(()=>player.mode),mode,await page.locator('#status').textContent());await page.click('#settings-close');
   for(const [name,ratio] of [['landscape',4/3],['portrait',9/16],['anamorphic',4/3],['rotated',3/4]]) {
     await page.locator('#file').setInputFiles(`build/fixtures/player-ui/${name}.mp4`);await idle();
     await page.waitForFunction(ratio=>Math.abs(Number(document.querySelector('#stage').dataset.aspect)-ratio)<.002,ratio);
     await page.waitForFunction(()=>player.properties.get('time-pos')>.1);
     await key('k');assert.equal(await page.evaluate(()=>player.properties.get('pause')),true);
     const geometry=await page.evaluate(()=>({mode:player.mode,ratio:Number(document.querySelector('#stage').dataset.aspect),width:player.surface.width,height:player.surface.height,stage:document.querySelector('#stage').getBoundingClientRect().toJSON(),params:player.properties.get('video-params')}));
     assert.equal(geometry.mode,mode);assert.ok(Math.abs(geometry.width/geometry.height-ratio)<.002);
     assert.ok(geometry.stage.bottom<1000);
     if(mode!=='native') {
       await page.waitForFunction(()=>{
         const canvas=document.createElement('canvas');canvas.width=10;canvas.height=10;
         const ctx=canvas.getContext('2d');ctx.drawImage(player.surface,0,0,10,10);
         return [[1,1],[8,1],[1,8],[8,8]].every(([x,y])=>ctx.getImageData(x,y,1,1).data[0]>100);
       });
     }
     result.geometry.push({name,...geometry});
     await page.screenshot({path:`${out}/${mode}-${name}.png`});
   }
   check(`${mode}: 4:3, portrait, anamorphic and rotated media; canvas output has no extra bars`);
   await key('f');
   await page.waitForFunction(()=>document.fullscreenElement?.id==='player-frame' && document.querySelector('#fullscreen').getAttribute('aria-label')==='Exit fullscreen');
   await page.click('#settings-toggle');assert.equal(await page.locator('#settings-dialog').isVisible(),true);
   await page.click('#settings-close');await key('f');
   await page.waitForFunction(()=>!document.fullscreenElement);
   check(`${mode}: actual fullscreen, settings inside fullscreen and keyboard exit`);
 }
 await key('Space');assert.equal(await page.evaluate(()=>player.properties.get('pause')),false);
 await key('k');assert.equal(await page.evaluate(()=>player.properties.get('pause')),true);
 await key('0');await key('ArrowRight');
 assert.ok(Math.abs(await page.evaluate(()=>player.properties.get('time-pos'))-5)<.4);
 await key('ArrowLeft');assert.ok(await page.evaluate(()=>player.properties.get('time-pos'))<.4);
 await key('l');assert.ok(Math.abs(await page.evaluate(()=>player.properties.get('time-pos'))-10)<.4);
 await key('j');assert.ok(await page.evaluate(()=>player.properties.get('time-pos'))<.4);
 await key('5');assert.ok(Math.abs(await page.evaluate(()=>player.properties.get('time-pos'))-6)<.4);
 await key('Home');assert.ok(await page.evaluate(()=>player.properties.get('time-pos'))<.4);
 await key('End');assert.ok(await page.evaluate(()=>player.properties.get('time-pos'))>11.5);
 await key('Home');
 check('Space/K, arrows, J/L, percentage seek and Home/End control the real player');
 await key('ArrowDown');assert.equal(await page.inputValue('#volume'),'95');
 await key('m');assert.equal(await page.evaluate(()=>player.properties.get('volume')),0);
 await key('m');assert.equal(await page.evaluate(()=>player.properties.get('volume')),95);
 await key('ArrowUp');assert.equal(await page.evaluate(()=>player.properties.get('volume')),100);
 await key(']');assert.equal(await page.evaluate(()=>player.properties.get('speed')),1.25);
 await key('[');assert.equal(await page.evaluate(()=>player.properties.get('speed')),1);
 await key('c');assert.equal(await page.locator('#player-toast').textContent(),'Subtitles off');
 await key('c');assert.equal(await page.locator('#player-toast').textContent(),'Subtitles on');
 check('Volume, mute restores previous volume, playback speed and subtitle shortcuts');
 await page.click('.remote-panel summary');await page.locator('#url').focus();await page.keyboard.type('mkf');
 assert.equal(await page.inputValue('#url'),'mkf');assert.equal(await page.evaluate(()=>player.properties.get('pause')),true);
 await page.click('#settings-toggle');await page.keyboard.press('k');
 assert.equal(await page.evaluate(()=>player.properties.get('pause')),true);
 await page.keyboard.press('Escape');assert.equal(await page.locator('#settings-dialog').isVisible(),false);
 await key('?');assert.equal(await page.locator('#shortcuts').getAttribute('open'),'');
 await page.keyboard.press('Escape');
 check('Typing and settings keep their keys; help and Escape work');
 await page.locator('#stage').dblclick();await page.waitForFunction(()=>document.fullscreenElement?.id==='player-frame');
 await page.locator('#stage').dblclick();await page.waitForFunction(()=>!document.fullscreenElement);
 check('Double-click enters and exits actual fullscreen');
 await page.evaluate(()=>{document.querySelector('#player-frame').requestFullscreen=()=>Promise.reject(Error('Blocked by embedding policy'));});
 await key('f');await page.locator('#fullscreen-error').waitFor({state:'visible'});
 assert.equal(await page.evaluate(()=>document.fullscreenElement),null);
 assert.equal(await page.locator('#standalone-player').getAttribute('target'),'_blank');
 await page.click('#fullscreen-dismiss');
 check('Denied fullscreen offers a browser-tab link without pretending to enter fullscreen');
 await page.setViewportSize({width:390,height:844});
 await page.waitForFunction(()=>document.querySelector('#stage').getBoundingClientRect().bottom<844);
 assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
 await page.screenshot({path:`${out}/mobile-portrait.png`,fullPage:true});
 await page.click('#close');await idle();
 assert.equal(await page.locator('#stage').getAttribute('data-aspect'),null);
 check('Mobile viewport height and close reset');
 assert.deepEqual(errors,[]);result.passed=true;
} catch(error){result.failure=String(error.stack);console.error(error);process.exitCode=1;await page.screenshot({path:`${out}/failure.png`,fullPage:true});result.state=await page.evaluate(()=>({status:document.querySelector('#status').textContent,params:Object.fromEntries(player.properties),error:document.querySelector('#playback-error-message').textContent}));}
finally {await browser.close();await writeFile(`${out}/result.json`,JSON.stringify(result,null,2)+'\n');}
