"""Preserve 5ms active service and settle paused software playback to 100ms."""
def schedule_software_worker(source):
    def replace(old,new):
        nonlocal source
        assert source.count(old)==1,old
        source=source.replace(old,new)
    replace('const CAPACITY = 8192;', '''const CAPACITY = 8192;
let paused=true,busyUntil=0,pumpFailed=false,nextDiagnostics=0;
function schedulePump(delay=5){
 clearTimeout(timer);if(closing||pumpFailed||!engine)return;
 timer=setTimeout(()=>{
  schedulePump(paused&&pendingTarget===null&&performance.now()>=busyUntil?100:5);
  tick();
 },delay);
}
''')
    replace("      if(event.event==='file-loaded'){", "      if(event.event==='property-change'&&event.name==='pause'){paused=!!event.data;busyUntil=performance.now()+300;}\n      if(event.event==='file-loaded'){")
    replace('      timer = setInterval(tick, 5);','      schedulePump();')
    replace('  const padded = [...args];','  busyUntil=performance.now()+300;schedulePump(0);\n  const padded = [...args];')
    replace("else if (data.type === 'resize') {canvas.width", "else if (data.type === 'resize') {busyUntil=performance.now()+300;schedulePump(0);canvas.width")
    replace("} catch (error) { clearInterval(timer); post", "} catch (error) {pumpFailed=true;clearInterval(timer);post")
    replace('if (++ticks % 40 === 0 || (ptr && sourceRendered <= 5)) post', 'ticks++;\n    if(performance.now()>=nextDiagnostics||(ptr&&sourceRendered<=5)){nextDiagnostics=performance.now()+200;post')
    replace("data:{rendered,renderMs", "data:{pumpTicks:ticks,rendered,renderMs") if 'data:{rendered,renderMs' in source else replace("data:{presenter:", "data:{pumpTicks:ticks,presenter:")
    replace('queuedFrames:(Atomics.load(audio,0)-Atomics.load(audio,1))>>>0}});', 'queuedFrames:(Atomics.load(audio,0)-Atomics.load(audio,1))>>>0}});}')
    return source
