from pathlib import Path
import re
# Performance-only bindings; preserve the functionally qualified files.
s=Path('web/subtitled-engine-worker.js').read_text()
s=s.replace("} else if (data.type === 'command')", "} else if(data.type==='perf-subtitle'){engine.FS.writeFile('/perf.ass',new TextEncoder().encode(data.content));submit(data.id,['sub-add','/perf.ass','select']);\n    } else if (data.type === 'command')")
Path('web/subtitle-perf-engine-worker.js').write_text(s)
s=Path('web/generated/subtitled-player.js').read_text().replace('../subtitled-engine-worker.js','../subtitle-perf-engine-worker.js')
Path('web/generated/subtitle-perf-player.js').write_text(s)
s=Path('web/retained.html').read_text().replace('./generated/retained-player.js','./generated/subtitle-perf-player.js').replace('Retained-frame presenter comparison','Subtitle overhead: two short tests')
s=s.replace("await player.openRemote({url});await player.play();", "await player.openRemote({url});await player.request({type:'perf-subtitle',content:await(await fetch('/fixtures/subtitle-perf.ass')).text()});await player.subtitleVisible(kind==='subs-on');await player.play();")
Path('web/subtitle-perf.html').write_text(s)
s=Path('fixtures/qualification.ass').read_text();header=s[:s.index('Dialogue:')]
lines=s[s.index('Dialogue:'):].strip().splitlines();events=[]
def stamp(n):return f'{n//3600}:{n//60%60:02d}:{n%60:02d}.00'
# Continuous shaping line, plus repeated animated ASS workload from qualification.
events.append(lines[0].replace('0:00:12.00','0:01:00.00'))
for base in range(0,56,8):
 for line in lines[1:]:
  def shift(m):return stamp(int(m[1])*3600+int(m[2])*60+int(m[3])+base)
  events.append(re.sub(r'(\d+):(\d+):(\d+)\.00',shift,line))
Path('fixtures/subtitle-perf.ass').write_text(header+'\n'.join(events)+'\n')
s=Path('tests/retained-presenter.mjs').read_text().replace('results/retained-presenter/','results/retained-subtitles/perf-')
s=s.replace('experiments/retained-presenter/PROTOCOL.md','experiments/retained-subtitles/PERF-PROTOCOL.md')
s=s.replace("'web/retained.html'", "'web/subtitle-perf.html','web/subtitle-perf-engine-worker.js','web/generated/subtitle-perf-player.js','web/subtitle-overlay.js','web/engine-retained-subs/player.wasm','web/engine-retained-subs/player.mjs','fixtures/subtitle-perf.ass','experiments/retained-subtitles/prepare-perf.py','tests/subtitle-perf.mjs'")
s=s.replace("warmupSeconds:smoke?2:30,measurementSeconds:smoke?10:60", "warmupSeconds:smoke?2:10,measurementSeconds:smoke?5:30")
s=s.replace("orders:[['native','retained']]", "orders:[['subs-off','subs-on']]")
s=s.replace('web/retained.html?mode=${variant}', 'web/subtitle-perf.html?mode=${variant}')
s=s.replace("if(variant==='retained'){const p=", "if(variant!=='native'){const p=")
s=s.replace('return {round,cpu,retainedMultipleOfNative:cpu.retained/cpu.native};', "return {round,cpu,subtitleOverheadPercentagePoints:cpu['subs-on']-cpu['subs-off'],subtitleRelativeOverheadPercent:(cpu['subs-on']/cpu['subs-off']-1)*100};")
s=s.replace('  record.summary.canvasSubmissions=', "  record.summary.subtitleUpdates=db.subtitles.updates-da.subtitles.updates;\n  record.summary.subtitleBitmapBytes=db.subtitles.bytes-da.subtitles.bytes;\n  record.summary.subtitlePeakPacketBytes=db.subtitles.peakBytes;\n  if(variant==='subs-on'){assert.ok(record.summary.subtitleUpdates>secondsPlaceholder);assert.ok(record.summary.subtitleBitmapBytes>100000);}\n  else{assert.equal(record.summary.subtitleBitmapBytes,0);}\n  record.summary.canvasSubmissions=".replace('secondsPlaceholder','elapsed'))
s=s.replace('const ps=db.presentation,late=ps.lateMs.slice().sort((a,b)=>a-b);', 'const ps=db.presentation,observed=new Map(),startPTS=da.presentation.pts.at(-1);for(const sample of samples){const p=sample.state.diagnostics.presentation;for(let i=0;i<p.pts.length;i++)if(p.pts[i]>startPTS)observed.set(p.pts[i],p.lateMs[i]);}const late=[...observed.values()].sort((a,b)=>a-b);record.summary.presentationTimingSamples=late.length;')
Path('tests/subtitle-perf.mjs').write_text(s)
