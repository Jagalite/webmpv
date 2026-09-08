#!/usr/bin/env bash
set -euo pipefail
ROOT=$(cd "$(dirname "$0")/../.." && pwd)
cd "$ROOT"
SDK="$ROOT/build/emsdk-4.0.14"
source "$SDK/emsdk_env.sh" >/dev/null
export PATH="$SDK/upstream/emscripten:$SDK:$PATH"
export EM_CONFIG="$ROOT/build/gap.emscripten"
export PKG_CONFIG_LIBDIR="$ROOT/build/prefix/lib/pkgconfig"
export PKG_CONFIG_PATH="$PKG_CONFIG_LIBDIR"
export EM_PKG_CONFIG_PATH="$PKG_CONFIG_LIBDIR"
mkdir -p build/obj-filter-ffmpeg web/engine-filter-copyback
if ! rg -q '^#define CONFIG_NEGATE_FILTER 1$' build/obj-filter-ffmpeg/config_components.h 2>/dev/null; then
 (cd build/obj-filter-ffmpeg
 emconfigure ../sources/ffmpeg/configure --prefix="$ROOT/build/prefix" --target-os=none --arch=wasm32 \
 --enable-cross-compile --cc=emcc --cxx=em++ --ar=emar --ranlib=emranlib --nm=emnm \
 --enable-static --disable-shared --disable-programs --disable-doc --disable-debug \
 --disable-autodetect --disable-network --disable-asm --disable-everything \
 --enable-pthreads --enable-decoder=h264,aac,ass,ssa,pcm_s16le,webvtt,mov_text \
 --enable-libxml2 --enable-demuxer=mov,matroska,ass,wav,hls,dash,mpegts,webvtt --enable-parser=h264,aac \
 --enable-protocol=file --enable-filter=aresample,aformat,format,scale,anull,null,hflip,vflip,crop,lut,negate \
 --enable-zlib --extra-cflags="-O2 -pthread -msimd128 -I$ROOT/build/prefix/include" --extra-ldflags="-pthread -L$ROOT/build/prefix/lib")
fi
(cd build/obj-filter-ffmpeg; emmake make -j 4 libavfilter/libavfilter.a)
# Link the new filter library only into this isolated full-frame compatibility engine.
read -r -a LIBS <<< "$(pkg-config --cflags --libs --static mpv)"
for i in "${!LIBS[@]}"; do
 if [ "${LIBS[$i]}" = -lavfilter ]; then LIBS[$i]="$ROOT/build/obj-filter-ffmpeg/libavfilter/libavfilter.a"; fi
done
emcc -O2 -pthread -msimd128 -Inative -Ibuild/sources/mpv -Ibuild/obj-mpv \
 native/player.c native/events.c native/stream_bridge.c native/vd_browser.c \
 "${LIBS[@]}" -lstdc++ \
 -sMODULARIZE=1 -sEXPORT_ES6=1 -sEXPORT_NAME=createEngine \
 -sENVIRONMENT=worker -sPTHREAD_POOL_SIZE=8 -sPTHREAD_POOL_SIZE_STRICT=2 \
 -sINITIAL_MEMORY=134217728 -sMAXIMUM_MEMORY=536870912 -sALLOW_MEMORY_GROWTH=1 \
 -sSTACK_SIZE=2097152 -sDEFAULT_PTHREAD_STACK_SIZE=2097152 \
 -sWASM_BIGINT=1 -sWASMFS=1 -sFORCE_FILESYSTEM=1 -sEXIT_RUNTIME=0 \
 -sEXPORTED_FUNCTIONS='["_web_create","_web_command_args","_web_event","_web_render","_web_presented","_web_destroy","_web_audio_ptr","_malloc","_free"]' \
 -sEXPORTED_RUNTIME_METHODS='["ccall","UTF8ToString","FS","PThread","HEAPU8","HEAPU32","HEAPF32"]' \
 -o web/engine-filter-copyback/player.mjs
