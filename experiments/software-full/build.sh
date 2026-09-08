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
OBJ="$ROOT/build/obj-software-full-ffmpeg"
mkdir -p "$OBJ" web/engine-software-full results/software-full
# Use upstream default component selection, with no hand-maintained codec list.
# mpv is already GPL; enable FFmpeg's built-in GPL filters as well.
# No new external libraries or native OS/network integrations are introduced.
CONFIGURE=("$ROOT/build/sources/ffmpeg/configure"
 --prefix="$ROOT/build/prefix-software-full" --target-os=none --arch=wasm32
 --enable-cross-compile --cc=emcc --cxx=em++ --ar=emar --ranlib=emranlib --nm=emnm
 --enable-static --disable-shared --disable-programs --disable-doc --disable-debug
 --disable-autodetect --disable-network --disable-asm --disable-hwaccels
 --disable-encoders --disable-muxers --disable-devices --disable-avdevice
 --disable-protocols --enable-protocol=file
 --enable-gpl --enable-pthreads --enable-libxml2 --enable-zlib --enable-libass
 --extra-cflags="-O2 -pthread -msimd128 -I$ROOT/build/prefix/include"
 --extra-ldflags="-pthread -L$ROOT/build/prefix/lib")
printf '%s\n' "${CONFIGURE[@]}" > "$OBJ/configure-request.next"
if ! cmp -s "$OBJ/configure-request.next" "$OBJ/configure-request"; then
 (cd "$OBJ"; emconfigure "${CONFIGURE[@]}")
 cp "$OBJ/configure-request.next" "$OBJ/configure-request"
fi
# A cached Makefile may not notice that Git discovery was corrected.
(cd "$OBJ"; sh "$ROOT/build/sources/ffmpeg/ffbuild/version.sh" "$ROOT/build/sources/ffmpeg" libavutil/ffversion.h)
(cd "$OBJ"; emmake make -j "${WEBMPV_JOBS:-4}")
# Do not install over the accepted prefix. Replace every FFmpeg archive at link time.
read -r -a LIBS <<< "$(pkg-config --cflags --libs --static mpv)"
for i in "${!LIBS[@]}"; do
 case "${LIBS[$i]}" in
 -lavcodec|-lavformat|-lavfilter|-lavutil|-lswresample|-lswscale|-lpostproc)
  name=${LIBS[$i]#-l}; LIBS[$i]="$OBJ/lib$name/lib$name.a";;
 esac
done
source scripts/decoder-simd.sh
emcc -O2 -pthread -msimd128 -Inative native/player.c native/events.c native/stream_bridge.c "${DECODER_SIMD_SOURCES[@]}" \
 "${LIBS[@]}" "$OBJ/libpostproc/libpostproc.a" -lstdc++ \
 -sMODULARIZE=1 -sEXPORT_ES6=1 -sEXPORT_NAME=createEngine \
 -sENVIRONMENT=worker -sPTHREAD_POOL_SIZE=8 -sPTHREAD_POOL_SIZE_STRICT=2 \
 -sINITIAL_MEMORY=134217728 -sMAXIMUM_MEMORY=536870912 -sALLOW_MEMORY_GROWTH=1 \
 -sSTACK_SIZE=2097152 -sDEFAULT_PTHREAD_STACK_SIZE=2097152 \
 -sWASM_BIGINT=1 -sWASMFS=1 -sFORCE_FILESYSTEM=1 -sEXIT_RUNTIME=0 \
 -sEXPORTED_FUNCTIONS='["_web_create","_web_command_args","_web_event","_web_render","_web_presented","_web_destroy","_web_audio_ptr","_malloc","_free"]' \
 -sEXPORTED_RUNTIME_METHODS='["ccall","UTF8ToString","FS","PThread","HEAPU8","HEAPU32","HEAPF32"]' \
 -o web/engine-software-full/player.mjs
python3 experiments/software-full/prepare.py
python3 experiments/software-full/inventory.py
