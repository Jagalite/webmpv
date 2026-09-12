#!/usr/bin/env python3
"""Create an isolated development snapshot; this is NOT a tagged release."""
import argparse, hashlib, json, pathlib, shutil, subprocess
root=pathlib.Path(__file__).resolve().parent.parent
p=argparse.ArgumentParser();p.add_argument('destination',type=pathlib.Path);args=p.parse_args()
dest=args.destination.resolve();dest.mkdir(parents=True,exist_ok=False)
paths=subprocess.check_output(['git','ls-files','-z','--cached','--others','--exclude-standard'],cwd=root).decode().split('\0')
hashes={}
for name in sorted(set(paths)):
 if not name or name.startswith('results/') or not (root/name).is_file():continue
 target=dest/name;target.parent.mkdir(parents=True,exist_ok=True);shutil.copy2(root/name,target)
 hashes[name]=hashlib.sha256(target.read_bytes()).hexdigest()
(dest/'build').mkdir();(dest/'results').mkdir()
(dest/'build/downloads').symlink_to(root/'build/downloads',target_is_directory=True)
(dest/'build/venv').symlink_to(root/'build/venv',target_is_directory=True)
(dest/'node_modules').symlink_to(root/'node_modules',target_is_directory=True)
(dest/'build/input-snapshot.json').write_text(json.dumps({'status':'untagged-development-build','files':hashes},indent=2)+'\n')
print(dest)
