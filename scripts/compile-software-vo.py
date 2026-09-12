#!/usr/bin/env python3
"""Build a libmpv VO override for the RGB Software engine.

The upstream libmpv VO advertises ROTATE90 for its GPU renderer. The RGB
render backend does not rotate pixels; mpv must insert its autorotate filter.
Hybrid uses its separate retained presenter and keeps native rotation support.
"""
import json
import os
import shlex
import subprocess
from pathlib import Path

root = Path.cwd()
outdir = root / 'build/software-vo'
outdir.mkdir(parents=True, exist_ok=True)
source = (root / 'build/sources/mpv/video/out/vo_libmpv.c').read_text()
assert source.count('.caps = VO_CAP_ROTATE90,') == 1, 'Review changed upstream VO capability declaration'
source = source.replace('.caps = VO_CAP_ROTATE90,', '.caps = 0, // RGB output requires mpv autorotation before rendering.')
(outdir / 'vo_libmpv.c').write_text(source)
entry = next(e for e in json.loads((root / 'build/obj-mpv/compile_commands.json').read_text()) if e['file'].endswith('/vo_libmpv.c'))
args = shlex.split(entry['command'])
command = [str(Path(os.environ.get('WEBMPV_SDK', root / 'build/emsdk-4.0.14')) / 'upstream/emscripten/emcc')]
i = 1
while i < len(args):
    arg = args[i]
    if arg in ('-MQ', '-MF'):
        i += 2
        continue
    if arg == '-MD':
        i += 1
        continue
    if arg in ('-o', '-c'):
        command += [arg, str(outdir / ('vo_libmpv.o' if arg == '-o' else 'vo_libmpv.c'))]
        i += 2
        continue
    command.append(arg)
    i += 1
command.insert(1, '-I' + str(root / 'build/sources/mpv/video/out'))
(outdir / 'compile-command.json').write_text(json.dumps(command, indent=2) + '\n')
subprocess.run(command, cwd=entry['directory'], env=os.environ.copy(), check=True)
