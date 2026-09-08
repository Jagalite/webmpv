#!/usr/bin/env python3
import json,sys,hashlib
from pathlib import Path
root=Path(__file__).resolve().parents[2]
out=root/'results/format-matrix';manifest=json.loads((root/'build/fixtures/format-matrix/manifest.json').read_text())
runs=[Path(p) for p in sys.argv[1:]]
if not runs:raise SystemExit('Pass the completed result.json files to combine')
rows={}
for p in runs:
 r=json.loads(p.read_text())
 if not r.get('inputsUnchanged'):raise SystemExit(f'Incomplete or changed-input run: {p}')
 for c in r['cases']:rows[c['codec']]={**c,'run':str(p.parent.relative_to(out) if p.is_absolute() else p.parent.relative_to('results/format-matrix'))}
assert set(rows)=={c['codec'] for c in manifest['cases']}, 'Every valid generated sample must be tested'
for c in manifest['cases']:assert rows[c['codec']]['sha256']==c['sha256']
counts={'generated':len(manifest['cases']),'generationGaps':len(manifest['generationFailures']),'noMatchingEncoderRegistrations':len(manifest['noMatchingEncoder']),'decode':sum(c['decode'] for c in rows.values()),'seek':sum(c['seek'] for c in rows.values()),'cleanup':sum(c['cleanup'] for c in rows.values()),'fullPass':sum(c['decode'] and c['seek'] and c['cleanup'] for c in rows.values())}
covered=sorted({c['probe']['streams'][0]['codec_name'] for c in manifest['cases'] if rows[c['codec']]['decode']})
report={'scope':'Generated audio/video sample configurations through the public software mode in Chrome','counts':counts,'verifiedProbeCodecNames':covered,'cases':rows}
(out/'summary.json').write_text(json.dumps(report,indent=2)+'\n');(out/'fixtures.json').write_text(json.dumps(manifest,indent=2)+'\n')
lines=['# Browser format matrix','',f"{counts['generated']} small generated samples tested in the public **Software** mode: **{counts['decode']} decoded**, **{counts['seek']} passed resumed seek**, **{counts['cleanup']} cleaned up**, and **{counts['fullPass']} passed all three**.",'',f"These samples cover {len(covered)} distinct ffprobe codec names with actual browser decode evidence. The inventory also records {counts['generationGaps']} generation/identification gaps and {counts['noMatchingEncoderRegistrations']} bundled decoder registrations without a matching local encoder. Registrations include aliases, images and specialized codecs; they are not independent media formats.",'','Every sample is approximately two seconds. Video uses a moving test pattern; audio uses a tone. Special codecs require larger dimensions or particular sample rates. Commands, stream metadata, file sizes and SHA-256 hashes are in [fixtures.json](fixtures.json); per-file browser evidence is in [summary.json](summary.json). Files are generated locally under `build/fixtures/format-matrix/` and are not checked in.','', 'A decode pass requires actual canvas frames and nonblack pixels, or consumed non-silent PCM. Seek is a separate check of resumed position near 0.6 seconds. Native media playback and WebCodecs are disabled to prove software execution. A decoding timeout means the public API did not establish playback within the test deadline; it does not alone prove FFmpeg lacks that codec. Errors remain visible instead of being counted as skips or passes.','','These are synthetic low-resolution functional checks in one Chrome/macOS environment. They do not qualify every container/profile/bit depth, damaged file, subtitle format, stream transport, browser, endurance or real-time performance. This matrix does not measure Native or Hybrid format support. H.263+ and packed raw-video variants may be reported by ffprobe under a shared codec name; their rows are sample configurations, not distinct decoder claims.','','| Sample | Codec reported by ffprobe | Decode | Seek | Cleanup |','| --- | --- | --- | --- | --- |']
for c in sorted(manifest['cases'],key=lambda c:c['file']):
 r=rows[c['codec']];yes=lambda k:'Pass' if r[k] else ('Not reached' if k=='seek' and not r['decode'] else 'Fail')
 lines.append(f"| [{c['file']}]({r['run']}/result.json) | {c['probe']['streams'][0]['codec_name']} | {yes('decode')} | {yes('seek')} | {yes('cleanup')} |")
lines+=['','## Reproduce','','```sh','npm run fixtures:formats','npm run test:formats','python3 experiments/format-matrix/report.py results/format-matrix/<run>/result.json','```','','The harness starts its own server and Chrome. Progress includes case number, elapsed time and an approximate remaining-time estimate; headless runs need no foreground hold. Use `HEADED=1` for a visible test page. `ONLY=codec1,codec2 npm run test:formats` limits a diagnostic rerun; supply all relevant result files to the report command.','']
(out/'README.md').write_text('\n'.join(lines));print(json.dumps(counts))
