#!/usr/bin/env bash
set -euo pipefail
ROOT=$(cd "$(dirname "$0")/../.." && pwd)
cd "$ROOT"
VARIANT=${1:-hints}
case "$VARIANT" in baseline|hints|strict|strict-copyback) ;; *) exit 2;; esac
SDK=${WEBMPV_SDK:-$ROOT/build/emsdk-4.0.14}
export EM_CONFIG="${WEBMPV_EM_CONFIG:-$ROOT/build/gap.emscripten}"
export PKG_CONFIG_LIBDIR="$ROOT/build/prefix/lib/pkgconfig"
export PKG_CONFIG_PATH="$PKG_CONFIG_LIBDIR"
export SOURCE_DATE_EPOCH=1740000000
OUTPUT="$ROOT/build/playback-performance/hybrid-baseline"
SOURCE=native/vd_browser.c
PLAYER_SOURCES=(experiments/retained-subtitles/player.c experiments/retained-subtitles/subtitles.c build/retained-subs/vo_libmpv.o)
if [ "$VARIANT" = hints ]; then
 OUTPUT="$ROOT/build/playback-performance/decoder-hints"
 SOURCE="$OUTPUT/vd_browser.c"
fi
if [ "$VARIANT" = strict ]; then
 OUTPUT="$ROOT/build/playback-performance/decoder-strict"
 SOURCE="$OUTPUT/vd_browser.c"
fi
if [ "$VARIANT" = strict-copyback ]; then
 OUTPUT="$ROOT/build/playback-performance/decoder-strict-copyback"
 SOURCE="$ROOT/build/playback-performance/decoder-strict/vd_browser.c"
 PLAYER_SOURCES=(native/player.c)
fi
mkdir -p "$OUTPUT"
read -r -a LIBS <<< "$(pkg-config --cflags --libs --static mpv)"
"$SDK/upstream/emscripten/emcc" -O2 --profiling-funcs -pthread -msimd128 -Inative -Ibuild/sources/mpv -Ibuild/obj-mpv \
 "${PLAYER_SOURCES[@]}" \
 native/events.c native/stream_bridge.c "$SOURCE" "${LIBS[@]}" -lstdc++ \
 -sMODULARIZE=1 -sEXPORT_ES6=1 -sEXPORT_NAME=createEngine -sENVIRONMENT=worker \
 -sPTHREAD_POOL_SIZE=8 -sPTHREAD_POOL_SIZE_STRICT=2 \
 -sINITIAL_MEMORY=134217728 -sMAXIMUM_MEMORY=536870912 -sALLOW_MEMORY_GROWTH=1 \
 -sSTACK_SIZE=2097152 -sDEFAULT_PTHREAD_STACK_SIZE=2097152 \
 -sWASM_BIGINT=1 -sWASMFS=1 -sFORCE_FILESYSTEM=1 -sEXIT_RUNTIME=0 \
 -sEXPORTED_FUNCTIONS='["_web_create","_web_command_args","_web_event","_web_render","_web_presented","_web_destroy","_web_audio_ptr","_malloc","_free"]' \
 -sEXPORTED_RUNTIME_METHODS='["ccall","UTF8ToString","FS","PThread","HEAPU8","HEAPU32","HEAPF32"]' \
 -o "$OUTPUT/player.mjs"
python3 - "$OUTPUT" "$SOURCE" "${PLAYER_SOURCES[@]}" <<'PY'
import hashlib,json,sys
from pathlib import Path
root=Path.cwd();out=Path(sys.argv[1])
paths=[out/'player.mjs',out/'player.wasm',*(Path(p).resolve() for p in sys.argv[2:])]
paths+=[root/p for p in ['native/events.c','native/stream_bridge.c','native/browser_decoder_bridge.h','build/prefix/lib/libmpv.a','experiments/playback-performance/link-hybrid.sh']]
paths+=list((root/'build/prefix/lib').glob('libav*.a'))+list((root/'build/prefix/lib').glob('libsw*.a'))
(out/'manifest.json').write_text(json.dumps({str(p.relative_to(root)):hashlib.sha256(p.read_bytes()).hexdigest() for p in paths},indent=2)+'\n')
PY
