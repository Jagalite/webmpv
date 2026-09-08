"""Compose an isolated DSP initializer without changing the validated kernel set."""
from pathlib import Path
import sys
packed='--horizontal-packed' in sys.argv
horizontal='--horizontal' in sys.argv or packed
out=Path('build/playback-performance')/('deblock-horizontal-packed' if packed else 'deblock-horizontal' if horizontal else 'deblock');out.mkdir(exist_ok=True)
a=Path('experiments/playback-performance/simd/h264-biweight.c').read_text().replace('__wrap_ff_h264dsp_init','webmpv_init_biweight')
b=Path('experiments/playback-performance/simd/h264-deblock.c').read_text();old='    __real_ff_h264dsp_init(context,bit_depth,chroma_format_idc);';assert b.count(old)==1;b=b.replace(old,'    webmpv_init_biweight(context,bit_depth,chroma_format_idc);')
source=a+'\n'+b
if horizontal:
    source=source.replace('__wrap_ff_h264dsp_init','webmpv_init_vertical')
    h=Path('experiments/playback-performance/simd')/('h264-deblock-horizontal-packed.c' if packed else 'h264-deblock-horizontal.c')
    h=h.read_text()
    h=h.replace(old,'    webmpv_init_vertical(context,bit_depth,chroma_format_idc);')
    for name in ('clip16','close16'):h=h.replace(name,'horizontal_'+name)
    source+='\n'+h
(out/'combined.c').write_text(source)
