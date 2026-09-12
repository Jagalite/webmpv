#!/usr/bin/env python3
"""Deterministic small fixtures for the compatibility expansion; source media is untouched."""
from pathlib import Path
import subprocess,json,hashlib,shutil
out=Path('build/fixtures/compatibility');out.mkdir(parents=True,exist_ok=True)
commands=[]
def ff(name,*args):
 cmd=['build/native-color-reference/ffmpeg' if name.endswith('-reference.rgb') else 'ffmpeg','-hide_banner','-loglevel','error','-nostdin','-y','-filter_threads','1',*args,str(out/name)]
 subprocess.run(cmd,check=True,timeout=120);commands.append(cmd)
for bits in [8,10]:ff(f'av1-{bits}.mkv','-f','lavfi','-i','testsrc2=s=320x180:r=12','-t','3','-c:v','libsvtav1','-preset','12','-svtav1-params','lp=1','-g','12','-pix_fmt','yuv420p' if bits==8 else 'yuv420p10le')
ff('4k.mkv','-f','lavfi','-i','testsrc2=s=3840x2160:r=2','-t','2','-c:v','ffv1','-threads','2')
tone='zscale=transfer=linear:npl=100,format=gbrpf32le,zscale=primaries=bt709,tonemap=tonemap=mobius:desat=0,zscale=transfer=bt709:matrix=bt709:range=limited,format=yuv420p'
for name,trc in [('hdr','smpte2084'),('hlg','arib-std-b67')]:
 ff(name+'.mkv','-f','lavfi','-i','testsrc2=s=320x180:r=12','-t','3','-vf',f'format=yuv420p10le,setparams=color_primaries=bt2020:color_trc={trc}:colorspace=bt2020nc:range=limited','-c:v','ffv1','-threads','2')
 ff(name+'-reference.rgb','-i',str(out/(name+'.mkv')),'-vf',tone+',format=rgba','-frames:v','1','-f','rawvideo')
ff('black.mp4','-f','lavfi','-i','color=black:s=320x180:r=12','-f','lavfi','-i','sine=frequency=440:sample_rate=48000','-t','6','-c:v','libx264','-preset','ultrafast','-g','12','-pix_fmt','yuv420p','-c:a','aac','-movflags','+faststart')
for n in [6,8]:
 expr='|'.join(f'{(i+1)/20}' for i in range(n))
 ff(f'channels-{n}.wav','-f','lavfi','-i',f'aevalsrc={expr}:s=48000:d=3:c={"5.1" if n==6 else "7.1"}','-c:a','pcm_f32le')
for codec in ['comfortnoise']:
 ff(codec+'.nut','-f','lavfi','-i','sine=frequency=440:sample_rate=8000','-t','3','-c:a','real_144' if codec=='ra_144' else codec,'-ac','1','-strict','-2')
ff('ra_144.mkv','-f','lavfi','-i','sine=frequency=440:sample_rate=8000','-t','3','-c:a','real_144','-ac','1')
for codec in ['sbc.sbc','dfpwm.nut','adpcm_swf.wav','dirac.nut','mpeg1video.mpg','mpeg2video.ts']:shutil.copyfile('build/fixtures/format-matrix/'+codec,out/codec)
(out/'subtitle.srt').write_text('1\n00:00:00,300 --> 00:00:05,500\nEXTERNAL CAPTION\n\n')
(out/'subtitle.ass').write_text('''[Script Info]
ScriptType: v4.00+
PlayResX: 320
PlayResY: 180
[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: Default,DejaVu Sans Mono,22,&H0000FF00,&H000000FF,&H00000000,&H00000000,0,0,0,0,100,100,0,0,1,1,0,2,10,10,12,1
[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
Dialogue: 0,0:00:00.30,0:00:05.50,Default,,0,0,0,,CUSTOM FONT
''')
shutil.copyfile('build/dejavu-fonts-ttf-2.37/ttf/DejaVuSansMono.ttf',out/'custom.ttf')
for name,color in [('low','red'),('high','blue')]:
 (out/name).mkdir(exist_ok=True)
 ff(name+'/index.m3u8','-f','lavfi','-i',f'color={color}:s=320x180:r=12','-f','lavfi','-i','sine=frequency=440:sample_rate=48000','-t','6','-c:v','libx264','-preset','ultrafast','-g','12','-sc_threshold','0','-c:a','aac','-hls_time','1','-hls_list_size','0','-hls_segment_filename',str(out/name/'%03d.ts'))
