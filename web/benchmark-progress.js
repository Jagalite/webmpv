// Experiment-only status; update once per second, outside the video surface.
const panel=document.createElement('section');
panel.style.cssText='padding:12px 16px;margin:12px 0;border:1px solid #555;border-radius:8px;max-width:928px;font-variant-numeric:tabular-nums';
panel.innerHTML='<strong id="bench-count">Preparing tests</strong><div id="bench-phase"></div><div id="bench-remaining"></div><div id="bench-close">Keep this window foreground. It closes automatically after each test.</div>';
document.querySelector('#surface').before(panel);
let state={phase:'Starting',phaseSeconds:0,remainingSeconds:0,index:0,total:0,at:Date.now()};
const duration=s=>{s=Math.max(0,Math.ceil(s));return `${Math.floor(s/60)}:${String(s%60).padStart(2,'0')}`;};
function paint(){
 const elapsed=(Date.now()-state.at)/1000;
 document.querySelector('#bench-count').textContent=`Test ${state.index} of ${state.total} — ${state.label??''}`;
 document.querySelector('#bench-phase').textContent=state.phaseSeconds?`${state.phase}: ${duration(state.phaseSeconds-elapsed)} remaining`:state.phase;
 document.querySelector('#bench-remaining').textContent=state.done||state.failed?'':`Estimated total remaining: ${duration(state.remainingSeconds-elapsed)}${elapsed>=state.remainingSeconds?' (finishing)':''}`;
 document.querySelector('#bench-close').textContent=state.done?'All tests complete. Safe to close.':state.failed?'Run stopped. Safe to close.':'Keep this window foreground. Tests advance and close automatically.';
}
window.setBenchmarkProgress=update=>{state={...state,...update,at:Date.now()};paint();};
paint();const interval=setInterval(paint,1000);
window.addEventListener('pagehide',()=>clearInterval(interval),{once:true});
