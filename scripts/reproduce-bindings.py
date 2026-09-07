#!/usr/bin/env python3
"""Compile browser bindings twice locally from a single source snapshot."""
import datetime
import hashlib
import json
import pathlib
import subprocess
import tempfile

root = pathlib.Path(__file__).resolve().parent.parent
stamp = datetime.datetime.now(datetime.timezone.utc).strftime('%Y-%m-%dT%H-%M-%SZ')
output = root / 'results/development' / ('bindings-' + stamp)
output.mkdir(parents=True, exist_ok=False)
inputs = ['package-lock.json', 'tsconfig.json', 'src/player.ts', 'scripts/build-bindings.sh']
sidecars = sorted(str(p.relative_to(root)) for p in (root / 'web').iterdir()
                  if p.suffix in ('.js', '.html'))
snapshot = {name: (root / name).read_bytes() for name in inputs + sidecars}
hashes = lambda files: {name: hashlib.sha256(data).hexdigest() for name, data in files.items()}
builds = []
for attempt in (1, 2):
    with tempfile.TemporaryDirectory(prefix='webmpv-bindings-', dir=root / 'build') as temporary:
        work = pathlib.Path(temporary)
        for name, data in snapshot.items():
            (work / name).parent.mkdir(parents=True, exist_ok=True)
            (work / name).write_bytes(data)
        (work / 'node_modules').symlink_to(root / 'node_modules', target_is_directory=True)
        subprocess.run(['bash', str(work / 'scripts/build-bindings.sh'),
                        str(work / 'assembled')], cwd=work, check=True)
        manifest = json.loads((work / 'assembled/manifest.json').read_text())
        manifest['inputs'] = hashes({name: snapshot[name] for name in inputs})
        builds.append(manifest)
        (output / f'{attempt}.json').write_text(json.dumps(manifest, indent=2) + '\n')
current = all((root / name).is_file() and hashlib.sha256((root / name).read_bytes()).hexdigest() == digest
              for group in ('inputs', 'outputs') for name, digest in builds[0][group].items())
result = {'passed': builds[0] == builds[1] and current,
          'identicalAssemblies': builds[0] == builds[1], 'matchesCheckout': current,
          'manifest': builds[0]}
(output / 'comparison.json').write_text(json.dumps(result, indent=2) + '\n')
print(output / 'comparison.json')
raise SystemExit(0 if result['passed'] else 1)
