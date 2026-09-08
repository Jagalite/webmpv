#!/usr/bin/env python3
"""Generate isolated software bindings from the unchanged production bindings."""
from pathlib import Path
root = Path(__file__).resolve().parents[2]

def replace_once(text, before, after):
    assert text.count(before) == 1, before
    return text.replace(before, after)

worker = (root/'web/engine-worker.js').read_text()
worker = replace_once(worker,
    "const createEngine=(await import(data.decoder==='webcodecs'?'./engine-m4/player.mjs':'./engine/player.mjs')).default;",
    "if(data.decoder!=='software')throw Error('This build supports software decoding only');\n      const createEngine=(await import('./engine-software-full/player.mjs')).default;")
(root/'web/software-full-engine-worker.js').write_text(worker)
player = (root/'web/generated/player.js').read_text()
player = replace_once(player, "'../engine-worker.js'", "'../software-full-engine-worker.js'")
(root/'web/generated/software-full-player.js').write_text(player)
page = (root/'web/index.html').read_text()
page = replace_once(page, "'/web/generated/player.js'", "'/web/generated/software-full-player.js'")
page = replace_once(page, 'accept=".mkv,.mp4,.mov,.wav"', '')
page = replace_once(page, 'H.264/AAC · SDR · Stereo · Browser access required · Direct files need byte ranges · Segmented VOD is in qualification',
    'Expanded software playback · Up to 1080p · Stereo output · Local files up to 32 MiB · Direct URLs need byte ranges')
page = replace_once(page, "decoder:new URLSearchParams(location.search).get('decoder')==='webcodecs'?'webcodecs':'software'", "decoder:'software'")
page = replace_once(page, '<p>Software playback, powered by mpv.</p>', '<p>Expanded software playback, powered by mpv and FFmpeg.</p>')
(root/'web/software-full.html').write_text(page)
