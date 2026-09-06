#!/usr/bin/env bash
set -euo pipefail
# Run inside the pinned toolchain image. /input is a read-only repository mount;
# /output is a caller-selected result directory. /work starts empty.
mkdir -p /work/build/downloads /work/results /output
cp -R /input/scripts /input/native /input/patches /input/fixtures /work/
mkdir -p /work/web/generated
cp /input/web/*.js /input/web/*.html /work/web/
cp /input/web/generated/* /work/web/generated/
cp /input/sources.lock.json /input/toolchain.lock.json /input/Dockerfile /work/
if [ -d /input/build/downloads ]; then
  cp /input/build/downloads/*.tar.gz /work/build/downloads/
fi
cd /work
dpkg-query -W > /output/container-packages.txt
pip3 freeze > /output/python-packages.txt
bash scripts/build.sh > /output/build.log 2>&1
cp web/engine/* /output/
cp results/build-manifest.json results/sbom.cdx.json /output/
cp build/obj-ffmpeg/config.h /output/ffmpeg-config.h
cp build/obj-ffmpeg/config_components.h /output/ffmpeg-components.h
cp build/obj-mpv/config.h /output/mpv-config.h
sha256sum web/engine/* > /output/artifacts.sha256
