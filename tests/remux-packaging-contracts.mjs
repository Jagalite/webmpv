import test from 'node:test';import assert from 'node:assert/strict';
import {remuxPackaging} from '../web/remux-packaging.js';
test('only common selected-track packaging is offered',()=>{
 const c=(v,a,p)=>remuxPackaging(v,a,p).map(x=>x.container);
 assert.deepEqual(c('vp09.00.10.08','opus'),['mp4','webm']);
 assert.deepEqual(c('av01.0.04M.08','opus'),['mp4','webm']);
 assert.deepEqual(c('vp09.00.10.08','mp4a.40.2'),['mp4']);
 assert.deepEqual(c('vp8','vorbis'),['webm']);
 assert.deepEqual(c('avc1.640028','vorbis'),[]);
 assert.deepEqual(c('','opus','webm'),['webm','mp4']);
 assert.deepEqual(c('avc1.640028','mp3'),['mp4']);
 assert.deepEqual(c('',''),[]);
 assert.equal(remuxPackaging('','opus')[0].mime,'audio/mp4; codecs="opus"');
});
