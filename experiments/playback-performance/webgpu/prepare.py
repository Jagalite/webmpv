"""Isolate the WebGPU presenter while keeping the existing native and decoder bytes."""
from pathlib import Path
import json
out=Path('build/playback-performance/webgpu');out.mkdir(parents=True,exist_ok=True)
s=Path('build/playback-performance/baseline/web/filter-retained-engine-worker.js').read_text()
def replace(old,new):
    global s
    assert s.count(old)==1,old
    s=s.replace(old,new)
replace('  drawRetainedVideo(context,frame,canvas,videoTrack);\n  subtitles.draw(context,request.overlay);','  drawFrame(frame,request.overlay);')
replace('drawRetainedVideo(context,heldFrame,canvas,videoTrack);subtitles.draw(context,overlay);','drawFrame(heldFrame,overlay);')
replace("      context = canvas.getContext('2d', {alpha:false});", """      gpuPresenter=await ExternalFramePresenter.create(canvas,message=>{pumpFailed=true;clearTimeout(timer);cleanupFrames();post({type:'error',message});});
      if(closing){gpuPresenter?.destroy();return;}
      if(!gpuPresenter)context=canvas.getContext('2d',{alpha:false});""")
replace('if(quality&&presentation.pixelChecks.length<2', 'if(quality&&!gpuPresenter&&presentation.pixelChecks.length<2')
replace('data:{pumpTicks:ticks,subtitles:', "data:{presenter:gpuPresenter?'webgpu':'canvas2d',gpuStats:gpuPresenter?.stats,pumpTicks:ticks,subtitles:")
replace('      engine?._web_destroy();', '      gpuPresenter?.destroy();gpuPresenter=null;\n      engine?._web_destroy();')
helper=Path('experiments/playback-performance/webgpu/presenter.js').read_text()
helper+='''\nlet gpuPresenter;
function drawFrame(frame,overlay){
 if(gpuPresenter)gpuPresenter.draw(frame,videoTrack,overlay);
 else{drawRetainedVideo(context,frame,canvas,videoTrack);subtitles.draw(context,overlay);}
}
'''
(out/'worker.js').write_text(helper+s)
(out/'overrides.json').write_text(json.dumps({'web/filter-retained-engine-worker.js':str(out/'worker.js')},indent=2)+'\n')
