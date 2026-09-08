from pathlib import Path
s=Path('build/sources/mpv/video/out/vo_libmpv.c').read_text()
s=s.replace('    if (do_render)\n        err = ctx->renderer->fns->render(ctx->renderer, params, frame);','''    extern void web_experiment_frame(double pts, int64_t target_ns, int redraw);
    if(frame->current) web_experiment_frame(frame->current->pts,frame->pts,frame->redraw);
    if (do_render)
        err = ctx->renderer->fns->render(ctx->renderer, params, frame);''')
Path('experiments/retained-presenter/vo_libmpv.c').write_text(s)
s=Path('experiments/remaining-gap/player.c').read_text()
s=s.replace('static int experiment_skip_render;', '''static int experiment_skip_render;
static double selected_pts=-1,selected_target;
static int selected_serial,selected_redraw;
void web_experiment_frame(double pts,int64_t target_ns,int redraw) {
    selected_pts=pts; selected_target=(double)target_ns/1000; selected_redraw=redraw; selected_serial++;
}
EMSCRIPTEN_KEEPALIVE double web_selected_pts(void) { return selected_pts; }
EMSCRIPTEN_KEEPALIVE int web_selected_serial(void) { return selected_serial; }
EMSCRIPTEN_KEEPALIVE int web_selected_redraw(void) { return selected_redraw; }
EMSCRIPTEN_KEEPALIVE double web_selected_delay(void) { return selected_target>0?(selected_target-mpv_get_time_us(player))/1000:0; }''')
Path('experiments/retained-presenter/player.c').write_text(s)
s=Path('experiments/remaining-gap/link.sh').read_text().replace('web/engine-gap','web/engine-retained').replace('experiments/remaining-gap/player.c','experiments/retained-presenter/player.c build/retained/vo_libmpv.o')
Path('experiments/retained-presenter/link.sh').write_text(s)
s=Path('web/gap-decoder-worker.js').read_text().replace("const noCopy=new URL(self.location.href).searchParams.get('mode')==='nocopy-skip';",'const noCopy=true;')
s=s.replace('      consumed++;stats.frames++;lastProgress=performance.now();result=1;', '''      postMessage({retainedFrame:frame,pts:frame.timestamp,generation},[frame]);
      stats.transferredFrames=(stats.transferredFrames??0)+1;
      consumed++;stats.frames++;lastProgress=performance.now();result=1;''')
