#!/usr/bin/env python3
"""Apply the original, reviewable browser platform patch set, idempotently."""
from pathlib import Path
import shutil
import subprocess
root = Path(__file__).resolve().parent.parent
patches = [(root/'build/sources/mpv',p) for p in sorted((root/'patches').glob('*.patch'))]
patches += [(root/'build/sources/ffmpeg',p) for p in sorted((root/'patches/ffmpeg').glob('*.patch'))]
for source,patch in patches:
    check = subprocess.run(['patch','-p1','--dry-run','--forward','-i',str(patch)],cwd=source,capture_output=True)
    if check.returncode == 0:
        subprocess.run(['patch','-p1','--forward','-i',str(patch)],cwd=source,check=True)
    else:
        reverse = subprocess.run(['patch','-p1','--dry-run','--reverse','-i',str(patch)],cwd=source,capture_output=True)
        if reverse.returncode != 0:
            raise SystemExit(f'Patch does not match pinned source: {patch.name}')
for name in ['ao_browser.c','audio_bridge.h']:
    shutil.copyfile(root/'native'/name,root/'build/sources/mpv/audio/out'/name)
