"""Coalesce unchanged timing messages while preserving the post-init handoff."""
from pathlib import Path
import json
out=Path('build/playback-performance/timing');out.mkdir(parents=True,exist_ok=True)
s=Path('build/playback-performance/baseline/web/generated/internal/wasm-player.js').read_text()
def replace(old,new):
    global s
    assert s.count(old)==1,old
    s=s.replace(old,new)
replace('this.browserCodecsAbsent = data.browserCodecsAbsent;\n                    resolve();', 'this.browserCodecsAbsent = data.browserCodecsAbsent;\n                    this.sendTiming(true);\n                    resolve();')
replace('    sendTiming() {', '    sendTiming(force = false) {')
replace("        this.worker.postMessage({ type: 'timing', latencyUs: Math.round(latency * 1e6), running: this.audioContext.state === 'running' });", """        const latencyUs = Math.round(latency * 1e6), running = this.audioContext.state === 'running';
        if (!force && this.lastTiming?.latencyUs === latencyUs && this.lastTiming.running === running) return;
        this.lastTiming = {latencyUs, running};
        this.worker.postMessage({type: 'timing', latencyUs, running});""")
(out/'wasm-player.js').write_text(s)
(out/'overrides.json').write_text(json.dumps({'web/generated/internal/wasm-player.js':str(out/'wasm-player.js')},indent=2)+'\n')
