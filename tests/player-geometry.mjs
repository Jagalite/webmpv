import {test} from 'node:test';
import assert from 'node:assert/strict';
import {displayAspect, outputDimensions} from '../web/player-geometry.js';
test('display dimensions include PAR once and apply rotation once', () => {
  assert.equal(displayAspect({dw:768,dh:576,par:16/15,rotate:0}),4/3);
  assert.ok(Math.abs(displayAspect({dw:768,dh:576,rotate:90})-3/4)<1e-12);
  assert.ok(Math.abs(displayAspect({w:720,h:576,par:16/15,rotate:270})-3/4)<1e-12);
  assert.ok(Math.abs(displayAspect(null,{'demux-w':320,'demux-h':240,'demux-par':1,'demux-rotation':-90})-3/4)<1e-12);
});
test('missing geometry does not invent a media aspect ratio', () => {
  assert.equal(displayAspect(null,null),undefined);
  assert.equal(displayAspect({w:0,h:1080}),undefined);
  assert.equal(displayAspect({w:NaN,h:1080}),undefined);
});
test('canvas dimensions preserve portrait, square, wide and anamorphic ratios within engine limits', () => {
  for(const ratio of [9/16,1,4/3,16/9,2.35,32/9]) {
    const {width,height}=outputDimensions(ratio);
    assert.ok(width<=1920 && height<=1080 && width>0 && height>0);
    assert.ok(Math.abs(width/height-ratio)<.01);
  }
  assert.deepEqual(outputDimensions(4/3),{width:1440,height:1080});
  assert.deepEqual(outputDimensions(9/16),{width:608,height:1080});
});
