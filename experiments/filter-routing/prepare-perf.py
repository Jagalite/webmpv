from pathlib import Path
s=Path('tests/retained-presenter.mjs').read_text().replace('results/retained-presenter/', 'results/filter-routing/perf-')
a=s.index('const files=');b=s.index('\nconst hashes=',a)
s=s[:a]+"const files=['experiments/filter-routing/PERF-PROTOCOL.md','experiments/filter-routing/prepare-perf.py','tests/filter-perf.mjs','web/filter-perf.html','web/filter-player.js','web/filter-retained-engine-worker.js','web/filter-copyback-engine-worker.js','web/generated/filter-retained-player.js','web/generated/filter-copyback-player.js','web/retained-decoder-worker.js','web/browser-decoder-worker.js','web/subtitle-overlay.js','web/engine-retained-subs/player.wasm','web/engine-retained-subs/player.mjs','web/engine-filter-copyback/player.wasm','web/engine-filter-copyback/player.mjs','web/benchmark-progress.js','scripts/benchmark-media-server.mjs','scripts/qualification-foreground.mjs','web/audio-worklet.js','web/io-worker.js','web/range-reader.js'];"+s[b:]
s=s.replace('warmupSeconds:smoke?2:30,measurementSeconds:smoke?10:60','warmupSeconds:smoke?2:10,measurementSeconds:smoke?5:30').replace("orders:[['native','retained']]", "orders:[['retained','copyback-null','copyback-mirror']]")
s=s.replace('web/retained.html?mode=${variant}', 'web/filter-perf.html?mode=${variant}')
a=s.index("   if(variant==='native'){assert.equal");b=s.index('   return data;',a)
s=s[:a]+'''   const d=state.diagnostics;
   assert.equal(d.decoder,'webcodecs');assert.ok(d.heapBytes<=536870912);assert.ok(d.io.peakCacheBytes<=16777216);
   assert.ok(d.decoderStats.peakOutstanding<=8);assert.ok(d.decoderStats.peakFrames<=8);
   assert.equal(d.route,variant==='retained'?'retained':'copyback');
   assert.equal(d.videoFilters,variant==='retained'?'':variant==='copyback-null'?'null':'hflip');
   if(variant==='retained'){assert.equal(d.skipCanvas,true);assert.equal(d.mode,'retained');assert.ok(d.presentation.peakRetained<=16);assert.equal(d.presentation.missing,0);assert.equal(d.decoderStats.actualWidth,1920);assert.equal(d.decoderStats.actualHeight,1080);}
'''+s[b:]
a=s.index("  if(variant!=='native')assert.ok(last.state.audio");b=s.index('  record.originAfter=',a)
s=s[:a]+'''  const da=first.state.diagnostics,db=last.state.diagnostics;
  record.summary.decodedFrames=db.decoderStats.frames-da.decoderStats.frames;
  record.summary.audioFrames=last.state.audio.mediaFrames-first.state.audio.mediaFrames;
  record.summary.renderWallMsPerFrame=(db.renderMs-da.renderMs)/rendered;
  record.summary.canvasWallMsPerFrame=(db.copyMs-da.copyMs)/rendered;
  assert.ok(Math.abs(record.summary.decodedFrames-rendered)<=12,'Decode/render counts diverged');
  assert.ok(record.summary.audioFrames>=elapsed*last.state.audio.sampleRate*.95,'Audio throughput too low');
  if(variant==='retained'){
   assert.equal(db.decoderStats.copyMs-da.decoderStats.copyMs,0);assert.equal(db.copyMs-da.copyMs,0);
   record.summary.presentationDraws=db.presentation.drawn-da.presentation.drawn;
   assert.ok(Math.abs(record.summary.presentationDraws-rendered)<=12);
   const observed=new Map(),startPTS=da.presentation.pts.at(-1);
   for(const sample of samples){const p=sample.state.diagnostics.presentation;for(let i=0;i<p.pts.length;i++)if(p.pts[i]>startPTS)observed.set(p.pts[i],p.lateMs[i]);}
   const late=[...observed.values()].sort((a,b)=>a-b);
   record.summary.presentationTimingSamples=late.length;record.summary.presentationLateP95Ms=late[Math.floor(late.length*.95)];record.summary.presentationLateMaxMs=Math.max(...late);
   assert.ok(record.summary.presentationLateP95Ms<=33&&record.summary.presentationLateMaxMs<=100);
  }else{assert.ok(db.decoderStats.copyMs-da.decoderStats.copyMs>0);assert.ok(db.copyMs-da.copyMs>0);}
  if(smoke){record.pixelCheck=await page.evaluate(()=>checkPixels());assert.ok(record.pixelCheck.max-record.pixelCheck.min>100);}
'''+s[b:]
s=s.replace("if(variant==='retained'){const p=record.cleanup.presentation", "if(variant==='retained'){const p=record.cleanup.presentation")
s=s.replace('return {round,cpu,retainedMultipleOfNative:cpu.retained/cpu.native};', "return {round,cpu,copybackOverheadPoints:cpu['copyback-null']-cpu.retained,copybackRelativePercent:(cpu['copyback-null']/cpu.retained-1)*100,mirrorIncrementPoints:cpu['copyback-mirror']-cpu['copyback-null'],mirrorRelativePercent:(cpu['copyback-mirror']/cpu['copyback-null']-1)*100};")
Path('tests/filter-perf.mjs').write_text(s)
