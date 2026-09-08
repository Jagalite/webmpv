# Browser format matrix

115 small generated samples tested in the public **Software** mode: **112 decoded**, **106 passed resumed seek**, **115 cleaned up**, and **106 passed all three**.

These samples cover 108 distinct ffprobe codec names with actual browser decode evidence. The inventory also records 47 generation/identification gaps and 334 bundled decoder registrations without a matching local encoder. Registrations include aliases, images and specialized codecs; they are not independent media formats.

Every sample is approximately two seconds. Video uses a moving test pattern; audio uses a tone. Special codecs require larger dimensions or particular sample rates. Commands, stream metadata, file sizes and SHA-256 hashes are in [fixtures.json](fixtures.json); per-file browser evidence is in [summary.json](summary.json). Files are generated locally under `build/fixtures/format-matrix/` and are not checked in.

A decode pass requires actual canvas frames and nonblack pixels, or consumed non-silent PCM. Seek is a separate check of resumed position near 0.6 seconds. Native media playback and WebCodecs are disabled to prove software execution. A decoding timeout means the public API did not establish playback within the test deadline; it does not alone prove FFmpeg lacks that codec. Errors remain visible instead of being counted as skips or passes.

These are synthetic low-resolution functional checks in one Chrome/macOS environment. They do not qualify every container/profile/bit depth, damaged file, subtitle format, stream transport, browser, endurance or real-time performance. This matrix does not measure Native or Hybrid format support. H.263+ and packed raw-video variants may be reported by ffprobe under a shared codec name; their rows are sample configurations, not distinct decoder claims.

