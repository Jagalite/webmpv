#!/usr/bin/env bash
set -euo pipefail
ROOT=$(cd "$(dirname "$0")/.." && pwd)
cd "$ROOT"
SDK=${WEBMPV_SDK:-$ROOT/build/emsdk-4.0.14}
source "$SDK/emsdk_env.sh" >/dev/null
export PATH="$ROOT/build/venv/bin:$SDK/upstream/emscripten:$SDK:$PATH"
export EM_CONFIG="${WEBMPV_EM_CONFIG:-$SDK/.emscripten}"
export EM_CACHE="${WEBMPV_CACHE:-$SDK/upstream/emscripten/cache}"
export SOURCE_DATE_EPOCH=1740000000
export EMSDK_QUIET=1
export GIT_CEILING_DIRECTORIES="$ROOT/build/sources"
PREFIX="$ROOT/build/prefix"
export PKG_CONFIG_LIBDIR="$PREFIX/lib/pkgconfig"
export PKG_CONFIG_PATH="$PKG_CONFIG_LIBDIR"
export EM_PKG_CONFIG_PATH="$PKG_CONFIG_LIBDIR"
export CFLAGS="-O2 -pthread -msimd128"
export CXXFLAGS="$CFLAGS"
export LDFLAGS="-pthread"
mkdir -p "$PREFIX" build/logs web/engine
python3 scripts/fetch-sources.py
python3 scripts/apply-patches.py
python3 - <<'PY'
from pathlib import Path
import shutil
target=Path('build/sources/libplacebo/3rdparty/Vulkan-Headers')
if not (target/'include').exists():
    shutil.copytree('build/sources/vulkan-headers',target,dirs_exist_ok=True)
PY
python3 - "$ROOT" <<'PY'
import pathlib,shutil,sys
r=pathlib.Path(sys.argv[1])
text='[binaries]\n'
for key,exe in [('c','emcc'),('cpp','em++'),('ar','emar'),('strip','emstrip'),('pkg-config','pkg-config')]:
 resolved=shutil.which(exe)
 if not resolved: raise SystemExit(f'Required build tool is unavailable: {exe}')
 text+=f'{key} = {resolved!r}\n'
text+='''[host_machine]
system = 'emscripten'
cpu_family = 'wasm32'
cpu = 'wasm32'
endian = 'little'
[properties]
needs_exe_wrapper = true
[built-in options]
c_args = ['-O2', '-pthread', '-msimd128']
cpp_args = ['-O2', '-pthread', '-msimd128']
c_link_args = ['-pthread']
cpp_link_args = ['-pthread']
'''
(r/'build/cross.ini').write_text(text)
PY
meson_lib() {
  local name=$1
  shift
  local mode=
  if [ -f "build/obj-$name/build.ninja" ]; then mode=--reconfigure; fi
    meson setup $mode "build/obj-$name" "build/sources/$name" --cross-file build/cross.ini \
      --prefix "$PREFIX" --libdir lib --default-library static --buildtype release \
      --wrap-mode nofallback -Dauto_features=disabled "$@"
  ninja -C "build/obj-$name" -j "${WEBMPV_JOBS:-6}"
  meson install -C "build/obj-$name"
}
if [ ! -f "$PREFIX/lib/libz.a" ]; then
  mkdir -p build/obj-zlib-static
  (cd build/obj-zlib-static
    CHOST=wasm32-unknown-emscripten emconfigure ../sources/zlib/configure --static --prefix="$PREFIX"
    emmake make -j 6 libz.a
    emmake make install)
fi
if [ ! -f "$PREFIX/lib/libfreetype.a" ]; then
  emcmake cmake -S build/sources/freetype -B build/obj-freetype -G Ninja -DCMAKE_INSTALL_PREFIX="$PREFIX" \
    -DCMAKE_BUILD_TYPE=Release -DBUILD_SHARED_LIBS=OFF -DFT_DISABLE_ZLIB=TRUE -DFT_DISABLE_BZIP2=TRUE \
    -DFT_DISABLE_PNG=TRUE -DFT_DISABLE_HARFBUZZ=TRUE -DFT_DISABLE_BROTLI=TRUE
  cmake --build build/obj-freetype -j 6
  cmake --install build/obj-freetype
fi
meson_lib fribidi -Ddocs=false -Dbin=false -Dtests=false
meson_lib harfbuzz -Dfreetype=enabled -Dtests=disabled -Dutilities=disabled
meson_lib libass -Drequire-system-font-provider=false
meson_lib libplacebo -Ddemos=false -Dtests=false
if [ ! -f "$PREFIX/lib/libxml2.a" ]; then
  emcmake cmake -S build/sources/libxml2 -B build/obj-libxml2 -G Ninja -DCMAKE_INSTALL_PREFIX="$PREFIX" \
    -DCMAKE_BUILD_TYPE=Release -DBUILD_SHARED_LIBS=OFF -DLIBXML2_WITH_PROGRAMS=OFF \
    -DLIBXML2_WITH_TESTS=OFF -DLIBXML2_WITH_PYTHON=OFF -DLIBXML2_WITH_ICONV=OFF \
    -DLIBXML2_WITH_ZLIB=OFF -DLIBXML2_WITH_LZMA=OFF -DLIBXML2_WITH_HTTP=OFF \
    -DLIBXML2_WITH_FTP=OFF -DLIBXML2_WITH_MODULES=OFF
  cmake --build build/obj-libxml2 -j "${WEBMPV_JOBS:-6}"
  cmake --install build/obj-libxml2
fi
if [ ! -f "$PREFIX/lib/libavcodec.a" ] || ! grep -q '#define CONFIG_DASH_DEMUXER 1' build/obj-ffmpeg/config_components.h; then
  mkdir -p build/obj-ffmpeg
  (cd build/obj-ffmpeg
    emconfigure ../sources/ffmpeg/configure --prefix="$PREFIX" --target-os=none --arch=wasm32 \
      --enable-cross-compile --cc=emcc --cxx=em++ --ar=emar --ranlib=emranlib --nm=emnm \
      --enable-static --disable-shared --disable-programs --disable-doc --disable-debug \
      --disable-autodetect --disable-network --disable-asm --disable-everything \
      --enable-pthreads --enable-decoder=h264,aac,ass,ssa,pcm_s16le,webvtt,mov_text \
      --enable-libxml2 --enable-demuxer=mov,matroska,ass,wav,hls,dash,mpegts,webvtt --enable-parser=h264,aac \
      --enable-protocol=file --enable-filter=aresample,aformat,format,scale,anull,null \
      --enable-zlib --extra-cflags="$CFLAGS -I$PREFIX/include" --extra-ldflags="-pthread -L$PREFIX/lib"
    )
fi
(cd build/obj-ffmpeg
  emmake make -j "${WEBMPV_JOBS:-6}"
  emmake make install)
meson_lib mpv -Dlibmpv=true -Dcplayer=false -Dgl=disabled -Dlua=disabled -Dbuild-date=false -Dzlib=enabled
bash scripts/link.sh
