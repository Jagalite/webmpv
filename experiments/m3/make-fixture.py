#!/usr/bin/env python3
"""Generate a fixed public fixture and extract exact MP4 packet bytes once."""
import hashlib
import json
from pathlib import Path
import subprocess


def sha(data):
    return hashlib.sha256(data).hexdigest()


def avcc_bytes(dump):
    return bytes.fromhex(''.join(line.split(':', 1)[1].split('  ', 1)[0].replace(' ', '')
                                for line in dump.strip().splitlines()))


def main():
    out = Path('web/m3/fixture')
    out.mkdir(parents=True, exist_ok=True)
    media = out / 'source.mp4'
    command = ['ffmpeg', '-hide_banner', '-y', '-f', 'lavfi', '-i',
               'testsrc2=size=1920x1080:rate=30:duration=32',
               '-c:v', 'libx264', '-preset', 'veryfast', '-threads', '3',
               '-pix_fmt', 'yuv420p', '-profile:v', 'high', '-b:v', '5M',
               '-minrate', '5M', '-maxrate', '5M', '-bufsize', '10M',
               '-g', '60', '-keyint_min', '60', '-sc_threshold', '0', '-bf', '2',
               '-x264-params', 'nal-hrd=cbr:force-cfr=1:open-gop=0',
               '-colorspace', 'bt709', '-color_trc', 'bt709',
               '-color_primaries', 'bt709', '-color_range', 'tv', '-an', str(media)]
    subprocess.run(command, check=True, stdout=subprocess.DEVNULL, stderr=subprocess.PIPE)
    common = ['ffprobe', '-v', 'error', '-select_streams', 'v:0', '-of', 'json']
    stream = json.loads(subprocess.check_output(common + ['-show_streams', '-show_data', str(media)]))['streams'][0]
    packets = json.loads(subprocess.check_output(common + ['-show_packets', str(media)]))['packets']
    extra = avcc_bytes(stream['extradata'])
    source = media.read_bytes()
    packed = bytearray()
    records = []
    for p in packets:
        data = source[int(p['pos']):int(p['pos']) + int(p['size'])]
        assert len(data) == int(p['size'])
        records.append({'offset': len(packed), 'size': len(data), 'sha256': sha(data),
                        'pts': round(float(p['pts_time']) * 1e6),
                        'dts': round(float(p['dts_time']) * 1e6),
                        'duration': round(float(p['duration_time']) * 1e6),
                        'key': 'K' in p['flags']})
        packed.extend(data)
    assert len(records) == 960 and records[0]['key']
    assert sorted(p['pts'] for p in records) == [round(i / 30 * 1e6) for i in range(960)]
    manifest = {'schema': 1, 'command': command,
                'ffmpeg': subprocess.check_output(['ffmpeg', '-version'], text=True).splitlines()[0],
                'sourceSha256': sha(source), 'packetsSha256': sha(packed),
                'width': stream['width'], 'height': stream['height'], 'fps': 30,
                'durationUs': 32000000, 'codec': 'avc1.' + extra[1:4].hex(),
                'description': list(extra), 'packets': records,
                'colorSpace': {'primaries': 'bt709', 'transfer': 'bt709', 'matrix': 'bt709', 'fullRange': False}}
    (out / 'packets.bin').write_bytes(packed)
    (out / 'manifest.json').write_text(json.dumps(manifest, indent=2) + '\n')
    Path('results/m3/fixture.json').write_text(json.dumps(manifest, indent=2) + '\n')
    print(json.dumps({k: v for k, v in manifest.items() if k != 'packets'}))


if __name__ == '__main__':
    main()
