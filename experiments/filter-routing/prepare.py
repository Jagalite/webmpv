from pathlib import Path
s=Path('web/engine-worker.js').read_text().replace("'./engine-m4/player.mjs'", "'./engine-filter-copyback/player.mjs'")
Path('web/filter-copyback-engine-worker.js').write_text(s)
s=Path('web/generated/player.js').read_text().replace('../engine-worker.js','../filter-copyback-engine-worker.js')
Path('web/generated/filter-copyback-player.js').write_text(s)
# Retire preroll frames even when their worker messages arrive after mpv has
# reported seek completion. Also release frames mpv skipped during playback.
s=Path('web/subtitled-engine-worker.js').read_text()
s='let minFramePts=-Infinity;\n'+s
s=s.replace(' presentation.received++;', " presentation.received++;\n if(message.pts<minFramePts&&!pendingFrames.has(Math.round(message.pts))){closeOwned(message.retainedFrame);return;}")
s=s.replace(' const key=Math.round(engine._web_selected_pts()*1e6),overlay=', " const key=Math.round(engine._web_selected_pts()*1e6);minFramePts=Math.max(minFramePts,key);\n for(const [pts,frame] of frames)if(pts<minFramePts&&!pendingFrames.has(pts)){closeOwned(frame);frames.delete(pts);}\n const overlay=")
s=s.replace("} else if(data.type==='seek'){cleanupFrames();", "} else if(data.type==='seek'){minFramePts=data.seconds*1e6-150000;cleanupFrames();")
s=s.replace("} else if (data.type === 'open') {cleanupFrames();", "} else if (data.type === 'open') {minFramePts=-Infinity;cleanupFrames();")
s=s.replace('async function openRemote(data){cleanupFrames();', 'async function openRemote(data){minFramePts=-Infinity;cleanupFrames();')
# A burst of decoder messages can run ahead of the interval callback after an
# event-loop stall. Service mpv's newest selection before admitting another frame.
s=s.replace(' frames.set(key,message.retainedFrame);', " if(frames.size+(heldFrame?1:0)>=16){tick();if(key<minFramePts&&!pendingFrames.has(key)){closeOwned(message.retainedFrame);return;}if(frames.size+(heldFrame?1:0)>=16){closeOwned(message.retainedFrame);throw Error('Retained frame bound exceeded');}}\n frames.set(key,message.retainedFrame);")
s=s.replace('if(message.retainedFrame){try{receiveFrame(message);}catch(error){post({type:\"error\",message:String(error)});}}', 'if(message.retainedFrame){try{receiveFrame(message);}catch(error){cleanupFrames();clearInterval(timer);post({type:\"error\",message:String(error)});}}')
Path('web/filter-retained-engine-worker.js').write_text(s)
s=Path('web/generated/subtitled-player.js').read_text().replace('../subtitled-engine-worker.js','../filter-retained-engine-worker.js')
Path('web/generated/filter-retained-player.js').write_text(s)
