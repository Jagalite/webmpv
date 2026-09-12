# Traceable beta release

A release candidate is one archive from a clean tagged revision, built and tested
as recorded below. A deterministic tar command alone is not an engine build test.
One clean build of all three engines is required for this developer beta. Universal
bit-for-bit reproducibility and the historical Linux baseline are separate claims.

## Prerequisites

Install native Python 3, CMake, Ninja, pkg-config, Git, curl and Node.js/npm. On the
reference macOS host, install the pinned Python build dependencies in the checkout:

```sh
python3 -m venv build/venv
build/venv/bin/python -m pip install meson==1.7.2 Jinja2==3.1.6 MarkupSafe==3.0.2
npm ci
python3 scripts/fetch-sources.py
cp -R build/sources/emsdk build/emsdk-4.0.14
build/emsdk-4.0.14/emsdk install 4.0.14
build/emsdk-4.0.14/emsdk activate 4.0.14
```

The installer archive and all library archives are verified against
`sources.lock.json`. The SDK installs the platform's 4.0.14 compiler tools. This
macOS recipe does not claim that the historical Linux `toolchain.lock.json` is a
macOS package lock. The new build record captures actual host tool versions and
hashes; retain it. `prepare-beta-toolchain.py` generates absolute SDK paths and a
fresh compiler cache, without inheriting an edited SDK configuration.

For a clean build use a new checkout of the reviewed tag, e.g. a fresh clone with
`git checkout --detach <tag>`. Install npm/Python dependencies there as above. An
already installed SDK and verified download archive cache may be shared with that
checkout, but never share extracted library sources, objects, prefixes or the
Emscripten cache. Do not run `fetch-sources.py` in that checkout before `--clean`;
use the prerequisite installation checkout to provision the SDK first.

```sh
WEBMPV_SDK=/absolute/path/to/installed/emsdk-4.0.14 \
  bash scripts/build-beta-engines.sh --clean > build/clean-build.log 2>&1
```

Create `build/` before redirecting the log. The clean flag rejects existing engine
outputs, extracted sources, dependency prefixes, objects or compiler cache. The
build verifies locked archives, applies the complete patch series, builds all
static dependencies and all three engines, and records actual configuration and
input/output hashes in `build/beta-build.json`. Inputs may not change during the
build. Generated tracked bindings must match the tag; otherwise fix the source,
review and make a new candidate revision.

## Assemble, test and identify the same bytes

Resolve the original-code license and inspect `docs/LICENSING.md` before tagging.
Use a new version/tag for changed candidate bytes. The release packaging option
requires a clean tagged revision, clean-build evidence, the original license and
matching input/configuration/engine hashes. It also produces the source companion.

```sh
python3 scripts/package-beta.py --release-tag <tag> --output build/release
BETA_ARCHIVE=/absolute/path/to/build/release/webmpv-<version>.tgz \
  node tests/beta-consumer.mjs
BROWSER=firefox BETA_ARCHIVE=/absolute/path/to/build/release/webmpv-<version>.tgz \
  node tests/beta-consumer.mjs
BETA_ARCHIVE=/absolute/path/to/build/release/webmpv-<version>.tgz \
  node tests/beta-streaming.mjs
BROWSER=firefox BETA_ARCHIVE=/absolute/path/to/build/release/webmpv-<version>.tgz \
  node tests/beta-streaming.mjs
```

The browser tests require Playwright's Firefox and local Chrome, and repository
fixtures created by the documented fixture generators. The focused streaming test
uses `build/fixtures/playback-performance/bbb-stream.mp4` by default, or
`STREAMING_FIXTURE` pointing to a seekable H.264/AAC MP4 longer than 500 seconds.
It records that fixture's hash. Keep fixture-generation/source provenance with the
results. Tests use only the extracted runtime archive, and verify all manifest
hashes before running. Consumer results include the archive's SHA-256.

Extract that same archive and run the deterministic timeout regressions against it:

```sh
mkdir -p build/release/extracted
tar -xzf build/release/webmpv-<version>.tgz -C build/release/extracted
RANGE_READER_MODULE="$PWD/build/release/extracted/package/web/range-reader.js" \
  node --test tests/range-reader-deadline.mjs
```

Record result paths and archive hashes in the release verification record. Recheck
both archive hashes immediately before distribution. Publish the tested runtime,
matching source companion, SHA256SUMS and verification record together. Packaging
creates a candidate; publication still requires the test results to pass and the
actual distribution/license arrangement to be settled. Never rebuild an archive
after testing and reuse the earlier test results for it.

Use the verifier to require both complete browser suites and run the deadline tests
against the archived reader, then write the final verification record:

```sh
python3 scripts/verify-beta-release.py \
  --archive build/release/webmpv-<version>.tgz \
  --source build/release/webmpv-<version>-source.tar.gz \
  --consumer <chrome-consumer-result.json> <firefox-consumer-result.json> \
  --streaming <chrome-streaming-result.json> <firefox-streaming-result.json>
```

A changed runtime hash, source companion, tagged test harness, failed test, filtered
suite, or missing browser result prevents verification. Archive assembly does not
publish anything; distribute the verified files without running the packager again.
