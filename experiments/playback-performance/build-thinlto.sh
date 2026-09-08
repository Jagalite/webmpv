#!/usr/bin/env bash
set -euo pipefail
ROOT=$(cd "$(dirname "$0")/../.." && pwd)
cd "$ROOT"
SDK=${WEBMPV_SDK:-$ROOT/build/emsdk-4.0.14}
source "$SDK/emsdk_env.sh" >/dev/null
export PATH="$SDK/upstream/emscripten:$SDK:$PATH"
export EM_CONFIG="${WEBMPV_EM_CONFIG:-$ROOT/build/gap.emscripten}"
export PKG_CONFIG_LIBDIR="$ROOT/build/prefix/lib/pkgconfig"
export PKG_CONFIG_PATH="$PKG_CONFIG_LIBDIR"
export EM_PKG_CONFIG_PATH="$PKG_CONFIG_LIBDIR"
export SOURCE_DATE_EPOCH=1740000000
export GIT_CEILING_DIRECTORIES="$ROOT/build/sources"
OBJ="$ROOT/build/obj-performance-ffmpeg-thinlto"
export EMCC_CORES=2
mkdir -p "$OBJ"
# Isolated ThinLTO experiment: keep the existing default playback component selection.
# mpv is already GPL; enable FFmpeg's built-in GPL filters as well.
# No new external libraries or native OS/network integrations are introduced.
CONFIGURE=("$ROOT/build/sources/ffmpeg/configure"
 --prefix="$ROOT/build/prefix-performance-thinlto" --target-os=none --arch=wasm32
 --enable-cross-compile --cc=emcc --cxx=em++ --ar=emar --ranlib=emranlib --nm=emnm
 --enable-static --disable-shared --disable-programs --disable-doc --disable-debug
 --disable-autodetect --disable-network --disable-asm --disable-hwaccels
 --disable-encoders --disable-muxers --disable-devices --disable-avdevice
 --disable-protocols --enable-protocol=file
 --enable-gpl --enable-pthreads --enable-libxml2 --enable-zlib --enable-libass
 --extra-cflags="-O3 -flto=thin -pthread -msimd128 -I$ROOT/build/prefix/include"
 --extra-ldflags="-pthread -flto=thin -Wl,--thinlto-jobs=1 -L$ROOT/build/prefix/lib")
printf '%s\n' "${CONFIGURE[@]}" > "$OBJ/configure-request.next"
if ! cmp -s "$OBJ/configure-request.next" "$OBJ/configure-request"; then
 (cd "$OBJ"; emconfigure "${CONFIGURE[@]}")
 cp "$OBJ/configure-request.next" "$OBJ/configure-request"
fi
# A cached Makefile may not notice that Git discovery was corrected.
(cd "$OBJ"; sh "$ROOT/build/sources/ffmpeg/ffbuild/version.sh" "$ROOT/build/sources/ffmpeg" libavutil/ffversion.h)
(cd "$OBJ"; emmake make -j "${WEBMPV_JOBS:-2}")
