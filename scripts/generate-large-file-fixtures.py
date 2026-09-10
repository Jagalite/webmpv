"""Create valid sparse MP4s; free-box padding tests offsets, not duration."""
from pathlib import Path
import struct
src=Path('build/fixtures/software-full/h264-aac.mp4').read_bytes()
boxes=[];at=0
while at<len(src):
    size,kind=struct.unpack_from('>I4s',src,at)
    if size==1: size=struct.unpack_from('>Q',src,at+8)[0]
    if size==0: size=len(src)-at
    if size<8 or at+size>len(src): raise ValueError('Invalid source MP4')
    boxes.append((at,size,kind));at+=size
moov=next(at for at,size,kind in boxes if kind==b'moov')
assert all(at<moov for at,size,kind in boxes if kind==b'mdat'), 'Source must have tail moov; sample offsets stay unchanged'
out=Path('build/routing-completion/fixtures');out.mkdir(parents=True,exist_ok=True)
for name,gap in [('64m',64*1024**2),('1g',1024**3),('4g',2**32+1024)]:
    target=out/(name+'.mp4')
    if target.exists(): continue
    with target.open('wb') as f:
        f.write(src[:moov]);f.write(struct.pack('>I4sQ',1,b'free',gap));f.seek(moov+gap);f.write(src[moov:])
    print(target,target.stat().st_size)
