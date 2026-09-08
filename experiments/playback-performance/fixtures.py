#!/usr/bin/env python3
"""Generate bounded, original performance fixtures; never modify source media."""
import hashlib,json,subprocess
from pathlib import Path
root=Path(__file__).resolve().parents[2]
out=root/'build/fixtures/playback-performance';out.mkdir(parents=True,exist_ok=True)
manifest={'generator':subprocess.check_output(['ffmpeg','-version'],text=True).splitlines()[0],'cases':[]}
cases=[
 ('h264-720p60.mp4',1280,720,60,'yuv420p',['libx264','-preset','veryfast','-crf','28'],['aac','-b:a','96k']),
 ('h264-1080p60.mp4',1920,1080,60,'yuv420p',['libx264','-preset','veryfast','-crf','28'],['aac','-b:a','96k']),
 ('h264-10bit.mkv',640,360,30,'yuv420p10le',['libx264','-preset','veryfast','-crf','24'],['aac','-b:a','96k']),
 ('hevc-10bit.mkv',640,360,30,'yuv420p10le',['libx265','-preset','fast','-crf','28','-x265-params','pools=1:frame-threads=1:log-level=error'],['aac','-b:a','96k']),
 ('vp9-30fps.webm',640,360,30,'yuv420p',['libvpx-vp9','-deadline','realtime','-cpu-used','6','-crf','35','-b:v','0'],['libopus','-b:a','96k']),
]
for name,width,height,fps,pixels,video,audio in cases:
    target=out/name
    command=['ffmpeg','-hide_banner','-loglevel','error','-nostdin','-n','-f','lavfi','-i',f'testsrc2=size={width}x{height}:rate={fps}',
        '-f','lavfi','-i','sine=frequency=440:sample_rate=48000','-map','0:v:0','-map','1:a:0','-c:v',*video,'-threads:v','2','-pix_fmt',pixels,'-g',str(fps*2),'-c:a',*audio,'-ac','2','-t','26',str(target)]
    if not target.exists():subprocess.run(command,check=True)
    probe=json.loads(subprocess.check_output(['ffprobe','-v','error','-show_streams','-show_format','-of','json',str(target)],text=True))
    assert float(probe['format']['duration'])>=26 and target.stat().st_size<=32*1024*1024
    manifest['cases'].append({'file':str(target.relative_to(root)),'sha256':hashlib.sha256(target.read_bytes()).hexdigest(),'bytes':target.stat().st_size,'command':command,'probe':probe})
    print(name,flush=True)
# The original 1080p sample is remuxed with an original subtitle track.
subtitles=out/'captions.srt'
subtitles.write_text('1\n00:00:00,000 --> 00:00:08,000\nSoftware and Hybrid subtitle performance\n\n2\n00:00:08,000 --> 00:00:16,000\nSecond caption: timing and redraw check\n\n3\n00:00:16,000 --> 00:00:26,000\nFinal caption with a second line\nSame source pixels and audio\n')
source=root/'build/hybrid-performance/sample.mp4';source_hash=hashlib.sha256(source.read_bytes()).hexdigest()
target=out/'sample-ass.mkv'
command=['ffmpeg','-hide_banner','-loglevel','error','-nostdin','-n','-i',str(source),'-i',str(subtitles),'-map','0:v:0','-map','0:a:0','-map','1:s:0','-c','copy','-c:s','ass',str(target)]
if not target.exists():subprocess.run(command,check=True)
assert hashlib.sha256(source.read_bytes()).hexdigest()==source_hash
manifest['cases'].append({'file':str(target.relative_to(root)),'sha256':hashlib.sha256(target.read_bytes()).hexdigest(),'sourceSha256':source_hash,'bytes':target.stat().st_size,'command':command,'subtitle':'ass'})
(out/'manifest.json').write_text(json.dumps(manifest,indent=2)+'\n')
