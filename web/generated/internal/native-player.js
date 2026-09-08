/** Browser media ownership, including listeners, pending loads and object URLs. */
export class NativePlayer extends EventTarget {
    video;
    ready = Promise.resolve();
    properties = new Map();
    stopped = false;
    objectURL;
    selectedSub = 'auto';
    subsVisible = true;
    cancelers = new Set();
    listeners = [];
    constructor(video) {
        super();
        this.video = video;
        video.playsInline = true;
        video.preload = 'auto';
        for (const event of ['timeupdate', 'durationchange', 'loadedmetadata', 'play', 'pause', 'volumechange', 'ratechange', 'ended']) {
            const listener = () => {
                this.refresh();
                if (event === 'ended')
                    this.emit('mpv', { event: 'end-file', reason: 'eof' });
            };
            video.addEventListener(event, listener);
            this.listeners.push(() => video.removeEventListener(event, listener));
        }
        const failed = () => this.emit('error', `Native playback failed (${video.error?.code ?? 'unknown'}): ${video.error?.message ?? 'unsupported media or network failure'}`);
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
        if (audio)
            tracks.push(...Array.from(audio, (t, i) => ({ id: String(i + 1), type: 'audio', title: t.label, lang: t.language, selected: t.enabled })));
        const values = { 'time-pos': this.video.currentTime, duration: Number.isFinite(this.video.duration) ? this.video.duration : 0, pause: this.video.paused, 'eof-reached': this.video.ended, volume: this.video.volume * 100, speed: this.video.playbackRate, 'track-list': tracks };
        for (const [name, data] of Object.entries(values)) {
            if (name !== 'track-list' && this.properties.get(name) === data)
                continue;
            this.properties.set(name, data);
            this.emit('mpv', { event: 'property-change', name, data });
        }
    }
    get diagnostics() { const q = this.video.getVideoPlaybackQuality(); return { path: 'native', position: this.video.currentTime, rendered: q.totalVideoFrames, dropped: q.droppedVideoFrames, readyState: this.video.readyState }; }
    async load(url) {
        await this.wait('loadeddata', () => { this.video.src = url; this.video.load(); });
        this.refresh();
        this.emit('mpv', { event: 'file-loaded' });
    }
    async open(file) {
        this.assertActive();
        this.objectURL = URL.createObjectURL(file instanceof File ? file : new Blob([file]));
        try {
            await this.load(this.objectURL);
        }
        catch (error) {
            URL.revokeObjectURL(this.objectURL);
            this.objectURL = undefined;
            throw error;
        }
    }
    async openRemote(source) {
        this.assertActive();
        if (source.headers || source.refreshAuthorization || source.allowedOrigins || source.immutable !== undefined || source.credentials === 'omit')
            throw new Error('Native mode cannot enforce custom request headers, renewal, origin restrictions, immutability or omitted same-origin credentials; use an mpv mode.');
        const url = new URL(source.url, location.href);
        if (!['http:', 'https:'].includes(url.protocol))
            throw new Error('Remote sources require HTTP or HTTPS');
        if (source.format && source.format !== 'file') {
            const mime = source.format === 'hls' ? 'application/vnd.apple.mpegurl' : 'application/dash+xml';
            if (!this.video.canPlayType(mime))
                throw new Error(`Native ${source.format.toUpperCase()} playback is not supported by this browser`);
        }
        this.video.crossOrigin = source.credentials === 'include' ? 'use-credentials' : 'anonymous';
        await this.load(url.href);
    }
    async play() { this.assertActive(); await this.video.play(); this.refresh(); }
    async pause() { this.assertActive(); this.video.pause(); this.refresh(); }
    async seek(seconds) {
        this.assertActive();
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
            const loaded = () => finish();
            const failed = () => finish(new Error('Native text track failed to load'));
            const cancel = (error) => finish(error);
            const timer = setTimeout(() => finish(new Error('Native text track load timed out')), 15000);
            this.cancelers.add(cancel);
            track.addEventListener('load', loaded);
            track.addEventListener('error', failed);
            this.video.append(track);
            track.track.mode = 'hidden';
        });
        this.applySubtitles();
        this.refresh();
    }
    resize(width, height) { this.assertActive(); this.video.width = width; this.video.height = height; }
    audioDiagnostics() { return { state: this.stopped ? 'closed' : this.video.paused ? 'paused' : 'running', source: 'native', decodedSampleCountersAvailable: false }; }
    async destroy() {
        if (this.stopped)
            return;
        this.stopped = true;
        for (const cancel of this.cancelers)
            cancel(new Error('Player is destroyed'));
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
