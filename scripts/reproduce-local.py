#!/usr/bin/env python3
"""Two clean local builds, sharing installed tools but no build objects/cache.

Uses cached, hash-verified source archives. Never invokes Docker. Outputs are
development evidence; the historical Linux container lock is not a host lock.
"""
import datetime
import hashlib
import json
import os
import pathlib
import platform
import shutil
import subprocess
import tempfile

root = pathlib.Path(__file__).resolve().parent.parent
stamp = datetime.datetime.now(datetime.timezone.utc).strftime('%Y-%m-%dT%H-%M-%SZ')
output = root / 'results/development' / ('local-builds-' + stamp)
output.mkdir(parents=True, exist_ok=False)
sdk = pathlib.Path(os.environ.get('WEBMPV_SDK', root / 'build/emsdk-4.0.14')).resolve()
config = pathlib.Path(os.environ['WEBMPV_EM_CONFIG']).resolve()
archives = root / 'build/downloads'
for item in json.loads((root / 'sources.lock.json').read_text())['sources']:
    archive = archives / (item['name'] + '.tar.gz')
    if not archive.is_file() or hashlib.sha256(archive.read_bytes()).hexdigest() != item['sha256']:
        raise SystemExit(f'Missing or invalid local archive: {archive}')

def digest(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()

host = {'mode': 'local', 'platform': platform.platform(), 'sdk': str(sdk),
        'configSha256': digest(config), 'sharedInputs': ['installed SDK', 'Python environment', 'verified source archives'],
        'freshInputs': ['extracted sources', 'objects', 'installed libraries', 'Emscripten cache'],
        'historicalContainerLockAppliesToHost': False}
(output / 'host.json').write_text(json.dumps(host, indent=2) + '\n')
# Reuse the same owned path so path-bearing FFmpeg configurations are comparable.
# Only children of this freshly created temporary directory are removed.
with tempfile.TemporaryDirectory(prefix='webmpv-local-', dir=root / 'build') as temporary:
    work = pathlib.Path(temporary) / 'work'
    snapshot = pathlib.Path(temporary) / 'input'
    snapshot.mkdir()
    for name in ('scripts', 'native', 'patches', 'fixtures', 'src'):
        shutil.copytree(root / name, snapshot / name)
    (snapshot / 'web').mkdir()
    for pattern in ('*.js', '*.html'):
        for file in (root / 'web').glob(pattern):
            shutil.copy2(file, snapshot / 'web' / file.name)
    shutil.copytree(root / 'web/generated', snapshot / 'web/generated')
    for name in ('sources.lock.json', 'toolchain.lock.json', 'Dockerfile'):
        shutil.copy2(root / name, snapshot / name)
    for attempt in (1, 2):
        work.mkdir()
        for name in ('scripts', 'native', 'patches', 'fixtures', 'src'):
            shutil.copytree(snapshot / name, work / name)
        (work / 'web').mkdir()
        for pattern in ('*.js', '*.html'):
            for file in (snapshot / 'web').glob(pattern):
                shutil.copy2(file, work / 'web' / file.name)
        shutil.copytree(snapshot / 'web/generated', work / 'web/generated')
        for name in ('sources.lock.json', 'toolchain.lock.json', 'Dockerfile'):
            shutil.copy2(snapshot / name, work / name)
        (work / 'build').mkdir()
        (work / 'build/downloads').symlink_to(archives, target_is_directory=True)
        (work / 'build/venv').symlink_to(root / 'build/venv', target_is_directory=True)
        (work / 'results').mkdir()
        destination = output / str(attempt)
        destination.mkdir()
        env = dict(os.environ, WEBMPV_SDK=str(sdk), WEBMPV_EM_CONFIG=str(config),
                   WEBMPV_CACHE=str(work / 'build/cache'), WEBMPV_MANIFEST_DIR='results',
                   WEBMPV_ENGINE_DIR='web/engine', WEBMPV_BROWSER_DECODER='0')
        with (destination / 'build.log').open('w') as log:
            subprocess.run(['bash', 'scripts/build.sh'], cwd=work, env=env, stdout=log, stderr=subprocess.STDOUT, check=True)
        for backend in ('software', 'webcodecs'):
            if backend == 'webcodecs':
                env['WEBMPV_BROWSER_DECODER'] = '1'
                with (destination / 'optional-link.log').open('w') as log:
                    subprocess.run(['bash', 'scripts/link.sh'], cwd=work, env=env, stdout=log, stderr=subprocess.STDOUT, check=True)
            target = destination / backend
            shutil.copytree(work / 'web/engine', target)
            for name in ('build-manifest.json', 'sbom.cdx.json'):
                shutil.copy2(work / 'results' / name, target / name)
        print(f'Completed local build {attempt}: {destination}', flush=True)
        shutil.rmtree(work)

result = {'passed': True, 'host': host, 'backends': {}}
for backend in ('software', 'webcodecs'):
    folders = [output / str(i) / backend for i in (1, 2)]
    manifests = [json.loads((p / 'build-manifest.json').read_text()) for p in folders]
    artifacts = {name: [digest(p / name) for p in folders] for name in ('player.wasm', 'player.mjs')}
    inputs = {key: manifests[0][key] == manifests[1][key] for key in
              ('sources', 'toolchainLock', 'patchesAndBindings', 'buildConfigurations', 'browserBindings', 'fixtures', 'tools')}
    for folder, manifest in zip(folders, manifests):
        for name in artifacts:
            assert manifest['artifacts']['web/engine/' + name] == digest(folder / name)
    passed = all(a == b for a, b in artifacts.values()) and all(inputs.values())
    result['backends'][backend] = {'passed': passed, 'artifacts': artifacts, 'inputs': inputs}
    result['passed'] &= passed
(output / 'comparison.json').write_text(json.dumps(result, indent=2) + '\n')
print(output / 'comparison.json', flush=True)
raise SystemExit(0 if result['passed'] else 1)
