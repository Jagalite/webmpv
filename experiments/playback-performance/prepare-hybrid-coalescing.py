"""Coalesce decoder diagnostics; mailbox readiness and frame ownership are unchanged."""
from pathlib import Path
import json
out=Path('build/playback-performance/hybrid-coalescing');out.mkdir(parents=True,exist_ok=True)
s=Path('build/playback-performance/decoder-hints/worker.js').read_text()
old="  if(operation!==4||stats.frames%30===0)postMessage({stats:{...stats,outstanding:submitted-consumed,queued:queue.length,active:!!decoder}});"
assert s.count(old)==1
s=s.replace(old,"""  const now=performance.now();
  if(operation===1||operation===5||operation===6||(result<0&&result!==AGAIN&&result!==EOF)||now-lastStatsAt>=200){
   lastStatsAt=now;postMessage({stats:{...stats,outstanding:submitted-consumed,queued:queue.length,active:!!decoder}});
  }""")
(out/'worker.js').write_text('let lastStatsAt=-Infinity;\n'+s)
overrides=json.loads(Path('build/playback-performance/decoder-hints/overrides.json').read_text())
overrides.update(json.loads(Path('build/playback-performance/timing/overrides.json').read_text()))
overrides['web/retained-decoder-worker.js']=str(out/'worker.js')
(out/'overrides.json').write_text(json.dumps(overrides,indent=2)+'\n')
