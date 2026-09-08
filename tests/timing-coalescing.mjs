import test from 'node:test';
import assert from 'node:assert/strict';
import {WasmPlayer} from '../web/generated/internal/wasm-player.js';
function setup(){
 const messages=[],player=Object.create(WasmPlayer.prototype);
 player.worker={postMessage:message=>messages.push(message)};
 player.audioContext={baseLatency:.005,outputLatency:.01,state:'running'};
 return {player,messages};
}
test('unchanged observations do not repeatedly wake the engine worker',()=>{
 const {player,messages}=setup();for(let i=0;i<500;i++)player.sendTiming();
 assert.deepEqual(messages,[{type:'timing',latencyUs:15000,running:true}]);
});
test('changed latency and AudioContext state are delivered immediately',()=>{
 const {player,messages}=setup();player.sendTiming();player.audioContext.outputLatency=.05;player.sendTiming();
 player.audioContext.state='suspended';player.sendTiming();player.audioContext.state='running';player.sendTiming();
 assert.deepEqual(messages.slice(1),[{type:'timing',latencyUs:55000,running:true},{type:'timing',latencyUs:55000,running:false},{type:'timing',latencyUs:55000,running:true}]);
});
test('post-initialization handoff republishes state even if an early message was ignored',()=>{
 const {player,messages}=setup();player.sendTiming();messages.length=0;
 player.sendTiming(true);assert.deepEqual(messages,[{type:'timing',latencyUs:15000,running:true}]);
 player.sendTiming();assert.equal(messages.length,1);
});
test('destroyed players ignore even a forced late timing observation',()=>{
 const {player,messages}=setup();player.destroyed=true;player.sendTiming(true);
 assert.deepEqual(messages,[]);
});
