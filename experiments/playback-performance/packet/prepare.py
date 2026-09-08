"""Isolate the redundant pre-constructor compressed-packet copy."""
from pathlib import Path
import json
out=Path('build/playback-performance/packet-direct');out.mkdir(exist_ok=True)
s=Path('build/playback-performance/baseline/web/retained-decoder-worker.js').read_text()
old='     const bytes=new Uint8Array(memory,pointer+packetOffset,size).slice();'
assert s.count(old)==1
s=s.replace(old,"""     // EncodedVideoChunk synchronously owns a copy before the mailbox is
     // acknowledged, so an additional JavaScript slice is unnecessary.
     const bytes=new Uint8Array(memory,pointer+packetOffset,size);""")
(out/'decoder-worker.js').write_text(s)
base={p:p for p in ['web/filter-retained-engine-worker.js','web/generated/internal/wasm-player.js','web/engine-retained-subs/player.mjs','web/engine-retained-subs/player.wasm']}
(out/'baseline-overrides.json').write_text(json.dumps(base,indent=2)+'\n')
(out/'candidate-overrides.json').write_text(json.dumps({**base,'web/retained-decoder-worker.js':str(out/'decoder-worker.js')},indent=2)+'\n')
