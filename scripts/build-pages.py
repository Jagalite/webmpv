#!/usr/bin/env python3
"""Assemble the Pages demo and its source distribution from local built engines."""
import argparse, gzip, hashlib, html, io, json, shutil, subprocess, tarfile
from pathlib import Path
root=Path(__file__).resolve().parent.parent
parser=argparse.ArgumentParser();parser.add_argument('--output',type=Path,default=root/'build/pages-site');parser.add_argument('--source-commit');parser.add_argument('--emscripten-archive',type=Path);args=parser.parse_args()
out=args.output.resolve()
if out.exists():raise SystemExit('Use a fresh output directory: '+str(out))
out.mkdir(parents=True)
packageout=out.parent/(out.name+'-package')
subprocess.run(['python3',str(root/'scripts/package-beta.py'),'--output',str(packageout)],check=True,cwd=root)
archive=next(packageout.glob('*.tgz'))
with tarfile.open(archive) as tar:
 for entry in tar.getmembers():
  if not entry.isfile():continue
  relative=Path(entry.name).relative_to('package')
  if '..' in relative.parts:raise SystemExit('Unsafe archive path')
  target=out/relative;target.parent.mkdir(parents=True,exist_ok=True);target.write_bytes(tar.extractfile(entry).read())
for name in ['player.css','player-demo.js','player-geometry.js']:
 shutil.copyfile(root/'web'/name,out/'web'/name)
shutil.copyfile(root/'fixtures/example.mp4',out/'fixtures/example.mp4')
page=(root/'web/player.html').read_text().replace('href="/"','href="./"').replace('href="/web/','href="./web/').replace('src="/web/','src="./web/')
page=page.replace('<main>','<main inert>')
page=page.replace('<script type="module" src="./web/player-demo.js"></script>','<script type="module" src="./pages-boot.js"></script>')
page=page.replace('<body>','''<body><div id="pages-startup" role="status" style="position:fixed;inset:0;z-index:100;background:#101114;display:grid;place-content:center;text-align:center;padding:24px"><strong>Preparing your player…</strong><p style="color:#aaa">First visit? Playback setup takes a moment.</p><a href="./" target="_blank" rel="noopener" hidden>Open in a browser tab</a></div><noscript><style>#pages-startup{display:none!important}</style>This player needs JavaScript enabled.</noscript>''')
page=page.replace('OPEN SOURCE <span class="footer-dot">·</span> BETA PLAYGROUND','<a href="https://github.com/Jagalite/webmpv/tree/demo-source">Source</a> <span class="footer-dot">·</span> <a href="./source/">Licenses &amp; downloads</a>')
(out/'index.html').write_text(page);(out/'.nojekyll').touch()
for path in (root/'hosting').glob('*.js'):shutil.copyfile(path,out/path.name)
source=out/'source';source.mkdir()
def sha(path):return hashlib.sha256(path.read_bytes()).hexdigest()
def bundle(name,files):
 target=source/name
 with target.open('wb') as dest,gzip.GzipFile(filename='',mode='wb',fileobj=dest,mtime=0,compresslevel=6) as gz,tarfile.open(fileobj=gz,mode='w|') as tar:
  for entry,path in sorted(files.items()):
   data=path.read_bytes();info=tarfile.TarInfo(entry);info.size=len(data);info.mode=0o755 if path.stat().st_mode&0o111 else 0o644;info.mtime=0;tar.addfile(info,io.BytesIO(data))
 print(name,target.stat().st_size,flush=True)
# Preferred project source, including current demo changes, excluding result logs/media histories.
files={}
for name in subprocess.check_output(['git','ls-files','--cached','--others','--exclude-standard','-z'],cwd=root).decode().split('\0'):
 if not name or name.startswith(('results/','build/','.github/')):continue
 path=root/name
 if path.is_file() and not path.is_symlink():files['webmpv/'+name]=path
bundle('webmpv-source.tar.gz',files)
# Exact locked upstream source archives are available from the same download location.
for item in json.loads((root/'sources.lock.json').read_text())['sources']:
 path=root/'build/downloads'/(item['name']+'.tar.gz')
 if sha(path)!=item['sha256']:raise SystemExit('Upstream source archive mismatch: '+item['name'])
 shutil.copyfile(path,source/path.name)
