import {test} from 'node:test';
import assert from 'node:assert/strict';
import {drawRetainedVideo} from '../web/retained-video.js';
function geometry(track){const calls=[];const ctx=Object.fromEntries(['save','fillRect','translate','rotate','drawImage','restore'].map(name=>[name,(...args)=>calls.push([name,...args])]));drawRetainedVideo(ctx,{visibleRect:{width:640,height:360},displayWidth:640,displayHeight:360},{width:640,height:480},track);return calls;}
test('16:9 video is centered inside 4:3 canvas',()=>{const c=geometry();assert.deepEqual(c.find(c=>c[0]==='translate'),['translate',320,240]);assert.deepEqual(c.find(c=>c[0]==='drawImage').slice(2),[-320,-180,640,360]);assert.deepEqual(c.find(c=>c[0]==='fillRect'),['fillRect',0,0,640,480]);});
test('anamorphic pixels use the demux sample aspect ratio',()=>{const c=geometry({'demux-par':.75});assert.deepEqual(c.find(c=>c[0]==='drawImage').slice(2),[-320,-240,640,480]);});
test('rotated video fits the canvas and restores subtitle coordinates',()=>{const c=geometry({'demux-rotation':90});assert.equal(c.find(c=>c[0]==='rotate')[1],Math.PI/2);const d=c.find(c=>c[0]==='drawImage').slice(2);assert.ok(Math.abs(d[2]-480)<1e-8);assert.ok(Math.abs(d[3]-270)<1e-8);assert.equal(c.at(-1)[0],'restore');});
