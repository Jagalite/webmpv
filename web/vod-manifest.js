// Admission policy only. FFmpeg remains the manifest/timeline parser.
export function validateVODManifest(bytes,format,options={}){
  const text=new TextDecoder('utf-8',{fatal:true}).decode(bytes).replace(/^\uFEFF/,'');
  if(format==='hls'){
    const lines=text.split(/\r?\n/).map(s=>s.trim());
    if(lines[0]!=='#EXTM3U')throw Error('Invalid HLS manifest');
    if(lines.some(s=>/^#EXT-X-(KEY|SESSION-KEY|PART|PRELOAD-HINT|SERVER-CONTROL|RENDITION-REPORT|SKIP):/.test(s)))throw Error('Encrypted or low-latency HLS is unsupported');
    const variants=lines.filter(s=>s.startsWith('#EXT-X-STREAM-INF:')).length;
    if(variants>1||lines.some(s=>s.startsWith('#EXT-X-I-FRAME-STREAM-INF:')))throw Error('Select one HLS variant before demuxing');
    if(!options.live&&!variants&&!lines.includes('#EXT-X-ENDLIST'))throw Error('HLS must be finite VOD');
    if(lines.filter(s=>s.startsWith('#EXTINF:')).length>10000)throw Error('HLS segment count limit exceeded');
    const subtitlePlaylists=[];
    for(const line of lines.filter(s=>s.startsWith('#EXT-X-MEDIA:')&&/(?:[:,])TYPE=SUBTITLES(?:,|$)/.test(s))){
      const uri=/(?:[:,])URI="([^"]+)"(?:,|$)/.exec(line)?.[1];
      if(!uri)throw Error('Invalid HLS subtitle URI');subtitlePlaylists.push(uri);
    }
    if(subtitlePlaylists.length>16)throw Error('HLS subtitle track limit exceeded');
    return {subtitlePlaylists,segments:lines.filter(s=>s&&!s.startsWith('#')),segmentCount:lines.filter(s=>s.startsWith('#EXTINF:')).length};
  }
  if(format!=='dash')throw Error('Unknown segmented format');
  // Accept a deliberately small XML spelling subset. Reject entities, prefixed
  // element names and declarations before policy inspection; native libxml2
  // performs the actual well-formedness and DASH parse.
  if(/<!DOCTYPE|<!ENTITY|<!\[CDATA\[|&#/i.test(text))throw Error('Unsupported DASH XML declaration');
  const clean=text.replace(/<!--[\s\S]*?-->/g,'').replace(/<\?xml[^?]*\?>/g,'');
  const stack=[];let root=false,periods=0,adaptations=0,segments=0,hasTemplate=false,hasTimeline=false,hasDuration=false;
  for(const match of clean.matchAll(/<([^>]+)>/g)){
    const token=match[1];const closing=token.startsWith('/'),selfClosing=token.endsWith('/');
    const name=/^\/?([A-Za-z][A-Za-z0-9]*)\b/.exec(token)?.[1];
    if(!name||/^\/?[\w]+:/.test(token))throw Error('Unsupported DASH XML element');
    if(closing){if(stack.pop()?.name!==name)throw Error('Malformed DASH XML');continue;}
    if(!root){if(name!=='MPD'||!(options.live?/(?:^|\s)type\s*=\s*(['"])(?:static|dynamic)\1(?:\s|$)/:/(?:^|\s)type\s*=\s*(['"])static\1(?:\s|$)/).test(token))throw Error('DASH must be static VOD');root=true;}
    if(['ContentProtection','Location','PatchLocation','EventStream'].includes(name)||/\bxlink:/.test(token))throw Error('Unsupported DASH extension');
    if(name==='MPD'&&/\bmediaPresentationDuration\s*=\s*(['"])P[^'"]+\1/.test(token))hasDuration=true;
    if(name==='Period'&&/\bduration\s*=\s*(['"])P[^'"]+\1/.test(token))hasDuration=true;
    if(name==='SegmentTemplate')hasTemplate=true;
    if(name==='SegmentTimeline')hasTimeline=true;
    if(name==='SegmentURL'&&++segments>10000)throw Error('DASH segment count limit exceeded');
    if(name==='S'){
      const repeat=/(?:^|\s)r\s*=\s*(['"])([^'"]+)\1/.exec(token)?.[2]??'0';
      if(!/^\d{1,5}$/.test(repeat))throw Error('Unbounded DASH timeline is unsupported');
      segments+=Number(repeat)+1;if(segments>10000)throw Error('DASH segment count limit exceeded');
    }
    if(name==='Period'&&++periods>1)throw Error('Multiple DASH periods are unsupported');
    if(name==='AdaptationSet'&&++adaptations>16)throw Error('DASH track limit exceeded');
    if(name==='Representation'){
      const parent=stack.at(-1);if(parent?.name!=='AdaptationSet'||++parent.representations>1)throw Error('Select one DASH representation before demuxing');
    }
    if(name==='S'&&/(?:^|\s)r\s*=\s*(['"])-/.test(token))throw Error('Unbounded DASH timeline is unsupported');
    if(!selfClosing)stack.push({name,representations:0});
  }
  if(!options.live&&hasTemplate&&!hasTimeline&&!hasDuration)throw Error('DASH template requires a finite duration or timeline');
  if(!root||stack.length||periods!==1)throw Error('Malformed DASH VOD manifest');
}
