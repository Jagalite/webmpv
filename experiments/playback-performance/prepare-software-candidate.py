"""Compose isolated, named Software experiments without changing maintained assets."""
from pathlib import Path
import json,runpy,sys
variant=sys.argv[1] if len(sys.argv)>1 else 'simd-scheduler'
assert variant in ('scheduler','simd-scheduler','simd-upload','simd-upload-scheduler','simd-qpel-scheduler','simd-qpel-upload-scheduler','simd-qpel-scheduler5','simd-qpel-upload-scheduler5')
out=Path('build/playback-performance/software-'+variant);out.mkdir(parents=True,exist_ok=True)
source=Path('build/playback-performance/direct-upload/worker.js' if 'upload' in variant else 'build/playback-performance/baseline/web/software-full-engine-worker.js').read_text()
if 'scheduler' in variant:
    source=runpy.run_path('experiments/playback-performance/software-scheduler.py')['schedule_software_worker'](source,5 if 'scheduler5' in variant else 10)
(out/'worker.js').write_text(source)
overrides={'web/software-full-engine-worker.js':str(out/'worker.js')}
if 'simd' in variant:
    native='simd-qpel' if 'qpel' in variant else 'simd'
    overrides.update({f'web/engine-software-full/player.{extension}':f'build/playback-performance/native-{native}/player.{extension}' for extension in ('mjs','wasm')})
overrides.update(json.loads(Path('build/playback-performance/timing/overrides.json').read_text()))
(out/'overrides.json').write_text(json.dumps(overrides,indent=2)+'\n')
