#!/usr/bin/env python3
"""Fetch only locked upstream archives, verifying their SHA-256 before extraction."""
import hashlib
import json
import pathlib
import subprocess
import tarfile

ROOT = pathlib.Path(__file__).resolve().parent.parent
for item in json.loads((ROOT / 'sources.lock.json').read_text())['sources']:
    archive = ROOT / 'build' / 'downloads' / (item['name'] + '.tar.gz')
    archive.parent.mkdir(parents=True, exist_ok=True)
    if not archive.exists():
        subprocess.run(['curl', '-fL', '--retry', '3', item['url'], '-o', str(archive)], check=True)
    digest = hashlib.sha256(archive.read_bytes()).hexdigest()
    if digest != item['sha256']:
        raise SystemExit(f"Hash mismatch: {item['name']}")
    target = ROOT / 'build' / 'sources' / item['name']
    if not target.exists():
        target.mkdir(parents=True)
        # Only SHA-256 verified archives listed in our source lock reach tar.
        subprocess.run(['tar','-xf',str(archive),'--strip-components=1','-C',str(target)],check=True)
    print(item['name'], digest)
