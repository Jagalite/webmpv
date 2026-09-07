#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/../.."
ROOT=$PWD
SDK=${WEBMPV_SDK:-$ROOT/build/emsdk-4.0.14}
mkdir -p build/m3/ffmpeg web/m3/engine
# Private configuration avoids historical machine-local SDK paths.
python3 - "$SDK" "$ROOT/build/m3/emscripten-config" <<'PY'
import pathlib,sys
s=pathlib.Path(sys.argv[1]).resolve()
pathlib.Path(sys.argv[2]).write_text(f'LLVM_ROOT = {str(s/"upstream/bin")!r}\nBINARYEN_ROOT = {str(s/"upstream")!r}\nNODE_JS = {str(s/"node/22.16.0_64bit/bin/node")!r}\n')
PY
export EM_CONFIG="$ROOT/build/m3/emscripten-config"
export EM_CACHE="$ROOT/build/m3/cache"
export PATH="$SDK/upstream/emscripten:$PATH"
python3 - <<'PY'
import hashlib,json,pathlib,tarfile
entry=next(x for x in json.loads(pathlib.Path('sources.lock.json').read_text())['sources'] if x['name']=='ffmpeg')
archive=pathlib.Path('build/downloads/ffmpeg.tar.gz')
assert hashlib.sha256(archive.read_bytes()).hexdigest()==entry['sha256'], 'FFmpeg archive mismatch'
out=pathlib.Path('build/m3/source')
if not out.exists():
 out.mkdir()
 with tarfile.open(archive) as t:
  top=t.getmembers()[0].name.split('/')[0]
  t.extractall(out,filter='data')
 (out/top).rename(out/'ffmpeg')
PY
python3 - <<'PY'
from pathlib import Path
import subprocess
source=Path('build/m3/source/ffmpeg')
for patch in sorted(Path('patches/ffmpeg').glob('*.patch')):
 args=['patch','-p1','-i',str(patch.resolve())]
 if subprocess.run(args+['--dry-run','--forward'],cwd=source,capture_output=True).returncode == 0:
  subprocess.run(args+['--forward'],cwd=source,check=True)
 elif subprocess.run(args+['--dry-run','--reverse'],cwd=source,capture_output=True).returncode != 0:
  raise SystemExit(f'Patch does not match: {patch}')
PY
if [ ! -f build/m3/ffmpeg/Makefile ]; then
 (cd build/m3/ffmpeg
 emconfigure ../source/ffmpeg/configure --target-os=none --arch=wasm32 \
  --enable-cross-compile --cc=emcc --cxx=em++ --ar=emar --ranlib=emranlib --nm=emnm \
  --enable-static --disable-shared --disable-programs --disable-doc --disable-debug \
  --disable-autodetect --disable-network --disable-asm --disable-everything \
  --enable-pthreads --enable-decoder=h264 --disable-avdevice --disable-avformat \
  --disable-avfilter --disable-swresample --extra-cflags='-O2 -pthread -msimd128' \
  --extra-ldflags=-pthread)
fi
(cd build/m3/ffmpeg; emmake make -j "${WEBMPV_JOBS:-4}")
emcc -O2 -pthread -msimd128 -Ibuild/m3/source/ffmpeg -Ibuild/m3/ffmpeg \
 experiments/m3/decoder.c build/m3/ffmpeg/libavcodec/libavcodec.a \
 build/m3/ffmpeg/libswscale/libswscale.a build/m3/ffmpeg/libavutil/libavutil.a \
 -sMODULARIZE=1 -sEXPORT_ES6=1 -sENVIRONMENT=worker -sPTHREAD_POOL_SIZE=2 \
 -sINITIAL_MEMORY=134217728 -sMAXIMUM_MEMORY=536870912 -sALLOW_MEMORY_GROWTH=1 \
 -sSTACK_SIZE=2097152 -sDEFAULT_PTHREAD_STACK_SIZE=2097152 \
 -sEXPORTED_FUNCTIONS='["_bench_init","_bench_close","_bench_send","_bench_receive","_bench_pts","_bench_rgba","_bench_i420","_bench_nv12","_bench_reset","_malloc","_free"]' \
 -sEXPORTED_RUNTIME_METHODS='["HEAPU8"]' -o web/m3/engine/decoder.mjs
python3 - <<'PY'
import hashlib,json,pathlib,subprocess
files=['sources.lock.json','experiments/m3/build.sh','experiments/m3/decoder.c',
 'patches/ffmpeg/0001-h264-sei-film-grain-build-dependency.patch',
 'build/m3/ffmpeg/config.h','build/m3/ffmpeg/config_components.h',
 'web/m3/engine/decoder.mjs','web/m3/engine/decoder.wasm']
record={'compiler':subprocess.check_output(['emcc','--version'],text=True),
 'kind':'local standalone FFmpeg benchmark; not a reproduced full mpv build',
 'hashes':{f:hashlib.sha256(pathlib.Path(f).read_bytes()).hexdigest() for f in files}}
pathlib.Path('results/m3/build.json').write_text(json.dumps(record,indent=2)+'\n')
PY
