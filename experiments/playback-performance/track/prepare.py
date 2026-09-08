"""Experimental video-compositor surface. Not a public API implementation.

The canvas becomes a transparent subtitle layer, so canvas-only screenshots no
longer contain the picture. Keep this isolated until the surface contract and
independent audio/display timing have been addressed.
"""
from pathlib import Path
import json
out=Path('build/playback-performance/track');out.mkdir(parents=True,exist_ok=True)
source=Path('experiments/playback-performance/track/clock.js').read_text()+'\n'+Path('build/playback-performance/timing/wasm-player.js').read_text()
def change(text,old,new):
    assert text.count(old)==1,old
    return text.replace(old,new)
source=change(source,'                const offscreen = canvas.transferControlToOffscreen();','''                let trackWritable;
                if(mode==='hybrid') {
                    if(typeof MediaStreamTrackGenerator!=='function')throw new Error('Experimental track presenter unavailable');
                    const track=new MediaStreamTrackGenerator({kind:'video'});
                    const video=canvas.ownerDocument.createElement('video');video.autoplay=true;video.muted=true;video.playsInline=true;
                    video.width=canvas.width;video.height=canvas.height;
                    video.style.cssText='position:absolute;inset:0;width:100%;height:100%;object-fit:contain;background:#000;pointer-events:none;z-index:0';
                    canvas.parentElement.style.position='relative';canvas.style.background='transparent';canvas.style.position='relative';canvas.style.zIndex='1';
                    canvas.before(video);video.srcObject=new MediaStream([track]);
                    const syncVisibility=()=>{video.style.display=canvas.style.display;};syncVisibility();
                    const observer=new MutationObserver(syncVisibility);observer.observe(canvas,{attributes:true,attributeFilter:['style']});
                    const clock=createTrackClock(),stats=clock.stats;Object.assign(stats,{callbacks:0,presentedFrames:0});
                    const presented=(now,metadata)=>{
                        stats.callbacks++;stats.presentedFrames=metadata.presentedFrames;
                        clock.present(metadata.mediaTime*1e6,performance.timeOrigin+metadata.expectedDisplayTime);
                        if(stats.delays.length>120)stats.delays.shift();
                        this.trackPresenter.callback=video.requestVideoFrameCallback(presented);
                    };
                    this.trackPresenter={track,video,observer,stats,clock};
                    this.trackPresenter.callback=video.requestVideoFrameCallback(presented);
                    void video.play().catch(error=>{if(!this.destroyed)this.fail(error);});
                    trackWritable=track.writable;
                }
                const offscreen = canvas.transferControlToOffscreen();''')
source=change(source,"decoderFaultAfter: 0 }, [offscreen, font]", "decoderFaultAfter: 0, trackWritable }, [offscreen, font,...(trackWritable?[trackWritable]:[])]")
source=change(source,"                else if (data.type === 'output')", "                else if (data.type === 'track-frame')this.trackPresenter?.clock.submit(data);\n                else if (data.type === 'output')")
source=change(source,"                else if (data.type === 'diagnostics')\n                    this.diagnostics = data.data;", """                else if (data.type === 'diagnostics') {
                    if(this.trackPresenter){const {video,stats}=this.trackPresenter;const quality=video.getVideoPlaybackQuality();data.data.trackOutput={...stats,delays:[...stats.delays],total:quality.totalVideoFrames,dropped:quality.droppedVideoFrames,width:video.videoWidth,height:video.videoHeight};}
                    this.diagnostics = data.data;
                }""")
source=change(source,'        this.destroyed = true;', '''        this.destroyed = true;
        if(this.trackPresenter){const {video,track,observer,callback}=this.trackPresenter;observer.disconnect();video.cancelVideoFrameCallback(callback);video.pause();video.srcObject=null;video.remove();this.retiredTrack=track;this.trackPresenter=null;}''')
source=change(source,'                this.worker.terminate();', '                this.retiredTrack?.stop();this.retiredTrack=null;\n                this.worker.terminate();')
(out/'wasm-player.js').write_text(source)
worker=Path('build/playback-performance/decoder-strict/worker.js').read_text()
worker=change(worker,'  drawRetainedVideo(context,frame,canvas,videoTrack);\n  subtitles.draw(context,request.overlay);','  presentTrack(frame,request.overlay);')
worker=change(worker,'drawRetainedVideo(context,heldFrame,canvas,videoTrack);subtitles.draw(context,overlay);','presentTrack(heldFrame,overlay);')
worker=change(worker,"      context = canvas.getContext('2d', {alpha:false});", """      if(!data.trackWritable)throw Error('Missing experimental video sink');
      trackWriter=data.trackWritable.getWriter();
      context=canvas.getContext('2d',{alpha:true});""")
worker=change(worker,'if(quality&&presentation.pixelChecks.length<2','if(false&&quality&&presentation.pixelChecks.length<2')
worker=change(worker,'data:{pumpTicks:ticks,subtitles:',"data:{presenter:'track',trackStats:{...trackStats},pumpTicks:ticks,subtitles:")
worker=change(worker,'      engine?._web_destroy();', '''      await trackWriter?.abort().catch(()=>{});trackWriter?.releaseLock();trackWriter=null;
      engine?._web_destroy();''')
helper='''// Only plain, square-pixel orientation is qualified by this prototype.
let trackWriter,lastTrackOverlay,lastTrackWidth=0,lastTrackHeight=0;
const trackStats={submitted:0,completed:0,pending:0,peakPending:0,writeMs:0,maxWriteMs:0,overlayUpdates:0,closedBySink:0};
function presentTrack(frame,overlay){
 const par=Number(videoTrack?.['demux-par'])||1,rotation=((Number(videoTrack?.['demux-rotation'])||0)%360+360)%360;
 if(Math.abs(par-1)>1e-6||rotation)throw Error('Experimental track presenter requires unrotated square pixels');
 if(trackStats.pending>=2)throw Error('Experimental track sink exceeded two pending writes');
 const copy=frame.clone();
 const started=performance.now();trackStats.submitted++;trackStats.pending++;trackStats.peakPending=Math.max(trackStats.peakPending,trackStats.pending);
 post({type:'track-frame',pts:frame.timestamp,wall:performance.timeOrigin+started});
 void trackWriter.write(copy).then(()=>{trackStats.completed++;if(copy.format===null)trackStats.closedBySink++;},error=>{if(!closing){pumpFailed=true;clearTimeout(timer);cleanupFrames();post({type:'error',message:String(error)});}}).finally(()=>{copy.close();trackStats.pending--;const elapsed=performance.now()-started;trackStats.writeMs+=elapsed;trackStats.maxWriteMs=Math.max(trackStats.maxWriteMs,elapsed);});
 if(overlay!==lastTrackOverlay||lastTrackWidth!==canvas.width||lastTrackHeight!==canvas.height){
  context.clearRect(0,0,canvas.width,canvas.height);subtitles.draw(context,overlay);
  lastTrackOverlay=overlay;lastTrackWidth=canvas.width;lastTrackHeight=canvas.height;trackStats.overlayUpdates++;
 }
}
'''
(out/'worker.js').write_text(helper+worker)
overrides=json.loads(Path('build/playback-performance/decoder-strict/overrides.json').read_text())
overrides.update({'web/filter-retained-engine-worker.js':str(out/'worker.js'),'web/generated/internal/wasm-player.js':str(out/'wasm-player.js')})
(out/'overrides.json').write_text(json.dumps(overrides,indent=2)+'\n')
