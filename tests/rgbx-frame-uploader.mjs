import test from 'node:test';
import assert from 'node:assert/strict';
import {RGBXFrameUploader} from '../experiments/playback-performance/rgbx-frame/uploader.js';
test('absent VideoFrame API retains the existing fallback',()=>{
 const upload=new RGBXFrameUploader(null);assert.equal(upload.draw({},new Uint8Array(),2,2,0),false);assert.equal(upload.stats.created,0);
});
test('successful uploads close every owned raw frame',()=>{
 let closed=0,drawn=0;
 class Frame{constructor(bytes,options){assert.equal(options.format,'RGBX');assert.equal(options.timestamp,123);}close(){closed++;}}
 const upload=new RGBXFrameUploader(Frame),context={drawImage(frame,x,y){assert.ok(frame instanceof Frame);assert.deepEqual([x,y],[0,0]);drawn++;}};
 for(let n=0;n<100;n++)assert.equal(upload.draw(context,new Uint8Array(16),2,2,123),true);
 assert.equal(closed,100);assert.equal(drawn,100);assert.deepEqual(upload.stats,{created:100,closed:100,drawn:100,failures:0});
});
test('constructor failure selects fallback and is not retried every frame',()=>{
 let attempts=0;class Frame{constructor(){attempts++;throw Error('unsupported shared input');}}
 const upload=new RGBXFrameUploader(Frame);for(let n=0;n<3;n++)assert.equal(upload.draw({},new Uint8Array(),2,2,0),false);
 assert.equal(attempts,1);assert.equal(upload.stats.failures,1);assert.equal(upload.stats.closed,0);
});
test('draw failure still closes the frame before switching to fallback',()=>{
 let closed=0;class Frame{close(){closed++;}}
 const upload=new RGBXFrameUploader(Frame);assert.equal(upload.draw({drawImage(){throw Error('draw rejected');}},new Uint8Array(16),2,2,0),false);
 assert.equal(closed,1);assert.equal(upload.active,false);assert.equal(upload.stats.created,upload.stats.closed);
});
test('canvas upload can precede a valid playback timestamp',()=>{
 let timestamp;class Frame{constructor(bytes,options){timestamp=options.timestamp;}close(){}}
 const upload=new RGBXFrameUploader(Frame);assert.equal(upload.draw({drawImage(){}},new Uint8Array(16),2,2),true);assert.equal(timestamp,0);
});
