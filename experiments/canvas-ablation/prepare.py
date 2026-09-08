"""Generate isolated experimental bindings without changing production files."""
from pathlib import Path
worker=Path('web/engine-worker.js').read_text()
worker="const skipCanvas=new URL(self.location.href).searchParams.get('skipCanvas')==='1';\nlet canvasSubmissions=0;\n"+worker
worker=worker.replace('      if(!frameImage', '      if(!skipCanvas){\n      if(!frameImage',1)
worker=worker.replace('      copyMs+=performance.now()-copyStart;engine._web_presented();','      copyMs+=performance.now()-copyStart;canvasSubmissions++;\n      }\n      engine._web_presented();',1)
worker=worker.replace('data:{rendered,renderMs','data:{skipCanvas,canvasSubmissions,rendered,renderMs',1)
Path('web/ablation-engine-worker.js').write_text(worker)
player=Path('web/generated/player.js').read_text().replace("new URL('../engine-worker.js', import.meta.url)","new URL('../ablation-engine-worker.js?skipCanvas='+new URLSearchParams(location.search).get('skipCanvas'), import.meta.url)")
Path('web/generated/ablation-player.js').write_text(player)
page=Path('web/benchmark.html').read_text().replace('./generated/player.js','./generated/ablation-player.js').replace('Three-way playback benchmark','Canvas output experiment').replace("frameCounter:'mpv presented frames'","frameCounter:'mpv rendered and acknowledged frames; bypass does not display'")
Path('web/ablation.html').write_text(page)