Path('web/retained-decoder-worker.js').write_text(s)
s=Path('web/gap-engine-worker.js').read_text().replace("'./engine-gap/player.mjs'","'./engine-retained/player.mjs'").replace("'./gap-decoder-worker.js?mode='+mode","'./retained-decoder-worker.js'")
s=s.replace('const skipCanvas=true;', 'const skipCanvas=true;')
s=s.replace("const skipCanvas=true;","const skipCanvas=true;const quality=new URL(self.location.href).searchParams.get('quality')==='1';")
s=s.replace('let canvasSubmissions=0;', '''let canvasSubmissions=0;
let selectedSerial=0,heldFrame,closingFrames=false;
const frames=new Map(),pendingFrames=new Map(),presentationTimers=new Set();
const presentation={received:0,closed:0,drawn:0,redraws:0,peakRetained:0,peakPending:0,missing:0,lateMs:[],pts:[],pixelChecks:[]};
function closeOwned(frame){frame.close();presentation.closed++;}
function cleanupFrames(){closingFrames=true;for(const timer of presentationTimers)clearTimeout(timer);presentationTimers.clear();for(const frame of frames.values())closeOwned(frame);frames.clear();if(heldFrame)closeOwned(heldFrame);heldFrame=null;pendingFrames.clear();}
function receiveFrame(message){
 presentation.received++;
 if(closingFrames){closeOwned(message.retainedFrame);return;}
 const key=Math.round(message.pts);
 if(frames.has(key)){closeOwned(message.retainedFrame);throw Error('Duplicate retained frame timestamp');}
 frames.set(key,message.retainedFrame);presentation.peakRetained=Math.max(presentation.peakRetained,frames.size+(heldFrame?1:0));
 if(frames.size>16)throw Error('Retained frame bound exceeded');
 presentReady(key);
}
function presentReady(key){
 const request=pendingFrames.get(key);if(!request||request.scheduled||!frames.has(key))return;
 request.scheduled=true;
 const draw=()=>{
  if(closingFrames)return;
  const frame=frames.get(key);if(!frame)throw Error('Scheduled retained frame missing');
  frames.delete(key);pendingFrames.delete(key);
  if(heldFrame)closeOwned(heldFrame);heldFrame=frame;
  context.drawImage(frame,0,0,canvas.width,canvas.height);
  presentation.drawn++;canvasSubmissions++;
  if(presentation.lateMs.length<10000)presentation.lateMs.push(performance.now()-request.deadline);
  if(presentation.pts.length<10000)presentation.pts.push(key);
  if(quality&&presentation.pixelChecks.length<2&&presentation.drawn%60===0){
   const pixels=context.getImageData(0,0,64,64).data;
   presentation.pixelChecks.push({pts:key,min:Math.min(...pixels.filter((_,i)=>i%4!==3)),max:Math.max(...pixels.filter((_,i)=>i%4!==3))});
  }
  engine._web_presented();
 };
 const delay=request.deadline-performance.now();
 if(delay<=0)draw();else{const timer=setTimeout(()=>{presentationTimers.delete(timer);draw();},delay);presentationTimers.add(timer);}
}
function presentSelected(){
 const serial=engine._web_selected_serial();if(serial===selectedSerial)return;
 selectedSerial=serial;
 if(engine._web_selected_redraw()&&heldFrame){context.drawImage(heldFrame,0,0,canvas.width,canvas.height);presentation.redraws++;engine._web_presented();return;}
 const key=Math.round(engine._web_selected_pts()*1e6);
 if(key<0)return;
 if(pendingFrames.has(key))return;
 pendingFrames.set(key,{deadline:performance.now()+engine._web_selected_delay(),scheduled:false});
 presentation.peakPending=Math.max(presentation.peakPending,pendingFrames.size);
 if(pendingFrames.size>8)throw Error('Pending presentation bound exceeded');
 presentReady(key);
 for(const [pts,request] of pendingFrames)if(performance.now()-request.deadline>500){presentation.missing++;throw Error(`Retained frame ${pts} did not arrive`);}
}''')
s=s.replace('      engine._web_presented();','      presentSelected();')
s=s.replace('data:{mode,skipCanvas,canvasSubmissions', 'data:{presentation:{...presentation,lateMs:presentation.lateMs.slice(-120),pts:presentation.pts.slice(-120),retained:frames.size+(heldFrame?1:0),pending:pendingFrames.size},mode,skipCanvas,canvasSubmissions')
s=s.replace('            if(message.ready)', '            if(message.retainedFrame){try{receiveFrame(message);}catch(error){post({type:"error",message:String(error)});}}\n            if(message.ready)')
s=s.replace('      closing = true;', '      closing = true;cleanupFrames();')
s=s.replace("post({type:'destroyed',decoderStats});", "post({type:'destroyed',decoderStats,presentation:{...presentation,lateMs:[],pts:[],retained:frames.size+(heldFrame?1:0),pending:pendingFrames.size}});")
Path('web/retained-engine-worker.js').write_text(s)
s=Path('web/generated/player.js').read_text().replace("new URL('../engine-worker.js', import.meta.url)","new URL('../retained-engine-worker.js?mode=retained&quality='+new URLSearchParams(location.search).get('quality'), import.meta.url)")
s=s.replace("else if (data.type === 'destroyed')", "else if (data.type === 'destroyed')")
# Preserve final receiver-side ownership counters as well as decoder counters.
s=s.replace('this.diagnostics.decoderStats = data.decoderStats;', 'this.diagnostics.decoderStats = data.decoderStats;this.diagnostics.presentation=data.presentation;')
Path('web/generated/retained-player.js').write_text(s)
s=Path('web/gap.html').read_text().replace('./generated/gap-player.js','./generated/retained-player.js').replace('Remaining pipeline cost experiment','Retained-frame presenter comparison')
s=s.replace('mpv acknowledged frames; experimental paths do not display','mpv scheduled frames; retained VideoFrame presentation')
s=s.replace("return {decoderStats:player?.diagnostics?.decoderStats};", "return {decoderStats:player?.diagnostics?.decoderStats,presentation:player?.diagnostics?.presentation};")
Path('web/retained.html').write_text(s)
