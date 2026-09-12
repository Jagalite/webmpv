// Codec-specific transport descriptions; capability acceptance still requires
// VideoDecoder.isConfigSupported AND successful decoded-frame delivery.
const hex=n=>n.toString(16).padStart(2,'0');
const pad=n=>String(n).padStart(2,'0');
// VP9 key-frame uncompressed header (WebM bitstream specification 6.2).
export function vp9PacketConfig(data){
 let at=0;const bits=n=>{if(at+n>data.length*8)throw Error('Truncated VP9 header');let v=0;while(n--)v=v*2+((data[at>>3]>>(7-(at++&7)))&1);return v;};
 if(bits(2)!==2)throw Error('Invalid VP9 frame marker');
 const profile=bits(1)+2*bits(1);if(profile===3&&bits(1))throw Error('Invalid VP9 profile');
 if(bits(1)||bits(1))throw Error('VP9 initialization requires a key frame');
 bits(2);if(bits(24)!==0x498342)throw Error('Invalid VP9 sync code');
 return {profile,depth:profile>=2?(bits(1)?12:10):8};
}
// Full key-frame color config is needed when packet-only demuxing leaves pix_fmt unset.
export function vp9RemuxConfig(data){
 const basic=vp9PacketConfig(data);let at=0;
 const bits=n=>{if(at+n>data.length*8)throw Error('Truncated VP9 color config');let v=0;while(n--)v=v*2+((data[at>>3]>>(7-(at++&7)))&1);return v;};
 bits(2);bits(2);if(basic.profile===3)bits(1);bits(4);bits(24);if(basic.profile>=2)bits(1);
 const color=bits(3);let fullRange=1,sx=0,sy=0;
 if(color!==7){fullRange=bits(1);if(basic.profile===1||basic.profile===3){sx=bits(1);sy=bits(1);bits(1);}else{sx=sy=1;}}
 else if(basic.profile===1||basic.profile===3)bits(1);else throw Error('Invalid VP9 RGB profile');
 const base=color===7?'gbrp':sx?(sy?'yuv420p':'yuv422p'):sy?'yuv440p':'yuv444p';
 return {...basic,pixelFormat:base+(basic.depth===8?'':basic.depth+'le'),fullRange};
}
function nal(data,type,hevc=false){
 for(let i=0;i+4<data.length;i++)if(data[i]===0&&data[i+1]===0&&(data[i+2]===1||(data[i+2]===0&&data[i+3]===1))){
  const start=i+(data[i+2]===1?3:4);if((hevc?(data[start]>>1)&63:data[start]&31)!==type)continue;
  let end=start+1;while(end+3<data.length&&!(data[end]===0&&data[end+1]===0&&(data[end+2]===1||(data[end+2]===0&&data[end+3]===1))))end++;
  if(end+3>=data.length)end=data.length;return data.subarray(start,end);
 }return null;
}
function rbsp(data){const out=[];for(let i=0;i<data.length;i++){if(i>=2&&data[i]===3&&data[i-1]===0&&data[i-2]===0)continue;out.push(data[i]);}return Uint8Array.from(out);}
function hevcString(ptl){
 if(ptl.length<12)throw Error('HEVC profile/tier/level unavailable');
 let compatibility=0;for(let i=0;i<32;i++)if(ptl[1+(i>>3)]&(1<<(7-(i&7))))compatibility=(compatibility|(1<<i))>>>0;
 const constraints=[...ptl.subarray(5,11)];while(constraints.length&&constraints.at(-1)===0)constraints.pop();
 return `hev1.${['','A','B','C'][ptl[0]>>6]}${ptl[0]&31}.${compatibility.toString(16)}.${ptl[0]&32?'H':'L'}${ptl[11]}${constraints.map(x=>'.'+hex(x)).join('')}`;
}
export function videoCodecConfig({kind,description=new Uint8Array(),width,height,profile=-1,level=-1,depth=8,maxWidth=8192,maxHeight=8192}){
 if(width<1||height<1||width>maxWidth||height>maxHeight||width*height>33554432||description.length>65536)throw Error('Video configuration exceeds current resource bounds');
 let codec,extra,prefix;
 if(kind===1){
  if(description[0]===1&&description.length>=7){codec='avc1.'+[...description.subarray(1,4)].map(hex).join('');extra=description;}
  else{const sps=nal(description,7);if(!sps||sps.length<4)throw Error('AVC SPS unavailable');codec='avc1.'+[...sps.subarray(1,4)].map(hex).join('');prefix=description;}
 }else if(kind===2){
  if(description[0]===1&&description.length>=23){codec=hevcString(description.subarray(1,13));extra=description;}
  else{const sps=nal(description,33,true);if(!sps)throw Error('HEVC SPS unavailable');codec=hevcString(rbsp(sps).subarray(3,15));prefix=description;}
 }else if(kind===3)codec='vp8';
 else if(kind===4){
  if(profile<0||profile>3||![8,10,12].includes(depth))throw Error('VP9 profile/bit depth unavailable');
  codec=`vp09.${pad(profile)}.${pad([10,11,20,21,30,31,40,41,50,51,52,60,61,62].includes(level)?level:10)}.${pad(depth)}`;
 }else if(kind===5){
  let tier='M';
  if(description.length>=4&&(description[0]&128)){profile=description[1]>>5;level=description[1]&31;tier=description[2]&128?'H':'M';depth=description[2]&64?(description[2]&32?12:10):8;prefix=description.subarray(4);}
  if(profile<0||profile>2||level<0||level>23||![8,10,12].includes(depth))throw Error('AV1 profile/level/bit depth unavailable');
  codec=`av01.${profile}.${pad(level)}${tier}.${pad(depth)}`;
 }else throw Error('Video codec has no WebCodecs bridge');
 return {configuration:{codec,...(extra?{description:extra}:{}),codedWidth:width,codedHeight:height,hardwareAcceleration:'no-preference',optimizeForLatency:false},prefix};
}
