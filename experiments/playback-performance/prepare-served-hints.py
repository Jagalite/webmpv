"""Serve nested worker candidates explicitly; Playwright cannot route their requests."""
from pathlib import Path
import json
served=Path('web/engine-retained-subs/performance');served.mkdir(parents=True,exist_ok=True)
for name,worker,engine in [('baseline','build/playback-performance/baseline/web/retained-decoder-worker.js','build/playback-performance/hybrid-baseline'),('hints','build/playback-performance/decoder-hints/worker.js','build/playback-performance/decoder-hints')]:
    identity=f'{name}-counted'
    s=Path(worker).read_text().replace('const stats={submitted:',f"const stats={{implementation:'{identity}',submitted:")
    anchor=' const operation=header[2],current=generation;'
    assert anchor in s
    s=s.replace(anchor,anchor+'\n stats[`request${operation}`]=(stats[`request${operation}`]??0)+1;')
    (served/f'decoder-{name}.js').write_text(s)
    root=Path('build/playback-performance/baseline/web/filter-retained-engine-worker.js').read_text()
    root=root.replace("'./retained-decoder-worker.js'",f"'./engine-retained-subs/performance/decoder-{name}.js'")
    out=Path('build/playback-performance')/f'served-{name}';out.mkdir(parents=True,exist_ok=True);(out/'worker.js').write_text(root)
    overrides={f'web/engine-retained-subs/{file}':f'{engine}/{file}' for file in ['player.mjs','player.wasm']}
    overrides['web/filter-retained-engine-worker.js']=str(out/'worker.js')
    (out/'overrides.json').write_text(json.dumps(overrides,indent=2)+'\n')
