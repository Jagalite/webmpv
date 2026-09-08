#!/usr/bin/env python3
"""Record final development bytes and verify the maintained build/test inputs."""
import datetime
import argparse
import hashlib
import json
import subprocess
from pathlib import Path

root = Path(__file__).resolve().parents[2]
parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('--api-result', default='results/player-api/functional-2026-09-08T18-17-02.028Z/result.json')
parser.add_argument('--strict-result', default='results/playback-performance/strict-runtime-2026-09-08T18-19-58.436Z/result.json')
parser.add_argument('--output', default='results/playback-performance/integrated-build/final-manifest.json')
args = parser.parse_args()
def digest(name):
    with (root / name).open('rb') as stream:
        return hashlib.file_digest(stream, 'sha256').hexdigest()

kernel_manifest = 'build/playback-performance/maintained-kernels-20260908T173553Z/manifest.json'
kernels = json.loads((root / kernel_manifest).read_text())
software = json.loads((root / 'results/software-full/build.json').read_text())
decoder = json.loads((root / 'build/playback-performance/decode-maintained/manifest.json').read_text())
verified = {}
for path in sorted((root / 'native/simd').glob('*.c')):
    name = str(path.relative_to(root))
    value = digest(name)
    assert kernels[name] == software['hashes'][name] == decoder[name] == value, name
    verified[name] = value
for name, expected in software['hashes'].items():
    assert digest(name) == expected, f'Software build input drift: {name}'

api_path = args.api_result
api = json.loads((root / api_path).read_text())
assert api['passed'] and len(api['tests']) == 21
for name, expected in api['hashes'].items():
    assert digest(name) == expected, f'API input drift: {name}'
packet = api['assetSnapshotAfter']['candidate']['web/retained-decoder-worker.js']
assert packet['hits'] > 0 and packet['sha256'] == digest('web/retained-decoder-worker.js')
strict_path = args.strict_result
strict = json.loads((root / strict_path).read_text())
assert strict['passed'] and len(strict['tests']) == 2
for name, artifact in strict['assets']['candidate'].items():
    assert digest(name) == artifact['sha256'], f'Strict runtime input drift: {name}'

paths = set(json.loads((root / 'build/playback-performance/baseline/manifest.json').read_text()))
paths.update(software['hashes'])
paths.update(verified)
paths.update([
    'native/vd_browser.c', 'native/browser_decoder_bridge.h',
    'src/internal/wasm-player.ts', 'web/generated/internal/wasm-player.d.ts',
    'scripts/link.sh', 'scripts/decoder-simd.sh', 'scripts/manifest.py',
    'experiments/filter-routing/retained-fixes.py',
    'experiments/filter-routing/retained-scheduler.py',
    'experiments/retained-presenter/prepare.py',
    'tests/timing-coalescing.mjs', 'tests/playback-performance.mjs',
    'tests/playback-stability.mjs', 'tests/decode-performance.mjs',
    'tests/strict-decoder-runtime.mjs', 'tests/encoded-chunk-ownership.mjs',
    'experiments/playback-performance/run-final-checks.mjs',
    'experiments/playback-performance/run-final-features.mjs',
    'experiments/playback-performance/compare-format-baseline.py',
    'experiments/playback-performance/process-costs.py',
    'experiments/playback-performance/assess-stability.py',
    'experiments/playback-performance/verify-baselines.py',
    'experiments/playback-performance/capture-final.py',
])
report = {
    'recorded': datetime.datetime.now(datetime.timezone.utc).isoformat(),
    'scope': 'Uncommitted development artifacts and inputs; historical release is separately preserved.',
    'head': subprocess.check_output(['git', 'rev-parse', 'HEAD'], cwd=root, text=True).strip(),
    'branch': subprocess.check_output(['git', 'branch', '--show-current'], cwd=root, text=True).strip(),
    'kernelValidationManifest': kernel_manifest,
    'kernelBuildAndTestInputsMatch': verified,
    'softwareBuildInputsMatch': True,
    'apiValidation': {'result': api_path, 'currentInputsMatch': True, 'checks': 21},
    'strictDecoderValidation': {'result': strict_path, 'currentInputsMatch': True, 'checks': 2},
    'files': {name: {'sha256': digest(name), 'bytes': (root / name).stat().st_size} for name in sorted(paths)},
}
output = root / args.output
output.write_text(json.dumps(report, indent=2) + '\n')
print(json.dumps({'output': str(output.relative_to(root)), 'files': len(paths), 'kernelSourcesVerified': len(verified), 'softwareBuildInputsMatch': True}))
