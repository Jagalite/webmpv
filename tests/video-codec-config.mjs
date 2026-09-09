import {test} from 'node:test';
import assert from 'node:assert/strict';
import {videoCodecConfig} from '../web/video-codec-config.js';
const config=(kind,description=[],extra={})=>videoCodecConfig({kind,description:Uint8Array.from(description),width:640,height:360,...extra});
test('AVC distinguishes avcC packets from Annex B and preserves parameter bytes',()=>{
 const c=config(1,[1,100,0,31,255,225,0]);assert.equal(c.configuration.codec,'avc1.64001f');assert.ok(c.configuration.description);assert.equal(c.prefix,undefined);
 const a=config(1,[0,0,0,1,103,100,0,31,0,0,1,104,1]);assert.equal(a.configuration.codec,'avc1.64001f');assert.equal(a.configuration.description,undefined);assert.ok(a.prefix);
});
test('HEVC profile compatibility bits and constraints generate the RFC codec string',()=>{
 const hvcc=[1,1,0x60,0,0,0,0xb0,0,0,0,0,0,93,...Array(10).fill(0)];
 assert.equal(config(2,hvcc).configuration.codec,'hev1.1.6.L93.b0');
 const annex=[0,0,1,66,1,1,...hvcc.slice(1,13)];const c=config(2,annex);assert.equal(c.configuration.codec,'hev1.1.6.L93.b0');assert.equal(c.configuration.description,undefined);
});
test('VP8/VP9 and AV1 use their own configuration contracts',()=>{
 assert.equal(config(3).configuration.codec,'vp8');
 assert.equal(config(4,[],{profile:2,depth:10}).configuration.codec,'vp09.02.10.10');
 const c=config(5,[0x81,8,0x40,0,0x0a,1,0]);assert.equal(c.configuration.codec,'av01.0.08M.10');assert.equal(c.configuration.description,undefined);assert.deepEqual([...c.prefix],[0x0a,1,0]);
});
test('Unknown configurations and resource limits fail explicitly',()=>{
 assert.throws(()=>config(99),/no WebCodecs/);assert.throws(()=>config(1),/SPS/);assert.throws(()=>config(4),/profile/);assert.throws(()=>config(5),/profile/);assert.throws(()=>config(3,[],{width:4096}),/bounds/);
});
test('VP9 packet metadata comes from the key header when container metadata is absent',async()=>{
 const {vp9PacketConfig}=await import('../web/video-codec-config.js');
 assert.deepEqual(vp9PacketConfig(Uint8Array.from([0x82,0x49,0x83,0x42,0])),{profile:0,depth:8});
 assert.deepEqual(vp9PacketConfig(Uint8Array.from([0x92,0x49,0x83,0x42,0x80])),{profile:2,depth:12});
 assert.throws(()=>vp9PacketConfig(Uint8Array.from([0x86,0x49,0x83,0x42])),/key frame/);
 assert.throws(()=>vp9PacketConfig(Uint8Array.from([0x82,0x49])),/Truncated/);
});
