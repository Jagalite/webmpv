from pathlib import Path
import subprocess,json,hashlib
out=Path('build/pipeline-qualification/fixtures');out.mkdir(parents=True,exist_ok=True)
commands=[]
def ff(name,args):
 path=out/name;cmd=['ffmpeg','-hide_banner','-loglevel','error','-y',*args,str(path)];commands.append(cmd)
 if not path.exists():subprocess.run(cmd,check=True)
movie='build/fixtures/playback-performance/bbb-stream.mp4';sample='build/hybrid-performance/sample.mp4'
ff('movie.mkv',['-i',movie,'-map','0:v:0','-map','0:a:0','-c','copy'])
ff('tail.mp4',['-i',movie,'-map','0:v:0','-map','0:a:0','-c','copy'])
ff('offset.mkv',['-i',sample,'-itsoffset','0.25','-i',sample,'-map','0:v:0','-map','1:a:0','-c','copy'])
ff('rotation.mp4',['-display_rotation:v:0','90','-i',sample,'-map','0:v:0','-map','0:a:0','-c','copy'])
ff('sar.mp4',['-i',sample,'-map','0:v:0','-map','0:a:0','-c','copy','-bsf:v','h264_metadata=sample_aspect_ratio=4/3','-aspect','64:27'])
ff('long.mp4',['-f','lavfi','-i','testsrc2=size=640x360:rate=30:duration=40','-f','lavfi','-i','sine=frequency=440:sample_rate=48000:duration=40','-c:v','libx264','-preset','fast','-g','600','-keyint_min','600','-sc_threshold','0','-bf','3','-c:a','aac','-ac','2','-movflags','+faststart'])
for n,size in enumerate(['640x360','320x180']):
 ff(f'config-{n}.ts',['-f','lavfi','-i',f'testsrc2=size={size}:rate=30:duration=6','-f','lavfi','-i','sine=sample_rate=48000:duration=6','-c:v','libx264','-preset','fast','-g','60','-c:a','aac','-ac','2','-f','mpegts'])
if not (out/'config.ts').exists():(out/'config.ts').write_bytes((out/'config-0.ts').read_bytes()+(out/'config-1.ts').read_bytes())
manifest={'commands':commands,'files':{p.name:{'bytes':p.stat().st_size,'sha256':hashlib.sha256(p.read_bytes()).hexdigest()} for p in out.iterdir() if p.is_file()}}
Path('results/pipeline-qualification/fixture-manifest.json').write_text(json.dumps(manifest,indent=2)+'\n')
print('Fixtures ready')
