import test from 'node:test';
import assert from 'node:assert/strict';
import {ResourceLoader} from '../web/resource-loader.js';
import {validateVODManifest} from '../web/vod-manifest.js';
const encode=s=>new TextEncoder().encode(s);
const options={url:'https://media.example/catalog/root.m3u8',format:'hls'};
const playlist='#EXTM3U\n#EXTINF:2,\npart.ts\n#EXT-X-ENDLIST\n';
const originalFetch=globalThis.fetch;
function mock(fn){globalThis.fetch=fn;}
test.afterEach(()=>{globalThis.fetch=originalFetch;});
test('ordinary 200 resource, relative URL, bounded reads and close accounting',async()=>{
  mock(async(url,init)=>{assert.equal(url,'https://media.example/catalog/part.ts');assert.equal(init.headers.has('Range'),false);return new Response(encode('abcdef'));});
  const loader=new ResourceLoader(options);const info=await loader.open('part.ts');
  assert.equal(info.size,'6');assert.equal(new TextDecoder().decode(loader.read(info.id,2n,2)),'cd');
  assert.equal(loader.read(info.id,6n,2).length,0);assert.equal(loader.stats.retainedBytes,6);
  loader.closeHandle(info.id);assert.equal(loader.stats.handles,0);assert.equal(loader.stats.retainedBytes,0);loader.close();
});
test('explicit range preserves absolute resource offsets and total size',async()=>{
  mock(async(url,init)=>{assert.equal(init.headers.get('Range'),'bytes=10-13');return new Response('abcd',{status:206,headers:{'Content-Range':'bytes 10-13/100','Content-Length':'4'}});});
  const loader=new ResourceLoader(options);const info=await loader.open('part.m4s',{start:10n,end:14n});
  assert.equal(info.size,'100');assert.equal(new TextDecoder().decode(loader.read(info.id,11n,2)),'bc');
  assert.throws(()=>loader.read(info.id,0n,1));loader.close();
});
test('requested ranges reject 200, malformed ranges and changed lengths',async()=>{
  for(const response of [new Response('abcd'),new Response('abcd',{status:206,headers:{'Content-Range':'bytes 9-12/100'}}),new Response('abcd',{status:206,headers:{'Content-Range':'bytes 10-13/100','Content-Length':'3'}})]){
    mock(async()=>response);const loader=new ResourceLoader(options);await assert.rejects(loader.open('x',{start:10n,end:14n}));loader.close();
  }
});
test('origin, protocol, embedded credentials and URL length are checked before fetch',async()=>{
  let requests=0;mock(async()=>{requests++;return new Response('x');});const loader=new ResourceLoader(options);
  for(const value of ['https://evil.example/x','file:///x','data:text/plain,x','https://u:p@media.example/x','x'.repeat(4097)])await assert.rejects(loader.open(value));
  assert.equal(requests,0);loader.close();
});
test('nested authorization refresh receives resource URL and updates only that request',async()=>{
  const urls=[];mock(async(url,init)=>{urls.push(url);return init.headers.get('Authorization')==='Bearer new'?new Response('ok'):new Response('no',{status:401});});
  const loader=new ResourceLoader(options,async resource=>{assert.equal(resource.url,'https://media.example/catalog/part.ts');return {headers:{Authorization:'Bearer new'}};});
  await loader.open('part.ts');assert.deepEqual(urls,['https://media.example/catalog/part.ts','https://media.example/catalog/part.ts']);loader.close();
});
test('refresh cannot redirect credentials to an unapproved origin',async()=>{
  mock(async()=>new Response('no',{status:401}));const loader=new ResourceLoader(options,async()=>({url:'https://evil.example/part.ts'}));
  await assert.rejects(loader.open('part.ts'),/not allowed/);loader.close();
});
test('bounded transient HTTP retry and truncation recovery',async()=>{
  let calls=0;mock(async()=>++calls===1?new Response('retry',{status:503}):calls===2?new Response('x',{headers:{'Content-Length':'2'}}):new Response('ok'));
  const loader=new ResourceLoader(options);const info=await loader.open('part.ts');assert.equal(info.length,2);assert.equal(loader.stats.retries,2);loader.close();
});
test('unknown-length bodies cannot exceed media resource cap',async()=>{
  mock(async()=>new Response(new Uint8Array(8*1024*1024+1)));const loader=new ResourceLoader(options);
  await assert.rejects(loader.open('part.ts'),/size limit/);assert.equal(loader.stats.retainedBytes,0);loader.close();
});
test('aggregate retention limit is enforced across handles and reclaimed on close',async()=>{
  mock(async()=>new Response(new Uint8Array(8*1024*1024)));const loader=new ResourceLoader(options);
  const a=await loader.open('a.ts');await loader.open('b.ts');await assert.rejects(loader.open('c.ts'),/memory budget/);
  loader.closeHandle(a.id);await loader.open('c.ts');assert.equal(loader.stats.peakRetainedBytes,16*1024*1024);loader.close();assert.equal(loader.stats.retainedBytes,0);
});
test('handle count is bounded independently of body size',async()=>{
  mock(async()=>new Response('x'));const loader=new ResourceLoader(options);for(let i=0;i<16;i++)await loader.open(`${i}.ts`);
  await assert.rejects(loader.open('next.ts'),/count limit/);loader.close();
});
test('destroy cancels pending authorization and rejects stale completion',async()=>{
  mock(async()=>new Response('no',{status:401}));let refreshStarted;const started=new Promise(r=>refreshStarted=r);
  const loader=new ResourceLoader(options,()=>{refreshStarted();return new Promise(()=>{});});
  const request=loader.open('part.ts');await started;loader.close();await assert.rejects(request,{name:'AbortError'});assert.equal(loader.stats.handles,0);
});
test('epoch cancellation discards a response even if transport ignores abort',async()=>{
  let respond;mock(()=>new Promise(r=>respond=r));const loader=new ResourceLoader(options);const request=loader.open('part.ts');
  loader.beginEpoch();respond(new Response('late'));await assert.rejects(request,{name:'AbortError'});assert.equal(loader.stats.handles,0);loader.close();
});
test('manifest admission rejects live, encrypted and adaptive HLS',async()=>{
  validateVODManifest(encode(playlist),'hls');
  for(const value of [playlist.replace('#EXT-X-ENDLIST',''),playlist+'#EXT-X-KEY:METHOD=AES-128\n','#EXTM3U\n#EXT-X-STREAM-INF:BANDWIDTH=1\na\n#EXT-X-STREAM-INF:BANDWIDTH=2\nb'])assert.throws(()=>validateVODManifest(encode(value),'hls'));
  mock(async()=>new Response(playlist));const loader=new ResourceLoader(options);await loader.open(options.url,{manifest:true});loader.close();
});
test('DASH admission accepts fixed static and rejects live, adaptive, entities and multiple periods',()=>{
  const mpd='<MPD type="static"><Period><AdaptationSet><Representation id="v"/></AdaptationSet></Period></MPD>';
  validateVODManifest(encode(mpd),'dash');
  for(const value of [mpd.replace('static','dynamic'),mpd.replace('<Representation','<Representation id="x"/><Representation'),mpd.replace('</MPD>','<Period/></MPD>'),'<!DOCTYPE x>'+mpd,mpd.replace('<Representation','<ContentProtection/><Representation')])assert.throws(()=>validateVODManifest(encode(value),'dash'));
});
test('HLS subtitles combine multiple segments into a bounded virtual resource',async()=>{
  const master='#EXTM3U\n#EXT-X-MEDIA:TYPE=SUBTITLES,GROUP-ID="s",URI="subs.m3u8"\n#EXT-X-STREAM-INF:BANDWIDTH=1,SUBTITLES="s"\nvideo.m3u8\n';
  const sub='#EXTM3U\n#EXTINF:2,\nfirst.vtt\n#EXTINF:2,\nsecond.vtt\n#EXT-X-ENDLIST\n';
  mock(async url=>new Response(url.endsWith('root.m3u8')?master:url.endsWith('subs.m3u8')?sub:`WEBVTT\nX-TIMESTAMP-MAP=LOCAL:00:00:00.000,MPEGTS:${url.endsWith('first.vtt')?0:180000}\n\n00:00:00.100 --> 00:00:01.900\nCaption\n`));
  const loader=new ResourceLoader(options);await loader.open(options.url,{manifest:true});const info=await loader.open('subs.m3u8');
  const playlist=new TextDecoder().decode(loader.read(info.id,0n,262144));const uri=playlist.split('\n').find(l=>l.startsWith('https:'));const combined=await loader.open(uri);
  const text=new TextDecoder().decode(loader.read(combined.id,0n,262144));assert.ok(text.includes('00:00:02.100'));assert.equal(text.match(/Caption/g).length,2);
  loader.close();assert.equal(loader.virtual.size,0);assert.equal(loader.stats.retainedBytes,0);
});

