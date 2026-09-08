/** One isolated software engine per player; bounded remote ranges or local files up to 32 MiB. */
export class BrowserPlayer extends EventTarget {
    worker;
    workerOwner;
    audioContext;
    audioNode;
    analyser;
    timing;
    nextId = 100;
    pending = new Map();
    destroyed = false;
    destruction;
    onDestroyed;
    readyTimer;
    rejectReady;
    eventWaiters = new Set();
    hasFile = false;
    opening = false;
    refreshAuthorization;
    audioHeader;
    diagnostics;
    browserCodecsAbsent = false;
    properties = new Map();
    ready;
    constructor(canvas, { disableBrowserCodecs = false, measureOutput = false, decoder = 'software', decoderFaultAfter = 0 } = {}) {
        super();
        if (!crossOriginIsolated)
            throw new Error('This player requires a secure, cross-origin isolated page.');
        this.audioContext = new AudioContext({ latencyHint: 'interactive' });
        // A disposable same-origin owner gives the browser a complete worker-tree
        // teardown boundary, including native pthread workers and decoder resources.
        this.workerOwner = canvas.ownerDocument.createElement('iframe');
        this.workerOwner.hidden = true;
        this.workerOwner.setAttribute('aria-hidden', 'true');
        canvas.ownerDocument.body.append(this.workerOwner);
        const owner = this.workerOwner.contentWindow;
        try {
            this.worker = new owner.Worker(new URL('../software-full-engine-worker.js', import.meta.url), { type: 'module' });
        }
        catch (error) {
            this.workerOwner.remove();
            void this.audioContext.close();
            throw error;
        }
        const audio = new SharedArrayBuffer(64 + 8192 * 2 * 4);
        this.audioHeader = new Int32Array(audio, 0, 16);
        this.ready = new Promise((resolve, reject) => {
            this.rejectReady = reject;
            const timeout = this.readyTimer = setTimeout(() => reject(new Error('Player initialization timed out')), 60000);
            this.worker.onerror = event => { clearTimeout(timeout); reject(new Error(event.message)); this.fail(new Error(event.message)); };
            this.worker.onmessage = ({ data }) => {
                if (data.type === 'ready') {
                    clearTimeout(timeout);
                    this.browserCodecsAbsent = data.browserCodecsAbsent;
                    resolve();
                }
                else if (data.type === 'error') {
                    clearTimeout(timeout);
                    const error = new Error(data.message);
                    reject(error);
                    this.fail(error, data.id);
                }
                else if (data.type === 'destroyed') {
                    if (this.diagnostics && data.decoderStats)
                        this.diagnostics.decoderStats = data.decoderStats;
                    this.onDestroyed?.();
                }
                else if (data.type === 'refresh') {
                    void this.refreshAuthorization?.(data.resource).then(update => this.worker.postMessage({ type: 'refreshed', id: data.id, update }), () => this.worker.postMessage({ type: 'refreshed', id: data.id, error: true }));
                }
                else if (data.type === 'output')
                    this.dispatchEvent(new CustomEvent('output', { detail: data.data }));
                else if (data.type === 'source')
                    this.dispatchEvent(new CustomEvent('source', { detail: data.info }));
                else if (data.type === 'diagnostics')
                    this.diagnostics = data.data;
                else if (data.type === 'log')
                    this.dispatchEvent(new CustomEvent('log', { detail: data.message }));
                else if (data.type === 'event') {
                    const event = data.event;
                    if (event.event === 'start-file')
                        this.hasFile = true;
                    if (event.event === 'end-file')
                        this.hasFile = false;
                    if (event.event === 'property-change' && event.name === 'track-list' && Array.isArray(event.data))
                        event.data = event.data.map(track => ({ ...track, id: String(track.id) }));
                    if (event.event === 'command-reply' && event.id) {
                        const pending = this.pending.get(event.id);
                        if (pending) {
                            clearTimeout(pending.timer);
                            this.pending.delete(event.id);
                            event.error ? pending.reject(new Error(event.error)) : pending.resolve();
                        }
                    }
                    if (event.event === 'property-change' && event.name)
                        this.properties.set(event.name, event.data);
                    this.dispatchEvent(new CustomEvent('mpv', { detail: event }));
                }
            };
            void (async () => {
                await this.audioContext.audioWorklet.addModule(new URL('../audio-worklet.js', import.meta.url));
                if (this.destroyed)
                    throw new Error('Player destroyed during initialization');
                this.audioNode = new AudioWorkletNode(this.audioContext, 'webmpv-pcm', { numberOfInputs: 0, numberOfOutputs: 1, outputChannelCount: [2], processorOptions: { buffer: audio, capacity: 8192, measureOutput } });
                this.audioNode.port.onmessage = ({ data }) => { const stamp = this.audioContext.getOutputTimestamp(); const wallTime = stamp.performanceTime !== undefined && stamp.contextTime !== undefined ? performance.timeOrigin + stamp.performanceTime + (data.audioFrame / data.sampleRate - stamp.contextTime) * 1000 : null; this.dispatchEvent(new CustomEvent('output', { detail: { ...data, wallTime, stamp } })); };
                this.analyser = this.audioContext.createAnalyser();
                this.audioNode.connect(this.analyser);
                this.analyser.connect(this.audioContext.destination);
                const response = await fetch(new URL('../../fixtures/DejaVuSans.ttf', import.meta.url));
                if (!response.ok)
                    throw new Error('Could not load the bundled subtitle font');
                const font = await response.arrayBuffer();
                if (this.destroyed)
                    throw new Error('Player destroyed during initialization');
                const offscreen = canvas.transferControlToOffscreen();
                this.worker.postMessage({ type: 'init', canvas: offscreen, audio, font, sampleRate: this.audioContext.sampleRate, disableBrowserCodecs, measureOutput, decoder, decoderFaultAfter }, [offscreen, font]);
                this.timing = setInterval(() => this.sendTiming(), 20);
                this.sendTiming();
            })().catch(error => { clearTimeout(timeout); reject(error); });
        });
    }
    sendTiming() {
        // Fallback latency estimate, explicitly not an independent A/V sync measurement.
        const latency = (this.audioContext.baseLatency || 0) + (this.audioContext.outputLatency || 0);
        this.worker.postMessage({ type: 'timing', latencyUs: Math.round(latency * 1e6), running: this.audioContext.state === 'running' });
    }
    fail(error, id, report = true) {
        for (const [key, p] of this.pending)
            if (!id || key === id) {
                clearTimeout(p.timer);
                p.reject(error);
                this.pending.delete(key);
            }
        if (report)
            for (const cancel of this.eventWaiters)
                cancel(error);
        if (report)
            this.dispatchEvent(new CustomEvent('error', { detail: error.message }));
    }
    request(message, transfer = []) {
        if (this.destroyed)
            return Promise.reject(new Error('Player is destroyed'));
        if (this.pending.size >= 128)
            return Promise.reject(new Error('Command queue is full'));
        const id = this.nextId++;
        return new Promise((resolve, reject) => {
            const timer = setTimeout(() => { this.pending.delete(id); reject(new Error('Command timed out')); }, 15000);
            this.pending.set(id, { resolve, reject, timer });
            this.worker.postMessage({ ...message, id }, transfer);
        });
    }
    async open(file) {
        if (this.destroyed)
            throw new Error('Player is destroyed');
        if (this.opening)
            throw new Error('Another open is in progress');
        this.opening = true;
        try {
            await this.openLocal(file);
        }
        finally {
            this.opening = false;
        }
    }
    async openRemote(source) {
        if (this.destroyed)
            throw new Error('Player is destroyed');
        if (this.opening)
            throw new Error('Another open is in progress');
        this.opening = true;
        try {
            await this.ready;
            if (this.hasFile)
                await Promise.all([this.waitForEvent(e => e.event === 'end-file'), this.command('stop')]);
            else
                await this.command('stop');
            const { refreshAuthorization, ...options } = source;
            this.refreshAuthorization = refreshAuthorization;
            const loaded = this.waitForEvent(e => e.event === 'file-loaded' || (e.event === 'end-file' && e.reason === 'error' ? new Error(String(e.file_error)) : false));
            await Promise.all([loaded, this.request({ type: 'open-remote', options, canRefresh: !!refreshAuthorization })]);
        }
        finally {
            this.opening = false;
        }
    }
    waitForEvent(predicate) {
        return new Promise((resolve, reject) => {
            const finish = (error) => { clearTimeout(timeout); this.removeEventListener('mpv', listener); this.eventWaiters.delete(cancel); error ? reject(error) : resolve(); };
            const cancel = (error) => finish(error);
            const listener = (event) => { const result = predicate(event.detail); if (result)
                finish(result instanceof Error ? result : undefined); };
            const timeout = setTimeout(() => finish(new Error('Media operation timed out')), 25000);
            this.eventWaiters.add(cancel);
            this.addEventListener('mpv', listener);
        });
    }
    async openLocal(file) {
        await this.ready;
        const size = file instanceof File ? file.size : file.byteLength;
        if (size > 32 * 1024 * 1024)
            throw new Error('M0 supports local fixtures up to 32 MiB');
        if (this.hasFile)
            await Promise.all([this.waitForEvent(event => event.event === 'end-file'), this.command('stop')]);
        else
            await this.command('stop');
        const bytes = file instanceof File ? await file.arrayBuffer() : file.slice(0);
        const loaded = this.waitForEvent(event => event.event === 'file-loaded' || (event.event === 'end-file' && event.reason === 'error' ? new Error(String(event.file_error)) : false));
        await Promise.all([loaded, this.request({ type: 'open', bytes }, [bytes])]);
    }
    async command(...args) { await this.ready; return this.request({ type: 'command', args }); }
    async play() { await this.audioContext.resume(); this.sendTiming(); await this.command('set', 'pause', 'no'); }
    pause() { return this.command('set', 'pause', 'yes'); }
    seek(seconds) { if (!Number.isFinite(seconds) || seconds < 0)
        throw new Error('Invalid seek time'); Atomics.store(this.audioHeader, 2, 0); return this.ready.then(() => this.request({ type: 'seek', seconds })); }
    rate(rate) { if (!Number.isFinite(rate) || rate < 0.5 || rate > 2)
        throw new Error('Playback rate must be 0.5 to 2'); return this.command('set', 'speed', String(rate)); }
    volume(percent) { if (!Number.isFinite(percent) || percent < 0 || percent > 100)
        throw new Error('Invalid volume'); return this.command('set', 'volume', String(percent)); }
    selectTrack(type, id) {
        if (!['audio', 'sub'].includes(type) || !/^(?:[1-9][0-9]*|auto|no)$/.test(id))
            throw new Error('Invalid track selection');
        return this.command('set', type === 'audio' ? 'aid' : 'sid', id);
    }
    subtitleVisible(visible) { return this.command('set', 'sub-visibility', visible ? 'yes' : 'no'); }
    resize(width, height) { if (this.destroyed)
        throw new Error('Player is destroyed'); if (!Number.isInteger(width) || !Number.isInteger(height) || width < 1 || height < 1 || width > 1920 || height > 1080)
        throw new Error('Invalid output dimensions'); this.worker.postMessage({ type: 'resize', width, height }); }
    audioDiagnostics() {
        const samples = new Float32Array(this.analyser?.fftSize || 2048);
        this.analyser?.getFloatTimeDomainData(samples);
        return { state: this.audioContext.state, sampleRate: this.audioContext.sampleRate, mediaFrames: Atomics.load(this.audioHeader, 5), underruns: Atomics.load(this.audioHeader, 6), rms: Math.sqrt(samples.reduce((sum, v) => sum + v * v, 0) / samples.length), latencyConfidence: 'reported-latency estimate' };
    }
    destroy() {
        if (this.destruction)
            return this.destruction;
        this.destroyed = true;
        clearTimeout(this.readyTimer);
        this.rejectReady?.(new Error('Player destroyed'));
        for (const cancel of this.eventWaiters)
            cancel(new Error('Player destroyed'));
        this.fail(new Error('Player destroyed'), undefined, false);
        clearInterval(this.timing);
        Atomics.store(this.audioHeader, 2, 0);
        this.audioNode?.port.postMessage('close');
        this.audioNode?.disconnect();
        this.audioNode?.port.close();
        this.analyser?.disconnect();
        this.destruction = (async () => {
            let timeout;
            try {
                await new Promise((resolve, reject) => {
                    this.onDestroyed = resolve;
                    timeout = setTimeout(() => reject(new Error('Native cleanup timed out; worker containment applied')), 10000);
                    this.worker.postMessage({ type: 'destroy' });
                });
            }
            finally {
                clearTimeout(timeout);
                this.worker.terminate();
                this.workerOwner.remove();
                await this.audioContext.close();
            }
        })();
        return this.destruction;
    }
}
