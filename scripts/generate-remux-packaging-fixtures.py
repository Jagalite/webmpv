from pathlib import Path
import subprocess
out=Path('build/routing-completion/fixtures');out.mkdir(parents=True,exist_ok=True)
def make(name,args):
 p=out/name
 if not p.exists():subprocess.run(['ffmpeg','-hide_banner','-loglevel','error','-nostdin',*args,str(p)],check=True)
for name,codec in [('audio-aac.m4a','aac'),('audio-opus.ogg','libopus'),('audio-flac.flac','flac')]:
 make(name,['-f','lavfi','-i','sine=frequency=997:sample_rate=48000:duration=64','-c:a',codec])
for name in ['vp8-vorbis','vp9-opus']:
 make(name+'.mkv',['-stream_loop','15','-i',f'build/fixtures/software-full/{name}.webm','-c','copy'])

make('audio-vorbis.ogg',['-stream_loop','15','-i','build/fixtures/software-full/vp8-vorbis.webm','-vn','-c:a','copy'])
for name,video,audio in [('vp8-opus','vp8-vorbis','audio-opus.ogg'),('vp9-vorbis','vp9-opus','audio-vorbis.ogg')]:
 make(name+'.mkv',['-i',str(out/(video+'.mkv')),'-i',str(out/audio),'-map','0:v:0','-map','1:a:0','-c','copy'])
