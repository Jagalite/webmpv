import {test} from 'node:test';import assert from 'node:assert/strict';
import {nativeRejection} from '../web/generated/internal/selection.js';
const settings={aid:'auto',sid:'auto',subtitles:true},video={canPlayType:()=> 'probably'};
const v={id:'1',index:0,type:'video',codec:'h264'},a={id:'1',index:1,type:'audio',codec:'aac',aacObject:2,default:true};
const reason=(tracks,s={})=>nativeRejection({tracks,duration:10},{...settings,...s},video);
test('Native checks the selected audio, not every available track',()=>{
 const other={id:'2',index:2,type:'audio',codec:'dts'};
 assert.equal(reason([v,a,other]),undefined);
 assert.match(reason([v,a,other],{aid:'2'}),/dts/);
 assert.match(reason([v,a],{aid:'3'}),/not found/);
});
test('Disabled subtitles do not disqualify Native; enabled embedded subtitles do',()=>{
 const sub={id:'1',index:2,type:'sub',codec:'ass'};
 assert.match(reason([v,a,sub]),/subtitles/);
 assert.equal(reason([v,a,sub],{subtitles:false}),undefined);
 assert.equal(reason([v,a,sub],{sid:'no'}),undefined);
});
test('Unknown audio profiles and unsupported browser MIME fail qualification',()=>{
 assert.match(reason([v,{...a,aacObject:0}]),/AAC profile/);
 assert.match(nativeRejection({tracks:[v,a],duration:10},settings,{canPlayType:()=>''}),/Browser/);
});

test('Native packaging checks include MP4 for VP9 with AAC and platform Dolby audio',()=>{
 const onlyMP4={canPlayType:mime=>mime.startsWith('video/mp4')?'probably':''};
 assert.equal(nativeRejection({tracks:[{...v,codec:'vp9'},a],duration:10},settings,onlyMP4),undefined);
 assert.equal(reason([v,{...a,codec:'eac3'}]),undefined);
});

test('AAC ASC profiles are probed with their actual object type',()=>{
 const mimes=[];
 assert.equal(nativeRejection({tracks:[v,{...a,aacObject:5}],duration:10},settings,{canPlayType:mime=>{mimes.push(mime);return 'probably';}}),undefined);
 assert.ok(mimes[0].includes('mp4a.40.5'));
});

test('exact inspected codec strings avoid Firefox generic AVC false rejection',()=>{
 const exact={canPlayType:m=>m==='video/mp4; codecs="avc1.64001e,mp4a.40.2"'?'probably':''};
 assert.equal(nativeRejection({tracks:[{...v,codecString:'avc1.64001e'},a],duration:1},settings,exact),undefined);
});
