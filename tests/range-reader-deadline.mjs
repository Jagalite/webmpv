import {test} from 'node:test';
import assert from 'node:assert/strict';
import {setImmediate as turn} from 'node:timers/promises';
import {pathToFileURL} from 'node:url';
// The same regression suite can exercise the extracted release archive.
const {RangeReader}=await import(process.env.RANGE_READER_MODULE
  ? pathToFileURL(process.env.RANGE_READER_MODULE).href : '../web/range-reader.js');
const options={url:'https://media.example/movie',blockBytes:1024,cacheBytes:2048};
function clock(t){
  let now=0;
  t.mock.timers.enable({apis:['setTimeout']});
  t.mock.method(performance,'now',()=>now);
  return async ms=>{now+=ms;t.mock.timers.tick(ms);await turn();};
}
function trickle(t,{delay=750,chunk=16}={}){
  const state={bytes:0,aborts:0,cancels:0,requests:0};
  t.mock.method(globalThis,'fetch',async(_url,{signal,headers})=>{
    state.requests++;let timer,stopped=false;
    const offset=Number(/^bytes=(\d+)-/.exec(headers.get('Range'))[1]);
    const body=new ReadableStream({
      start(controller){signal.addEventListener('abort',()=>{state.aborts++;stopped=true;clearTimeout(timer);controller.error(new DOMException('Aborted','AbortError'));},{once:true});},
      pull(controller){return new Promise(resolve=>{timer=setTimeout(()=>{
        if(!stopped){const bytes=new Uint8Array(chunk).fill(7);state.bytes+=chunk;controller.enqueue(bytes);}resolve();
      },delay);});},
      cancel(){stopped=true;clearTimeout(timer);state.cancels++;}
    });
    return new Response(body,{status:206,headers:{'Content-Range':`bytes ${offset}-${offset+1023}/8192`,'Content-Length':'1024',ETag:'"stable"'}});
  });return state;
}
test('successful trickle expires at the absolute 15-second deadline and publishes no partial block',async t=>{
  const advance=clock(t),state=trickle(t),r=new RangeReader(options);
  let settled=false;const read=assert.rejects(r.read(0n,1024),/Media read retry deadline exceeded/).then(()=>settled=true);
  await turn();
  for(let i=0;i<19;i++){await advance(750);assert.equal(settled,false);}
  assert.ok(state.bytes>0);assert.equal(state.aborts,0,'progress should keep idle timeout alive');
  await advance(750);assert.equal(settled,true,'the operation must settle at 15 seconds despite progress');await read;
  assert.equal(state.requests,1);assert.equal(state.aborts,1);
  assert.equal(r.cache.size,0);assert.equal(r.stats.cacheBytes,0);assert.equal(r.stats.activeBytes,0);assert.equal(r.busy,false);
  r.close();await advance(30000);assert.equal(state.requests,1);
});
for(const action of ['beginEpoch','close'])test(`${action} promptly cancels a progressing read without waiting for its deadline`,async t=>{
  const advance=clock(t),state=trickle(t),r=new RangeReader(options);
  const read=assert.rejects(r.read(0n,1024),{name:'AbortError'});
  await turn();await advance(750);r[action]();await read;
  assert.equal(state.aborts,1);assert.equal(r.cache.size,0);assert.equal(r.busy,false);
  await advance(30000);assert.equal(state.requests,1);
  if(action==='close')await assert.rejects(r.read(0n,1),/closed/);
  else{
    t.mock.method(globalThis,'fetch',async()=>new Response(new Uint8Array(1024).fill(9),{status:206,headers:{'Content-Range':'bytes 0-1023/8192',ETag:'"stable"'}}));
    assert.equal((await r.read(0n,1))[0],9,'replacement epoch is reusable');r.close();
  }
});
for(const action of ['deadline','beginEpoch','close'])test(`${action} settles a stalled credential refresh and ignores late renewal`,async t=>{
  const advance=clock(t);let renew;
  t.mock.method(globalThis,'fetch',async()=>new Response(null,{status:401}));
  const r=new RangeReader(options,()=>new Promise(resolve=>renew=resolve));
  const read=assert.rejects(r.open(),action==='deadline'?/deadline exceeded/:{name:'AbortError'});
  await turn();assert.equal(typeof renew,'function');
  if(action==='deadline')await advance(15000);else r[action]();await read;
  renew({url:'https://media.example/replacement'});await turn();
  assert.equal(r.options.url,options.url);assert.equal(r.busy,false);assert.equal(r.cache.size,0);r.close();
});
test('retry-after cannot schedule a fresh request beyond the operation deadline',async t=>{
  const advance=clock(t);let requests=0;
  t.mock.method(globalThis,'fetch',async()=>{requests++;return new Response(null,{status:503,headers:{'Retry-After':'60'}});});
  const r=new RangeReader(options),read=assert.rejects(r.open(),/deadline exceeded/);
  await turn();await advance(15000);await read;assert.equal(requests,1);assert.equal(r.busy,false);r.close();
});
test('successful completion clears the operation deadline and keeps the cache reusable',async t=>{
  const advance=clock(t);let aborts=0;
  t.mock.method(globalThis,'fetch',async(_url,{signal})=>{
    signal.addEventListener('abort',()=>aborts++);
    return new Response(new Uint8Array(1024).fill(3),{status:206,headers:{'Content-Range':'bytes 0-1023/8192',ETag:'"stable"'}});
  });
  const r=new RangeReader(options);assert.equal((await r.read(0n,10))[0],3);
  await advance(30000);assert.equal(aborts,0);assert.equal(r.operation,null);assert.equal(r.controller,null);
  assert.equal((await r.read(5n,10))[0],3);assert.equal(r.stats.requests,1);r.close();
});
