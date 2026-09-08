"""Produce isolated native rendering experiments from the maintained bridge."""
from pathlib import Path
import sys
variant=sys.argv[1]
s=Path('native/player.c').read_text()
if variant=='alpha':
    s=s.replace('#include <stdint.h>', '#include <stdint.h>\n#include <wasm_simd128.h>')
    s=s.replace('    return (uintptr_t)pixels;', '''    // Preserve the existing opaque RGB output while normalizing four pixels at once.
    const size_t length=(size_t)w*h*4;
    const v128_t opaque=wasm_i32x4_splat((int32_t)0xff000000u);
    size_t n=0;
    for(;n+16<=length;n+=16)
        wasm_v128_store(pixels+n,wasm_v128_or(wasm_v128_load(pixels+n),opaque));
    for(;n<length;n+=4)pixels[n+3]=255;
    return (uintptr_t)pixels;''')
elif variant=='rgba':
    s=s.replace('MPV_RENDER_PARAM_SW_FORMAT,"rgb0"', 'MPV_RENDER_PARAM_SW_FORMAT,"rgba"')
elif variant in ('threads1','threads4'):
    s=s.replace('"vd-lavc-threads","2"', f'"vd-lavc-threads","{variant[-1]}"')
elif variant not in ('baseline','chroma','biweight','simd','qpel','simd-qpel','simd-qpel-deblock','lto','lto-chroma','lto-simd'):
    raise ValueError(variant)
Path(f'build/playback-performance/native-{variant}/player.c').write_text(s)
