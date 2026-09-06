import {test} from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFile} from 'node:fs/promises';
const source=await readFile(new URL('../web/audio-worklet.js',import.meta.url),'utf8');
function setup(capacity=512) {
  let Processor;
  vm.runInNewContext(source,{AudioWorkletProcessor:class {port={};},registerProcessor:(_name,type)=>Processor=type,Int32Array,Float32Array,Atomics,Math});
  const buffer=new SharedArrayBuffer(64+capacity*8);
  const h=new Int32Array(buffer,0,16),pcm=new Float32Array(buffer,64);
  const processor=new Processor({processorOptions:{buffer,capacity}});
  const render=(size=128)=>{const out=[new Float32Array(size),new Float32Array(size)];const active=processor.process([], [out]);return {out,active};};
  render();
  return {h,pcm,processor,render};
}
test('PCM ring wraps and handles actual output quantum length',()=>{
  const {h,pcm,render}=setup();
  h[1]=480;h[0]=560;h[2]=1;
  for(let i=0;i<80;i++){const at=((480+i)%512)*2;pcm[at]=i/100;pcm[at+1]=-i/100;}
  const {out}=render(80);
  for(let i=0;i<80;i++){assert.equal(out[0][i],Math.fround(i/100));assert.equal(out[1][i],Math.fround(-i/100));}
  assert.equal(h[1],560);assert.equal(h[5],80);
});
test('underrun silence never advances media consumption',()=>{
  const {h,pcm,render}=setup();h[0]=12;h[2]=1;pcm.fill(.25);
  const {out}=render(256);
  assert.deepEqual(Array.from(out[0].slice(0,12)),Array(12).fill(.25));
  assert.ok(out[0].slice(12).every(v=>v===0));assert.equal(h[5],12);assert.equal(h[1],12);
  render(256);assert.equal(h[5],12);assert.equal(h[1],12);assert.equal(h[6],2);
});
test('pause and generation reset suppress queued stale PCM',()=>{
  const {h,pcm,render}=setup();h[0]=128;pcm.fill(.5);
  assert.ok(render().out[0].every(v=>v===0));assert.equal(h[5],0);
  h[2]=1;render(64);assert.equal(h[5],64);
  h[2]=0;h[0]=0;h[3]=2;
  assert.ok(render().out[0].every(v=>v===0));assert.equal(h[4],2);assert.equal(h[1],0);
  pcm.fill(-.25);h[0]=32;h[2]=1;
  const {out}=render(32);assert.ok(out[0].every(v=>v===-.25));assert.equal(h[5],96);
});
test('closed output processor releases its processing lifetime',()=>{
  const {processor,render}=setup();processor.port.onmessage({data:'close'});assert.equal(render().active,false);
});