(out/'master.m3u8').write_text('#EXTM3U\n#EXT-X-MEDIA:TYPE=SUBTITLES,GROUP-ID="subs",NAME="English",LANGUAGE="en",DEFAULT=YES,AUTOSELECT=YES,URI="subs.m3u8"\n#EXT-X-STREAM-INF:BANDWIDTH=100000,SUBTITLES="subs"\nlow/index.m3u8\n#EXT-X-STREAM-INF:BANDWIDTH=900000,SUBTITLES="subs"\nhigh/index.m3u8\n')
(out/'subs.m3u8').write_text('#EXTM3U\n#EXT-X-TARGETDURATION:2\n'+''.join(f'#EXTINF:2,\nsub-{i}.vtt\n' for i in range(3))+'#EXT-X-ENDLIST\n')
for i in range(3):(out/f'sub-{i}.vtt').write_text(f'WEBVTT\nX-TIMESTAMP-MAP=LOCAL:00:00:00.000,MPEGTS:{126000+i*180000}\n\n00:00:00.100 --> 00:00:01.900\nSEGMENT {i+1}\n')
for i,(color,size) in enumerate([('red','320x180'),('blue','640x360')]):
 ff(f'change-{i}.ts','-f','lavfi','-i',f'color={color}:s={size}:r=12','-f','lavfi','-i','sine=frequency=440:sample_rate=48000','-t','8','-c:v','libx264','-preset','ultrafast','-g','12','-pix_fmt','yuv420p','-c:a','aac','-output_ts_offset',str(i*8),'-muxdelay','0')
(out/'configuration-change.ts').write_bytes((out/'change-0.ts').read_bytes()+(out/'change-1.ts').read_bytes())
ff('video-only.ts','-f','lavfi','-i','testsrc2=s=320x180:r=12','-t','8','-c:v','libx264','-preset','ultrafast','-g','12','-pix_fmt','yuv420p','-muxdelay','0')
periods=[]
for i,color in [(0,'red'),(1,'blue')]:
 name=f'period{i}';(out/name).mkdir(exist_ok=True)
 ff(name+'/manifest.mpd','-f','lavfi','-i',f'color={color}:s=320x180:r=12','-t','3','-c:v','libx264','-preset','ultrafast','-g','12','-sc_threshold','0','-f','dash','-seg_duration','1','-use_template','1','-use_timeline','1')
 text=(out/name/'manifest.mpd').read_text();period=text[text.index('<Period'):text.index('</Period>')+9];period=period.replace('id="0" start="PT0.0S"',f'id="{i}" start="PT{i*3}S" duration="PT3S"').replace('<AdaptationSet',f'<BaseURL>{name}/</BaseURL><AdaptationSet',1);periods.append(period)
(out/'periods.mpd').write_text('<MPD type="static" mediaPresentationDuration="PT6S">'+''.join(periods)+'</MPD>')
periods=[]
for i,color in [(0,'red'),(1,'blue')]:
 name=f'period-av{i}';(out/name).mkdir(exist_ok=True)
 ff(name+'/manifest.mpd','-f','lavfi','-i',f'color={color}:s=320x180:r=12','-f','lavfi','-i','sine=frequency=440:sample_rate=48000','-t','3','-c:v','libx264','-preset','ultrafast','-g','12','-sc_threshold','0','-c:a','aac','-f','dash','-seg_duration','1','-use_template','1','-use_timeline','1')
 text=(out/name/'manifest.mpd').read_text();period=text[text.index('<Period'):text.index('</Period>')+9];period=period.replace('id="0" start="PT0.0S"',f'id="{i}" start="PT{i*3}S" duration="PT3S"').replace('<AdaptationSet',f'<BaseURL>{name}/</BaseURL><AdaptationSet',1);periods.append(period)
(out/'periods-av.mpd').write_text('<MPD type="static" mediaPresentationDuration="PT6S">'+''.join(periods)+'</MPD>')
files={str(p.relative_to(out)):{'bytes':p.stat().st_size,'sha256':hashlib.sha256(p.read_bytes()).hexdigest()} for p in sorted(out.rglob('*')) if p.is_file() and p.name!='manifest.json'}
(out/'manifest.json').write_text(json.dumps({'generator':subprocess.check_output(['ffmpeg','-version'],text=True).splitlines()[0],'commands':commands,'files':files},indent=2)+'\n')
print(out)
