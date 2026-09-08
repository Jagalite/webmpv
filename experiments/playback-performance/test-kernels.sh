#!/usr/bin/env bash
# Build first, then measure each kernel with no concurrent compilation.
set -euo pipefail
ROOT=$(cd "$(dirname "$0")/../.." && pwd)
cd "$ROOT"
SDK=${WEBMPV_SDK:-$ROOT/build/emsdk-4.0.14}
export EM_CONFIG="${WEBMPV_EM_CONFIG:-$ROOT/build/gap.emscripten}"
KERNEL_OPT=${WEBMPV_KERNEL_OPT:--O2}
case "$KERNEL_OPT" in -O2|-O3) ;; *) exit 2;; esac
OUT="build/playback-performance/kernels-$(date -u +%Y%m%dT%H%M%SZ)"
mkdir -p "$OUT"
KERNELS=(chroma biweight qpel)
SYMBOLS=(ff_h264chroma_init ff_h264dsp_init ff_h264qpel_init)
OBJ=build/obj-software-full-ffmpeg
for i in "${!KERNELS[@]}"; do
 name=${KERNELS[$i]}
 "$SDK/upstream/emscripten/emcc" "$KERNEL_OPT" -pthread -msimd128 -Ibuild/sources/ffmpeg \
  "experiments/playback-performance/simd/test-$name.c" "experiments/playback-performance/simd/h264-$name.c" \
  "$OBJ/libavcodec/libavcodec.a" "$OBJ/libavutil/libavutil.a" \
  "-Wl,--wrap=${SYMBOLS[$i]}" -sENVIRONMENT=node -sEXIT_RUNTIME=1 -sINITIAL_MEMORY=33554432 \
  -o "$OUT/$name.cjs"
done
python3 - "$OUT" "$KERNEL_OPT" <<'PY'
import hashlib,json,sys
from pathlib import Path
out=Path(sys.argv[1])
paths=list(out.glob('*'))+[Path('experiments/playback-performance/test-kernels.sh')]
paths+=list(Path('experiments/playback-performance/simd').glob('h264-*.c'))
paths+=list(Path('experiments/playback-performance/simd').glob('test-*.c'))
paths+=[Path('build/obj-software-full-ffmpeg')/p for p in ['libavcodec/libavcodec.a','libavutil/libavutil.a','config.h','config_components.h']]
(out/'manifest.json').write_text(json.dumps({'optimization':sys.argv[2],'hashes':{str(p):hashlib.sha256(p.read_bytes()).hexdigest() for p in paths}},indent=2)+'\n')
PY
for name in "${KERNELS[@]}"; do
 node "$OUT/$name.cjs" > "$OUT/$name.jsonl"
 head -n 1 "$OUT/$name.jsonl"
done
printf '%s\n' "$OUT"
