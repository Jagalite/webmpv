#!/usr/bin/env bash
set -euo pipefail
ROOT=$(cd "$(dirname "$0")/.." && pwd)
cd "$ROOT"
SDK=${WEBMPV_SDK:-$ROOT/build/emsdk-4.0.14}
source "$SDK/emsdk_env.sh" >/dev/null
export PATH="$ROOT/build/venv/bin:$SDK/upstream/emscripten:$SDK:$PATH"
export EM_CONFIG="$SDK/.emscripten"
export EM_CACHE="${WEBMPV_CACHE:-${WEBMPV_SDK:-$ROOT/build/emsdk-4.0.14}/upstream/emscripten/cache}"
export PKG_CONFIG_LIBDIR="$ROOT/build/prefix/lib/pkgconfig"
export PKG_CONFIG_PATH="$PKG_CONFIG_LIBDIR"
mkdir -p web/engine
emcc "${WEBMPV_LINK_OPT:--O2}" -pthread -msimd128 -Inative native/player.c native/events.c native/stream_bridge.c \
  $(pkg-config --cflags --libs --static mpv) -lstdc++ \
  -sMODULARIZE=1 -sEXPORT_ES6=1 -sEXPORT_NAME=createEngine \
  -sENVIRONMENT=worker -sPTHREAD_POOL_SIZE=8 -sPTHREAD_POOL_SIZE_STRICT=2 \
  -sINITIAL_MEMORY=134217728 -sMAXIMUM_MEMORY=536870912 -sALLOW_MEMORY_GROWTH=1 \
  -sSTACK_SIZE=2097152 -sDEFAULT_PTHREAD_STACK_SIZE=2097152 \
  -sWASM_BIGINT=1 -sWASMFS=1 -sFORCE_FILESYSTEM=1 -sEXIT_RUNTIME=0 \
  -sEXPORTED_FUNCTIONS='["_web_create","_web_command_args","_web_event","_web_render","_web_presented","_web_destroy","_web_audio_ptr","_malloc","_free"]' \
  -sEXPORTED_RUNTIME_METHODS='["ccall","UTF8ToString","FS","HEAPU8","HEAPU32","HEAPF32"]' \
  -o web/engine/player.mjs
python3 scripts/manifest.py
