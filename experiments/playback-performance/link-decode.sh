#!/usr/bin/env bash
set -euo pipefail
ROOT=$(cd "$(dirname "$0")/../.." && pwd)
cd "$ROOT"
VARIANT=${1:-baseline}
case "$VARIANT" in reference|maintained|baseline|chroma|biweight|simd|qpel|simd-qpel|simd-qpel-deblock|simd-qpel-deblock-h|simd-qpel-deblock-packed|lto|lto-chroma|lto-simd) ;; *) exit 2;; esac
SDK=${WEBMPV_SDK:-$ROOT/build/emsdk-4.0.14}
export EM_CONFIG="${WEBMPV_EM_CONFIG:-$ROOT/build/gap.emscripten}"
export PKG_CONFIG_LIBDIR="$ROOT/build/prefix/lib/pkgconfig"
export PKG_CONFIG_PATH="$PKG_CONFIG_LIBDIR"
export SOURCE_DATE_EPOCH=1740000000
OBJ="$ROOT/build/obj-software-full-ffmpeg"
LINK_OPTIONS=(-O2)
case "$VARIANT" in lto*)
 OBJ="$ROOT/build/obj-performance-ffmpeg-thinlto"
 LINK_OPTIONS=(-O3 -flto=thin -Wl,--thinlto-jobs=1 -Wl,--threads=2);;
esac
OUTPUT="$ROOT/build/playback-performance/decode-$VARIANT"
mkdir -p "$OUTPUT"
read -r -a LIBS <<< "$(pkg-config --cflags --libs --static mpv)"
for i in "${!LIBS[@]}"; do
 case "${LIBS[$i]}" in
 -lavcodec|-lavformat|-lavfilter|-lavutil|-lswresample|-lswscale|-lpostproc)
  name=${LIBS[$i]#-l}; LIBS[$i]="$OBJ/lib$name/lib$name.a";;
 esac
done
EXTRA=(-Inative)
if [ "$VARIANT" = maintained ]; then source scripts/decoder-simd.sh; EXTRA+=("${DECODER_SIMD_SOURCES[@]}"); fi
case "$VARIANT" in chroma|simd|simd-qpel|simd-qpel-deblock|simd-qpel-deblock-h|simd-qpel-deblock-packed|lto-chroma|lto-simd)
 EXTRA+=(-Ibuild/sources/ffmpeg experiments/playback-performance/simd/h264-chroma.c -Wl,--wrap=ff_h264chroma_init);;
esac
case "$VARIANT" in biweight|simd|simd-qpel|lto-simd)
 EXTRA+=(-Ibuild/sources/ffmpeg experiments/playback-performance/simd/h264-biweight.c -Wl,--wrap=ff_h264dsp_init);;
esac
case "$VARIANT" in simd-qpel-deblock|simd-qpel-deblock-h|simd-qpel-deblock-packed)
 case "$VARIANT" in
  simd-qpel-deblock-packed) DEBLOCK_PATH=deblock-horizontal-packed; python3 experiments/playback-performance/prepare-deblock.py --horizontal-packed;;
  simd-qpel-deblock-h) DEBLOCK_PATH=deblock-horizontal; python3 experiments/playback-performance/prepare-deblock.py --horizontal;;
  *) DEBLOCK_PATH=deblock; python3 experiments/playback-performance/prepare-deblock.py;;
 esac
 EXTRA+=(-Ibuild/sources/ffmpeg "build/playback-performance/$DEBLOCK_PATH/combined.c" -Wl,--wrap=ff_h264dsp_init);;
esac
case "$VARIANT" in qpel|simd-qpel|simd-qpel-deblock|simd-qpel-deblock-h|simd-qpel-deblock-packed)
 EXTRA+=(-Ibuild/sources/ffmpeg experiments/playback-performance/simd/h264-qpel.c -Wl,--wrap=ff_h264qpel_init);;
esac
"$SDK/upstream/emscripten/emcc" "${LINK_OPTIONS[@]}" --profiling-funcs -pthread -msimd128 experiments/playback-performance/decode-benchmark.c "${EXTRA[@]}" \
 "${LIBS[@]}" "$OBJ/libpostproc/libpostproc.a" -lstdc++ \
 -sMODULARIZE=1 -sEXPORT_ES6=1 -sEXPORT_NAME=createDecoder -sENVIRONMENT=node \
 -sPTHREAD_POOL_SIZE=4 -sPTHREAD_POOL_SIZE_STRICT=2 \
 -sINITIAL_MEMORY=134217728 -sMAXIMUM_MEMORY=536870912 -sALLOW_MEMORY_GROWTH=1 \
 -sSTACK_SIZE=2097152 -sDEFAULT_PTHREAD_STACK_SIZE=2097152 \
 -sWASM_BIGINT=1 -sWASMFS=1 -sFORCE_FILESYSTEM=1 -sEXIT_RUNTIME=0 \
 -sEXPORTED_FUNCTIONS='["_decode_benchmark"]' \
 -sEXPORTED_RUNTIME_METHODS='["ccall","FS","PThread","HEAPU8"]' \
 -o "$OUTPUT/decoder.mjs"
python3 - "$OUTPUT" "$OBJ" "${EXTRA[@]}" <<'PY'
import hashlib,json,sys
from pathlib import Path
out=Path(sys.argv[1]); root=Path.cwd()
paths=[out/'decoder.mjs',out/'decoder.wasm',root/'experiments/playback-performance/decode-benchmark.c',root/'experiments/playback-performance/link-decode.sh',root/'scripts/decoder-simd.sh']
paths+=list((root/'experiments/playback-performance/simd').glob('*.c'))
paths+=[Path(p).resolve() for p in sys.argv[3:] if p.endswith('.c')]
paths+=list(Path(sys.argv[2]).glob('lib*/*.a'))
(out/'manifest.json').write_text(json.dumps({str(p.relative_to(root)):hashlib.sha256(p.read_bytes()).hexdigest() for p in paths},indent=2)+'\n')
PY
