import {LocalFileReader} from './file-reader.js';
// Conservative, bounded local MP4 metadata admission. Unknown means inspect with FFmpeg.
// File bytes are immutable for the lifetime of this selection; MIME/name are never used.
const LIMIT=262144, text=(b,a,n=4)=>String.fromCharCode(...b.subarray(a,a+n));
function boxes(b,start=0,end=b.length){
 const result=[];const v=new DataView(b.buffer,b.byteOffset,b.byteLength);
 for(let p=start;p<end;){
  if(result.length>=128||p+8>end)throw Error('Invalid box table');
  const n=v.getUint32(p),type=text(b,p+4);
  if(n<8||p+n>end)throw Error('Unsupported box size');
  result.push({type,b:b.subarray(p+8,p+n)});p+=n;
 }
 return result;
}
const one=(items,type)=>{const a=items.filter(x=>x.type===type);if(a.length!==1)throw Error('Ambiguous '+type);return a[0].b;};
const u32=(b,p)=>new DataView(b.buffer,b.byteOffset,b.byteLength).getUint32(p);
function descriptor(b,p,tag){
 if(b[p++]!==tag)throw Error('Unexpected descriptor');let n=0,done=false;
 for(let i=0;i<4;i++){const c=b[p++];if(c===undefined)throw Error('Short descriptor');n=n*128+(c&127);if(!(c&128)){done=true;break;}}
 if(!done||p+n>b.length)throw Error('Invalid descriptor length');return b.subarray(p,p+n);
}
function aac(esds){
 if(u32(esds,0)!==0)throw Error('ESDS version');
 const es=descriptor(esds,4,3);if(es[2]!==0)throw Error('ES flags');
 const config=descriptor(es,3,4);if(config[0]!==0x40||(config[1]>>2)!==5)throw Error('Non-AAC audio');
 const asc=descriptor(config,13,5);
 // FFmpeg commonly appends an explicit SBR-absent sync extension. No extension is removed.
 if(!(asc.length===2||(asc.length===5&&asc[2]===0x56&&asc[3]===0xe5&&asc[4]===0))||(asc[0]>>3)!==2||((asc[0]&7)*2+(asc[1]>>7))>=13||(asc[1]&7))throw Error('Complex AAC');
 const channels=(asc[1]>>3)&15;if(channels<1||channels>2)throw Error('Audio layout');return channels;
}
function tracks(moov,video){
 const root=boxes(moov);if(root.some(x=>!['mvhd','trak','udta'].includes(x.type)))throw Error('Complex movie');
 const result=[],seen=new Set();
 for(const trak of root.filter(x=>x.type==='trak')){
  const t=boxes(trak.b);if(t.some(x=>!['tkhd','edts','mdia'].includes(x.type)))throw Error('Track dependencies');
  const header=one(t,'tkhd');if(header[0]!==0||header.length<84||(u32(header,0)&3)!==3)throw Error('Disabled/complex track');
  const matrix=[65536,0,0,0,65536,0,0,0,1073741824];if(matrix.some((n,i)=>u32(header,40+i*4)!==n))throw Error('Track transform');
  const mdia=boxes(one(t,'mdia')),handler=text(one(mdia,'hdlr'),8);
  if(!['vide','soun'].includes(handler)||seen.has(handler))throw Error('Extra or unknown tracks');seen.add(handler);
  const minf=boxes(one(mdia,'minf')),dref=one(boxes(one(minf,'dinf')),'dref');
  if(u32(dref,0)!==0||u32(dref,4)!==1)throw Error('Data references');
  const refs=boxes(dref,8);if(refs.length!==1||refs[0].type!=='url '||refs[0].b.length!==4||u32(refs[0].b,0)!==1)throw Error('External reference');
  const stsd=one(boxes(one(minf,'stbl')),'stsd');if(u32(stsd,0)!==0||u32(stsd,4)!==1)throw Error('Multiple configurations');
  const entries=boxes(stsd,8);if(entries.length!==1)throw Error('Sample entries');const entry=entries[0];
  if(new DataView(entry.b.buffer,entry.b.byteOffset,entry.b.byteLength).getUint16(6)!==1)throw Error('Data reference index');
  let codec,mime,channels;
  if(handler==='vide'){
   if(entry.type!=='avc1')throw Error('Video codec');
   const children=boxes(entry.b,78);if(children.some(x=>!['avcC','pasp','btrt','colr'].includes(x.type)))throw Error('Video extensions');
   for(const c of children.filter(x=>x.type==='colr')){const v=new DataView(c.b.buffer,c.b.byteOffset,c.b.byteLength);if(!['nclx','nclc'].includes(text(c.b,0))||[4,6,8].some(p=>v.getUint16(p)!==1))throw Error('Unqualified color');}
   const avc=one(children,'avcC');if(avc.length<7||avc[0]!==1||![66,77,100].includes(avc[1])||(avc[4]&3)!==3)throw Error('AVC configuration');
   mime='video/mp4; codecs="avc1.'+[...avc.subarray(1,4)].map(n=>n.toString(16).padStart(2,'0')).join('')+'"';codec='h264';
  }else{
   if(entry.type!=='mp4a'||entry.b[8]||entry.b[9])throw Error('Audio entry');
   const children=boxes(entry.b,28);if(children.some(x=>!['esds','btrt'].includes(x.type)))throw Error('Audio extensions');
   channels=aac(one(children,'esds'));codec='aac';mime='audio/mp4; codecs="mp4a.40.2"';
  }
  if(!video.canPlayType(mime))throw Error('Browser admission');
  result.push({id:'1',index:result.length,type:handler==='vide'?'video':'audio',codec,codecString:mime.split('\"')[1],default:true,...(channels?{channels,aacObject:2}:{})});
 }
 if(!seen.has('vide'))throw Error('No video');return result;
}
export async function cheapMP4Probe(file,signal,video){
 let bytesRead=0,reader;const abort=()=>reader?.close();signal.addEventListener('abort',abort,{once:true});
 const read=async(a,n)=>{if(signal.aborted)throw new DOMException('Aborted','AbortError');if(bytesRead+n>LIMIT+2048)throw Error('Metadata budget');const b=await reader.read(BigInt(a),n);bytesRead+=b.length;if(signal.aborted)throw new DOMException('Aborted','AbortError');if(b.length!==n)throw Error('Short file');return b;};
 try{
  reader=new LocalFileReader(file);
  let moov,brand=false,mdat=false;
  for(let p=0,count=0;p<file.size;count++){
   if(count>=64)throw Error('Box budget');const h=await read(p,Math.min(16,file.size-p));if(h.length<8)throw Error('Short header');let n=u32(h,0);const type=text(h,4);let header=8;
   if(n===1){if(h.length<16)throw Error('Short extended header');n=Number(new DataView(h.buffer).getBigUint64(8));header=16;}
   if(!Number.isSafeInteger(n)||n<header||p+n>file.size)throw Error('Box bounds');
   if(type==='ftyp'){if(p!==0||n>128||header!==8)throw Error('Brand box');const b=await read(p+8,n-8);brand=['isom','iso2','mp41','mp42','avc1'].includes(text(b,0));}
   else if(type==='moov'){if(moov||n>LIMIT||header!==8)throw Error('Metadata size');moov=await read(p+8,n-8);}
   else if(type==='mdat')mdat=true;
   else if(!['free','skip','wide'].includes(type))throw Error('Complex packaging');
   p+=n;
  }
  if(!brand||!moov||!mdat)throw Error('Incomplete MP4');
  return {probe:{tracks:tracks(moov,video),duration:0},bytesRead};
 }catch(error){if(signal.aborted)throw error;return {bytesRead,reason:String(error)};}finally{signal.removeEventListener('abort',abort);reader?.close();}
}
