import test from 'node:test';
import assert from 'node:assert/strict';
import {RemuxPlayer} from '../web/native-remux-player.js';

function pump(ranges,extra={}){
 const sent=[],errors=[];
 const p=Object.assign(Object.create(RemuxPlayer.prototype),{
  stopped:false,sb:{updating:false},busy:false,media:{readyState:'open'},
  video:{currentTime:1},timelineBias:1,target:0,targetReady:false,
  ranges:()=>ranges,raps:[],segments:[],pending:null,eof:false,
  stats:{peakBufferedSeconds:0,peakBufferedBytesUpperBound:0,gapSkips:[]},
  worker:{postMessage:m=>sent.push(m)},fail:e=>errors.push(e),...extra
 });
 p.pump();return {sent,errors};
}
test('paused Opus leading gap does not drain the source',()=>{
 const result=pump([[.001,5.581]]);assert.deepEqual(result,{sent:[],errors:[]});
});
test('fragmented future ranges fail before full-source remuxing',()=>{
 const result=pump([[.02,.53],[12.1,12.2]]);assert.equal(result.sent.length,0);assert.match(result.errors[0],/timeline gap/);
});
test('useful short contiguous buffering permits one further batch',()=>{
 const result=pump([[0,2]]);assert.deepEqual(result,{sent:[{type:'next'}],errors:[]});
});

test('small MSE holes advance only a playing stalled output',()=>{
 for(const [paused,readyState,expected] of [[false,2,2.2],[true,2,2],[false,4,2]]){
  const video={currentTime:2,paused,readyState};pump([[0,1],[1.2,3]],{video,targetReady:true});assert.equal(video.currentTime,expected);
 }
 const video={currentTime:2,paused:false,readyState:2};pump([[0,1],[2,4]],{video,targetReady:true});assert.equal(video.currentTime,2);
});
