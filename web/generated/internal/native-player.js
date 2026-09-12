/** Browser media ownership, including listeners, pending loads and object URLs. */
export class NativePlayer extends EventTarget {
    video;
    remuxPolicy;
    assetBase;
    ready = Promise.resolve();
    properties = new Map();
    stopped = false;
    destruction;
    opening = false;
    remux;
    remuxSource;
    directFailure;
    shiftedCues = new WeakSet();
    sourceTime() { return Math.max(0, this.video.currentTime - (this.remux?.timelineBias ?? 0)); }
    sourceDuration() { return Number.isFinite(this.video.duration) ? Math.max(0, this.video.duration - (this.remux?.timelineBias ?? 0)) : 0; }
    objectURL;
    selectedSub = 'auto';
    subsVisible = true;
    cancelers = new Set();
    listeners = [];
    constructor(video, remuxPolicy = 'auto', assetBase = new URL('../../../', import.meta.url)) {
        super();
        this.video = video;
        this.remuxPolicy = remuxPolicy;
        this.assetBase = assetBase;
        video.playsInline = true;
        video.preload = 'auto';
        for (const event of ['timeupdate', 'durationchange', 'loadedmetadata', 'play', 'pause', 'volumechange', 'ratechange', 'ended', 'waiting', 'playing', 'progress', 'seeking', 'seeked', 'resize']) {
            const listener = () => {
                this.refresh();
                this.emit('activity', event);
                if (event === 'ended')
                    this.emit('mpv', { event: 'end-file', reason: 'eof' });
            };
            video.addEventListener(event, listener);
            this.listeners.push(() => video.removeEventListener(event, listener));
        }
        const failed = () => { if (!this.opening && !this.remux?.starting && !this.stopped)
            this.emit('error', `Native playback failed (${video.error?.code ?? 'unknown'}): ${video.error?.message ?? 'unsupported media or network failure'}`); };
        video.addEventListener('error', failed);
        this.listeners.push(() => video.removeEventListener('error', failed));
        const tracks = () => this.refresh();
        video.textTracks.addEventListener('change', tracks);
        video.textTracks.addEventListener('addtrack', tracks);
        this.listeners.push(() => { video.textTracks.removeEventListener('change', tracks); video.textTracks.removeEventListener('addtrack', tracks); });
        this.refresh();
    }
    emit(type, detail) { this.dispatchEvent(new CustomEvent(type, { detail })); }
    assertActive() { if (this.stopped)
        throw new Error('Player is destroyed'); }
    wait(event, start) {
        this.assertActive();
        return new Promise((resolve, reject) => {
            const finish = (error) => {
                clearTimeout(timer);
                this.video.removeEventListener(event, done);
                this.video.removeEventListener('error', failed);
                this.cancelers.delete(cancel);
                error ? reject(error) : resolve();
            };
            const done = () => finish();
            const failed = () => finish(new Error(`Native media operation failed: ${this.video.error?.message || this.video.error?.code}`));
            const cancel = (error) => finish(error);
            const timer = setTimeout(() => finish(new Error(`Native ${event} timed out`)), 25000);
            this.cancelers.add(cancel);
            this.video.addEventListener(event, done, { once: true });
            this.video.addEventListener('error', failed, { once: true });
            try {
                start();
            }
            catch (error) {
                finish(error);
            }
        });
    }
    refresh() {
        const tracks = Array.from(this.video.textTracks, (t, i) => ({ id: String(i + 1), type: 'sub', title: t.label, lang: t.language, selected: t.mode === 'showing' }));
        const audio = this.video.audioTracks;
        if (this.remux?.tracks)
            tracks.push(...this.remux.tracks.filter(t => t.type === 'audio').map(t => ({ ...t, selected: t.selected && !this.video.muted })));
        else if (audio)
            tracks.push(...Array.from(audio, (t, i) => ({ id: String(i + 1), type: 'audio', title: t.label, lang: t.language, selected: t.enabled })));
        const timeRanges = (r) => Array.from({ length: r.length }, (_, i) => ({ start: Math.max(0, r.start(i) - (this.remux?.timelineBias ?? 0)), end: Math.max(0, r.end(i) - (this.remux?.timelineBias ?? 0)) }));
        const values = { 'time-pos': this.sourceTime(), duration: Number.isFinite(this.video.duration) ? this.sourceDuration() : null, 'native-buffered': timeRanges(this.video.buffered), 'native-seekable': timeRanges(this.video.seekable), 'native-live': this.video.duration === Infinity, pause: this.video.paused, 'eof-reached': this.video.ended, volume: this.video.volume * 100, speed: this.video.playbackRate, 'track-list': tracks };
        for (const [name, data] of Object.entries(values)) {
            if (name !== 'track-list' && this.properties.get(name) === data)
                continue;
            this.properties.set(name, data);
            this.emit('mpv', { event: 'property-change', name, data });
        }
    }
    get diagnostics() { const q = this.video.getVideoPlaybackQuality(); return { path: 'native', plan: this.remux ? 'remux' : 'direct', directFailure: this.directFailure, remux: this.remux?.snapshot(), position: this.sourceTime(), rendered: q.totalVideoFrames, dropped: q.droppedVideoFrames, readyState: this.video.readyState }; }
    async load(url) {
        await this.wait('loadeddata', () => { this.video.src = url; this.video.load(); });
        this.refresh();
        this.emit('mpv', { event: 'file-loaded' });
    }
    async startRemux(source, target = 0) {
        this.assertActive();
        if (!crossOriginIsolated || typeof MediaSource === 'undefined')
            throw Error('Native remux requires MediaSource and cross-origin isolation');
        if (source.options?.format && source.options.format !== 'file')
            throw Error('Native remux currently requires a random-access file source; use Hybrid for this manifest');
        const moduleURL = new URL('web/native-remux-player.js', this.assetBase).href;
        const { RemuxPlayer } = await import(moduleURL);
        this.assertActive();
        this.remux ??= new RemuxPlayer(this.video);
        this.remux.onError = message => { if (!this.opening && !this.stopped)
            this.emit('error', message); };
        const { refreshAuthorization, ...options } = source.options ?? {};
        const transport = { ...source, ...(source.options ? { options: options } : {}), refreshAuthorization };
        await this.remux.open(transport, target);
        this.remuxSource = source;
        if (this.video.seeking)
            await this.wait('seeked', () => { });
        this.refresh();
        this.emit('source', { plan: 'remux', tracks: this.remux.tracks });
        this.emit('mpv', { event: 'file-loaded' });
    }
    async loadPlan(source, direct, requiresRemux = false) {
        this.assertActive();
        this.opening = true;
        try {
            if (this.remuxPolicy !== 'always' && !requiresRemux) {
                try {
                    await direct();
                    return;
                }
                catch (error) {
                    if (this.stopped || this.remuxPolicy === 'never' || ![3, 4].includes(this.video.error?.code ?? 0))
                        throw error;
                    this.directFailure = String(error);
                }
            }
            else if (this.remuxPolicy === 'never')
                throw Error('Native direct cannot enforce these source permissions; enable native remux or choose Hybrid');
            await this.startRemux(source);
        }
        finally {
            this.opening = false;
        }
    }
    async open(file) {
        this.assertActive();
        const local = file instanceof File ? file : new File([file], 'media');
        this.objectURL = URL.createObjectURL(local);
        try {
            await this.loadPlan({ file: local }, () => this.load(this.objectURL));
        }
        catch (error) {
            URL.revokeObjectURL(this.objectURL);
            this.objectURL = undefined;
            throw error;
        }
    }
    async openRemote(source) {
        this.assertActive();
        const url = new URL(source.url, location.href);
        if (!['http:', 'https:'].includes(url.protocol))
            throw Error('Remote sources require HTTP or HTTPS');
        const requiresRemux = !!(source.headers || source.refreshAuthorization || source.allowedOrigins || source.immutable !== undefined || source.credentials === 'omit');
        this.video.crossOrigin = source.credentials === 'include' ? 'use-credentials' : 'anonymous';
        await this.loadPlan({ options: { ...source, url: url.href } }, async () => {
            if (source.format && source.format !== 'file') {
                const mime = source.format === 'hls' ? 'application/vnd.apple.mpegurl' : 'application/dash+xml';
                if (!this.video.canPlayType(mime))
                    throw Error(`Native ${source.format.toUpperCase()} playback is not supported by this browser`);
            }
            await this.load(url.href);
        }, requiresRemux);
    }
    async play() { this.assertActive(); if (this.remux)
        await this.remux.play();
    else
        await this.video.play(); this.refresh(); }
    async pause() { this.assertActive(); if (this.remux)
        this.remux.pause();
    else
        this.video.pause(); this.refresh(); }
    async seek(seconds) {
        this.assertActive();
        if (this.remux) {
            const paused = this.video.paused;
            await this.remux.seek(seconds);
            if (this.video.seeking)
                await this.wait('seeked', () => { });
            if (!paused)
                await this.video.play();
            this.refresh();
            return;
        }
        if (Math.abs(this.video.currentTime - seconds) < .001 && !this.video.seeking)
            return;
        await this.wait('seeked', () => { this.video.currentTime = seconds; });
        this.refresh();
    }
    async rate(value) { this.assertActive(); this.video.defaultPlaybackRate = value; this.video.playbackRate = value; this.refresh(); }
    async volume(value) { this.assertActive(); this.video.volume = value / 100; this.refresh(); }
    async selectTrack(type, id) {
        this.assertActive();
        if (type === 'audio') {
            const audio = this.video.audioTracks;
            if (id === 'auto') {
                this.video.muted = false;
                return;
            }
            if (id === 'no') {
                this.video.muted = true;
                return;
            }
            if (this.remux && this.remuxSource) {
                const track = this.remux.tracks?.find(t => t.type === 'audio' && t.id === id);
                if (!track)
                    throw Error('Unknown remux audio track');
                if (!track.selected) {
                    const previous = this.remuxSource, position = this.sourceTime(), paused = this.video.paused;
                    this.opening = true;
                    try {
                        await this.startRemux({ ...previous, audioTrack: Number(id) - 1 }, position);
                    }
                    catch (error) {
                        try {
                            await this.startRemux(previous, position);
                        }
                        catch (recovery) {
                            this.emit('error', String(recovery));
                        }
                        throw error;
                    }
                    finally {
                        this.opening = false;
                        if (!paused)
                            await this.video.play();
                    }
                }
                this.video.muted = false;
                this.refresh();
                return;
            }
            if (!audio || !audio[Number(id) - 1])
                throw new Error('Native audio track selection is not supported for this source/browser');
            this.video.muted = false;
            Array.from(audio).forEach((t, i) => { t.enabled = i === Number(id) - 1; });
        }
        else {
            if (!['auto', 'no'].includes(id) && !this.video.textTracks[Number(id) - 1])
                throw new Error('Unknown native subtitle track');
            this.selectedSub = id;
            this.applySubtitles();
        }
        this.refresh();
    }
    applySubtitles() {
        const preferred = this.video.querySelector('track[default]')?.track;
        const autoIndex = Math.max(0, Array.from(this.video.textTracks).findIndex(t => t === preferred));
        Array.from(this.video.textTracks).forEach((t, i) => { t.mode = this.subsVisible && this.selectedSub !== 'no' && (this.selectedSub === 'auto' ? i === autoIndex : i === Number(this.selectedSub) - 1) ? 'showing' : 'disabled'; });
    }
    async subtitleVisible(visible) { this.assertActive(); this.subsVisible = visible; this.applySubtitles(); this.refresh(); }
    async addTextTrack(source) {
        this.assertActive();
        const url = new URL(source.src, location.href);
        if (!['http:', 'https:', 'blob:'].includes(url.protocol))
            throw new Error('Text tracks require HTTP, HTTPS or a blob URL');
        const track = document.createElement('track');
        track.kind = 'subtitles';
        track.label = source.label;
        track.srclang = source.language || '';
        track.default = !!source.default;
        track.src = url.href;
        await new Promise((resolve, reject) => {
            const finish = (error) => { clearTimeout(timer); track.removeEventListener('load', loaded); track.removeEventListener('error', failed); this.cancelers.delete(cancel); if (error) {
                track.remove();
                reject(error);
            }
            else
                resolve(); };
            const loaded = () => { this.shiftTextTrack(track); finish(); };
            const failed = () => finish(new Error('Native text track failed to load'));
            const cancel = (error) => finish(error);
            const timer = setTimeout(() => finish(new Error('Native text track load timed out')), 15000);
            this.cancelers.add(cancel);
            track.addEventListener('load', loaded);
            track.addEventListener('error', failed);
            this.video.append(track);
            track.addEventListener('load', () => this.shiftTextTrack(track));
            track.track.mode = 'hidden';
        });
        this.applySubtitles();
        this.refresh();
    }
    shiftTextTrack(track) {
        if (!this.remux)
            return;
        for (const cue of Array.from(track.track.cues ?? []))
            if (!this.shiftedCues.has(cue)) {
                cue.startTime += this.remux.timelineBias;
                cue.endTime += this.remux.timelineBias;
                this.shiftedCues.add(cue);
            }
    }
    resize(width, height) { this.assertActive(); this.video.width = width; this.video.height = height; }
    audioDiagnostics() { return { state: this.stopped ? 'closed' : this.video.paused ? 'paused' : 'running', source: 'native', decodedSampleCountersAvailable: false }; }
    destroy() {
        if (this.destruction)
            return this.destruction;
        this.destruction = this.dispose();
        return this.destruction;
    }
    async dispose() {
        this.stopped = true;
        for (const cancel of this.cancelers)
            cancel(new Error('Player is destroyed'));
        await this.remux?.destroy();
        this.listeners.forEach(remove => remove());
        this.listeners = [];
        this.video.pause();
        this.video.removeAttribute('src');
        this.video.replaceChildren();
        this.video.load();
        if (this.objectURL)
            URL.revokeObjectURL(this.objectURL);
        this.objectURL = undefined;
    }
}
