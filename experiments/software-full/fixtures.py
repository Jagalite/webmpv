#!/usr/bin/env python3
"""Generate short, original fixtures with the host FFmpeg, never the Wasm encoder."""
import hashlib,json,subprocess
from pathlib import Path
root=Path(__file__).resolve().parents[2]
out=root/'build/fixtures/software-full';out.mkdir(parents=True,exist_ok=True)
(out/'captions.srt').write_text('1\n00:00:00,000 --> 00:00:03,900\nSoftware subtitle qualification\n')
cases=[
 ('h264-aac.mp4','h264','aac',['libx264','-preset','ultrafast'],['aac']),
 ('hevc-ac3.mkv','hevc','ac3',['libx265','-preset','ultrafast','-x265-params','pools=1:frame-threads=1:log-level=error'],['ac3']),
 ('vp8-vorbis.webm','vp8','vorbis',['libvpx','-deadline','realtime','-cpu-used','8'],['vorbis','-strict','experimental']),
 ('vp9-opus.webm','vp9','opus',['libvpx-vp9','-deadline','realtime','-cpu-used','8'],['libopus']),
 ('mpeg4-mp3.avi','mpeg4','mp3',['mpeg4'],['libmp3lame']),
 ('mpeg2-mp2.ts','mpeg2video','mp2',['mpeg2video'],['mp2']),
 ('ffv1-flac.mkv','ffv1','flac',['ffv1'],['flac']),
 ('wmv2-wmav2.asf','wmv2','wmav2',['wmv2'],['wmav2']),
 ('mjpeg-pcm.avi','mjpeg','pcm_s16le',['mjpeg'],['pcm_s16le']),
 ('prores-pcm.mov','prores','pcm_s16le',['prores_ks','-profile:v','0','-pix_fmt','yuv422p10le'],['pcm_s16le']),
 ('audio.flac',None,'flac',None,['flac']),
 ('audio.mp3',None,'mp3',None,['libmp3lame']),
 ('audio.ac3',None,'ac3',None,['ac3']),
 ('audio.eac3',None,'eac3',None,['eac3']),
 ('audio.dts',None,'dts',None,['dca','-strict','experimental']),
 ('audio.wv',None,'wavpack',None,['wavpack']),
 ('subrip.mkv','h264','aac',['libx264','-preset','ultrafast'],['aac']),
 ('movtext.mp4','h264','aac',['libx264','-preset','ultrafast'],['aac']),
]
manifest={'generator':subprocess.check_output(['ffmpeg','-version'],text=True).splitlines()[0],'cases':[]}
for name,video,audio,vc,ac in cases:
 cmd=['ffmpeg','-hide_banner','-loglevel','error','-nostdin','-y']
 if video:cmd+=['-f','lavfi','-i','testsrc2=size=320x180:rate=24']
 cmd+=['-f','lavfi','-i','sine=frequency=440:sample_rate=48000']
 sub='subrip' if name=='subrip.mkv' else 'mov_text' if name=='movtext.mp4' else None
 if sub:cmd+=['-i',str(out/'captions.srt')]
 if video:cmd+=['-map','0:v:0','-map','1:a:0','-c:v',*vc,'-threads:v','1','-g','12']
 else:cmd+=['-map','0:a:0']
 if sub:cmd+=['-map','2:s:0','-c:s',sub]
 cmd+=['-c:a',*ac,'-ac','2','-t','4',str(out/name)]
 subprocess.run(cmd,check=True)
 probe=json.loads(subprocess.check_output(['ffprobe','-v','error','-show_streams','-show_format','-of','json',str(out/name)],text=True))
 manifest['cases'].append({'file':name,'video':video,'audio':audio,'subtitle':sub,'sha256':hashlib.sha256((out/name).read_bytes()).hexdigest(),'bytes':(out/name).stat().st_size,'command':cmd,'probe':probe})
 print(name,flush=True)
(out/'manifest.json').write_text(json.dumps(manifest,indent=2)+'\n')
# PCM control is playable in both the accepted and expanded engines.
subprocess.run(['ffmpeg','-hide_banner','-loglevel','error','-nostdin','-y',
 '-f','lavfi','-i','sine=frequency=440:sample_rate=48000','-ac','2','-t','4',
 '-c:a','pcm_s16le',str(out/'control.wav')],check=True)
