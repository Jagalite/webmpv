#!/usr/bin/env bash
set -euo pipefail
ROOT=$(cd "$(dirname "$0")/.." && pwd)
cd "$ROOT"
SDK=${WEBMPV_SDK:-$ROOT/build/emsdk-4.0.14}
export EMSDK_QUIET=1
source "$SDK/emsdk_env.sh" >/dev/null
export PATH="$ROOT/build/venv/bin:$SDK/upstream/emscripten:$SDK:$PATH"
export EM_CONFIG="${WEBMPV_EM_CONFIG:-$ROOT/build/gap.emscripten}"
PREFIX="$ROOT/build/prefix-playback"
export CFLAGS='-O2 -pthread -msimd128'
export CXXFLAGS="$CFLAGS"
export LDFLAGS='-pthread'
mkdir -p "$PREFIX"
test -f build/sources/dav1d/meson.build
test -f build/sources/zimg/configure.ac
mode=
if [ -f build/obj-dav1d/build.ninja ]; then mode=--reconfigure; fi
meson setup $mode build/obj-dav1d build/sources/dav1d --cross-file build/cross.ini \
 --prefix "$PREFIX" --libdir lib --default-library static --buildtype release \
 --wrap-mode nofallback -Denable_asm=false -Denable_tools=false -Denable_tests=false
ninja -C build/obj-dav1d -j "${WEBMPV_JOBS:-4}"
meson install -C build/obj-dav1d
python3 scripts/configure-zimg.py
emcmake cmake -S build/zimg-cmake -B build/obj-zimg-cmake -G Ninja -DCMAKE_INSTALL_PREFIX="$PREFIX"
cmake --build build/obj-zimg-cmake -j "${WEBMPV_JOBS:-4}"
cmake --install build/obj-zimg-cmake
