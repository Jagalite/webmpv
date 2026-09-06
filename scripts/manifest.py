#!/usr/bin/env python3
import hashlib,json,pathlib,platform,subprocess
root=pathlib.Path(__file__).resolve().parent.parent
def hashed(paths):
    return {str(p.relative_to(root)):hashlib.sha256(p.read_bytes()).hexdigest() for p in paths if p.is_file()}
manifest={
 'schema':1,'scope':'M1/M2 software player with bounded HTTP streaming','buildHost':platform.platform(),
 'toolchainLock':json.loads((root/'toolchain.lock.json').read_text()),
 'sources':json.loads((root/'sources.lock.json').read_text()),
 'patchesAndBindings':hashed(sorted((root/'patches').rglob('*.patch'))+sorted((root/'native').glob('*'))),
 'artifacts':hashed(sorted((root/'web/engine').glob('*'))),
 'buildConfigurations':hashed([root/'build/obj-ffmpeg/config.h',root/'build/obj-ffmpeg/config_components.h',root/'build/obj-ffmpeg/ffbuild/config.mak',root/'build/obj-mpv/config.h',root/'scripts/build.sh',root/'scripts/link.sh',root/'Dockerfile']),
 'browserBindings':hashed([root/'src/player.ts',root/'web/engine-worker.js',root/'web/audio-worklet.js',root/'web/io-worker.js',root/'web/range-reader.js',root/'web/generated/player.js']),
 'fixtures':hashed(sorted((root/'fixtures').glob('*'))),
 'tools':{},
 'browserDecoding':False,'renderer':'libmpv software render API / Canvas 2D',
 'audio':'original browser AO / fixed stereo Float32 AudioWorklet ring',
 'baselineProfile':{'video':'H.264 SDR yuv420p','audio':'AAC stereo','containers':['MP4','MKV'],'subtitles':'ASS','network':'bounded HTTP ranges','initialHeapBytes':134217728,'maximumHeapBytes':536870912,'pthreadPoolSize':8,'softwareScaler':'bilinear, sws-fast=yes'},
 'reproducibility':'Hash comparison recorded separately; source pins alone are not proof.',
}
for name,cmd in [('emscripten',['emcc','--version']),('meson',['meson','--version']),('cmake',['cmake','--version']),('ninja',['ninja','--version'])]:
    try:manifest['tools'][name]=subprocess.check_output(cmd,text=True).splitlines()[0]
    except (OSError,subprocess.CalledProcessError):manifest['tools'][name]='unavailable'
(root/'results/build-manifest.json').write_text(json.dumps(manifest,indent=2)+'\n')

# Dependency inventory; exact license texts are supplied in third_party/notices.
sbom={'bomFormat':'CycloneDX','specVersion':'1.6','version':1,'components':[]}
for item in manifest['sources']['sources']:
    sbom['components'].append({'type':'application' if item['name']=='emsdk' else 'library','name':item['name'],'version':item['revision'],'hashes':[{'alg':'SHA-256','content':item['sha256']}],'externalReferences':[{'type':'vcs','url':item['upstream']},{'type':'distribution','url':item['url']}],'properties':[{'name':'webmpv:license-notices','value':'third_party/notices/'+item['name']}]})
(root/'results/sbom.cdx.json').write_text(json.dumps(sbom,indent=2)+'\n')
