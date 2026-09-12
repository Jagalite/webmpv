import {test} from 'node:test';
import assert from 'node:assert/strict';
import {prepareDASH,selectHLS,parseXML} from '../web/streaming-manifest.js';
import {validateVODManifest} from '../web/vod-manifest.js';
import {mergeWebVTT} from '../web/segmented-subtitles.js';
const encode=s=>new TextEncoder().encode(s),decode=b=>new TextDecoder().decode(b);
test('HLS chooses one bounded variant without dropping audio or subtitles',()=>{
 const master='#EXTM3U\n#EXT-X-MEDIA:TYPE=AUDIO,GROUP-ID="a",NAME="en",URI="en.m3u8"\n#EXT-X-STREAM-INF:BANDWIDTH=200000,AUDIO="a"\nlow.m3u8\n#EXT-X-STREAM-INF:BANDWIDTH=900000,AUDIO="a"\nhigh.m3u8\n';
 const low=selectHLS(master,{maxBandwidth:300000});assert.ok(low.includes('low.m3u8'));assert.ok(!low.includes('high.m3u8'));assert.ok(low.includes('en.m3u8'));validateVODManifest(encode(low),'hls');
 assert.ok(selectHLS(master,{representation:'1'}).includes('high.m3u8'));
 assert.throws(()=>selectHLS(master,{representation:'missing'}),/unavailable/);
});
test('standard live manifests require explicit admission',()=>{
 const live=encode('#EXTM3U\n#EXT-X-TARGETDURATION:2\n#EXT-X-MEDIA-SEQUENCE:12\n#EXTINF:2,\na.ts\n');
 assert.throws(()=>validateVODManifest(live,'hls'),/finite/);validateVODManifest(live,'hls',{live:true});
 const dash=encode('<MPD type="dynamic"><Period><AdaptationSet><Representation><SegmentTemplate duration="2" media="$Number$.m4s"/></Representation></AdaptationSet></Period></MPD>');
 assert.throws(()=>validateVODManifest(dash,'dash'),/static/);validateVODManifest(dash,'dash',{live:true});
});
const period=(id,start)=>`<Period id="${id}" start="PT${start}S" duration="PT4S"><BaseURL>${id}/</BaseURL><AdaptationSet id="v" contentType="video"><Representation id="low" bandwidth="100" mimeType="video/mp4"><SegmentTemplate timescale="10" initialization="init.m4s" media="$Number%03d$.m4s"><SegmentTimeline><S t="0" d="20" r="1"/></SegmentTimeline></SegmentTemplate></Representation><Representation id="high" bandwidth="200" mimeType="video/mp4"><SegmentTemplate duration="2" initialization="high.m4s" media="high-$Number$.m4s"/></Representation></AdaptationSet></Period>`;
test('all finite DASH periods become indexed discontinuity playlists',()=>{
 const mpd=`<MPD type="static" mediaPresentationDuration="PT8S">${period('one',0)}${period('two',4)}</MPD>`;
 const p=prepareDASH(mpd,'https://media.test/show/manifest.mpd',{maxBandwidth:100});assert.equal(p.format,'hls');
 const playlist=decode([...p.resources.values()][0]);assert.ok(playlist.includes('https://media.test/show/one/001.m4s'));assert.ok(playlist.includes('https://media.test/show/two/002.m4s'));assert.equal(playlist.match(/#EXTINF/g).length,4);assert.equal(playlist.match(/#EXT-X-DISCONTINUITY/g).length,1);
 assert.throws(()=>prepareDASH(mpd.replace('start="PT4S"','start="PT5S"'),'https://media.test/a.mpd'),/contiguous/);
});
test('single DASH period keeps FFmpeg parsing and prunes representations',()=>{
 const p=prepareDASH(`<MPD type="static">${period('one',0)}</MPD>`,'https://media.test/a.mpd',{representation:'high'});
 assert.equal(p.format,'dash');const root=parseXML(decode(p.bytes));const reps=root.children[0].children.find(n=>n.name==='AdaptationSet').children;assert.equal(reps.filter(n=>n.name==='Representation').length,1);assert.equal(reps[0].attrs.id,'high');
 assert.throws(()=>parseXML('<!DOCTYPE MPD><MPD/>'),/declaration/);
});
test('segmented WebVTT preserves payload, maps timestamps and deduplicates cues',()=>{
 const text=(pts)=>`WEBVTT\nX-TIMESTAMP-MAP=LOCAL:00:00:00.000,MPEGTS:${pts}\n\n00:00:00.100 --> 00:00:01.900 align:start\nHello\n`;
 const merged=mergeWebVTT([{text:text(900000),start:0},{text:text(1080000),start:2}]);
 assert.ok(merged.includes('00:00:10.100 --> 00:00:11.900 align:start'));assert.ok(merged.includes('00:00:12.100 --> 00:00:13.900 align:start'));
 assert.equal(mergeWebVTT([{text:text(0)},{text:text(0)}]).match(/Hello/g).length,1);
});
test('unselected HLS rendition groups are not opened',()=>{
 const text='#EXTM3U\n#EXT-X-MEDIA:TYPE=AUDIO,GROUP-ID="a",URI="a.m3u8"\n#EXT-X-MEDIA:TYPE=AUDIO,GROUP-ID="b",URI="b.m3u8"\n#EXT-X-STREAM-INF:BANDWIDTH=10,AUDIO="a"\nlow\n#EXT-X-STREAM-INF:BANDWIDTH=20,AUDIO="b"\nhigh\n';
 const result=selectHLS(text,{maxBandwidth:10});assert.ok(result.includes('a.m3u8'));assert.ok(!result.includes('b.m3u8'));
});
test('DASH SegmentTemplate attributes inherit across period, adaptation and representation',()=>{
 const p=id=>`<Period start="PT${id*2}S" duration="PT2S"><SegmentTemplate timescale="1000" initialization="init.m4s" duration="1000"/><AdaptationSet contentType="video"><SegmentTemplate media="${id}-$Number$.m4s"/><Representation id="v" bandwidth="100" mimeType="video/mp4"><SegmentTemplate startNumber="7"/></Representation></AdaptationSet></Period>`;
 const result=prepareDASH(`<MPD type="static">${p(0)}${p(1)}</MPD>`,'https://media.test/m.mpd');const media=decode([...result.resources.values()][0]);assert.ok(media.includes('/0-7.m4s'));assert.ok(media.includes('/1-8.m4s'));assert.equal(media.match(/#EXTINF:1,/g).length,4);
});
test('malformed XML and unsafe period metadata are rejected before creating resources',()=>{
 for(const xml of ['<MPD/><','<MPD a="1" a="2"/>','<MPD><Period></MPD>','<!ENTITY x "y"><MPD/>'])assert.throws(()=>parseXML(xml));
 assert.throws(()=>prepareDASH(`<MPD type="static">${period('one',0).replace('contentType="video"','contentType="video" lang="en&amp;bad"')}${period('two',4)}</MPD>`,'https://media.test/a.mpd'),/language/);
});
test('WebVTT timestamp discontinuities align the new period without resetting media origin',()=>{
 const part=(mpegts,start,discontinuity)=>({text:`WEBVTT\nX-TIMESTAMP-MAP=LOCAL:00:00:00.000,MPEGTS:${mpegts}\n\n00:00:00.100 --> 00:00:01.900\nCaption\n`,start,discontinuity});
 const text=mergeWebVTT([part(126000,0,false),part(0,2,true)]);assert.ok(text.includes('00:00:01.500 --> 00:00:03.300'));assert.ok(text.includes('00:00:03.500 --> 00:00:05.300'));
});
