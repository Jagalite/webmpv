import createEngine from './engine/player.mjs';

let engine, canvas, context, timer, audio, pcm, nativeAudio, epoch = -1, forwarded = 0;
let rendered = 0, ticks = 0, force = true, closing = false;
const CAPACITY = 8192;
const post = message => self.postMessage(message);
function pumpAudio() {
  // Refresh views after every possible Wasm memory growth.
  const h = engine.HEAPU32;
  const at = nativeAudio >>> 2;
  const nextEpoch = Atomics.load(h, at + 3);
  if (nextEpoch & 1) return;
  if (epoch !== nextEpoch) {
    epoch = nextEpoch;
    forwarded = 0;
    Atomics.store(audio, 2, 0);
    Atomics.store(audio, 0, 0);
    Atomics.store(audio, 3, epoch);
    return;
  }
  if (Atomics.load(audio, 4) !== epoch) return;
  const consumed = Atomics.load(audio, 1) >>> 0;
  Atomics.store(h, at + 7, 0);
  Atomics.store(h, at + 1, consumed);
  Atomics.store(h, at + 7, epoch);
  const written = Atomics.load(h, at);
  const count = (written - forwarded) >>> 0;
  if (Atomics.load(h, at + 3) !== epoch) return;
  if (count > CAPACITY) throw new Error('PCM capacity invariant violated');
  const source = (nativeAudio + 32) >>> 2;
  for (let i = 0; i < count; i++) {
    const index = ((forwarded + i) % CAPACITY) * 2;
    pcm[index] = engine.HEAPF32[source + index];
    pcm[index + 1] = engine.HEAPF32[source + index + 1];
  }
  // A reset during the copy discards this batch before publishing it.
  if (Atomics.load(h, at + 3) !== epoch) return;
  forwarded = written;
  Atomics.store(audio, 0, written);
  Atomics.store(audio, 2, Atomics.load(h, at + 2));
}
function tick() {
  if (closing) return;
  try {
    pumpAudio();
    for (let i = 0; i < 64; i++) {
      const ptr = engine._web_event();
      if (!ptr) break;
      const event = JSON.parse(engine.UTF8ToString(ptr));
      engine._free(ptr);
      post({type:'event', event});
    }
    const ptr = engine._web_render(canvas.width, canvas.height, +force);
    force = false;
    if (ptr) {
      const bytes = new Uint8ClampedArray(engine.HEAPU8.subarray(ptr, ptr + canvas.width * canvas.height * 4));
      for (let i = 3; i < bytes.length; i += 4) bytes[i] = 255;
      context.putImageData(new ImageData(bytes, canvas.width, canvas.height), 0, 0);
      engine._web_presented();
      rendered++;
    }
    if (++ticks % 40 === 0) post({type:'diagnostics', data:{rendered, heapBytes:engine.HEAPU8.byteLength, epoch, path:'wasm', queuedFrames:(Atomics.load(audio,0)-Atomics.load(audio,1))>>>0}});
  } catch (error) { clearInterval(timer); post({type:'error',message:String(error.stack || error)}); }
}
self.onmessage = async ({data}) => {
  try {
    if (data.type === 'init') {
      if (data.disableBrowserCodecs) for (const name of ['VideoDecoder','AudioDecoder','VideoFrame']) Object.defineProperty(globalThis,name,{value:undefined, configurable:true});
      canvas = data.canvas;
      context = canvas.getContext('2d', {alpha:false});
      audio = new Int32Array(data.audio, 0, 16);
      pcm = new Float32Array(data.audio, 64);
      engine = await createEngine({printErr:message=>post({type:'log',message}),print:message=>post({type:'log',message})});
      if (closing) return;
      engine.FS.mkdir('/fonts');
      engine.FS.writeFile('/fonts/DejaVuSans.ttf', new Uint8Array(data.font));
      const fontSize=engine.FS.stat('/fonts/DejaVuSans.ttf').size;
      if(Number(fontSize) !== data.font.byteLength) throw new Error('Subtitle font write failed');
      const result = engine._web_create(data.sampleRate);
      if (result < 0) throw new Error(`mpv initialization failed: ${result}`);
      nativeAudio = engine._web_audio_ptr();
      timer = setInterval(tick, 5);
      post({type:'ready', browserCodecsAbsent:['VideoDecoder','AudioDecoder','VideoFrame'].every(name=>typeof globalThis[name]==='undefined')});
    } else if (data.type === 'timing' && engine) {
      Atomics.store(engine.HEAPU32, (nativeAudio >>> 2) + 5, data.latencyUs);
      Atomics.store(engine.HEAPU32, (nativeAudio >>> 2) + 6, +data.running);
    } else if (data.type === 'open') {
      if (data.bytes.byteLength > 32 * 1024 * 1024) throw new Error('M0 local fixture limit is 32 MiB');
      try {engine.FS.unlink('/media.mkv');} catch { /* First open. */ }
      engine.FS.writeFile('/media.mkv', new Uint8Array(data.bytes));
      if(Number(engine.FS.stat('/media.mkv').size) !== data.bytes.byteLength) throw new Error('Local media write failed');
      submit(data.id, ['loadfile','/media.mkv','replace']);
    } else if (data.type === 'command') submit(data.id,data.args);
    else if (data.type === 'resize') {canvas.width=data.width;canvas.height=data.height;force=true;}
    else if (data.type === 'destroy') {
      closing = true;
      clearInterval(timer);
      if (audio) Atomics.store(audio,2,0);
      engine?._web_destroy();
      post({type:'destroyed'});
    }
  } catch (error) {post({type:'error',id:data.id,message:String(error.stack || error)});}
};
function submit(id,args) {
  if (!engine || closing) throw new Error('Player is unavailable');
  if (args.length > 4 || !args.length) throw new Error('Invalid command arity');
  const padded = [...args];
  while (padded.length < 4) padded.push(null);
  const result = engine.ccall('web_command_args','number',['number','string','string','string','string'],[id,...padded]);
  if (result < 0) throw new Error(`mpv command failed: ${result}`);
}
