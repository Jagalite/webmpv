#!/usr/bin/env bash
set -euo pipefail
ROOT=$(cd "$(dirname "$0")/.." && pwd)
cd "$ROOT"
SDK=${WEBMPV_SDK:-$ROOT/build/emsdk-4.0.14}
source "$SDK/emsdk_env.sh" >/dev/null
export EM_CONFIG="${WEBMPV_EM_CONFIG:-$ROOT/build/gap.emscripten}"
export PATH="$SDK/upstream/emscripten:$SDK:$PATH"
export SOURCE_DATE_EPOCH=1740000000
export GIT_CEILING_DIRECTORIES="$ROOT/build/sources"
OBJ="${WEBMPV_REMUX_FFMPEG_DIR:-$ROOT/build/native-remux/ffmpeg}"
OUT="$ROOT/web/engine-remux"
mkdir -p "$OBJ" "$OUT"
if [ -z "${WEBMPV_REMUX_FFMPEG_DIR:-}" ] && { [ ! -f "$OBJ/Makefile" ] || ! rg -q -- "--enable-muxer='?mp4,webm'?" "$OBJ/ffbuild/config.mak"; }; then
 (cd "$OBJ"
 emconfigure "$ROOT/build/sources/ffmpeg/configure" \
 --target-os=none --arch=wasm32 --enable-cross-compile \
 --cc=emcc --cxx=em++ --ar=emar --ranlib=emranlib --nm=emnm \
 --enable-static --disable-shared --disable-programs --disable-doc --disable-debug \
 --disable-autodetect --disable-network --disable-asm --disable-everything \
 --disable-avdevice --disable-avfilter --disable-swscale --disable-swresample --disable-postproc \
 --enable-avformat --enable-avcodec --enable-avutil --enable-pthreads \
 --enable-demuxers \
 --enable-muxer=mp4,webm --enable-parsers \
 --enable-bsfs \
 --extra-cflags='-O2 -pthread -msimd128' --extra-ldflags='-pthread')
fi
if [ -z "${WEBMPV_REMUX_FFMPEG_DIR:-}" ]; then (cd "$OBJ"; emmake make -j 4); fi
LINK_OUT=$(mktemp -d "$ROOT/build/native-remux/link.XXXXXX")
emcc -O2 -pthread -msimd128 -I"$OBJ" -Ibuild/sources/ffmpeg \
 native/remux/remux.c \
 "$OBJ/libavformat/libavformat.a" "$OBJ/libavcodec/libavcodec.a" "$OBJ/libavutil/libavutil.a" \
 -sMODULARIZE=1 -sEXPORT_ES6=1 -sEXPORT_NAME=createRemux -sENVIRONMENT=worker \
 -sINITIAL_MEMORY=67108864 -sMAXIMUM_MEMORY=134217728 -sALLOW_MEMORY_GROWTH=1 \
 -sSTACK_SIZE=2097152 -sWASM_BIGINT=1 -sFILESYSTEM=0 \
 -sEXPORTED_FUNCTIONS='["_rm_error","_rm_probe","_rm_open","_rm_start","_rm_set_container","_rm_step","_rm_close","_rm_duration","_rm_video_codec","_rm_audio_codec","_malloc","_free"]' \
 -sEXPORTED_RUNTIME_METHODS='["HEAPU8","ccall","UTF8ToString"]' \
 -o "$LINK_OUT/remux.mjs"
# Verify the complete binary before publishing any served artifact.
node --input-type=module -e 'import {readFileSync} from "node:fs"; if(!WebAssembly.validate(readFileSync(process.argv[1])))throw Error("Invalid remux Wasm");' "$LINK_OUT/remux.wasm"
cp "$LINK_OUT/remux.wasm" "$OUT/remux.wasm.next"
cp "$LINK_OUT/remux.mjs" "$OUT/remux.mjs.next"
mv "$OUT/remux.wasm.next" "$OUT/remux.wasm"
mv "$OUT/remux.mjs.next" "$OUT/remux.mjs"
