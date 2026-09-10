import test from 'node:test';import assert from 'node:assert/strict';import {readFile} from 'node:fs/promises';
import {cheapMP4Probe} from '../web/cheap-mp4-probe.js';
const supported={canPlayType:()=> 'probably'};
const source=await readFile(new URL('../fixtures/example.mp4',import.meta.url));
const probe=(bytes,video=supported,signal=new AbortController().signal)=>cheapMP4Probe(new File([bytes],'lie.mkv',{type:'application/octet-stream'}),signal,video);
test('simple MP4 uses bounded actual metadata despite misleading name/type',async()=>{const r=await probe(source);assert.equal(r.probe.tracks[0].codec,'h264');assert.equal(r.probe.tracks[1].codec,'aac');assert.ok(r.bytesRead<source.length);assert.ok(r.bytesRead<=264192);});
test('unsupported browser, non-MP4 and malformed box sizes require deep inspection',async()=>{for(const b of [source,Buffer.from('not mp4'),Buffer.from([255,255,255,255,109,111,111,118])])assert.equal((await probe(b,{canPlayType:()=>''})).probe,undefined);});
test('extra subtitle tracks, encrypted entries and unknown AAC extensions are not admitted',async()=>{
 for(const [needle,replacement] of [['soun','subt'],['avc1','encv']]){const b=Buffer.from(source);let at=b.indexOf(needle,100);assert.ok(at>0);b.write(replacement,at);assert.equal((await probe(b)).probe,undefined);}
 const b=Buffer.from(source),at=b.indexOf(Buffer.from([0x56,0xe5,0]));assert.ok(at>0);b[at+2]=0x80;assert.equal((await probe(b)).probe,undefined);
});
test('abort and oversize metadata do not trigger unbounded allocation',async()=>{const c=new AbortController();c.abort();await assert.rejects(()=>probe(source,supported,c.signal),{name:'AbortError'});const b=Buffer.alloc(16);b.writeUInt32BE(1000000);b.write('moov',4);assert.equal((await probe(b)).probe,undefined);});

test('abort cancels an outstanding metadata stream',async()=>{
 let cancelled=false;const file={size:16,slice:()=>({stream:()=>new ReadableStream({cancel(){cancelled=true;}})})};
 const controller=new AbortController(),pending=cheapMP4Probe(file,controller.signal,supported);
 await new Promise(r=>setTimeout(r,0));controller.abort();await assert.rejects(pending,{name:'AbortError'});assert.equal(cancelled,true);
});
