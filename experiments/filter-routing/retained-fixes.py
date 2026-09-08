"""Apply maintained presenter fixes after generating the historical worker base."""
def fix_retained_worker(s):
    s="import {drawRetainedVideo} from './retained-video.js';\nlet videoTrack;\n"+s
    s=s.replace('presentation={received:', 'presentation={position:null,received:')
    s=s.replace('function cleanupFrames(){', 'function cleanupFrames(){presentation.position=null;')
    s=s.replace('context.drawImage(frame,0,0,canvas.width,canvas.height);', 'drawRetainedVideo(context,frame,canvas,videoTrack);')
    s=s.replace('context.drawImage(heldFrame,0,0,canvas.width,canvas.height);', 'drawRetainedVideo(context,heldFrame,canvas,videoTrack);')
    s=s.replace('  presentation.drawn++;', '  presentation.position=key/1e6;\n  presentation.drawn++;')
    s=s.replace("      if(event.event==='file-loaded'){", "      if(event.event==='property-change'&&event.name==='track-list')videoTrack=event.data?.find(t=>t.type==='video'&&t.selected);\n      if(event.event==='file-loaded'){")
    return s
