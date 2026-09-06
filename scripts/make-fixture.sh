#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
ffmpeg -hide_banner -y -f lavfi -i 'testsrc2=size=640x360:rate=30:duration=12' \
  -f lavfi -i 'sine=frequency=440:sample_rate=48000:duration=12' -i fixtures/m0.ass \
  -map 0:v -map 1:a -map 2:s -c:v libx264 -preset medium -crf 23 -pix_fmt yuv420p \
  -g 60 -bf 2 -c:a aac -b:a 96k -ac 2 -c:s ass \
  -attach fixtures/DejaVuSans.ttf -metadata:s:t mimetype=application/x-truetype-font \
  -metadata:s:t filename=DejaVuSans.ttf -fflags +bitexact -flags:v +bitexact -flags:a +bitexact fixtures/m0.mkv
ffprobe -v error -show_format -show_streams -of json fixtures/m0.mkv > fixtures/m0.ffprobe.json
