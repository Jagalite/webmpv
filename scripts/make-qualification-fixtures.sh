#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
mkdir -p build/fixtures
if [ ! -f build/fixtures/video.mp4 ]; then
ffmpeg -hide_banner -y -f lavfi -i 'testsrc2=size=1920x1080:rate=30:duration=32' \
 -vf "drawbox=x=0:y=0:w=128:h=128:color=white:t=fill:enable='lt(mod(t,1),0.0666)'" \
 -c:v libx264 -preset veryfast -threads 3 -pix_fmt yuv420p -b:v 5M -minrate 5M -maxrate 5M -bufsize 10M \
 -g 60 -keyint_min 60 -sc_threshold 0 -bf 2 -x264-params 'nal-hrd=cbr:force-cfr=1' -an build/fixtures/video.mp4
fi
if [ ! -f build/fixtures/tail.mp4 ]; then
ffmpeg -hide_banner -y -stream_loop -1 -i build/fixtures/video.mp4 \
 -f lavfi -i "aevalsrc=if(lt(mod(t\,1)\,0.04)\,0.7*sin(2*PI*880*t)\,0):s=48000:d=1800" \
 -t 1800 -map 0:v -map 1:a -c:v copy -c:a aac -b:a 128k -ac 2 -threads 2 build/fixtures/tail.mp4
fi
if [ ! -f build/fixtures/front.mp4 ]; then
ffmpeg -hide_banner -y -i build/fixtures/tail.mp4 -map 0 -c copy -movflags +faststart build/fixtures/front.mp4
fi
if [ ! -f build/fixtures/tracks.mkv ]; then
ffmpeg -hide_banner -y -i build/fixtures/video.mp4 \
 -f lavfi -i 'sine=frequency=440:sample_rate=48000:duration=12' \
 -f lavfi -i 'sine=frequency=880:sample_rate=48000:duration=12' \
 -i fixtures/m0.ass -i fixtures/qualification.ass -t 12 \
 -map 0:v -map 1:a -map 2:a -map 3:s -map 4:s -c:v copy -c:a aac -ac 2 -c:s ass \
 -metadata:s:a:0 language=eng -metadata:s:a:1 language=jpn -metadata:s:s:0 language=eng -metadata:s:s:1 language=ara \
 -disposition:s:0 default -attach fixtures/DejaVuSans.ttf -metadata:s:t mimetype=application/x-truetype-font build/fixtures/tracks.mkv
fi
if [ ! -f build/fixtures/vfr.mkv ]; then
ffmpeg -hide_banner -y -i fixtures/m0.mkv -map 0:v -map 0:a -map 0:s \
 -vf "select='if(lt(t,6),not(mod(n,2)),1)'" -fps_mode vfr -c:v libx264 -preset veryfast -threads 3 -bf 2 -g 60 -c:a copy -c:s copy build/fixtures/vfr.mkv
fi
python3 - <<'PY'
import pathlib,json,hashlib,subprocess
items=[]
for file in sorted(pathlib.Path('build/fixtures').glob('*')):
 if file.suffix not in ['.mkv','.mp4']:continue
 h=hashlib.sha256()
 with file.open('rb') as f:
  for block in iter(lambda:f.read(1024*1024),b''):h.update(block)
 probe=json.loads(subprocess.check_output(['ffprobe','-v','error','-show_format','-show_streams','-of','json',str(file)]))
 items.append({'path':str(file),'bytes':file.stat().st_size,'sha256':h.hexdigest(),'probe':probe})
pathlib.Path('results/qualification-fixtures.json').write_text(json.dumps(items,indent=2)+'\n')
PY
