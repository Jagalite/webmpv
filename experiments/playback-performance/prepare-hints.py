"""Isolated decoder-ready hints; legacy workers retain the original mailbox path."""
from pathlib import Path
import json
out=Path('build/playback-performance/decoder-hints');out.mkdir(parents=True,exist_ok=True)
s=Path('native/browser_decoder_bridge.h').read_text().replace('int full_range, reserved[3];','int full_range;\n    _Atomic int receive_hint, hint_version;\n    int reserved;')
(out/'browser_decoder_bridge.h').write_text(s)
s=Path('build/playback-performance/source-baseline/native/vd_browser.c').read_text().replace('        result=request(4);','''        // A compatible decoder worker publishes empty/EOF/error states before waking mpv.
        // Positive readiness still uses the serialized mailbox to take frame ownership.
        int hint=atomic_load(&web_decoder.hint_version)==1?atomic_load(&web_decoder.receive_hint):1;
        result=hint>0?request(4):hint;''')
s=s.replace('static void process(struct mp_filter *f){struct browser_priv *p=f->priv;lavc_process(f,&p->state,send,receive);}', 'static void process(struct mp_filter *f){\n    struct browser_priv *p=f->priv;\n    // lavc_process retries empty results immediately. Wait for the existing\n    // browser-output wakeup while decoded work is pending, instead of spinning.\n    if(p->browser && atomic_load(&web_decoder.hint_version)==1 &&\n       atomic_load(&web_decoder.receive_hint)==0)return;\n    lavc_process(f,&p->state,send,receive);\n}')
(out/'vd_browser.c').write_text(s)
s=Path('build/playback-performance/baseline/web/retained-decoder-worker.js').read_text()
s=s.replace('function closeFrame(frame)', '''function publishHint(){
 if(!header)return;
 const hint=failure||!decoder?IO:queue.length?1:draining?(flushed?EOF:0):submitted-consumed>=8?0:AGAIN;
 Atomics.store(header,13,hint);
}
function checkWatchdog(){
 if(decoder&&!failure&&!queue.length&&(draining||submitted-consumed>=8)&&submitted>consumed&&performance.now()-lastProgress>3000){
  failure='Decoder output watchdog';stats.errors++;publishHint();postMessage({wakeup:true});
 }
}
function closeFrame(frame)''')
s=s.replace('failure=null;}','failure=null;publishHint();}')
s=s.replace('failure=String(error);stats.errors++;postMessage({wakeup:true});','failure=String(error);stats.errors++;publishHint();postMessage({wakeup:true});')
s=s.replace("failure='Frame queue limit';stats.errors++;return;", "failure='Frame queue limit';stats.errors++;publishHint();postMessage({wakeup:true});return;")
s=s.replace('queue.push(frame);postMessage({wakeup:true});','queue.push(frame);publishHint();postMessage({wakeup:true});')
s=s.replace('decoder.configure(configuration);lastProgress=performance.now();','decoder.configure(configuration);lastProgress=performance.now();publishHint();')
s=s.replace('faultAfter=data.faultAfter??0;', 'Atomics.store(header,13,0);Atomics.store(header,14,1);\n faultAfter=data.faultAfter??0;')
s=s.replace(' if(!header)return;\n const ticket=', ' if(!header)return;\n checkWatchdog();\n const ticket=')
s=s.replace('flushed=true;postMessage({wakeup:true});', 'flushed=true;publishHint();postMessage({wakeup:true});')
s=s.replace('failure=String(error);postMessage({wakeup:true});', 'failure=String(error);publishHint();postMessage({wakeup:true});')
s=s.replace(' finally{\n  if(valid())', ' finally{\n  publishHint();\n  if(valid())')
(out/'worker.js').write_text(s)
(out/'overrides.json').write_text(json.dumps({'web/retained-decoder-worker.js':str(out/'worker.js'),'web/engine-retained-subs/player.mjs':str(out/'player.mjs'),'web/engine-retained-subs/player.wasm':str(out/'player.wasm')},indent=2)+'\n')
