#!/usr/bin/env python3
"""Small generated samples for every locally encodable bundled audio/video codec."""
import hashlib,json,re,subprocess,sys
from pathlib import Path
root=Path(__file__).resolve().parents[2]
out=root/'build/fixtures/format-matrix';out.mkdir(parents=True,exist_ok=True)
build=json.loads((root/'results/software-full/build.json').read_text())
enabled=set(build['enabled']['decoder'])
listing=subprocess.check_output(['ffmpeg','-hide_banner','-encoders'],text=True,stderr=subprocess.DEVNULL)
selected={}
for line in listing.splitlines():
 m=re.match(r' ([VA])[^ ]*\s+(\S+)\s+(.+)',line)
 if not m:continue
 kind,encoder,description=m.groups();codec=(re.search(r'\(codec ([^)]+)\)',description) or [None,encoder])[1]
 if codec.upper() not in enabled or any(x in encoder for x in ['videotoolbox','_at']):continue
 if codec not in selected:selected[codec]=(kind,encoder)
containers={'h264':'mp4','hevc':'mp4','av1':'mp4','vp8':'webm','vp9':'webm','mpeg4':'avi','mpeg1video':'mpg','mpeg2video':'ts','ffv1':'mkv','prores':'mov','mjpeg':'avi','wmv1':'asf','wmv2':'asf','flv1':'flv','qtrle':'mov','rpza':'mov','smc':'mov','rv10':'rm','rv20':'rm','huffyuv':'avi','ffvhuff':'avi','utvideo':'avi','msmpeg4v2':'avi','msmpeg4v3':'avi','msvideo1':'avi','msrle':'avi','cinepak':'avi','zlib':'avi','zmbv':'avi','aac':'m4a','alac':'m4a','mp3':'mp3','mp2':'mp2','ac3':'ac3','eac3':'eac3','dts':'dts','flac':'flac','opus':'ogg','vorbis':'ogg','wavpack':'wv','tta':'tta','truehd':'thd','mlp':'mlp','wmav1':'asf','wmav2':'asf','ra_144':'ra','sbc':'sbc'}
manifest={'schema':1,'generator':subprocess.check_output(['ffmpeg','-version'],text=True).splitlines()[0],'scope':'Two-second low-resolution generated samples; not exhaustive profiles or containers','cases':[],'generationFailures':[],'noMatchingEncoder':sorted(enabled-{c.upper() for c in selected})}
if '--retry' in sys.argv:
 previous=json.loads((out/'manifest.json').read_text());retry={c['codec'] for c in previous['generationFailures']};manifest['cases']=previous['cases'];selected={c:v for c,v in selected.items() if c in retry}
for n,(codec,(kind,encoder)) in enumerate(sorted(selected.items()),1):
 helptext=subprocess.check_output(['ffmpeg','-hide_banner','-h',f'encoder={encoder}'],text=True,stderr=subprocess.DEVNULL)
 rates=re.search(r'Supported sample rates: ([0-9 ]+)',helptext);rates=list(map(int,rates[1].split())) if rates else [48000]
 rate=48000 if 48000 in rates else rates[0];channels=1 if codec in ['g723_1','adpcm_g722','nellymoser','roq_dpcm'] else 2
 if codec in ['adpcm_g726','adpcm_g726le','adpcm_ima_amv','comfortnoise','ra_144']:channels=1
 if codec=='g723_1':rate=8000
 if codec=='roq_dpcm':rate=22050
 opts=[];size='176x144';fps='25'
 if codec=='avui':size='720x486'
 if codec=='xface':size='48x48'
 if codec=='h264':opts=['-preset','ultrafast','-pix_fmt','yuv420p']
 if codec=='hevc':opts=['-preset','ultrafast','-x265-params','pools=1:frame-threads=1:log-level=error','-pix_fmt','yuv420p']
 if codec=='av1':opts=['-preset','12','-svtav1-params','lp=1','-pix_fmt','yuv420p']
 if codec in ['vp8','vp9']:opts=['-deadline','realtime','-cpu-used','8']
 if codec=='dnxhd':size='1280x720';opts=['-profile:v','dnxhr_lb','-pix_fmt','yuv422p']
 if codec=='dvvideo':size='720x480';fps='30000/1001';opts=['-pix_fmt','yuv411p']
 if codec=='prores':opts=['-profile:v','0','-pix_fmt','yuv422p10le']
 if codec=='roq':size='128x128';fps='30'
 if codec=='speedhq':size='320x240'
 ext=containers.get(codec,'wav' if kind=='A' and (codec.startswith('pcm_') or codec.startswith('adpcm_')) else 'nut')
 name=f'{codec}.{ext}';path=out/name
 base=['ffmpeg','-hide_banner','-loglevel','error','-nostdin','-y','-filter_threads','1']
 if kind=='V':base+=['-f','lavfi','-i',f'testsrc2=size={size}:rate={fps}','-an','-c:v',encoder,'-threads:v','1',*opts]
 else:base+=['-f','lavfi','-i',f'sine=frequency=440:sample_rate={rate}','-vn','-c:a',encoder,'-ac',str(channels)]
 cmd=base+['-strict','-2','-t','2',str(path)]
 try:
  p=subprocess.run(cmd,capture_output=True,text=True,timeout=45)
  if p.returncode:
   attempts=[{'file':name,'error':p.stderr[-1200:]}]
   for fallback in ['nut','avi','mov']:
    if fallback==ext:continue
    trial=out/f'{codec}.{fallback}';trialcmd=cmd[:-1]+[str(trial)]
    attempt=subprocess.run(trialcmd,capture_output=True,text=True,timeout=45)
    if attempt.returncode==0:path=trial;name=trial.name;cmd=trialcmd;p=attempt;break
    attempts.append({'file':trial.name,'error':attempt.stderr[-1200:]})
   if p.returncode:raise RuntimeError(json.dumps(attempts))
  probe=json.loads(subprocess.check_output(['ffprobe','-v','error','-show_streams','-show_format','-of','json',str(path)],text=True,stderr=subprocess.DEVNULL))
  actual=probe['streams'][0].get('codec_name')
  aliases={'h263p':'h263','v308':'rawvideo','v408':'rawvideo','v410':'rawvideo'}
  if actual!=aliases.get(codec,codec):raise RuntimeError(f'Container identifies {actual}, not the requested {codec}; sample is not usable as proof')
  if path.stat().st_size>32*1024*1024:raise RuntimeError('Fixture exceeds 32 MiB local limit')
  manifest['cases'].append({'file':name,'codec':codec,'kind':kind,'encoder':encoder,'bytes':path.stat().st_size,'sha256':hashlib.sha256(path.read_bytes()).hexdigest(),'command':cmd,'probe':probe})
  print(f'{n}/{len(selected)} generated {name}',flush=True)
 except Exception as e:
  manifest['generationFailures'].append({'codec':codec,'encoder':encoder,'command':cmd,'error':str(e)})
  print(f'{n}/{len(selected)} generation gap {name}',flush=True)
 (out/'manifest.json').write_text(json.dumps(manifest,indent=2)+'\n')
print(f"Generated {len(manifest['cases'])}; generation gaps {len(manifest['generationFailures'])}; no encoder match {len(manifest['noMatchingEncoder'])}")
