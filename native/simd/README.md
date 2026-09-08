# Wasm decoder DSP specializations

FFmpeg remains responsible for codec parsing, decoding, threading and frame
ownership. These link-time replacements specialize selected eight-bit H.264 DSP
operations using Wasm SIMD128:

- eight-pixel chroma interpolation, put and average;
- eight- and sixteen-pixel weighted biprediction;
- eight- and sixteen-pixel luma quarter-pixel interpolation, put and average;
- inter luma deblocking in both edge directions, using packed row loads for
  vertical edges without reading beyond FFmpeg's six source samples.

Other widths and bit depths keep FFmpeg's selected functions. Components that
reuse these FFmpeg DSP routines can also call the replacements; their format
support is still determined by the FFmpeg configuration.

The build uses the pinned FFmpeg internal headers and `--wrap` initialization
hooks. `scripts/decoder-simd.sh` supplies the same source selection to the narrow
software build and the expanded software build. Set `WEBMPV_DECODER_SIMD=0` to
omit these additional replacements; the existing base build still uses
`-msimd128`. No decoder, demuxer or filter registrations are added or removed.

The differential checks under `experiments/playback-performance/simd/` compare
against FFmpeg's original dispatch, including fractional positions, signed
weights, boundary values, negative strides, guard bytes and untouched bit-depth
selection. `test-maintained-kernels.sh` builds all programs before running the
checks and tests these native sources directly, with small
test-only dispatch adapters for individual DSP slots. Full-video frame
checksums, public API tests and the format matrix provide additional evidence.
