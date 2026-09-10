// Packet/container contracts, independent of browser admission. Selected codecs only.
export function remuxPackaging(video, audio, preferred='mp4') {
 const webmVideo=!video||/^(vp8|vp09\.|av01\.)/.test(video);
 const webmAudio=!audio||['opus','vorbis'].includes(audio);
 const mp4Video=!video||/^(avc1\.|hvc1\.|hev1\.|vp09\.|av01\.)/.test(video);
 const mp4Audio=!audio||/^(mp4a\.|mp3$|opus$|flac$|ac-3$|ec-3$)/.test(audio);
 if(!video&&!audio)return [];
 return [preferred,...['mp4','webm'].filter(c=>c!==preferred)]
  .filter(c=>c==='mp4'?mp4Video&&mp4Audio:c==='webm'&&webmVideo&&webmAudio)
  .map(container=>({container,mime:`${video?'video':'audio'}/${container}; codecs="${[video,audio].filter(Boolean).join(',')}"`}));
}
