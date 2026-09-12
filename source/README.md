# Demo source and licenses

This is a development demo, not the clean-build beta release candidate.
The original webmpv code and combined engines are GPL-2.0-or-later. Third-party
components retain their licenses and notices; see ../docs/LICENSING.md and ../third_party/.

Download webmpv-source.tar.gz for the preferred project source, scripts and patches.
Extract it, then place the individual upstream archives in webmpv/build/downloads/.
emscripten-source.tar.gz supplies the SDK 4.0.14 runtime/library source and scripts.
build-materials.tar.gz records the local configurations used for these engines,
including Software's RGB rotation override. Absolute paths in these records describe
the build machine; use the project scripts to configure your checkout's paths.

The documented engine build entry point is scripts/build-beta-engines.sh; see
README.md and docs/RELEASE.md for dependencies and build instructions. Rebuilds
have not been independently qualified as bit-for-bit reproducible. That release
gate remains separate from this playable demo. source-manifest.json records the
source download hashes; ../deployment-manifest.json records the deployed assets.
