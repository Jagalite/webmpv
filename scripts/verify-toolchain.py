#!/usr/bin/env python3
"""Fail closed if the container toolchain or any installed Debian package drifts."""
import hashlib,json,pathlib,subprocess,sys
lock=json.loads(pathlib.Path(sys.argv[1]).read_text())
for filename,expected in lock['archives'].items():
    digest=hashlib.sha256()
    with open(filename,'rb') as stream:
        for chunk in iter(lambda:stream.read(1024*1024),b''): digest.update(chunk)
    if digest.hexdigest()!=expected: raise SystemExit(f'Toolchain archive mismatch: {filename}')
packages=dict(line.split('\t') for line in subprocess.check_output(['dpkg-query','-W'],text=True).splitlines())
if packages!=lock['debPackages']: raise SystemExit('Container package versions differ from toolchain.lock.json')
version=pathlib.Path('/emsdk/upstream/emscripten/emscripten-version.txt').read_text().strip().strip('"')
if version!=lock['emscripten']: raise SystemExit('Emscripten version mismatch')
print('Verified pinned SDK archives and all container package versions')
