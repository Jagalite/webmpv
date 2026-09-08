#!/usr/bin/env bash
# Source after entering the project root. FFmpeg remains the decoder owner;
# these replacements specialize selected eight-bit DSP operations only.
# Keep a harmless argument when disabled: macOS Bash 3.2 treats an empty array
# expanded under nounset as an unbound variable.
DECODER_SIMD_SOURCES=(-Inative)
case "${WEBMPV_DECODER_SIMD:-1}" in
  1)
    DECODER_SIMD_SOURCES=(-Ibuild/sources/ffmpeg
      native/simd/h264-chroma.c -Wl,--wrap=ff_h264chroma_init
      native/simd/h264-biweight.c native/simd/h264-deblock.c
      native/simd/h264-dsp.c -Wl,--wrap=ff_h264dsp_init
      native/simd/h264-qpel.c -Wl,--wrap=ff_h264qpel_init)
    ;;
  0) ;;
  *) printf '%s\n' 'WEBMPV_DECODER_SIMD must be 0 or 1' >&2; return 2 ;;
esac
