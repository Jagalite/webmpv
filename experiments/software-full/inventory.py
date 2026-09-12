#!/usr/bin/env python3
"""Record configured components separately from browser-qualified formats."""
import hashlib, json, re, gzip, os
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
paths += sorted((root/'build/prefix-playback/lib').glob('*.a'))
paths += sorted((root/'native/simd').glob('*.c'))+[root/'scripts/decoder-simd.sh',root/'scripts/compile-software-vo.py']
paths += sorted((root/'build/software-vo').glob('*'))
paths += sorted((root/'web/engine-software-full').glob('*'))
artifacts = {str(p.relative_to(root)): {'bytes':p.stat().st_size,'gzipBytes':len(gzip.compress(p.read_bytes(),mtime=0)),'sha256':digest(p)} for p in (root/'web/engine-software-full').glob('*') if p.is_file()}
report = {'schema':1,'scope':'Software playback with dav1d and zimg, FFmpeg 7.1.1. Registrations are not per-format runtime qualification.',
 'rotation':'RGB VO clears ROTATE90; mpv autorotates before software rendering.',
 'decoderSimd':os.environ.get('WEBMPV_DECODER_SIMD','1')=='1',
 'selection':'Upstream defaults with GPL filters and already bundled zlib/libxml2/libass; dav1d AV1 decoding and zimg color conversion. Encoding, muxing, devices, hardware acceleration and native network protocols disabled.',
 'baseline':base,'enabled':full,'added':{k:sorted(set(full[k])-set(base[k])) for k in full},
 'counts':{k:{'baseline':len(base[k]),'expanded':len(full[k]),'added':len(set(full[k])-set(base[k]))} for k in full},
 'knownLimitations':['Only representative fixtures are runtime checked. No all-format or real-time guarantee.', 'Output remains within 1080p. Configurable input cap up to 4K, 1 GiB heap cap, 32-256 MiB individual allocation cap; ArrayBuffer inputs remain capped at 32 MiB. PCM layout depends on device negotiation. Browser I/O restrictions remain.'],
 'artifacts':artifacts,'hashes':{str(p.relative_to(root)):digest(p) for p in paths if p.is_file()}}
output=root/os.environ.get('WEBMPV_FULL_MANIFEST_DIR','results/software-full');output.mkdir(parents=True,exist_ok=True)
(output/'build.json').write_text(json.dumps(report,indent=2)+'\n')
print(json.dumps(report['counts'],indent=2))
