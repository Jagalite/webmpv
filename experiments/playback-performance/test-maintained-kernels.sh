#!/usr/bin/env bash
# Compile maintained production sources. Measure only after all linking exits.
set -euo pipefail
ROOT=$(cd "$(dirname "$0")/../.." && pwd)
cd "$ROOT"
SDK=${WEBMPV_SDK:-$ROOT/build/emsdk-4.0.14}
export EM_CONFIG="${WEBMPV_EM_CONFIG:-$ROOT/build/gap.emscripten}"
OUT="build/playback-performance/maintained-kernels-$(date -u +%Y%m%dT%H%M%SZ)"
mkdir -p "$OUT"
python3 - "$OUT" <<'PY'
from pathlib import Path
import sys
out=Path(sys.argv[1])
for name,initializer,other in [('biweight','biweight',None),('deblock','deblock','h264_h_loop_filter_luma'),('deblock-horizontal','deblock','h264_v_loop_filter_luma')]:
 source='#include "libavcodec/h264dsp.h"\nvoid __real_ff_h264dsp_init(H264DSPContext *,int,int);\n'
 source+=f'void webmpv_h264_{initializer}_init(H264DSPContext *);\n'
 source+='void __wrap_ff_h264dsp_init(H264DSPContext *context,int depth,int chroma){\n__real_ff_h264dsp_init(context,depth,chroma);\nif(depth==8){\n'
 if other:source+=f'H264DSPContext original=*context;\n'
 source+=f'webmpv_h264_{initializer}_init(context);\n'
 if other:source+=f'context->{other}=original.{other};\n'
 source+='}}\n'
 (out/f'{name}-adapter.c').write_text(source)
PY
for name in chroma biweight qpel deblock deblock-horizontal dsp-dispatch; do
 SOURCES=(-Inative)
 case "$name" in
  chroma) SOURCES+=(native/simd/h264-chroma.c -Wl,--wrap=ff_h264chroma_init);;
  qpel) SOURCES+=(native/simd/h264-qpel.c -Wl,--wrap=ff_h264qpel_init);;
  biweight) SOURCES+=(native/simd/h264-biweight.c "$OUT/$name-adapter.c" -Wl,--wrap=ff_h264dsp_init);;
  deblock|deblock-horizontal) SOURCES+=(native/simd/h264-deblock.c "$OUT/$name-adapter.c" -Wl,--wrap=ff_h264dsp_init);;
  dsp-dispatch) SOURCES+=(native/simd/h264-biweight.c native/simd/h264-deblock.c native/simd/h264-dsp.c -Wl,--wrap=ff_h264dsp_init);;
 esac
 "$SDK/upstream/emscripten/emcc" -O2 -pthread -msimd128 -Ibuild/sources/ffmpeg \
  "experiments/playback-performance/simd/test-$name.c" "${SOURCES[@]}" \
  build/obj-software-full-ffmpeg/libavcodec/libavcodec.a build/obj-software-full-ffmpeg/libavutil/libavutil.a \
  -sENVIRONMENT=node -sEXIT_RUNTIME=1 -sINITIAL_MEMORY=33554432 -o "$OUT/$name.cjs"
done
python3 - "$OUT" <<'PY'
import hashlib,json,sys
from pathlib import Path
out=Path(sys.argv[1]);paths=list(out.glob('*'))+list(Path('native/simd').glob('*'))
paths+=[Path('experiments/playback-performance/test-maintained-kernels.sh')]+list(Path('experiments/playback-performance/simd').glob('test-*.c'))
paths+=[Path('build/obj-software-full-ffmpeg')/p for p in ['libavcodec/libavcodec.a','libavutil/libavutil.a','config.h','config_components.h']]
(out/'manifest.json').write_text(json.dumps({str(path):hashlib.sha256(path.read_bytes()).hexdigest() for path in paths if path.is_file()},indent=2)+'\n')
PY
for name in chroma biweight qpel deblock deblock-horizontal dsp-dispatch; do
 node "$OUT/$name.cjs" > "$OUT/$name.jsonl"
 head -n 1 "$OUT/$name.jsonl"
done
printf '%s\n' "$OUT"
