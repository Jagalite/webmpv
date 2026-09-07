import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {EventEmitter} from 'node:events';
import path from 'node:path';
import vm from 'node:vm';
const source=(await readFile(new URL('../scripts/s1-media-server.mjs',import.meta.url),'utf8'))
 .replace(/^import .*;\n/gm,'').replaceAll('import.meta.dirname',JSON.stringify('/fixture/scripts'));
function response(){
 const res=new EventEmitter();res.destroyed=false;res.headersSent=false;
 res.setHeader=()=>{};res.writeHead=()=>{res.headersSent=true;return res;};
 res.end=body=>{res.body=body;return res;};return res;
}
test('disconnect during metadata lookup does not leave a phantom active request',async()=>{
 let handler,finishStat;
 vm.runInNewContext(source,{URL,path,setTimeout,console:{log(){}},
  http:{createServer:fn=>{handler=fn;return {listen(){}};}},
  stat:()=>new Promise(resolve=>{finishStat=resolve;}),
  createReadStream:()=>{throw Error('A disconnected request must not start a body');}});
 const res=response(),pending=handler({url:'/media/cancel/ts/media.m3u8',method:'GET',headers:{}},res);
 res.destroyed=true;res.emit('close');
 finishStat({size:100,isFile:()=>true});await pending;
 const status=response();await handler({url:'/control?id=cancel',method:'GET',headers:{}},status);
 assert.equal(JSON.parse(status.body).active,0);
});
