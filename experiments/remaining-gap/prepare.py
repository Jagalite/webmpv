from pathlib import Path
p=Path('native/player.c').read_text()
p=p.replace('static int width, height;', '''static int width, height;
static int experiment_skip_render;
EMSCRIPTEN_KEEPALIVE void web_experiment_skip_render(int value) { experiment_skip_render=value; }''')
p=p.replace('    if(w!=width || h!=height) {','''    if(experiment_skip_render) {
        int skip=1,block=0;
        mpv_render_param params[]={{MPV_RENDER_PARAM_SKIP_RENDERING,&skip},{MPV_RENDER_PARAM_BLOCK_FOR_TARGET_TIME,&block},{0}};
        return mpv_render_context_render(renderer,params)<0?0:1;
    }
    if(w!=width || h!=height) {''')
Path('experiments/remaining-gap/player.c').write_text(p)
s=Path('scripts/link.sh').read_text().replace('ROOT=$(cd "$(dirname "$0")/.." && pwd)','ROOT="$PWD"').replace('OUTPUT_DIR=${WEBMPV_ENGINE_DIR:-web/engine}','OUTPUT_DIR=web/engine-gap').replace('native/player.c','experiments/remaining-gap/player.c').replace('python3 scripts/manifest.py','')
Path('experiments/remaining-gap/link.sh').write_text(s)
w=Path('web/ablation-engine-worker.js').read_text()
w=w.replace("const skipCanvas=new URL(self.location.href).searchParams.get('skipCanvas')==='1';", "const skipCanvas=true;const mode=new URL(self.location.href).searchParams.get('mode');")
w=w.replace("'./engine-m4/player.mjs'","'./engine-gap/player.mjs'")
w=w.replace("'./browser-decoder-worker.js'","'./gap-decoder-worker.js?mode='+mode")
w=w.replace('      nativeAudio = engine._web_audio_ptr();',"      engine._web_experiment_skip_render(mode!=='copy-render');\n      nativeAudio = engine._web_audio_ptr();")
w=w.replace('data:{skipCanvas,canvasSubmissions','data:{mode,skipCanvas,canvasSubmissions')
Path('web/gap-engine-worker.js').write_text(w)
d=Path('web/browser-decoder-worker.js').read_text()
d="const noCopy=new URL(self.location.href).searchParams.get('mode')==='nocopy-skip';\n"+d
d=d.replace('      const w=frame.visibleRect.width,h=frame.visibleRect.height;','''      const actualWidth=frame.visibleRect.width,actualHeight=frame.visibleRect.height;
      stats.actualWidth=actualWidth;stats.actualHeight=actualHeight;
      const w=noCopy?2:actualWidth,h=noCopy?2:actualHeight;''')
d=d.replace('      const bytes=new Uint8Array(w*h*3/2),started=performance.now();','      if(!noCopy){\n      const bytes=new Uint8Array(w*h*3/2),started=performance.now();')
d=d.replace('      header[5]=w;header[6]=h;header[8]=+nv12;','''      stats.pixelCopies=(stats.pixelCopies??0)+1;
      }else{
       new Uint8Array(memory,pointer+frameOffset,6).set([16,16,16,16,128,128]);
       stats.placeholderFrames=(stats.placeholderFrames??0)+1;
      }
      header[5]=w;header[6]=h;header[8]=+nv12;''')
Path('web/gap-decoder-worker.js').write_text(d)
p=Path('web/generated/player.js').read_text().replace("new URL('../engine-worker.js', import.meta.url)","new URL('../gap-engine-worker.js?mode='+new URLSearchParams(location.search).get('mode'), import.meta.url)")
Path('web/generated/gap-player.js').write_text(p)
p=Path('web/benchmark.html').read_text().replace('./generated/player.js','./generated/gap-player.js').replace('Three-way playback benchmark','Remaining pipeline cost experiment').replace("frameCounter:'mpv presented frames'","frameCounter:'mpv acknowledged frames; experimental paths do not display'")
p=p.replace('<script type="module">', "<script type=\"module\">\nimport './benchmark-progress.js';")
Path('web/gap.html').write_text(p)
