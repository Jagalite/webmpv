from pathlib import Path
import subprocess,json,hashlib
out=Path('build/pipeline-qualification/fixtures');out.mkdir(parents=True,exist_ok=True)
commands=[]
def ff(name,args):
 p=out/name;cmd=['ffmpeg','-hide_banner','-loglevel','error',*args,str(p)];commands.append(cmd)
 if not p.exists():subprocess.run(cmd,check=True)
for matrix in ['bt709','smpte170m']:
 for full in [False,True]:
  name=f'color-{matrix}-{int(full)}-v2';w,h=640,360
  colors=[(16,128,128),(235,128,128),(81,90,240),(145,54,34),(41,240,110),(128,128,128),(64,160,180),(180,110,80),(100,80,80),(210,180,150),(30,130,124),(230,120,130)]
  planes=[]
  for i in range(3):
   pw,ph=(w,h) if i==0 else(w//2,h//2)
   planes.append(bytes(colors[min(2,y*3//ph)*4+min(3,x*4//pw)][i] for y in range(ph) for x in range(pw)))
  raw=out/(name+'.yuv')
  if not raw.exists():raw.write_bytes(b''.join(planes))
  ff(name+'.mkv',['-stream_loop','-1','-f','rawvideo','-pixel_format','yuv420p','-video_size',f'{w}x{h}','-framerate','30','-i',str(raw),'-f','lavfi','-i','anullsrc=r=48000:cl=stereo','-t','6','-vf',f'setparams=range={"full" if full else "limited"}:colorspace={matrix}','-c:v','ffv1','-colorspace',matrix,'-color_range','pc' if full else 'tv','-c:a','aac'])
ff('sync.mp4',['-f','lavfi','-i',"color=black:s=640x360:r=30:d=12,drawbox=x=0:y=0:w=iw:h=ih:color=white:t=fill:enable='lt(mod(t,1),0.067)'",'-f','lavfi','-i',"aevalsrc=0.5*sin(2*PI*1000*t)*lt(mod(t\\,1)\\,0.04):s=48000:d=12",'-c:v','libx264','-g','60','-bf','3','-c:a','aac','-ac','2','-movflags','+faststart'])
ff('sync.mkv',['-i',str(out/'sync.mp4'),'-c','copy'])
ff('offset.mp4',['-i',str(out/'sync.mp4'),'-itsoffset','0.25','-i',str(out/'sync.mp4'),'-map','0:v:0','-map','1:a:0','-c','copy'])
ff('long.ts',['-i','build/pipeline-separation/fixtures/long.mp4','-c','copy','-f','mpegts'])
ff('edit.mp4',['-ss','0.25','-i',str(out/'sync.mp4'),'-c','copy'])
Path('results/pipeline-qualification/extra-fixtures.json').write_text(json.dumps({'commands':commands,'files':{p.name:{'bytes':p.stat().st_size,'sha256':hashlib.file_digest(p.open('rb'),'sha256').hexdigest()} for p in out.iterdir()}},indent=2)+'\n')