| Sample | Codec reported by ffprobe | Decode | Seek | Cleanup |
| --- | --- | --- | --- | --- |
| [aac.m4a](2026-09-08T11-33-37.367Z/result.json) | aac | Pass | Pass | Pass |
| [ac3.ac3](2026-09-08T11-33-37.367Z/result.json) | ac3 | Pass | Pass | Pass |
| [adpcm_g722.wav](2026-09-08T11-33-37.367Z/result.json) | adpcm_g722 | Pass | Pass | Pass |
| [adpcm_g726.wav](2026-09-08T11-37-43.125Z/result.json) | adpcm_g726 | Pass | Pass | Pass |
| [adpcm_ima_qt.mov](2026-09-08T11-37-43.125Z/result.json) | adpcm_ima_qt | Pass | Pass | Pass |
| [adpcm_ima_wav.wav](2026-09-08T11-33-37.367Z/result.json) | adpcm_ima_wav | Pass | Pass | Pass |
| [adpcm_ms.wav](2026-09-08T11-33-37.367Z/result.json) | adpcm_ms | Pass | Pass | Pass |
| [adpcm_swf.wav](2026-09-08T11-33-37.367Z/result.json) | adpcm_swf | Pass | Fail | Pass |
| [adpcm_yamaha.wav](2026-09-08T11-33-37.367Z/result.json) | adpcm_yamaha | Pass | Pass | Pass |
| [alac.m4a](2026-09-08T11-33-37.367Z/result.json) | alac | Pass | Pass | Pass |
| [amv.nut](2026-09-08T11-33-37.367Z/result.json) | amv | Pass | Pass | Pass |
| [asv1.nut](2026-09-08T11-33-37.367Z/result.json) | asv1 | Pass | Pass | Pass |
| [asv2.nut](2026-09-08T11-33-37.367Z/result.json) | asv2 | Pass | Pass | Pass |
| [av1.mp4](2026-09-08T11-33-37.367Z/result.json) | av1 | Fail | Not reached | Pass |
| [cfhd.nut](2026-09-08T11-33-37.367Z/result.json) | cfhd | Pass | Pass | Pass |
| [cinepak.avi](2026-09-08T11-33-37.367Z/result.json) | cinepak | Pass | Pass | Pass |
| [cljr.nut](2026-09-08T11-33-37.367Z/result.json) | cljr | Pass | Pass | Pass |
| [comfortnoise.nut](2026-09-08T11-37-43.125Z/result.json) | comfortnoise | Pass | Fail | Pass |
| [dfpwm.nut](2026-09-08T11-33-37.367Z/result.json) | dfpwm | Fail | Not reached | Pass |
| [dirac.nut](2026-09-08T11-33-37.367Z/result.json) | dirac | Pass | Fail | Pass |
| [dnxhd.nut](2026-09-08T11-33-37.367Z/result.json) | dnxhd | Pass | Pass | Pass |
| [dpx.nut](2026-09-08T11-33-37.367Z/result.json) | dpx | Pass | Pass | Pass |
| [dvvideo.nut](2026-09-08T11-33-37.367Z/result.json) | dvvideo | Pass | Pass | Pass |
| [eac3.eac3](2026-09-08T11-33-37.367Z/result.json) | eac3 | Pass | Pass | Pass |
| [ffv1.mkv](2026-09-08T11-33-37.367Z/result.json) | ffv1 | Pass | Pass | Pass |
| [ffvhuff.avi](2026-09-08T11-33-37.367Z/result.json) | ffvhuff | Pass | Pass | Pass |
| [flac.flac](2026-09-08T11-33-37.367Z/result.json) | flac | Pass | Pass | Pass |
| [flashsv.nut](2026-09-08T11-33-37.367Z/result.json) | flashsv | Pass | Pass | Pass |
| [g723_1.nut](2026-09-08T11-37-43.125Z/result.json) | g723_1 | Pass | Pass | Pass |
| [gif.nut](2026-09-08T11-33-37.367Z/result.json) | gif | Pass | Pass | Pass |
| [h261.nut](2026-09-08T11-33-37.367Z/result.json) | h261 | Pass | Pass | Pass |
| [h263.nut](2026-09-08T11-33-37.367Z/result.json) | h263 | Pass | Pass | Pass |
| [h263p.nut](2026-09-08T11-33-37.367Z/result.json) | h263 | Pass | Pass | Pass |
| [h264.mp4](2026-09-08T11-33-37.367Z/result.json) | h264 | Pass | Pass | Pass |
| [hevc.mp4](2026-09-08T11-33-37.367Z/result.json) | hevc | Pass | Pass | Pass |
| [huffyuv.avi](2026-09-08T11-33-37.367Z/result.json) | huffyuv | Pass | Pass | Pass |
| [jpeg2000.nut](2026-09-08T11-33-37.367Z/result.json) | jpeg2000 | Pass | Pass | Pass |
| [jpegls.nut](2026-09-08T11-33-37.367Z/result.json) | jpegls | Pass | Pass | Pass |
| [magicyuv.nut](2026-09-08T11-33-37.367Z/result.json) | magicyuv | Pass | Pass | Pass |
| [mjpeg.avi](2026-09-08T11-33-37.367Z/result.json) | mjpeg | Pass | Pass | Pass |
| [mlp.mlp](2026-09-08T11-33-37.367Z/result.json) | mlp | Pass | Pass | Pass |
| [mp2.mp2](2026-09-08T11-33-37.367Z/result.json) | mp2 | Pass | Pass | Pass |
| [mp3.mp3](2026-09-08T11-33-37.367Z/result.json) | mp3 | Pass | Pass | Pass |
| [mpeg1video.mpg](2026-09-08T11-33-37.367Z/result.json) | mpeg1video | Pass | Fail | Pass |
| [mpeg2video.ts](2026-09-08T11-33-37.367Z/result.json) | mpeg2video | Pass | Fail | Pass |
| [mpeg4.avi](2026-09-08T11-33-37.367Z/result.json) | mpeg4 | Pass | Pass | Pass |
| [msmpeg4v2.avi](2026-09-08T11-33-37.367Z/result.json) | msmpeg4v2 | Pass | Pass | Pass |
| [msmpeg4v3.avi](2026-09-08T11-33-37.367Z/result.json) | msmpeg4v3 | Pass | Pass | Pass |
| [msrle.avi](2026-09-08T11-33-37.367Z/result.json) | msrle | Pass | Pass | Pass |
| [msvideo1.avi](2026-09-08T11-33-37.367Z/result.json) | msvideo1 | Pass | Pass | Pass |
| [nellymoser.mov](2026-09-08T11-37-43.125Z/result.json) | nellymoser | Pass | Pass | Pass |
| [opus.ogg](2026-09-08T11-33-37.367Z/result.json) | opus | Pass | Pass | Pass |
| [pcm_alaw.wav](2026-09-08T11-33-37.367Z/result.json) | pcm_alaw | Pass | Pass | Pass |
| [pcm_f32be.nut](2026-09-08T11-37-43.125Z/result.json) | pcm_f32be | Pass | Pass | Pass |
| [pcm_f32le.wav](2026-09-08T11-33-37.367Z/result.json) | pcm_f32le | Pass | Pass | Pass |
| [pcm_f64be.nut](2026-09-08T11-37-43.125Z/result.json) | pcm_f64be | Pass | Pass | Pass |
| [pcm_f64le.wav](2026-09-08T11-33-37.367Z/result.json) | pcm_f64le | Pass | Pass | Pass |
| [pcm_mulaw.wav](2026-09-08T11-33-37.367Z/result.json) | pcm_mulaw | Pass | Pass | Pass |
| [pcm_s16be.nut](2026-09-08T11-37-43.125Z/result.json) | pcm_s16be | Pass | Pass | Pass |
| [pcm_s16be_planar.nut](2026-09-08T11-37-43.125Z/result.json) | pcm_s16be_planar | Pass | Pass | Pass |
| [pcm_s16le.wav](2026-09-08T11-33-37.367Z/result.json) | pcm_s16le | Pass | Pass | Pass |
| [pcm_s16le_planar.nut](2026-09-08T11-37-43.125Z/result.json) | pcm_s16le_planar | Pass | Pass | Pass |
| [pcm_s24be.nut](2026-09-08T11-37-43.125Z/result.json) | pcm_s24be | Pass | Pass | Pass |
| [pcm_s24le.wav](2026-09-08T11-33-37.367Z/result.json) | pcm_s24le | Pass | Pass | Pass |
| [pcm_s24le_planar.nut](2026-09-08T11-37-43.125Z/result.json) | pcm_s24le_planar | Pass | Pass | Pass |
| [pcm_s32be.nut](2026-09-08T11-37-43.125Z/result.json) | pcm_s32be | Pass | Pass | Pass |
| [pcm_s32le.wav](2026-09-08T11-33-37.367Z/result.json) | pcm_s32le | Pass | Pass | Pass |
| [pcm_s32le_planar.nut](2026-09-08T11-37-43.125Z/result.json) | pcm_s32le_planar | Pass | Pass | Pass |
| [pcm_s64be.nut](2026-09-08T11-37-43.125Z/result.json) | pcm_s64be | Pass | Pass | Pass |
| [pcm_s64le.wav](2026-09-08T11-33-37.367Z/result.json) | pcm_s64le | Pass | Pass | Pass |
| [pcm_s8.nut](2026-09-08T11-37-43.125Z/result.json) | pcm_s8 | Pass | Pass | Pass |
| [pcm_s8_planar.nut](2026-09-08T11-37-43.125Z/result.json) | pcm_s8_planar | Pass | Pass | Pass |
| [pcm_u16be.nut](2026-09-08T11-37-43.125Z/result.json) | pcm_u16be | Pass | Pass | Pass |
| [pcm_u16le.nut](2026-09-08T11-37-43.125Z/result.json) | pcm_u16le | Pass | Pass | Pass |
| [pcm_u24be.nut](2026-09-08T11-37-43.125Z/result.json) | pcm_u24be | Pass | Pass | Pass |
| [pcm_u24le.nut](2026-09-08T11-37-43.125Z/result.json) | pcm_u24le | Pass | Pass | Pass |
| [pcm_u32be.nut](2026-09-08T11-37-43.125Z/result.json) | pcm_u32be | Pass | Pass | Pass |
| [pcm_u32le.nut](2026-09-08T11-37-43.125Z/result.json) | pcm_u32le | Pass | Pass | Pass |
| [pcm_u8.wav](2026-09-08T11-33-37.367Z/result.json) | pcm_u8 | Pass | Pass | Pass |
| [png.nut](2026-09-08T11-33-37.367Z/result.json) | png | Pass | Pass | Pass |
| [prores.mov](2026-09-08T11-33-37.367Z/result.json) | prores | Pass | Pass | Pass |
| [qtrle.mov](2026-09-08T11-33-37.367Z/result.json) | qtrle | Pass | Pass | Pass |
| [r10k.nut](2026-09-08T11-33-37.367Z/result.json) | r10k | Pass | Pass | Pass |
| [r210.nut](2026-09-08T11-33-37.367Z/result.json) | r210 | Pass | Pass | Pass |
| [ra_144.ra](2026-09-08T11-37-43.125Z/result.json) | ra_144 | Pass | Fail | Pass |
| [rawvideo.nut](2026-09-08T11-33-37.367Z/result.json) | rawvideo | Pass | Pass | Pass |
| [rpza.mov](2026-09-08T11-33-37.367Z/result.json) | rpza | Pass | Pass | Pass |
| [rv10.rm](2026-09-08T11-33-37.367Z/result.json) | rv10 | Pass | Pass | Pass |
| [rv20.rm](2026-09-08T11-33-37.367Z/result.json) | rv20 | Pass | Pass | Pass |
| [sbc.sbc](2026-09-08T11-33-37.367Z/result.json) | sbc | Fail | Not reached | Pass |
| [smc.mov](2026-09-08T11-33-37.367Z/result.json) | smc | Pass | Pass | Pass |
| [snow.nut](2026-09-08T11-33-37.367Z/result.json) | snow | Pass | Pass | Pass |
| [speedhq.nut](2026-09-08T11-33-37.367Z/result.json) | speedhq | Pass | Pass | Pass |
| [svq1.nut](2026-09-08T11-33-37.367Z/result.json) | svq1 | Pass | Pass | Pass |
| [targa.nut](2026-09-08T11-33-37.367Z/result.json) | targa | Pass | Pass | Pass |
| [truehd.thd](2026-09-08T11-33-37.367Z/result.json) | truehd | Pass | Pass | Pass |
| [tta.tta](2026-09-08T11-33-37.367Z/result.json) | tta | Pass | Pass | Pass |
| [utvideo.avi](2026-09-08T11-33-37.367Z/result.json) | utvideo | Pass | Pass | Pass |
| [v210.nut](2026-09-08T11-33-37.367Z/result.json) | v210 | Pass | Pass | Pass |
| [v308.nut](2026-09-08T11-38-52.482Z/result.json) | rawvideo | Pass | Pass | Pass |
| [v408.nut](2026-09-08T11-38-52.482Z/result.json) | rawvideo | Pass | Pass | Pass |
| [v410.nut](2026-09-08T11-38-52.482Z/result.json) | rawvideo | Pass | Pass | Pass |
| [vorbis.ogg](2026-09-08T11-33-37.367Z/result.json) | vorbis | Pass | Pass | Pass |
| [vp8.webm](2026-09-08T11-33-37.367Z/result.json) | vp8 | Pass | Pass | Pass |
| [vp9.webm](2026-09-08T11-33-37.367Z/result.json) | vp9 | Pass | Pass | Pass |
| [wavpack.wv](2026-09-08T11-33-37.367Z/result.json) | wavpack | Pass | Pass | Pass |
| [wmav1.asf](2026-09-08T11-33-37.367Z/result.json) | wmav1 | Pass | Pass | Pass |
| [wmav2.asf](2026-09-08T11-33-37.367Z/result.json) | wmav2 | Pass | Pass | Pass |
| [wmv1.asf](2026-09-08T11-33-37.367Z/result.json) | wmv1 | Pass | Pass | Pass |
| [wmv2.asf](2026-09-08T11-33-37.367Z/result.json) | wmv2 | Pass | Pass | Pass |
| [xface.nut](2026-09-08T11-37-43.125Z/result.json) | xface | Pass | Pass | Pass |
| [y41p.nut](2026-09-08T11-33-37.367Z/result.json) | y41p | Pass | Pass | Pass |
| [yuv4.nut](2026-09-08T11-33-37.367Z/result.json) | yuv4 | Pass | Pass | Pass |
| [zlib.avi](2026-09-08T11-33-37.367Z/result.json) | zlib | Pass | Pass | Pass |
| [zmbv.avi](2026-09-08T11-33-37.367Z/result.json) | zmbv | Pass | Pass | Pass |

## Reproduce

```sh
npm run fixtures:formats
npm run test:formats
python3 experiments/format-matrix/report.py results/format-matrix/<run>/result.json
```

The harness starts its own server and Chrome. Progress includes case number, elapsed time and an approximate remaining-time estimate; headless runs need no foreground hold. Use `HEADED=1` for a visible test page. `ONLY=codec1,codec2 npm run test:formats` limits a diagnostic rerun; supply all relevant result files to the report command.
