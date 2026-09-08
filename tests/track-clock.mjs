import test from 'node:test';
import assert from 'node:assert/strict';
import {createTrackClock} from '../experiments/playback-performance/track/clock.js';
test('frame clocks match either message order without an epoch subtraction',()=>{
 const clock=createTrackClock();clock.submit({pts:1234567,wall:1788880000100});clock.present(1234567.000001,1788880000117);
 clock.present(1267900,1788880000150);clock.submit({pts:1267900,wall:1788880000133});
 assert.equal(clock.stats.delayCount,2);assert.equal(clock.stats.delaySum,34);assert.equal(clock.stats.delayMax,17);assert.deepEqual(clock.pending(),{submissions:0,presentations:0});
});
test('seek reset drops unmatched older frame times and storage remains bounded',()=>{
 const clock=createTrackClock(3);for(let n=0;n<8;n++)clock.submit({pts:n,wall:n*33});assert.equal(clock.pending().submissions,3);assert.equal(clock.stats.evictedSubmissions,5);
 clock.reset();clock.present(0,500);assert.equal(clock.stats.delayCount,0);clock.submit({pts:0,wall:490});assert.equal(clock.stats.delayMax,10);assert.equal(clock.stats.delayCount,1);
 for(let n=1;n<9;n++)clock.present(n,500+n);assert.equal(clock.pending().presentations,3);assert.equal(clock.stats.evictedPresentations,5);
 assert.throws(()=>clock.submit({pts:NaN,wall:0}));assert.throws(()=>clock.present(0,Infinity));
});
