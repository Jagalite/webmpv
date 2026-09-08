"""Keep active playback responsive; lower worker wakeups after paused work settles."""
def schedule_paused_worker(s):
    scheduler='''
let paused=true, busyUntil=0, pumpFailed=false, nextDiagnostics=0;
function schedulePump(delay=10) {
  clearTimeout(timer);
  if(closing||pumpFailed||!engine)return;
  timer=setTimeout(()=>{
    tick();
    schedulePump(paused&&pendingTarget===null&&pendingFrames.size===0&&performance.now()>=busyUntil?100:10);
  },delay);
}
'''
    s=s.replace('const CAPACITY = 8192;', 'const CAPACITY = 8192;'+scheduler)
    s=s.replace("if(event.event==='property-change'&&event.name==='track-list')", "if(event.event==='property-change'&&event.name==='pause'){paused=!!event.data;busyUntil=performance.now()+300;}\n      if(event.event==='property-change'&&event.name==='track-list')")
    s=s.replace('timer = setInterval(tick, 10);','schedulePump();')
    s=s.replace("  const padded = [...args];", "  busyUntil=performance.now()+300;schedulePump(0);\n  const padded = [...args];")
    s=s.replace("else if (data.type === 'resize') {subtitles.clear();", "else if (data.type === 'resize') {busyUntil=performance.now()+300;schedulePump(0);subtitles.clear();")
    s=s.replace('cleanupFrames();clearInterval(timer);post', 'cleanupFrames();pumpFailed=true;clearInterval(timer);post')
    s=s.replace('} catch (error) { clearInterval(timer); post', '} catch (error) { pumpFailed=true;clearInterval(timer); post')
    s=s.replace('if (++ticks % 20 === 0 || (ptr && sourceRendered <= 5)) post', "ticks++;\n    if (performance.now()>=nextDiagnostics || (ptr && sourceRendered <= 5)) {nextDiagnostics=performance.now()+200;post")
    s=s.replace("data:{subtitles:{...subtitles.stats}", "data:{pumpTicks:ticks,subtitles:{...subtitles.stats}")
    s=s.replace('queuedFrames:(Atomics.load(audio,0)-Atomics.load(audio,1))>>>0}});', 'queuedFrames:(Atomics.load(audio,0)-Atomics.load(audio,1))>>>0}});}')
    return s