test('fixed HLS discontinuities remain native timeline input',()=>{
  validateVODManifest(encode(playlist+'\n#EXT-X-DISCONTINUITY'),'hls');
  validateVODManifest(encode(playlist+'\n#EXT-X-DISCONTINUITY\n#EXT-X-MAP:URI="init.mp4"'),'hls');
});
test('DASH timeline and template resource counts are bounded',()=>{
  for(const inner of ['<SegmentTemplate/>','<SegmentTimeline><S d="1" r="10000"/></SegmentTimeline>','<SegmentTimeline><S d="1" r="-1"/></SegmentTimeline>'])assert.throws(()=>validateVODManifest(encode(`<MPD type="static"><Period>${inner}</Period></MPD>`),'dash'));
});
test('virtual resources retain range offsets and reject over-budget mutation atomically',async()=>{
 const loader=new ResourceLoader(options);loader.storeVirtual([['https://media.example/catalog/a.vtt',encode('abcdef')]]);
 const info=await loader.open('a.vtt',{start:2n,end:5n});assert.equal(info.start,'2');assert.equal(info.size,'6');assert.equal(new TextDecoder().decode(loader.read(info.id,2n,3)),'cde');assert.equal(loader.stats.opens,1);
 assert.throws(()=>loader.storeVirtual([['https://media.example/catalog/b',new Uint8Array(4*1024*1024)]]),/budget/);assert.equal(loader.virtual.size,1);
 await assert.rejects(loader.open('a.vtt',{start:3n,end:10n}),/range/);loader.close();assert.equal(loader.stats.retainedBytes,0);
});
test('live sessions keep per-open budgets without a finite lifetime request cap',async()=>{
 mock(async()=>new Response('part'));const live=new ResourceLoader({...options,streaming:{live:true}});live.stats.opens=10000;const info=await live.open('part.ts');assert.equal(info.length,4);live.close();
 const vod=new ResourceLoader(options);vod.stats.opens=10000;await assert.rejects(vod.open('part.ts'),/count limit/);vod.close();
});
