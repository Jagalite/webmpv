// Convert a bounded HLS WebVTT window to one indexed subtitle resource. Preserve
// cue settings and payload; normalize MPEGTS/LOCAL maps and timestamp wrap.
const timestamp=s=>{const p=s.split(':').map(Number);if(p.some(n=>!Number.isFinite(n))||p.length<2||p.length>3)throw Error('Invalid WebVTT timestamp');return p.reduce((n,v)=>n*60+v,0);};
const clock=t=>{t=Math.max(0,Math.round(t*1000));const h=Math.floor(t/3600000),m=Math.floor(t/60000)%60,s=Math.floor(t/1000)%60;return `${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}.${String(t%1000).padStart(3,'0')}`;};
export function subtitleSegments(text,base){
 const segments=[];let duration,at=0,discontinuity=false;
 for(const raw of text.split(/\r?\n/)){
  const line=raw.trim();if(line.startsWith('#EXTINF:'))duration=Number(line.slice(8).split(',')[0]);
  else if(line==='#EXT-X-DISCONTINUITY')discontinuity=true;
  else if(line&&!line.startsWith('#')){if(!(duration>0)||segments.length>=10000)throw Error('Invalid subtitle segment duration');segments.push({url:new URL(line,base).href,start:at,duration,discontinuity});at+=duration;duration=undefined;discontinuity=false;}
 }
 return {segments,duration:at};
}
export function mergeWebVTT(parts){
 let firstMap,previousMap,discontinuityOffset=0;const cues=[],seen=new Set(),styles=new Set();
 for(const part of parts){
  const text=part.text.replace(/^\uFEFF/,'').replaceAll('\r\n','\n');if(!text.startsWith('WEBVTT'))throw Error('Invalid HLS WebVTT');
  const map=/X-TIMESTAMP-MAP\s*=([^\n]+)/.exec(text)?.[1];let shift=0;
  if(map){
   const local=/LOCAL:([^,\s]+)/.exec(map)?.[1],mpeg=/MPEGTS:(\d+)/.exec(map)?.[1];if(!local||!mpeg)throw Error('Invalid WebVTT timestamp map');
   let offset=Number(mpeg)/90000-timestamp(local);const wrap=2**33/90000;
   if(previousMap!==undefined)offset+=Math.round((previousMap-offset)/wrap)*wrap;
   firstMap??=offset;if(part.discontinuity)discontinuityOffset=firstMap+part.start-offset;
   shift=offset+discontinuityOffset;previousMap=offset;
  }
  for(const block of text.split(/\n\s*\n/).slice(1)){
   if(/^(STYLE|REGION)(?:\n|$)/.test(block)){styles.add(block);continue;}
   if(/^NOTE(?:\s|$)/.test(block)||!block.trim())continue;
   const lines=block.split('\n'),i=lines.findIndex(l=>l.includes('-->'));if(i<0)continue;
   const m=/^(\S+)\s+-->\s+(\S+)(.*)$/.exec(lines[i]);if(!m)throw Error('Invalid WebVTT cue');
   const start=timestamp(m[1])+shift,end=timestamp(m[2])+shift;if(end<=start)throw Error('Invalid WebVTT cue interval');
   lines[i]=`${clock(start)} --> ${clock(end)}${m[3]}`;const cue=lines.join('\n');if(!seen.has(cue)){seen.add(cue);cues.push({start,cue});}
  }
 }
 const output='WEBVTT\n\n'+[...styles,...cues.sort((a,b)=>a.start-b.start).map(c=>c.cue)].join('\n\n')+'\n';
 if(new TextEncoder().encode(output).byteLength>1024*1024)throw Error('Combined subtitles exceed 1 MiB');return output;
}
