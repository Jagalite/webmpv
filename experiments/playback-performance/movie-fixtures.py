"""Keyframe-aligned licensed movie excerpts for fair startup and CPU comparisons."""
from pathlib import Path
import json,subprocess,hashlib
out=Path('build/fixtures/playback-performance');source=out/'bbb-source.mp4'
packets=json.loads(subprocess.check_output(['ffprobe','-v','error','-select_streams','v:0','-show_packets','-show_entries','packet=pts_time,flags','-of','json',str(source)]))['packets']
keys=[float(p['pts_time']) for p in packets if 'K' in p['flags']]
cases=[]
for target_time in [60,240,480]:
 start=max(key for key in keys if key<=target_time);target=out/f'bbb-key-{target_time:03d}.mp4'
 command=['ffmpeg','-hide_banner','-loglevel','error','-nostdin','-n','-ss',str(start),'-i',str(source),'-map','0:v:0','-map','0:a:0','-c:v','copy','-c:a','aac','-b:a','128k','-ac','2','-t','26','-movflags','+faststart',str(target)]
 if not target.exists():subprocess.run(command,check=True)
 assert target.stat().st_size<32*1024*1024
 cases.append({'file':str(target),'sourceStart':start,'command':command,'sha256':hashlib.sha256(target.read_bytes()).hexdigest(),'bytes':target.stat().st_size})
manifest={'attribution':'Big Buck Bunny, copyright 2008 Blender Foundation / www.bigbuckbunny.org. CC BY 3.0. Excerpts remuxed; audio converted to AAC stereo.','licenseSource':'https://peach.blender.org/about/','sourceUrl':'https://download.blender.org/demo/movies/BBB/bbb_sunflower_1080p_30fps_normal.mp4.zip','sourceSha256':hashlib.sha256(source.read_bytes()).hexdigest(),'cases':cases}
(out/'bbb-key-manifest.json').write_text(json.dumps(manifest,indent=2)+'\n')
for case in cases:print(case['file'],case['sourceStart'])
