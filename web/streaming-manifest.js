// Bounded manifest selection and finite DASH-period adaptation. Compressed media
// is never decoded here; FFmpeg still demuxes segments and owns packet timelines.
const enc=new TextEncoder();
const fail=message=>{throw Error(message);};
const escape=s=>String(s).replaceAll('&','&amp;').replaceAll('"','&quot;').replaceAll('<','&lt;');
const entities=s=>s.replace(/&(#x[0-9a-f]+|#\d+|amp|lt|gt|quot|apos);/gi,(_,v)=>v[0]==='#'?String.fromCodePoint(v[1].toLowerCase()==='x'?parseInt(v.slice(2),16):Number(v.slice(1))):({amp:'&',lt:'<',gt:'>',quot:'"',apos:"'"})[v]);
export function parseXML(text){
 if(/<!DOCTYPE|<!ENTITY|<!\[CDATA\[/i.test(text))fail('Unsupported DASH XML declaration');
 const root={name:'',attrs:{},children:[],text:''},stack=[root];let count=0;
 const tokens=text.match(/<!--[\s\S]*?-->|<\?[\s\S]*?\?>|<[^>]*>|[^<]+/g)??[];
 if(tokens.join('')!==text)fail('Malformed DASH XML');
 for(const token of tokens){
  if(token.startsWith('<!--')||token.startsWith('<?'))continue;
  if(!token.startsWith('<')){stack.at(-1).text+=entities(token);continue;}
  if(token.startsWith('</')){if(stack.length===1||stack.pop().name!==token.slice(2,-1).trim())fail('Malformed DASH XML');continue;}
  const name=/^<([\w:.-]+)/.exec(token)?.[1];if(!name||++count>50000||stack.length>32)fail('Invalid DASH XML bounds');
  const attrs={};let rest=token.slice(name.length+1).replace(/\/?\s*>$/,'');
  while(rest.trim()){
   const m=/^\s+([\w:.-]+)\s*=\s*(["'])([\s\S]*?)\2/.exec(rest);if(!m||Object.hasOwn(attrs,m[1]))fail('Malformed DASH attributes');
   attrs[m[1]]=entities(m[3]);rest=rest.slice(m[0].length);
  }
  const node={name,attrs,children:[],text:''};stack.at(-1).children.push(node);if(!/\/\s*>$/.test(token))stack.push(node);
 }
 if(stack.length!==1||root.children.length!==1||root.children[0].name!=='MPD')fail('Malformed DASH MPD');return root.children[0];
}
const children=(n,name)=>n.children.filter(c=>c.name===name);
const child=(n,name)=>children(n,name)[0];
const xml=n=>`<${n.name}${Object.entries(n.attrs).map(([k,v])=>` ${k}="${escape(v)}"`).join('')}>${escape(n.text)}${n.children.map(xml).join('')}</${n.name}>`;
export function isoDuration(s){const m=/^P(?:(\d+(?:\.\d+)?)D)?(?:T(?:(\d+(?:\.\d+)?)H)?(?:(\d+(?:\.\d+)?)M)?(?:(\d+(?:\.\d+)?)S)?)?$/.exec(s??'');if(!m)return NaN;return Number(m[1]??0)*86400+Number(m[2]??0)*3600+Number(m[3]??0)*60+Number(m[4]??0);}
export function chooseVariant(items,options={}){
 if(!items.length)fail('No streaming representation');
 if(options.representation!==undefined){const exact=items.find(i=>i.id===String(options.representation));if(!exact)fail('Requested streaming representation is unavailable');return exact;}
 const limit=options.maxBandwidth??Infinity;if(!(limit>0))fail('Invalid streaming bandwidth limit');
 const sorted=[...items].sort((a,b)=>a.bandwidth-b.bandwidth);return sorted.filter(i=>i.bandwidth<=limit).at(-1)??sorted[0];
}
const attrs=line=>Object.fromEntries([...line.matchAll(/(?:^|[:,])([A-Z0-9-]+)=("[^"]*"|[^,]*)/g)].map(m=>[m[1],m[2].replace(/^"|"$/g,'')]));
export function selectHLS(text,options={}){
 const lines=text.split(/\r?\n/),variants=[];
 for(let i=0;i<lines.length;i++)if(lines[i].startsWith('#EXT-X-STREAM-INF:')){
  let j=i+1;while(j<lines.length&&!lines[j].trim())j++;
  if(!lines[j]||lines[j].startsWith('#'))fail('Missing HLS variant URI');
  variants.push({id:String(variants.length),bandwidth:Number(attrs(lines[i]).BANDWIDTH)||0,line:i,uri:j});
 }
 if(variants.length>64)fail('HLS variant limit exceeded');
 if(!variants.length)return text;
 const chosen=chooseVariant(variants,options),drop=new Set(variants.filter(v=>v!==chosen).flatMap(v=>[v.line,v.uri]));
 const chosenAttrs=attrs(lines[chosen.line]);
 return lines.filter((line,i)=>{
  if(drop.has(i))return false;
  if(line.startsWith('#EXT-X-MEDIA:')){const a=attrs(line);return !['AUDIO','SUBTITLES','VIDEO','CLOSED-CAPTIONS'].includes(a.TYPE)||chosenAttrs[a.TYPE]===a['GROUP-ID'];}
  return true;
 }).join('\n');
}
const baseAt=(node,base)=>child(node,'BaseURL')?new URL(child(node,'BaseURL').text.trim(),base).href:base;
function templateURL(pattern,rep,time,number){
 if(!pattern)fail('DASH segment URL is missing');
 return pattern.replace(/\$\$|\$(RepresentationID|Bandwidth|Time|Number)(?:%0(\d+)d)?\$/g,(all,key,width)=>key?String(key==='RepresentationID'?rep.attrs.id:key==='Bandwidth'?rep.attrs.bandwidth:key==='Time'?time:number).padStart(Number(width)||0,'0'):'$');
}
function segmentsFor(rep,adaptation,period,base,duration){
 base=baseAt(rep,baseAt(adaptation,base));
 const inherit=name=>{const nodes=[period,adaptation,rep].map(n=>child(n,name)).filter(Boolean);return nodes.length?{...nodes.at(-1),attrs:Object.assign({},...nodes.map(n=>n.attrs)),children:[...new Map(nodes.flatMap(n=>n.children).map(n=>[n.name,n])).values()]}:undefined;};
 const template=inherit('SegmentTemplate');
 const list=child(rep,'SegmentList')??child(adaptation,'SegmentList')??child(period,'SegmentList');
 const spec=template??list;if(!spec)fail('Multiple DASH periods require SegmentTemplate or SegmentList');
 const scale=Number(spec.attrs.timescale??1),offset=Number(spec.attrs.presentationTimeOffset??0);if(!Number.isSafeInteger(scale)||scale<=0||!Number.isSafeInteger(offset))fail('Invalid DASH timescale');
 let time=0,number=Number(spec.attrs.startNumber??1);const timeline=child(spec,'SegmentTimeline'),entries=[];
 if(timeline){
  const nodes=children(timeline,'S');
  for(let i=0;i<nodes.length;i++){
   const s=nodes[i];time=s.attrs.t===undefined?time:Number(s.attrs.t);const d=Number(s.attrs.d);let r=Number(s.attrs.r??0);
   if(r===-1){const next=nodes[i+1]?.attrs.t;r=Math.ceil(((next===undefined?duration*scale+offset:Number(next))-time)/d)-1;}
   if(!Number.isSafeInteger(time)||!Number.isSafeInteger(d)||d<=0||!Number.isInteger(r)||r<0||entries.length+r+1>10000)fail('Invalid or unbounded DASH timeline');
   for(let j=0;j<=r;j++){entries.push({time,duration:d/scale,number:number++});time+=d;}
  }
 }else{
  const d=Number(spec.attrs.duration);if(!(d>0&&duration>0)||Math.ceil(duration*scale/d)>10000)fail('DASH period needs a bounded segment duration');
  for(let n=0;n<Math.ceil(duration*scale/d);n++)entries.push({time:offset+n*d,duration:Math.min(d/scale,duration-n*d/scale),number:number++});
 }
 if(!entries.length)fail('Empty DASH period');
 const init=template?new URL(templateURL(template.attrs.initialization,rep,0,0),base).href:new URL(child(list,'Initialization')?.attrs.sourceURL??fail('Missing DASH initialization'),base).href;
 const urls=list?children(list,'SegmentURL'):[];
 if(list&&urls.length!==entries.length)fail('DASH SegmentList timeline mismatch');
 if(list&&(child(list,'Initialization')?.attrs.range||urls.some(n=>n.attrs.mediaRange)))fail('Multi-period byte-range DASH requires separate segment resources');
 return {init,entries:entries.map((e,i)=>({...e,url:new URL(template?templateURL(template.attrs.media,rep,e.time,e.number):urls[i].attrs.media,base).href})),offset:entries[0].time/scale-offset/scale};
}
export function prepareDASH(text,url,options={}){
 const mpd=parseXML(text),periods=children(mpd,'Period');
 if(!periods.length||periods.length>64)fail('DASH period count limit exceeded');
 const all=[];const visit=n=>{all.push(n);n.children.forEach(visit);};visit(mpd);
 if(all.some(n=>['ContentProtection','Location','PatchLocation','EventStream'].includes(n.name)||Object.keys(n.attrs).some(k=>k.startsWith('xlink:'))))fail('Unsupported DASH extension');
 for(const period of periods)for(const adaptation of children(period,'AdaptationSet')){
  const reps=children(adaptation,'Representation');if(reps.length>64)fail('DASH representation limit exceeded');
  const type=adaptation.attrs.contentType??(reps[0]?.attrs.mimeType??adaptation.attrs.mimeType??'').split('/')[0];
  const selected=chooseRepresentation(reps,type==='video'?options:{});
  adaptation.children=adaptation.children.filter(n=>n.name!=='Representation'||n===selected);
 }
 if(periods.length===1)return {bytes:enc.encode(xml(mpd)),format:'dash',resources:new Map()};
 if(mpd.attrs.type!=='static')fail('Multiple live DASH periods are unsupported');
 const resources=new Map(),tracks=new Map(),rootBase=baseAt(mpd,url);let expectedStart=0;
 for(let i=0;i<periods.length;i++){
  const period=periods[i],start=period.attrs.start===undefined?expectedStart:isoDuration(period.attrs.start);
  let duration=isoDuration(period.attrs.duration);
  if(!Number.isFinite(duration))duration=(i+1<periods.length?isoDuration(periods[i+1].attrs.start):isoDuration(mpd.attrs.mediaPresentationDuration))-start;
  if(!Number.isFinite(start)||Math.abs(start-expectedStart)>.01||!(duration>0))fail('DASH periods must have contiguous finite durations');
  const present=new Set();
  for(const [a,adaptation] of children(period,'AdaptationSet').entries()){
   const rep=child(adaptation,'Representation'),type=adaptation.attrs.contentType??(rep?.attrs.mimeType??adaptation.attrs.mimeType??'').split('/')[0];
   if(!rep||!['video','audio'].includes(type))fail('Multi-period DASH requires audio/video fMP4 representations');
   const key=type+':'+(adaptation.attrs.id??a),mime=rep.attrs.mimeType??adaptation.attrs.mimeType;
   if(mime&&!mime.endsWith('/mp4'))fail('Multi-period DASH requires fMP4 segments');
   const info=segmentsFor(rep,adaptation,period,baseAt(period,rootBase),duration);
   if(Math.abs(info.offset)>.01)fail('DASH period starts must align with their first segment');
   const language=adaptation.attrs.lang??'und';if(!/^[a-zA-Z0-9-]{1,64}$/.test(language))fail('Invalid DASH language tag');
   const track=tracks.get(key)??{type,language,parts:[],bandwidth:Number(rep.attrs.bandwidth)||1000000};
   if(i&&!tracks.has(key))fail('DASH track identity changed across periods');
   track.parts.push({duration,...info});tracks.set(key,track);present.add(key);
  }
  if(present.size!==tracks.size)fail('DASH tracks cannot disappear across periods');expectedStart=start+duration;
 }
 const prefix=new URL('__webmpv_periods__/',url).href;let audio=[],video=[];
 for(const [key,t] of tracks){
  const uri=prefix+encodeURIComponent(key)+'.m3u8';let body='#EXTM3U\n#EXT-X-VERSION:7\n#EXT-X-TARGETDURATION:'+Math.ceil(Math.max(...t.parts.flatMap(p=>p.entries.map(e=>e.duration))))+'\n#EXT-X-PLAYLIST-TYPE:VOD\n';
  for(const [i,p] of t.parts.entries()){
   if(i)body+='#EXT-X-DISCONTINUITY\n';body+='#EXT-X-MAP:URI="'+p.init+'"\n';
   let remaining=p.duration;for(const e of p.entries){if(remaining<=.000001)break;const d=Math.min(e.duration,remaining);body+=`#EXTINF:${d},\n${e.url}\n`;remaining-=d;}
   if(remaining>.05)fail('DASH segments do not cover period duration');
  }
  body+='#EXT-X-ENDLIST\n';resources.set(uri,enc.encode(body));(t.type==='audio'?audio:video).push({...t,uri,key});
 }
 if(video.length>1)fail('Choose one DASH video adaptation set');
 let master='#EXTM3U\n';for(const [i,a] of audio.entries())master+=`#EXT-X-MEDIA:TYPE=AUDIO,GROUP-ID="audio",NAME="audio-${i}",LANGUAGE="${a.language}",DEFAULT=${i?'NO':'YES'},AUTOSELECT=YES,URI="${a.uri}"\n`;
 const main=video[0]??audio[0];if(!main)fail('Empty DASH presentation');
 master+=`#EXT-X-STREAM-INF:BANDWIDTH=${main.bandwidth}${audio.length&&video.length?',AUDIO="audio"':''}\n${main.uri}\n`;
 return {bytes:enc.encode(master),format:'hls',url:prefix+'master.m3u8',resources};
}
function chooseRepresentation(reps,options){return chooseVariant(reps.map(node=>({node,id:node.attrs.id,bandwidth:Number(node.attrs.bandwidth)||0})),options).node;}
