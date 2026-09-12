#!/usr/bin/env node
import {readFile,mkdir,lstat,writeFile,rename} from 'node:fs/promises';
import path from 'node:path';import {fileURLToPath} from 'node:url';import {createHash} from 'node:crypto';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const hash=b=>createHash('sha256').update(b).digest('hex');
async function safeDirectory(dir){const absolute=path.resolve(dir);let at=path.parse(absolute).root;for(const part of absolute.slice(at.length).split(path.sep).filter(Boolean)){at=path.join(at,part);try{const s=await lstat(at);if(!s.isDirectory()||s.isSymbolicLink())throw Error('Destination contains a non-directory or symlink: '+at);}catch(e){if(e.code!=='ENOENT')throw e;await mkdir(at);}}}
async function main(){
 const [command,destination,...extra]=process.argv.slice(2);if(command!=='copy-assets'||!destination||extra.length)throw Error('Usage: webmpv copy-assets <destination-directory>');
 const pkg=JSON.parse(await readFile(path.join(root,'package.json')));let manifest;
 try{manifest=JSON.parse(await readFile(path.join(root,'release-manifest.json')));}catch{throw Error('Missing release-manifest.json. Use the packaged archive, not an unassembled source checkout.');}
 if(manifest.schema!==1||manifest.version!==pkg.version||JSON.stringify(manifest.publicModes)!=='["native","hybrid","software"]')throw Error('Incompatible package/runtime manifest');
 const files=new Map();
 // Validate every manifest input before writing anything, including the CLI itself.
 for(const [name,expected]of Object.entries(manifest.files)){
  if(name.includes('\\')||path.isAbsolute(name)||name.split('/').includes('..'))throw Error('Unsafe manifest path');
  let bytes;try{bytes=await readFile(path.join(root,name));}catch{throw Error('Missing package asset: '+name);}
  if(bytes.length!==expected.bytes||hash(bytes)!==expected.sha256)throw Error('Package asset hash mismatch: '+name);
  if(name.startsWith('web/')||name.startsWith('fixtures/')||name.startsWith('third_party/')||['LICENSE','sources.lock.json','toolchain.lock.json'].includes(name)||name==='docs/LICENSING.md')files.set(name,bytes);
 }
 for(const name of ['web/engine-hybrid/player.wasm','web/engine-software-full/player.wasm','web/engine-remux/remux.wasm','fixtures/DejaVuSans.ttf','LICENSE','third_party/notices.json'])if(!files.has(name))throw Error('Required runtime asset absent: '+name);
 const target=path.resolve(destination);await safeDirectory(target);
 let previous;try{const info=await lstat(path.join(target,'webmpv-runtime.json'));if(!info.isFile()||info.isSymbolicLink())throw Error('Unsafe runtime manifest destination');previous=JSON.parse(await readFile(path.join(target,'webmpv-runtime.json')));}catch(e){if(e.code!=='ENOENT')throw Error('Invalid destination runtime manifest');}
 // Refuse unrelated file collisions and all symlink destinations. No directory is removed.
 for(const [name,bytes]of files){const file=path.join(target,name);await safeDirectory(path.dirname(file));try{const info=await lstat(file);if(!info.isFile()||info.isSymbolicLink())throw Error('Unsafe destination asset: '+name);const existing=await readFile(file),digest=hash(existing);if(digest!==hash(bytes)&&digest!==previous?.files?.[name]?.sha256)throw Error('Refusing to overwrite unrelated destination file: '+name);}catch(e){if(e.code!=='ENOENT')throw e;}}
 const entries={};for(const [name,bytes]of files){const file=path.join(target,name),temp=file+`.webmpv-${process.pid}.tmp`;await writeFile(temp,bytes,{flag:'wx'});await rename(temp,file);entries[name]={bytes:bytes.length,sha256:hash(bytes)};}
 const record={schema:1,version:pkg.version,packageManifestSHA256:hash(await readFile(path.join(root,'release-manifest.json'))),files:entries};
 await writeFile(path.join(target,'webmpv-runtime.json'),JSON.stringify(record,null,2)+'\n');
 console.log(`Copied ${files.size} verified webmpv ${pkg.version} assets to ${target}. Unrelated files were retained.`);
}
main().catch(error=>{console.error('webmpv: '+error.message);process.exitCode=1;});
