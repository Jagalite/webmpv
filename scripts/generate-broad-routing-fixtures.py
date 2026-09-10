"""Derived test media only; does not alter original fixtures."""
import subprocess
from pathlib import Path
out = Path('build/broad-routing/fixtures')
out.mkdir(parents=True, exist_ok=True)
def make(name, args):
    target = out / name
    if not target.exists():
        subprocess.run(['ffmpeg', '-hide_banner', '-loglevel', 'error', '-nostdin', *args, str(target)], check=True)
for codec in ['mp3', 'opus', 'flac', 'ac3', 'eac3']:
    make(f'h264-{codec}.mp4', ['-i', 'build/fixtures/software-full/h264-aac.mp4', '-map', '0:v:0', '-map', '0:a:0', '-c:v', 'copy', '-c:a', {'mp3': 'libmp3lame', 'opus': 'libopus'}.get(codec, codec), '-strict', '-2'])
for src, name in [('hevc-ac3.mkv', 'hevc-aac.mp4'), ('vp9-opus.webm', 'vp9-aac.mp4')]:
    make(name, ['-i', 'build/fixtures/software-full/' + src, '-map', '0:v:0', '-map', '0:a:0', '-c:v', 'copy', '-c:a', 'aac'])
make('h264-4k.mp4', ['-f', 'lavfi', '-i', 'testsrc2=size=3840x2160:rate=12:duration=4', '-c:v', 'libx264', '-preset', 'ultrafast', '-crf', '32', '-g', '12', '-pix_fmt', 'yuv420p'])
make('h264-51.mp4', ['-i', 'build/fixtures/software-full/h264-aac.mp4', '-c:v', 'copy', '-c:a', 'aac', '-ac', '6'])
make('h264-flac16.mp4', ['-i', 'build/fixtures/software-full/h264-aac.mp4', '-c:v', 'copy', '-c:a', 'flac', '-sample_fmt', 's16', '-strict', '-2'])
