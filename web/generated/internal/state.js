export function freeze(value) {
    if (value && typeof value === 'object' && !Object.isFrozen(value)) {
        Object.values(value).forEach(freeze);
        Object.freeze(value);
    }
    return value;
}
export function ranges(value) {
    if (!Array.isArray(value))
        return null;
    const out = value.map(r => ({ start: Number(r.start), end: Number(r.end) }));
    return out.every(r => Number.isFinite(r.start) && Number.isFinite(r.end) && r.start >= 0 && r.end >= r.start) ? out : null;
}
export function trackKey(track, mode, plan) {
    const type = track.type;
    // ff-index belongs to each demuxer: separate subtitle files commonly all use 0.
    // Attachments are replayed in the same order on replacement, retaining mpv IDs.
    if (track.external)
        return `${type}:external:${track.id}`;
    const index = Number.isInteger(track['ff-index']) ? track['ff-index'] : mode === 'native' && plan === 'remux' && type === 'audio' ? Number(track.id) - 1 : undefined;
    return index !== undefined ? `${type}:stream:${index}` : `${type}:${mode === 'native' ? 'native' : 'mpv'}:${track.id}`;
}
export function tracks(raw, sourceId, mode, plan) {
    return raw.filter(t => ['audio', 'sub', 'video'].includes(t.type)).map(t => ({ id: `${sourceId}:${trackKey(t, mode, plan)}`, type: t.type === 'sub' ? 'subtitle' : t.type,
        label: String(t.title || t.lang || `${t.type === 'sub' ? 'Subtitle' : t.type === 'audio' ? 'Audio' : 'Video'} ${t.id}`), language: t.lang ? String(t.lang) : null,
        codec: t.codec ? String(t.codec) : null, selected: !!t.selected, external: !!t.external }));
}
const positive = (value) => typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : null;
export function mediaInfo(properties, mode, surface, list) {
    const raw = properties.get('track-list')?.find(t => t.type === 'video' && t.selected);
    let width = null, height = null, rotation = null;
    if (surface?.tagName === 'VIDEO') {
        width = positive(surface.videoWidth);
        height = positive(surface.videoHeight);
    }
    else {
        const p = (mode === 'hybrid' ? undefined : properties.get('video-out-params') || properties.get('video-params'));
        width = positive(p?.dw);
        height = positive(p?.dh);
        if (!width || !height) {
            width = positive(p?.w) || positive(raw?.['demux-w']);
            height = positive(p?.h) || positive(raw?.['demux-h']);
            if (width)
                width *= positive(p?.par) || positive(raw?.['demux-par']) || 1;
        }
        const angle = p?.rotate ?? raw?.['demux-rotation'];
        rotation = typeof angle === 'number' ? angle : null;
        if (width && height) {
            const a = (rotation || 0) * Math.PI / 180, c = Math.abs(Math.cos(a)), s = Math.abs(Math.sin(a));
            [width, height] = [width * c + height * s, width * s + height * c];
        }
    }
    return { displayWidth: width, displayHeight: height, aspectRatio: width && height ? width / height : null, rotation,
        video: list.find(t => t.type === 'video' && t.selected) ?? null, audio: list.find(t => t.type === 'audio' && t.selected) ?? null, subtitle: list.find(t => t.type === 'subtitle' && t.selected) ?? null };
}
