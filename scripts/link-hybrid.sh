#!/usr/bin/env bash
set -euo pipefail
ROOT=$(cd "$(dirname "$0")/.." && pwd)
cd "$ROOT"
SDK=${WEBMPV_SDK:-$ROOT/build/emsdk-4.0.14}
source "$SDK/emsdk_env.sh" >/dev/null
export EM_CONFIG="${WEBMPV_EM_CONFIG:-$ROOT/build/gap.emscripten}"
export PKG_CONFIG_LIBDIR="$ROOT/build/prefix/lib/pkgconfig"
export PKG_CONFIG_PATH="$PKG_CONFIG_LIBDIR"
OUTPUT="$ROOT/web/engine-hybrid"
SOURCE=native/vd_browser.c
PLAYER_SOURCES=(experiments/retained-subtitles/player.c experiments/retained-subtitles/subtitles.c build/retained-subs/vo_libmpv.o)
mkdir -p "$OUTPUT"
read -r -a LIBS <<< "$(pkg-config --cflags --libs --static mpv)"
for i in "${!LIBS[@]}"; do
 case "${LIBS[$i]}" in
 -lavcodec|-lavformat|-lavfilter|-lavutil|-lswresample|-lswscale|-lpostproc)
 name=${LIBS[$i]#-l};LIBS[$i]="$ROOT/build/obj-software-full-ffmpeg/lib$name/lib$name.a";;
 esac
done
source scripts/decoder-simd.sh
"$SDK/upstream/emscripten/emcc" -O2 --profiling-funcs -pthread -msimd128 -Inative -Ibuild/sources/mpv -Ibuild/obj-mpv \
 "${PLAYER_SOURCES[@]}" \
 native/events.c native/stream_bridge.c "$SOURCE" "${DECODER_SIMD_SOURCES[@]}" "${LIBS[@]}" "$ROOT/build/obj-software-full-ffmpeg/libpostproc/libpostproc.a" "$ROOT/build/prefix-playback/lib/libdav1d.a" "$ROOT/build/prefix-playback/lib/libzimg.a" -lstdc++ -fexceptions \
 -sMODULARIZE=1 -sEXPORT_ES6=1 -sEXPORT_NAME=createEngine -sENVIRONMENT=worker \
 -sPTHREAD_POOL_SIZE=8 -sPTHREAD_POOL_SIZE_STRICT=2 \
 -sINITIAL_MEMORY=134217728 -sMAXIMUM_MEMORY=1073741824 -sALLOW_MEMORY_GROWTH=1 \
 -sSTACK_SIZE=2097152 -sDEFAULT_PTHREAD_STACK_SIZE=2097152 \
 -sWASM_BIGINT=1 -sWASMFS=1 -sFORCE_FILESYSTEM=1 -sEXIT_RUNTIME=0 \
 -sEXPORTED_FUNCTIONS='["_web_create","_web_command_args","_web_event","_web_render","_web_presented","_web_destroy","_web_audio_ptr","_malloc","_free"]' \
 -sEXPORTED_RUNTIME_METHODS='["ccall","UTF8ToString","FS","PThread","HEAPU8","HEAPU32","HEAPF32"]' \
 -o "$OUTPUT/player.mjs"
