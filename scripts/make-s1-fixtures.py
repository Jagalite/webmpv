#!/usr/bin/env python3
"""Synthetic, finite software-decoder S1 fixtures; no private media inputs."""
from pathlib import Path
import subprocess,json,hashlib
root=Path(__file__).resolve().parent.parent
out=root/'build/fixtures/s1';out.mkdir(parents=True,exist_ok=True)
def run(args):subprocess.run(['ffmpeg','-hide_banner','-loglevel','error','-y',*map(str,args)],check=True)
source=out/'source.mp4'
run(['-f','lavfi','-i','testsrc2=size=640x360:rate=30','-f','lavfi','-i','sine=frequency=440:sample_rate=48000','-f','lavfi','-i','sine=frequency=880:sample_rate=48000','-t','24','-map','0:v','-map','1:a','-map','2:a','-c:v','libx264','-preset','fast','-pix_fmt','yuv420p','-g','60','-keyint_min','60','-sc_threshold','0','-bf','2','-c:a','aac','-ac','2','-b:a','96k',source])
for kind in ['ts','fmp4']:
 folder=out/kind;folder.mkdir(exist_ok=True)
 for name,mapping in [('video','0:v'),('english','0:a:0'),('alternate','0:a:1')]:
  run(['-i',source,'-map',mapping,'-c','copy','-f','hls','-hls_time','2','-hls_playlist_type','vod','-hls_segment_type','mpegts' if kind=='ts' else 'fmp4',*(['-hls_fmp4_init_filename',f'{name}-init.mp4'] if kind=='fmp4' else []),'-hls_segment_filename',folder/(name+'-%03d.'+('ts' if kind=='ts' else 'm4s')),folder/(name+'.m3u8')])
 (folder/'subtitles.vtt').write_text('WEBVTT\n\n00:00:00.000 --> 00:00:24.000\nS1 SOFTWARE SUBTITLE\n')
 (folder/'subtitles.m3u8').write_text('#EXTM3U\n#EXT-X-TARGETDURATION:24\n#EXT-X-PLAYLIST-TYPE:VOD\n#EXTINF:24,\nsubtitles.vtt\n#EXT-X-ENDLIST\n')
 (folder/'master.m3u8').write_text('#EXTM3U\n#EXT-X-MEDIA:TYPE=AUDIO,GROUP-ID="audio",NAME="English",LANGUAGE="en",DEFAULT=YES,AUTOSELECT=YES,URI="english.m3u8"\n#EXT-X-MEDIA:TYPE=AUDIO,GROUP-ID="audio",NAME="Alternate",LANGUAGE="fr",DEFAULT=NO,AUTOSELECT=YES,URI="alternate.m3u8"\n#EXT-X-MEDIA:TYPE=SUBTITLES,GROUP-ID="subs",NAME="English",LANGUAGE="en",DEFAULT=YES,AUTOSELECT=YES,URI="subtitles.m3u8"\n#EXT-X-STREAM-INF:BANDWIDTH=2000000,CODECS="avc1.64001e,mp4a.40.2",AUDIO="audio",SUBTITLES="subs"\nvideo.m3u8\n')
folder=out/'dash';folder.mkdir(exist_ok=True)
run(['-i',source,'-map','0:v','-map','0:a:0','-map','0:a:1','-c','copy','-f','dash','-seg_duration','2','-use_template','1','-use_timeline','1','-adaptation_sets','id=0,streams=0 id=1,streams=1 id=2,streams=2',folder/'manifest.mpd'])
folder=out/'byterange';folder.mkdir(exist_ok=True)
run(['-i',source,'-map','0:v','-map','0:a:0','-c','copy','-f','hls','-hls_time','2','-hls_playlist_type','vod','-hls_segment_type','fmp4','-hls_flags','single_file','-hls_segment_filename',folder/'media.mp4',folder/'media.m3u8'])
# A muxed TS playlist supports deterministic stalled-segment and discontinuity tests.
folder=out/'muxed';folder.mkdir(exist_ok=True)
run(['-i',source,'-map','0:v','-map','0:a:0','-c','copy','-f','hls','-hls_time','2','-hls_playlist_type','vod','-hls_segment_filename',folder/'av-%03d.ts',folder/'media.m3u8'])
lines=['#EXTM3U','#EXT-X-TARGETDURATION:2','#EXT-X-PLAYLIST-TYPE:VOD']
for cycle in range(2):
 if cycle:lines.append('#EXT-X-DISCONTINUITY')
 for index in range(6):lines.extend(['#EXTINF:2,',f'av-{index:03d}.ts'])
lines.append('#EXT-X-ENDLIST');(folder/'discontinuity.m3u8').write_text('\n'.join(lines)+'\n')
# fMP4 timestamp reset with a repeated initialization section.
fmp4=out/'fmp4-discontinuity';fmp4.mkdir(exist_ok=True)
run(['-i',source,'-map','0:v','-map','0:a:0','-c','copy','-f','hls','-hls_time','2','-hls_playlist_type','vod','-hls_segment_type','fmp4','-hls_fmp4_init_filename','init.mp4','-hls_segment_filename',fmp4/'av-%03d.m4s',fmp4/'original.m3u8'])
rows=['#EXTM3U','#EXT-X-TARGETDURATION:2','#EXT-X-PLAYLIST-TYPE:VOD']
for cycle in range(2):
 if cycle:rows.append('#EXT-X-DISCONTINUITY')
 rows.append('#EXT-X-MAP:URI="init.mp4"')
 for i in range(6):rows.extend(['#EXTINF:2,',f'av-{i:03d}.m4s'])
rows.append('#EXT-X-ENDLIST');(fmp4/'media.m3u8').write_text('\n'.join(rows)+'\n')
# Nonzero media timestamps and a declared unavailable segment exercise timeline edges.
(folder/'offset.m3u8').write_text('#EXTM3U\n#EXT-X-TARGETDURATION:2\n#EXT-X-PLAYLIST-TYPE:VOD\n'+''.join(f'#EXTINF:2,\nav-{i:03d}.ts\n' for i in range(3,12))+'#EXT-X-ENDLIST\n')
(folder/'gap.m3u8').write_text((folder/'media.m3u8').read_text().replace('av-005.ts','#EXT-X-GAP\nav-005.ts'))
(folder/'live.m3u8').write_text((folder/'media.m3u8').read_text().replace('#EXT-X-ENDLIST',''))
(folder/'encrypted.m3u8').write_text((folder/'media.m3u8').read_text().replace('#EXTM3U','#EXTM3U\n#EXT-X-KEY:METHOD=AES-128,URI="key.bin"'))
files={str(p.relative_to(out)): {'bytes':p.stat().st_size,'sha256':hashlib.sha256(p.read_bytes()).hexdigest()} for p in sorted(out.rglob('*')) if p.is_file()}
(root/'results/s1/fixtures.json').write_text(json.dumps({'generator':'scripts/make-s1-fixtures.py','files':files},indent=2)+'\n')
