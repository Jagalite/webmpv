export function nativeRejection(probe, settings, video) {
    const selected = (type, id = 'auto') => { const tracks = probe.tracks.filter(t => t.type === type && !t.attachedPicture); return id === 'no' ? undefined : id === 'auto' ? (tracks.find(t => t.default) || tracks[0]) : tracks.find(t => t.id === id); };
    // Browser text-track exposure cannot reliably prove embedded subtitle delivery.
    if (settings.subtitles && selected('sub', settings.sid))
        return 'Embedded subtitles require mpv rendering';
    const v = selected('video'), a = selected('audio', settings.aid);
    if (!['auto', 'no'].includes(settings.aid) && !a)
        return 'Requested audio track was not found';
    const codecs = { h264: 'avc1', hevc: 'hev1', vp8: 'vp8', vp9: 'vp09.00.10.08', av1: 'av01.0.04M.08', aac: 'mp4a.40.2', mp3: 'mp3', opus: 'opus', vorbis: 'vorbis', flac: 'flac', ac3: 'ac-3', eac3: 'ec-3' };
    if (!v && !a)
        return 'No selected playable streams';
    for (const t of [v, a])
        if (t && !codecs[t.codec])
            return `Native has no qualified ${t.type} mapping for ${t.codec}`;
    if (a?.codec === 'aac') {
        if (!a.aacObject || a.aacObject < 1 || a.aacObject >= 31)
            return 'Native AAC profile is unavailable';
        codecs.aac = `mp4a.40.${a.aacObject}`;
    }
    // Try each relevant packaging contract. A WebM rejection does not rule out MP4
    // (for example VP9 plus AAC). Actual remux configuration and playback still gate.
    const mimes = ['mp4', 'webm'].map(container => `${v ? 'video' : 'audio'}/${container}; codecs="${[v, a].filter(Boolean).map(t => container === 'webm' && t.codec === 'vp9' ? 'vp9' : t.codecString ?? codecs[t.codec]).join(',')}"`);
    if (!mimes.some(mime => video.canPlayType(mime)))
        return `Browser does not report support for ${mimes.join(' or ')}`;
}
