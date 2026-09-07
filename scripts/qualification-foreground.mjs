// Qualification-only checks; never included in the player runtime.
import {execFileSync} from 'node:child_process';
const browserPIDs=new WeakMap();
const pageSessions=new WeakMap();
async function browserPID(browser){
 if(!browserPIDs.has(browser)){
  const session=await browser.newBrowserCDPSession();
  try{browserPIDs.set(browser,(await session.send('SystemInfo.getProcessInfo')).processInfo.find(p=>p.type==='browser')?.id);}
  finally{await session.detach();}
 }
 return browserPIDs.get(browser);
}
export async function observeForeground(page,browser){
 if(!pageSessions.has(page))pageSessions.set(page,await page.context().newCDPSession(page));
 // Playwright enables focus emulation by default; disable it before observing
 // the actual window/tab state required by the reference profile.
 await pageSessions.get(page).send('Emulation.setFocusEmulationEnabled',{enabled:false});
 const state={at:new Date().toISOString(),...await page.evaluate(()=>({focused:document.hasFocus(),visibility:document.visibilityState}))};
 state.browserPID=await browserPID(browser);
 if(process.platform==='darwin'){
  try{
   const asn=execFileSync('lsappinfo',['front'],{encoding:'utf8',timeout:2000}).trim();
   const info=execFileSync('lsappinfo',['info','-only','pid',asn],{encoding:'utf8',timeout:2000});
   state.foregroundPID=Number(/"pid"=(\d+)/.exec(info)?.[1])||null;
  }catch(error){state.error=error.message;}
 }
 state.matched=state.focused&&state.visibility==='visible'&&
  (process.platform!=='darwin'||state.foregroundPID===state.browserPID);
 return state;
}
export async function focusForQualification(page,browser){
 await page.bringToFront();await page.waitForTimeout(100);
 const state=await observeForeground(page,browser);
 if(!state.matched)throw Error(`Foreground browser condition not met: ${JSON.stringify(state)}`);
 return state;
}
