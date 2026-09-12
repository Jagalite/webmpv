#!/usr/bin/env python3
"""Small synthetic media for demo geometry and interaction checks; requires FFmpeg."""
import json
import subprocess
from pathlib import Path

root = Path('build/fixtures/player-ui')
root.mkdir(parents=True, exist_ok=True)
for name, size, par in [('landscape', '320x240', '1'), ('portrait', '180x320', '1'), ('anamorphic', '720x576', '16/15')]:
    subprocess.run(['ffmpeg', '-hide_banner', '-loglevel', 'error', '-y', '-f', 'lavfi', '-i', f'color=c=0xbb7733:s={size}:r=15', '-t', '12', '-vf', f'setsar={par}', '-c:v', 'libx264', '-preset', 'ultrafast', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', str(root / f'{name}.mp4')], check=True)
subprocess.run(['ffmpeg', '-hide_banner', '-loglevel', 'error', '-y', '-display_rotation:v:0', '90', '-i', str(root / 'landscape.mp4'), '-c', 'copy', str(root / 'rotated.mp4')], check=True)
probe = json.loads(subprocess.check_output(['ffprobe', '-v', 'error', '-show_entries', 'stream_side_data=rotation', '-of', 'json', str(root / 'rotated.mp4')]))
assert any(abs(side.get('rotation', 0)) == 90 for stream in probe['streams'] for side in stream.get('side_data_list', [])), 'Fixture must carry rotation metadata'
