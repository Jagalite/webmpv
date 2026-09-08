"""Retained frames cannot use native software replay; keep legacy mode 1 behavior."""
from pathlib import Path
import json
out=Path('build/playback-performance/decoder-strict');out.mkdir(parents=True,exist_ok=True)
s=Path('build/playback-performance/source-baseline/native/vd_browser.c').read_text()
def replace(old,new):
 global s
 assert s.count(old)==1,old
 s=s.replace(old,new)
replace('    bool browser, replaying, drained, software_open, software_failed;', '    bool browser, replaying, drained, software_open, software_failed;\n    bool retained_only, submitted_keyframe;')
replace('    MP_WARN(f,"Browser decode failed or reached its bound; replaying in software.\\n");', '''    if(p->retained_only){
        // This renderer consumes browser-owned VideoFrames. Software AVFrames
        // cannot satisfy that contract; the public API owns explicit mode changes.
        MP_ERR(f,"Retained browser decode failed. Reopen in software mode.\\n");
        request(5);p->browser=false;p->software_failed=true;
        mp_filter_internal_mark_failed(f);return;
    }
    MP_WARN(f,"Browser decode failed or reached its bound; replaying in software.\\n");''')
replace('    if(p->packet->size>WEB_DEC_PACKET_MAX || p->count>=256 ||\n       p->bytes+p->packet->size>16*1024*1024 || p->packet->pts==AV_NOPTS_VALUE ||', '    if(p->packet->size>WEB_DEC_PACKET_MAX ||\n       (!p->retained_only&&(p->count>=256||p->bytes+p->packet->size>16*1024*1024)) ||\n       p->packet->pts==AV_NOPTS_VALUE ||')
replace('       (!p->count&&!(p->packet->flags&AV_PKT_FLAG_KEY))) {', '       (!p->submitted_keyframe&&!(p->packet->flags&AV_PKT_FLAG_KEY))) {')
replace('    AVPacket *copy=av_packet_clone(p->packet);\n    if(!copy){fallback(f);return AVERROR(EAGAIN);}', '    AVPacket *copy=p->retained_only?NULL:av_packet_clone(p->packet);\n    if(!p->retained_only&&!copy){fallback(f);return AVERROR(EAGAIN);}')
replace('    p->replay[p->count++]=copy;p->bytes+=copy->size;', '    if(copy){p->replay[p->count++]=copy;p->bytes+=copy->size;}\n    if(result>=0)p->submitted_keyframe=true;')
replace('    if(p->browser){\n        int cut=0;', '    if(p->browser&&!p->retained_only){\n        int cut=0;')
replace('    p->delivered=p->recovery_target=AV_NOPTS_VALUE;p->drained=false;p->state=(struct lavc_state){0};', '    p->delivered=p->recovery_target=AV_NOPTS_VALUE;p->drained=false;p->submitted_keyframe=false;p->state=(struct lavc_state){0};')
replace('    struct browser_priv *p=f->priv;p->public.f=f;p->delivered=p->recovery_target=AV_NOPTS_VALUE;', '    struct browser_priv *p=f->priv;p->public.f=f;p->delivered=p->recovery_target=AV_NOPTS_VALUE;\n    p->retained_only=atomic_load(&enabled)==2;')
(out/'vd_browser.c').write_text(s)
worker=Path('build/playback-performance/baseline/web/filter-retained-engine-worker.js').read_text()
assert worker.count('engine._web_decoder_enable(1);')==1
(out/'worker.js').write_text(worker.replace('engine._web_decoder_enable(1);','engine._web_decoder_enable(2);'))
base={'web/filter-retained-engine-worker.js':str(out/'worker.js'),'web/engine-retained-subs/player.mjs':str(out/'player.mjs'),'web/engine-retained-subs/player.wasm':str(out/'player.wasm')}
(out/'overrides.json').write_text(json.dumps(base,indent=2)+'\n')
gpu=Path('build/playback-performance/webgpu/worker.js').read_text()
assert gpu.count('engine._web_decoder_enable(1);')==1
(out/'gpu-worker.js').write_text(gpu.replace('engine._web_decoder_enable(1);','engine._web_decoder_enable(2);'))
base['web/filter-retained-engine-worker.js']=str(out/'gpu-worker.js')
(out/'gpu-overrides.json').write_text(json.dumps(base,indent=2)+'\n')
