#!/usr/bin/env python3
"""Record configured components separately from browser-qualified formats."""
import hashlib, json, re, gzip
from pathlib import Path
root = Path(__file__).resolve().parents[2]
obj = root/'build/obj-software-full-ffmpeg'
def digest(p):
    return hashlib.sha256(p.read_bytes()).hexdigest()
def inventory(p):
    text = p.read_text()
    return {kind.lower(): sorted(re.findall(r'^#define CONFIG_(\w+)_' + kind + r' 1$', text, re.M))
            for kind in ['DECODER','DEMUXER','PARSER','BSF','FILTER','ENCODER','MUXER','PROTOCOL','HWACCEL']}
base = inventory(root/'build/obj-ffmpeg/config_components.h')
full = inventory(obj/'config_components.h')
paths = [obj/'config.h',obj/'libavutil/ffversion.h',obj/'config_components.h',obj/'configure-request',root/'sources.lock.json',root/'toolchain.lock.json',root/'build/prefix/lib/libmpv.a',root/'build/obj-mpv/config.h']
paths += sorted(obj.glob('lib*/lib*.a'))
paths += [root/p for p in ['native/player.c','native/events.c','native/stream_bridge.c','native/stream_bridge.h','web/engine-worker.js','web/generated/player.js','web/software-full-engine-worker.js','web/generated/software-full-player.js','web/software-full.html','web/audio-worklet.js','web/io-worker.js','web/range-reader.js','web/resource-loader.js','web/vod-manifest.js','fixtures/DejaVuSans.ttf']]
paths += sorted((root/'experiments/software-full').glob('*.*'))
paths += sorted((root/'web/engine-software-full').glob('*'))
artifacts = {str(p.relative_to(root)): {'bytes':p.stat().st_size,'gzipBytes':len(gzip.compress(p.read_bytes(),mtime=0)),'sha256':digest(p)} for p in (root/'web/engine-software-full').glob('*') if p.is_file()}
report = {'schema':1,'scope':'Built-in software playback, FFmpeg 7.1.1. Registrations are not per-format runtime qualification.',
 'selection':'Upstream defaults with GPL filters and already bundled zlib/libxml2/libass; no new external codec libraries. Encoding, muxing, devices, hardware acceleration and native network protocols disabled.',
 'baseline':base,'enabled':full,'added':{k:sorted(set(full[k])-set(base[k])) for k in full},
 'counts':{k:{'baseline':len(base[k]),'expanded':len(full[k]),'added':len(set(full[k])-set(base[k]))} for k in full},
 'knownLimitations':['Built-in AV1 registration in FFmpeg 7.1.1 has no software reconstruction; software AV1 needs an external library.', 'Only representative fixtures are runtime checked. No all-format or real-time guarantee.', 'Existing 1080p pixel cap, 512 MiB Wasm cap, 32 MiB individual allocation/local-file limits, stereo output and browser I/O restrictions remain.'],
 'artifacts':artifacts,'hashes':{str(p.relative_to(root)):digest(p) for p in paths if p.is_file()}}
(root/'results/software-full/build.json').write_text(json.dumps(report,indent=2)+'\n')
print(json.dumps(report['counts'],indent=2))