# Emscripten's preferred runtime/library source and build scripts; no caches or host binaries.
sdk=root/'build/emsdk-4.0.14/upstream/emscripten'
files={}
for path in sdk.rglob('*'):
 relative=path.relative_to(sdk)
 if any(part in ['cache','__pycache__','.git','node_modules'] for part in relative.parts):continue
 if path.is_file():files['emscripten/'+str(relative)]=path
if args.emscripten_archive:
 shutil.copyfile(args.emscripten_archive,source/'emscripten-source.tar.gz')
else:bundle('emscripten-source.tar.gz',files)
materials=['build/obj-mpv/config.h','build/obj-mpv/compile_commands.json','build/obj-mpv/meson-info/intro-buildoptions.json','build/obj-ffmpeg/config.h','build/obj-ffmpeg/ffbuild/config.mak','build/obj-software-full-ffmpeg/config.h','build/obj-software-full-ffmpeg/config_components.h','build/obj-software-full-ffmpeg/ffbuild/config.mak','build/obj-software-full-ffmpeg/configure-request','build/native-remux/ffmpeg/config.h','build/native-remux/ffmpeg/config_components.h','build/native-remux/ffmpeg/ffbuild/config.mak','build/retained-subs/compile-command.json','build/software-vo/compile-command.json','build/software-vo/vo_libmpv.c','build/gap.emscripten','results/software-full/build.json']
bundle('build-materials.tar.gz',{name:root/name for name in materials})
readme='''# Demo source and licenses

This is a development demo, not the clean-build beta release candidate.
The original webmpv code and combined engines are GPL-2.0-or-later. Third-party
components retain their licenses and notices; see ../docs/LICENSING.md and ../third_party/.

Download webmpv-source.tar.gz for the preferred project source, scripts and patches.
Extract it, then place the individual upstream archives in webmpv/build/downloads/.
emscripten-source.tar.gz supplies the SDK 4.0.14 runtime/library source and scripts.
build-materials.tar.gz records the local configurations used for these engines,
including Software's RGB rotation override. Absolute paths in these records describe
the build machine; use the project scripts to configure your checkout's paths.

The documented engine build entry point is scripts/build-beta-engines.sh; see
README.md and docs/RELEASE.md for dependencies and build instructions. Rebuilds
have not been independently qualified as bit-for-bit reproducible. That release
gate remains separate from this playable demo. source-manifest.json records the
source download hashes; ../deployment-manifest.json records the deployed assets.
'''
(source/'README.md').write_text(readme)
manifest={p.name:{'bytes':p.stat().st_size,'sha256':sha(p)} for p in sorted(source.glob('*.gz'))}
(source/'source-manifest.json').write_text(json.dumps(manifest,indent=2)+'\n')
links=''.join(f'<li><a href="{html.escape(name)}">{html.escape(name)}</a> — {data["bytes"]/1024/1024:.1f} MiB</li>' for name,data in manifest.items())
(source/'index.html').write_text(f'''<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>webmpv source &amp; licenses</title><style>body{{font:16px/1.7 system-ui;max-width:850px;margin:40px auto;padding:0 24px;background:#101114;color:#ded9e9}}a{{color:#c3a9ff}}pre{{white-space:pre-wrap;font:14px/1.7 system-ui}}</style><a href="../">← Player</a><h1>Source &amp; licenses</h1><p><a href="../LICENSE">GPL license</a> · <a href="../docs/LICENSING.md">Component licensing</a> · <a href="../third_party/notices.json">Third-party notices</a> · <a href="source-manifest.json">Download hashes</a></p><pre>{html.escape(readme)}</pre><ul>{links}</ul>''')
manifest={'status':'development-demo','baseCommit':subprocess.check_output(['git','rev-parse','HEAD'],cwd=root,text=True).strip(),'sourceBranch':'demo-source','sourceCommit':args.source_commit,'independentCleanBuildQualified':False,'files':{str(p.relative_to(out)):{'bytes':p.stat().st_size,'sha256':sha(p)} for p in sorted(out.rglob('*')) if p.is_file()}}
(out/'deployment-manifest.json').write_text(json.dumps(manifest,indent=2)+'\n')
for path in out.rglob('*'):
 if path.is_file() and path.stat().st_size>=100*1024*1024:raise SystemExit('File exceeds GitHub Git limit: '+str(path))
print(out)
