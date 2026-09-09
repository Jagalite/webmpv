#!/usr/bin/env bash
set -euo pipefail
ROOT=$(cd "$(dirname "$0")/../.." && pwd)
cd "$ROOT"
SDK="$ROOT/build/emsdk-4.0.14"
source "$SDK/emsdk_env.sh" >/dev/null
export EM_CONFIG="$ROOT/build/gap.emscripten"
export PATH="$SDK/upstream/emscripten:$SDK:$PATH"
export SOURCE_DATE_EPOCH=1740000000
export GIT_CEILING_DIRECTORIES="$ROOT/build/sources"
OBJ="$ROOT/build/pipeline-separation/ffmpeg-remux"
OUT="$ROOT/build/pipeline-separation/remux"
mkdir -p "$OBJ" "$OUT"
if [ ! -f "$OBJ/Makefile" ]; then
 (cd "$OBJ"
 emconfigure "$ROOT/build/sources/ffmpeg/configure" \
 --target-os=none --arch=wasm32 --enable-cross-compile \
 --cc=emcc --cxx=em++ --ar=emar --ranlib=emranlib --nm=emnm \
 --enable-static --disable-shared --disable-programs --disable-doc --disable-debug \
 --disable-autodetect --disable-network --disable-asm --disable-everything \
 --disable-avdevice --disable-avfilter --disable-swscale --disable-swresample --disable-postproc \
 --enable-avformat --enable-avcodec --enable-avutil --enable-pthreads \
 --enable-demuxer=mov,matroska,mpegts,avi,flv,ogg \
 --enable-muxer=mp4 --enable-parser=h264,hevc,aac,opus \
 --enable-bsf=aac_adtstoasc,extract_extradata,h264_mp4toannexb,hevc_mp4toannexb \
 --extra-cflags='-O2 -pthread -msimd128' --extra-ldflags='-pthread')
fi
(cd "$OBJ"; emmake make -j 4)
emcc -O2 -pthread -msimd128 -Ibuild/sources/ffmpeg -I"$OBJ" \
 experiments/pipeline-separation/remux.c \
 "$OBJ/libavformat/libavformat.a" "$OBJ/libavcodec/libavcodec.a" "$OBJ/libavutil/libavutil.a" \
 -sMODULARIZE=1 -sEXPORT_ES6=1 -sEXPORT_NAME=createRemux -sENVIRONMENT=worker \
 -sINITIAL_MEMORY=67108864 -sMAXIMUM_MEMORY=134217728 -sALLOW_MEMORY_GROWTH=1 \
 -sSTACK_SIZE=2097152 -sWASM_BIGINT=1 -sFILESYSTEM=0 \
 -sEXPORTED_FUNCTIONS='["_rm_open","_rm_start","_rm_step","_rm_close","_rm_duration","_rm_video_codec","_rm_audio_codec","_malloc","_free"]' \
 -sEXPORTED_RUNTIME_METHODS='["HEAPU8","ccall","UTF8ToString"]' \
 -o "$OUT/remux.mjs"
