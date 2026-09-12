import { runtimeBase } from './internal/assets.js';
import { PlayerError, playerError, redact } from './internal/errors.js';
import { freeze, ranges, tracks, trackKey, mediaInfo } from './internal/state.js';
import { PLAYBACK_MODES } from './types.js';
import { nativeRejection } from './internal/selection.js';
const filterChain = (value) => {
    if (typeof value !== 'string' || value.length > 4096 || value.includes('\0'))
        throw new PlayerError('INVALID_ARGUMENT', 'Invalid filter chain');
    return value.trim();
};
const terminalSourceFailure = (error) => /Source transport:|representation changed|changed length|origin is not allowed|Authorization refresh|HTTP (?:401|403)|received (?:401|403)/i.test(String(error));
const modeValue = (mode) => {
    if (!PLAYBACK_MODES.includes(mode))
        throw new PlayerError('INVALID_ARGUMENT', 'Mode must be native, hybrid or software');
    return mode;
};
const dimensions = (width, height) => {
    if (!Number.isInteger(width) || !Number.isInteger(height) || width < 1 || height < 1 || width > 1920 || height > 1080)
        throw new PlayerError('INVALID_ARGUMENT', 'Output dimensions must be within 1920×1080');
};
/** Three explicit playback modes. Mode/filter changes reopen transactionally. */
export class Player extends EventTarget {
    ready = Promise.resolve();
    assetBase;
    snapshot;
    subscribers = new Set();
    publishQueued = false;
    sourceSerial = 0;
    publicSelections = new Map();
    operationSerial = 0;
    operationEpoch = 0;
    activeOperation;
    pendingOperation = null;
    sessionError = null;
    observedPlaying = false;
    observedWaiting = false;
    muted = false;
    closing;
    currentMode;
    automatic;
    attempts = [];
    inspection;
    recovering = false;
    lifetime = new AbortController();
    recoveredSessions = new WeakSet();
    nativeRemux;
    softwarePresenter;
    settings;
    audioOutput;
    audioFallback;
    toneMapping;
    resourceLimits;
    fonts = [];
    subtitleAssets = [];
    root;
    width;
    height;
    current;
    candidate;
    source;
    nativeTracks = [];
    queue = Promise.resolve();
    queued = 0;
    destroyed = false;
    destruction;
    busy = false;
    empty = new Map();
    monitor;
    constructor(container, options = {}) {
        super();
        if (typeof HTMLElement === 'undefined')
            throw new PlayerError('INVALID_ARGUMENT', 'Player construction requires a browser');
        this.assetBase = runtimeBase(options.assetBase);
        if (!(container instanceof HTMLElement) || container instanceof HTMLCanvasElement || container instanceof HTMLVideoElement)
            throw new PlayerError('INVALID_ARGUMENT', 'Pass a container element; Player owns its video/canvas surface');
        this.currentMode = modeValue(options.mode ?? 'native');
        this.automatic = options.automaticSelection ?? options.mode === undefined;
        if (typeof this.automatic !== 'boolean')
            throw new PlayerError('INVALID_ARGUMENT', 'Invalid automatic selection policy');
        this.audioOutput = options.audioOutput ?? 'stereo';
        this.audioFallback = options.audioFallback ?? 'stereo';
        this.toneMapping = options.toneMapping ?? 'off';
        if (!['stereo', '5.1', '7.1', 'auto'].includes(this.audioOutput) || !['stereo', 'reject'].includes(this.audioFallback))
            throw new PlayerError('INVALID_ARGUMENT', 'Invalid audio output policy');
        if (!['off', 'hdr-to-sdr'].includes(this.toneMapping))
            throw new PlayerError('INVALID_ARGUMENT', 'Invalid tone mapping policy');
        this.resourceLimits = { maxDecodePixels: options.resourceLimits?.maxDecodePixels ?? 8294400, maxAllocationBytes: options.resourceLimits?.maxAllocationBytes ?? 134217728 };
        if (!Number.isInteger(this.resourceLimits.maxDecodePixels) || this.resourceLimits.maxDecodePixels < 1 || this.resourceLimits.maxDecodePixels > 8294400 || !Number.isInteger(this.resourceLimits.maxAllocationBytes) || this.resourceLimits.maxAllocationBytes < 33554432 || this.resourceLimits.maxAllocationBytes > 268435456)
            throw new PlayerError('INVALID_ARGUMENT', 'Invalid decode resource limits');
        this.nativeRemux = options.nativeRemux ?? 'auto';
        this.softwarePresenter = options.softwarePresenter ?? 'rgb';
        if (!['rgb', 'experimental-yuv'].includes(this.softwarePresenter))
            throw new PlayerError('INVALID_ARGUMENT', 'Invalid software presenter');
        if (!['auto', 'never', 'always'].includes(this.nativeRemux))
            throw new PlayerError('INVALID_ARGUMENT', 'Invalid native remux policy');
        this.width = options.width ?? 640;
        this.height = options.height ?? 360;
        dimensions(this.width, this.height);
        this.settings = { pause: true, volume: 100, speed: 1, aid: 'auto', sid: 'auto', subtitles: true, vf: filterChain(options.videoFilters ?? ''), af: filterChain(options.audioFilters ?? '') };
        if (this.automatic && (this.settings.vf || this.settings.af || this.toneMapping !== 'off'))
            this.currentMode = 'software';
        this.validateFilters(this.currentMode, this.settings);
        this.root = document.createElement('div');
        this.root.className = 'webmpv-player';
        container.append(this.root);
        this.publish();
    }
    get state() { return this.snapshot; }
    get mediaInfo() { return this.snapshot.mediaInfo; }
    subscribe(listener) {
        this.subscribers.add(listener);
        listener(this.snapshot);
        return () => { this.subscribers.delete(listener); };
    }
    addEventListener(type, listener, options) { super.addEventListener(type, listener, options); }
    removeEventListener(type, listener, options) { super.removeEventListener(type, listener, options); }
    schedulePublish() {
        if (this.publishQueued)
            return;
        this.publishQueued = true;
        queueMicrotask(() => { this.publishQueued = false; if (!this.busy)
            this.publish(); });
    }
    publish() {
        const previous = this.snapshot, p = this.properties;
        let raw = (p.get('track-list') ?? []);
        if (this.mode === 'native' && this.surface?.videoWidth && !raw.some(t => t.type === 'video'))
            raw = [...raw, { id: '1', type: 'video', selected: true }];
        const list = this.current ? tracks(raw, this.sourceSerial, this.mode, this.current.backend.diagnostics?.plan) : [];
        const d = p.get('duration'), reportedDuration = typeof d === 'number' && Number.isFinite(d) && d >= 0 ? d : null;
        const live = (this.source?.kind === 'remote' && this.source.options.streaming?.live) || p.get('native-live') === true;
        const duration = live ? null : reportedDuration;
        const streamType = !this.source ? 'unknown' : live ? 'live' : duration !== null ? 'vod' : 'unknown';
        const cache = p.get('demuxer-cache-state');
        const seekable = !this.current ? null : this.mode === 'native' ? ranges(p.get('native-seekable')) : live ? ranges(cache?.['seekable-ranges']) : p.get('seekable') === false ? [] : p.get('seekable') === true && duration !== null ? [{ start: 0, end: duration }] : null;
        const caps = this.featureCapabilities(seekable, list.filter(t => t.type === 'audio').length, list.filter(t => t.type === 'subtitle').length);
        const status = !this.current ? (this.sessionError ? 'error' : 'idle') : this.sessionError ? 'error' : p.get('eof-reached') === true ? 'ended' : this.settings.pause || p.get('pause') === true ? 'paused' : this.observedWaiting || p.get('paused-for-cache') === true ? 'buffering' : this.observedPlaying ? 'playing' : 'paused';
        const next = { status, playbackIntent: this.settings.pause ? 'pause' : 'play', pendingOperation: this.pendingOperation, sourceId: this.current ? this.sourceSerial : null,
            currentTime: Math.max(0, Number(p.get('time-pos')) || 0), duration, streamType, subtitlesVisible: this.settings.subtitles, volume: this.settings.volume / 100, muted: this.muted, playbackRate: this.settings.speed,
            activeMode: this.current ? this.mode : null, automaticSelection: this.automatic, buffered: this.mode === 'native' && this.current ? ranges(p.get('native-buffered')) : null, seekable,
            audioTracks: list.filter(t => t.type === 'audio'), subtitleTracks: list.filter(t => t.type === 'subtitle'), mediaInfo: mediaInfo(p, this.mode, this.surface, list), capabilities: caps, error: this.sessionError };
        if (previous && JSON.stringify(previous) === JSON.stringify(next))
            return;
        this.snapshot = freeze(next);
        for (const fn of [...this.subscribers]) {
            try {
                fn(this.snapshot);
            }
            catch (error) {
                globalThis.reportError?.(error);
            }
        }
        this.dispatchEvent(new CustomEvent('statechange', { detail: this.snapshot }));
        if (!previous)
            return;
        const changed = (a, b) => JSON.stringify(a) !== JSON.stringify(b);
        for (const [event, a, b] of [
            ['sourcechange', previous.sourceId, next.sourceId], ['durationchange', previous.duration, next.duration],
            ['trackschange', [previous.audioTracks, previous.subtitleTracks], [next.audioTracks, next.subtitleTracks]],
            ['capabilitieschange', previous.capabilities, next.capabilities], ['volumechange', [previous.volume, previous.muted], [next.volume, next.muted]],
            ['ratechange', previous.playbackRate, next.playbackRate], ['timeupdate', previous.currentTime, next.currentTime],
        ])
            if (changed(a, b))
                this.dispatchEvent(new CustomEvent(event, { detail: this.snapshot }));
        if (previous.playbackIntent !== next.playbackIntent && next.playbackIntent === 'play')
            this.dispatchEvent(new CustomEvent('play', { detail: this.snapshot }));
        if (previous.status !== next.status) {
            const event = { playing: 'playing', paused: 'pause', buffering: 'waiting', ended: 'ended' }[next.status];
            if (event)
                this.dispatchEvent(new CustomEvent(event, { detail: this.snapshot }));
        }
    }
    featureCapabilities(seekable, audio, sub) {
        const isolated = globalThis.crossOriginIsolated === true, available = { availability: 'available' };
        const unavailable = (reason) => ({ availability: 'unavailable', reason });
        const unknown = { availability: 'unknown', reason: 'Open a source to establish availability' };
        const route = (mode) => !isolated ? unavailable('This deployment requires cross-origin isolation') : this.mode === mode || (mode === 'hybrid' && this.mode === 'software') ? available : this.automatic ? { availability: 'switch', mode, reason: `This feature requires ${mode} playback` } : unavailable(`Select ${mode} mode first`);
        return { ...this.legacyCapabilities, deployment: { isolated, webCodecs: typeof VideoDecoder !== 'undefined', mediaSource: typeof MediaSource !== 'undefined' }, features: {
                seek: seekable === null ? { availability: 'unknown', reason: 'Seek window has not been established' } : seekable.length ? available : unavailable('The source currently has no seekable time range'),
                audioTracks: !this.current ? unknown : audio ? available : unavailable('Audio track selection is not exposed by this source/browser'),
                subtitleTracks: !this.current ? unknown : sub ? available : unavailable('No subtitle tracks are available'),
                externalSubtitles: route('hybrid'), customFonts: route('hybrid'), videoFilters: route('software'), audioFilters: route('software')
            } };
    }
    get mode() { return this.currentMode; }
    get automaticSelection() { return this.automatic; }
    get surface() { return this.current?.surface; }
    get properties() { return this.current?.backend.properties ?? this.empty; }
    get capabilities() { return this.snapshot?.capabilities ?? this.featureCapabilities(null, 0, 0); }
    get legacyCapabilities() {
        return { videoFilters: this.automatic || this.mode === 'software', audioFilters: this.automatic || this.mode === 'software', mpvSubtitles: this.mode !== 'native', externalTextTracks: this.mode === 'native', externalSubtitles: this.automatic || this.mode !== 'native', customFonts: this.automatic || this.mode !== 'native', customRequestHeaders: this.mode !== 'native' || (this.nativeRemux !== 'never' && crossOriginIsolated && typeof MediaSource !== 'undefined') };
    }
    get diagnostics() {
        return redact({ mode: this.mode, selection: { automatic: this.automatic, attempts: this.attempts.map(a => ({ ...a })) }, switching: this.busy, videoFilters: this.settings.vf, audioFilters: this.settings.af, toneMapping: this.toneMapping, resourceLimits: { ...this.resourceLimits }, backend: this.current?.backend.diagnostics });
    }
    audioDiagnostics() { return this.current?.backend.audioDiagnostics(); }
    emit(type, detail) {
        if (type === 'error') {
            const error = playerError(detail, this.activeOperation?.id ?? null, this.activeOperation?.kind ?? null, 'session');
            this.sessionError = error.toJSON();
            this.publish();
            detail = this.sessionError;
        }
        this.dispatchEvent(new CustomEvent(type, { detail: redact(detail) }));
    }
    assertOperation() { if (this.destroyed || this.activeOperation?.controller.signal.aborted)
        throw new PlayerError('ABORTED', this.destroyed ? 'Player is destroyed' : 'Operation aborted'); }
    validateFilters(mode, settings) {
        if (mode !== 'software' && (settings.vf || settings.af || this.toneMapping !== 'off'))
            throw new PlayerError('UNSUPPORTED_FEATURE', 'Filters require software mode. Clear filters before leaving software mode.');
    }
    enqueue(operation, kind = null, signal) {
        const id = ++this.operationSerial, epoch = this.operationEpoch;
        if (this.destroyed)
            return Promise.reject(new PlayerError('ABORTED', 'Player is destroyed', id, kind));
        if (this.queued >= 32 && kind !== 'closing')
            return Promise.reject(new PlayerError('INVALID_ARGUMENT', 'Player operation queue is full', id, kind));
        this.queued++;
        const controller = new AbortController();
        const cancel = () => { controller.abort(); if (this.activeOperation?.id === id) {
            this.inspection?.abort();
            void this.candidate?.backend.destroy().catch(() => { });
        } };
        signal?.addEventListener('abort', cancel, { once: true });
        if (signal?.aborted)
            cancel();
        const result = this.queue.then(async () => {
            if (epoch !== this.operationEpoch || this.destroyed || controller.signal.aborted)
                throw new PlayerError('ABORTED', this.destroyed ? 'Player is destroyed' : 'Operation aborted', id, kind);
            this.activeOperation = { id, kind, controller, detachCallerAbort: () => signal?.removeEventListener('abort', cancel) };
            this.pendingOperation = kind ? { id, kind } : null;
            this.publish();
            if (kind === 'seeking')
                this.dispatchEvent(new CustomEvent('seeking', { detail: this.state }));
            try {
                await operation();
                this.assertOperation();
            }
            catch (error) {
                const structured = playerError(controller.signal.aborted ? new PlayerError('ABORTED', this.destroyed ? 'Player is destroyed' : 'Operation aborted') : error, id, kind);
                if (!this.current && kind === 'opening' && structured.code !== 'ABORTED')
                    this.sessionError = { ...structured.toJSON(), scope: 'session' };
                this.publish();
                this.dispatchEvent(new CustomEvent('error', { detail: freeze(structured.toJSON()) }));
                throw structured;
            }
            finally {
                this.activeOperation = undefined;
                this.pendingOperation = null;
                this.publish();
            }
            if (kind === 'seeking')
                this.dispatchEvent(new CustomEvent('seeked', { detail: this.state }));
        }).finally(() => signal?.removeEventListener('abort', cancel));
        this.queue = result.catch(() => { }).finally(() => { this.queued--; });
        return result;
    }
    async interruptible(work) {
        const signal = this.activeOperation?.controller.signal ?? this.lifetime.signal;
        this.assertOperation();
        let cancel;
        try {
            return await Promise.race([work, new Promise((_, reject) => {
                    cancel = () => reject(new PlayerError('ABORTED', this.destroyed ? 'Player is destroyed' : 'Operation aborted'));
                    signal.addEventListener('abort', cancel, { once: true });
                })]);
        }
        finally {
            signal.removeEventListener('abort', cancel);
        }
    }
    async dispose(session) {
        if (!session)
            return;
        try {
            await session.backend.destroy();
        }
        finally {
            session.surface.remove();
        }
    }
    async create(mode) {
        let backend;
        const surface = document.createElement(mode === 'native' ? 'video' : 'canvas');
        surface.width = this.width;
        surface.height = this.height;
        surface.style.cssText = 'display:none;width:100%;background:#000';
        // Import before allocating workers; destroy during import cannot orphan an engine.
        const module = mode === 'native' ? await this.interruptible(import('./internal/native-player.js')) : await this.interruptible(import('./internal/wasm-player.js'));
        this.assertOperation();
        this.root.append(surface);
        try {
            backend = 'NativePlayer' in module ? new module.NativePlayer(surface, this.nativeRemux, this.assetBase) : new module.WasmPlayer(surface, { mode: mode, softwarePresenter: this.softwarePresenter, audioOutput: this.audioOutput, audioFallback: this.audioFallback, resourceLimits: this.resourceLimits, fonts: this.fonts, assetBase: this.assetBase });
        }
        catch (error) {
            surface.remove();
            throw error;
        }
        const session = { backend, surface };
        for (const type of ['mpv', 'error', 'log', 'output', 'source', 'activity'])
            backend.addEventListener(type, event => {
                const detail = event.detail;
                if (type === 'error')
                    session.error = new Error(String(detail));
                if (type === 'mpv' && detail.event === 'end-file' && detail.reason === 'error')
                    session.error = new Error(String(detail.file_error));
                if (this.current === session && !this.busy && !this.destroyed) {
                    if (session.error && (type === 'error' || (type === 'mpv' && detail.event === 'end-file')) && this.automatic && this.mode !== 'software') {
                        this.recover(session);
                        return;
                    }
                    if (type === 'mpv' && detail.event === 'end-file' && detail.reason === 'error')
                        this.emit('error', session.error);
                    if (type === 'activity') {
                        if (detail === 'waiting')
                            this.observedWaiting = true;
                        if (detail === 'playing') {
                            this.observedPlaying = true;
                            this.observedWaiting = false;
                        }
                        this.schedulePublish();
                        return;
                    }
                    if (type === 'mpv') {
                        if (detail.event === 'property-change' && detail.name === 'time-pos' && !this.settings.pause && Number(detail.data) > this.state.currentTime) {
                            this.observedPlaying = true;
                            this.observedWaiting = false;
                        }
                        if (detail.event === 'property-change' && detail.name === 'pause' && detail.data === true && !this.activeOperation)
                            this.settings.pause = true;
                        this.schedulePublish();
                    }
                    this.emit(type, detail);
                }
            });
        return session;
    }
    async settled(session, mode, target) {
        if (mode === 'native')
            return;
        const deadline = performance.now() + 25000;
        while (performance.now() < deadline) {
            this.assertOperation();
            if (session.error)
                throw session.error;
            const d = session.backend.diagnostics;
            const tracks = session.backend.properties.get('track-list');
            // Selection is transiently empty while mpv initializes a video track.
            const hasVideo = tracks?.some(t => t.type === 'video');
            if (hasVideo === false && tracks?.length)
                return;
            if (mode === 'hybrid' && tracks?.some(t => t.type === 'video' && t.selected && !['h264', 'hevc', 'vp8', 'vp9', 'av1'].includes(t.codec ?? '')))
                throw new Error('Hybrid mode has no browser bridge for this video codec. Choose software mode for this source.');
            const position = mode === 'hybrid' ? d?.presentation?.position : d?.presentedPosition;
            if (d?.rendered && (mode !== 'hybrid' || d.decoder === 'webcodecs') && !d.seeking && position !== undefined && Math.abs(position - target) < .15)
                return;
            await new Promise(resolve => setTimeout(resolve, 25));
        }
        throw new Error(`${mode} mode did not present the requested position`);
    }
    async replace(source, mode, settings, preserve, nativeTracks, requestedTarget) {
        this.validateFilters(mode, settings);
        const attachments = preserve ? this.subtitleAssets : [];
        if (mode === 'native' && attachments.length)
            throw Error('External mpv subtitles require Hybrid or Software');
        if (mode === 'native' && this.audioOutput !== 'stereo')
            throw Error('Explicit PCM output layout requires Hybrid or Software');
        if (source.kind === 'local' && source.file instanceof ArrayBuffer && source.file.byteLength > 32 * 1024 * 1024)
            throw new Error('ArrayBuffer sources are limited to 32 MiB');
        const old = this.current;
        const wasPaused = this.settings.pause;
        const desired = { ...settings, pause: preserve ? !!wasPaused : true };
        const target = requestedTarget ?? (preserve ? Math.max(0, Number(old?.backend.properties.get('time-pos')) || 0) : 0);
        if ((!preserve && old) || (preserve && (mode === 'native') !== (this.mode === 'native'))) {
            desired.aid = preserve && settings.aid === 'no' ? 'no' : 'auto';
            desired.sid = preserve && settings.sid === 'no' ? 'no' : 'auto';
        }
        const crossing = preserve && this.automatic && (mode === 'native') !== (this.mode === 'native');
        const trackIndexes = new Map();
        if (crossing) {
            for (const type of ['audio', 'sub']) {
                const id = settings[type === 'audio' ? 'aid' : 'sid'];
                if (['auto', 'no'].includes(id))
                    continue;
                const list = old?.backend.properties.get('track-list');
                const track = list?.find(t => t.type === type && String(t.id) === id);
                const index = this.mode === 'native' && old?.backend.diagnostics?.plan === 'remux' ? Number(id) - 1 : track?.['ff-index'];
                if (index === undefined)
                    throw Error('Cannot preserve selected track across playback modes');
                trackIndexes.set(type, index);
            }
        }
        if (this.activeOperation && !this.pendingOperation) {
            this.activeOperation.kind = 'switching';
            this.pendingOperation = { id: this.activeOperation.id, kind: 'switching' };
        }
        this.busy = true;
        this.publish();
        this.emit('modechange', { phase: 'loading', mode });
        let candidate;
        try {
            if (old && !old.error)
                await old.backend.pause();
            candidate = this.candidate = await this.create(mode);
            this.assertOperation();
            const p = candidate.backend;
            await p.ready;
            this.assertOperation();
            const tone = this.toneMapping === 'hdr-to-sdr' ? 'zscale=transfer=linear:npl=100,format=gbrpf32le,zscale=primaries=bt709,tonemap=tonemap=mobius:desat=0,zscale=transfer=bt709:matrix=bt709:range=limited,format=yuv420p' : '';
            const vf = [tone ? `lavfi=[${tone}]` : '', desired.vf].filter(Boolean).join(',');
            if (vf)
                await p.command('set', 'vf', vf);
            if (desired.af)
                await p.command('set', 'af', desired.af);
            await p.volume(this.muted ? 0 : desired.volume);
            await p.rate(desired.speed);
            // Native numeric track IDs only exist after metadata/text-track loading.
            if (mode !== 'native') {
                await p.selectTrack('audio', desired.aid);
                await p.selectTrack('sub', desired.sid);
                await p.subtitleVisible(desired.subtitles);
            }
            if (source.kind === 'local')
                await p.open(source.file, source.input);
            else
                await p.openRemote(source.options);
            if ('inspectMetadata' in p)
                await p.inspectMetadata();
            this.assertOperation();
            if (mode !== 'native') {
                for (const subtitle of attachments)
                    await p.addSubtitle(subtitle);
                if (attachments.length && desired.sid !== 'auto')
                    await p.selectTrack('sub', desired.sid);
            }
            if (mode === 'native') {
                for (const track of nativeTracks)
                    await p.addTextTrack(track);
                await p.selectTrack('audio', desired.aid);
                await p.selectTrack('sub', desired.sid);
                await p.subtitleVisible(desired.subtitles);
            }
            for (const [type, index] of trackIndexes) {
                const list = p.properties.get('track-list');
                const track = list?.find(t => t.type === type && (mode === 'native' ? p.diagnostics?.plan === 'remux' && Number(t.id) - 1 === index : t['ff-index'] === index));
                if (!track)
                    throw Error('Cannot preserve selected track across playback modes');
                const id = String(track.id);
                await p.selectTrack(type, id);
                desired[type === 'audio' ? 'aid' : 'sid'] = id;
            }
            if (preserve)
                for (const [type, key] of this.publicSelections) {
                    const raw = (p.properties.get('track-list') ?? []);
                    const plan = p.diagnostics?.plan;
                    const track = raw.find(t => t.type === type && trackKey(t, mode, plan) === key);
                    if (!track)
                        throw new PlayerError('UNSUPPORTED_FEATURE', 'Cannot preserve explicit public track selection across playback modes');
                    const id = String(track.id);
                    await p.selectTrack(type, id);
                    desired[type === 'audio' ? 'aid' : 'sid'] = id;
                }
            await this.settled(candidate, mode, 0);
            if (target > 0) {
                await p.seek(target);
                await this.settled(candidate, mode, target);
            }
            if (candidate.error)
                throw candidate.error;
            if (!desired.pause)
                await p.play();
            this.assertOperation();
            if (!preserve) {
                this.sourceSerial++;
                this.publicSelections.clear();
            }
            this.sessionError = null;
            this.observedPlaying = false;
            this.observedWaiting = false;
            this.current = candidate;
            this.candidate = undefined;
            this.source = source;
            this.currentMode = mode;
            this.settings = desired;
            this.nativeTracks = nativeTracks;
            if (!preserve)
                this.subtitleAssets = [];
            // Acceptance is the cancellation boundary, including synchronous observers.
            // close/destroy still abort the internal controller during old-session cleanup.
            this.activeOperation?.detachCallerAbort();
            this.publish();
            candidate.surface.style.display = 'block';
            if (old)
                old.surface.style.display = 'none';
            clearInterval(this.monitor);
            let inactiveSamples = 0;
            if (mode === 'hybrid')
                this.monitor = setInterval(() => {
                    const d = p.diagnostics;
                    const hasVideo = p.properties.get('track-list')?.some(t => t.type === 'video' && t.selected);
                    inactiveSamples = hasVideo && !this.busy && this.queued === 0 && d?.decoder === 'software' ? inactiveSamples + 1 : 0;
                    if (inactiveSamples >= 4) {
                        clearInterval(this.monitor);
                        if (this.automatic) {
                            candidate.error = new Error('Hybrid browser decoder became inactive for four consecutive checks');
                            this.recover(candidate);
                            return;
                        }
                        this.settings.pause = true;
                        void p.pause().catch(() => { });
                        this.emit('error', 'Hybrid decoder stopped. Reopen in software mode.');
                    }
                }, 250);
            // The new session is committed. Cleanup failures must not pretend to roll it back.
            try {
                await this.dispose(old);
            }
            catch (error) {
                this.dispatchEvent(new CustomEvent('error', { detail: freeze(playerError(error, this.activeOperation?.id ?? null, this.activeOperation?.kind ?? null, 'operation').toJSON()) }));
            }
            for (const [name, data] of p.properties)
                this.emit('mpv', { event: 'property-change', name, data });
            this.emit('mpv', { event: 'file-loaded' });
            this.emit('modechange', { phase: 'ready', mode, position: target });
        }
        catch (error) {
            if (candidate && candidate !== this.current)
                await this.dispose(candidate).catch(() => { });
            this.candidate = undefined;
            if (old && !old.error && this.current === old && !wasPaused && !this.destroyed && !this.closing)
                await old.backend.play().catch(() => { });
            this.emit('modechange', { phase: 'failed', mode, rolledBack: this.current === old, message: String(error) });
            throw error;
        }
        finally {
            this.busy = false;
            this.publish();
        }
    }
    record(attempt) {
        this.attempts.push(attempt);
        if (this.attempts.length > 32)
            this.attempts.shift();
        this.emit('selectionchange', { ...attempt });
    }
    async select(source, settings, preserve, tracks, start = 0, target, priorAttempts = []) {
        if (!this.automatic)
            return this.replace(source, this.mode, settings, preserve, tracks, target);
        this.attempts = [];
        for (const attempt of priorAttempts)
            this.record(attempt);
        let nativeReason;
        if (start === 0 && !(settings.vf || settings.af || this.toneMapping !== 'off')) {
            if ((source.kind === 'local' && source.input?.demuxer) || (source.kind === 'remote' && (source.options.demuxer || (source.options.format && source.options.format !== 'file')))) {
                nativeReason = 'Manifest track requirements require mpv inspection';
            }
            else {
                const controller = this.inspection = new AbortController();
                try {
                    let probe;
                    // Immutable local bytes permit bounded inspection without an engine download.
                    // Remote identity/permission enforcement continues through the existing inspector.
                    if (source.kind === 'local' && this.nativeRemux !== 'always') {
                        const { cheapMP4Probe } = await this.interruptible(import(new URL('web/cheap-mp4-probe.js', this.assetBase).href));
                        const local = source.file instanceof File ? source.file : new File([source.file], 'media');
                        const cheap = await cheapMP4Probe(local, controller.signal, document.createElement('video'));
                        probe = cheap.probe;
                        this.record({ mode: 'probe', outcome: probe ? 'selected' : 'skipped', reason: `Local MP4 metadata: ${cheap.bytesRead} bytes; ${probe ? 'no inspector Wasm required' : cheap.reason}` });
                    }
                    this.assertOperation();
                    const transport = source.kind === 'local' ? { file: source.file instanceof File ? source.file : new File([source.file], 'media') } : (() => { const { refreshAuthorization, ...options } = source.options; return { options: { ...options, url: new URL(options.url, location.href).href }, refreshAuthorization }; })();
                    if (!probe) {
                        const { probeSource } = await this.interruptible(import(new URL('web/source-probe.js', this.assetBase).href));
                        probe = await probeSource(transport, controller.signal);
                    }
                    if (!probe)
                        throw Error('Source inspection returned no metadata');
                    if (source.kind === 'remote' && probe.identity)
                        source.options.identity ??= probe.identity;
                    // Cross-mode track IDs reset to auto in replace(); preflight that same selection.
                    let aid = preserve && (this.mode === 'native' || settings.aid === 'no') ? settings.aid : 'auto';
                    const sid = tracks.length ? 'no' : preserve && (this.mode === 'native' || settings.sid === 'no') ? settings.sid : 'auto';
                    if (preserve && this.mode === 'native' && this.current?.backend.diagnostics?.plan === 'remux' && !['auto', 'no'].includes(aid))
                        aid = probe.tracks.find(t => t.type === 'audio' && t.index === Number(aid) - 1)?.id ?? aid;
                    nativeReason = nativeRejection(probe, { ...settings, aid, sid }, document.createElement('video'));
                }
                catch (error) {
                    if (this.destroyed || this.activeOperation?.controller.signal.aborted || playerError(error).code === 'AUTOPLAY_BLOCKED' || terminalSourceFailure(error))
                        throw error;
                    nativeReason = 'Native eligibility could not be established: ' + String(error);
                    this.record({ mode: 'probe', outcome: 'failed', reason: String(error) });
                }
                finally {
                    controller.abort();
                    if (this.inspection === controller)
                        this.inspection = undefined;
                }
            }
        }
        const errors = [];
        for (const mode of PLAYBACK_MODES.slice(start)) {
            this.assertOperation();
            const reason = (settings.vf || settings.af || this.toneMapping !== 'off') && mode !== 'software' ? 'CPU filters or tone mapping require Software' : mode === 'native' ? (preserve && this.subtitleAssets.length ? 'External mpv subtitles require mpv' : this.audioOutput !== 'stereo' ? 'Explicit PCM layout requires mpv' : nativeReason) : tracks.length ? 'External browser text tracks cannot be silently discarded' : undefined;
            if (reason) {
                this.record({ mode, outcome: 'skipped', reason });
                continue;
            }
            try {
                await this.replace(source, mode, settings, preserve, tracks, target);
                this.record({ mode, outcome: 'selected', reason: 'Playback requirements and actual presentation accepted' });
                if (this.current?.error && !this.recovering)
                    this.recover(this.current);
                return;
            }
            catch (error) {
                if (this.destroyed || this.activeOperation?.controller.signal.aborted || playerError(error).code === 'AUTOPLAY_BLOCKED' || terminalSourceFailure(error))
                    throw error;
                errors.push(`${mode}: ${String(error)}`);
                this.record({ mode, outcome: 'failed', reason: String(error) });
            }
        }
        throw Error('No playback route satisfied the source: ' + (errors.join('; ') || this.attempts.map(a => a.reason).join('; ')));
    }
    recover(session) {
        if (this.recovering || this.recoveredSessions.has(session) || this.destroyed || !this.automatic || !this.source || this.mode === 'software')
            return;
        this.recoveredSessions.add(session);
        if (terminalSourceFailure(session.error)) {
            void session.backend.pause().catch(() => { });
            this.emit('error', String(session.error));
            return;
        }
        this.recovering = true;
        void this.enqueue(async () => {
            if (this.current !== session || !this.automatic)
                return;
            await session.backend.pause().catch(() => { });
            const policy = this.nativeRemux;
            const tryRemux = this.mode === 'native' && session.backend.diagnostics?.plan === 'direct' && policy !== 'never';
            const priorAttempts = [...this.attempts.filter(attempt => attempt.outcome !== 'selected'), { mode: this.mode, outcome: 'failed', reason: `Runtime playback failure: ${session.error?.message ?? 'Playback backend became unavailable'}` }];
            try {
                if (tryRemux)
                    this.nativeRemux = 'always';
                await this.select(this.source, this.settings, true, this.nativeTracks, tryRemux ? 0 : PLAYBACK_MODES.indexOf(this.mode) + 1, undefined, priorAttempts);
            }
            finally {
                this.nativeRemux = policy;
            }
        }, 'switching').catch(error => { if (!this.destroyed)
            this.emit('error', String(error)); }).finally(() => { this.recovering = false; if (this.current?.error && this.current !== session)
            this.recover(this.current); });
    }
    setAutomaticSelection(enabled = true) {
        if (typeof enabled !== 'boolean')
            throw new PlayerError('INVALID_ARGUMENT', 'Invalid automatic selection policy');
        return this.enqueue(async () => {
            const previous = this.automatic;
            this.automatic = enabled;
            try {
                if (enabled && this.source)
                    await this.select(this.source, this.settings, true, this.nativeTracks);
            }
            catch (error) {
                this.automatic = previous;
                throw error;
            }
        }, 'switching');
    }
    open(input, options = {}) {
        let source;
        try {
            if (typeof input === 'string' || input instanceof URL || (!(input instanceof File) && !(input instanceof ArrayBuffer) && input && typeof input === 'object')) {
                const value = typeof input === 'string' || input instanceof URL ? { url: String(input) } : input;
                if (typeof value.url !== 'string' || !value.url.trim())
                    throw Error('Invalid remote URL');
                const url = new URL(value.url, location.href);
                if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password)
                    throw Error('Invalid remote URL');
                source = { kind: 'remote', options: { ...value, url: url.href, headers: value.headers ? { ...value.headers } : undefined, streaming: value.streaming ? { ...value.streaming } : undefined, allowedOrigins: value.allowedOrigins?.slice() } };
            }
            else {
                if (!(input instanceof File) && !(input instanceof ArrayBuffer))
                    throw Error('Expected File, ArrayBuffer or remote source');
                if (input instanceof ArrayBuffer && input.byteLength > 32 * 1024 * 1024)
                    throw Error('ArrayBuffer sources are limited to 32 MiB; use File for larger sources');
                source = { kind: 'local', file: input instanceof File ? input : input.slice(0), input: { demuxer: options.demuxer } };
            }
        }
        catch (error) {
            return Promise.reject(playerError(error));
        }
        return this.enqueue(() => this.select(source, this.settings, false, []), 'opening', options.signal);
    }
    openRemote(source, options = {}) { return this.open(source, options); }
    setMode(mode) {
        modeValue(mode);
        return this.enqueue(async () => {
            this.validateFilters(mode, this.settings);
            if (mode === this.mode) {
                this.automatic = false;
                return;
            }
            if (this.source)
                await this.replace(this.source, mode, this.settings, true, this.nativeTracks);
            else {
                this.currentMode = mode;
                this.emit('modechange', { phase: 'ready', mode, position: 0 });
            }
            this.automatic = false;
        }, 'switching');
    }
    filters(key, value) {
        const chain = filterChain(value);
        return this.enqueue(async () => {
            if (!this.automatic && this.mode !== 'software')
                throw new Error('Filters require software mode. Call setMode("software") first.');
            if (chain === this.settings[key])
                return;
            const settings = { ...this.settings, [key]: chain };
            if (this.source)
                await this.select(this.source, settings, true, this.nativeTracks);
            else {
                this.settings = settings;
                if (this.automatic && (settings.vf || settings.af))
                    this.currentMode = 'software';
            }
        }, 'switching');
    }
    setVideoFilters(value) { return this.filters('vf', value); }
    setAudioFilters(value) { return this.filters('af', value); }
    setting(action, update) {
        return this.enqueue(async () => { if (this.current)
            await action(this.current.backend); update(); });
    }
    play() {
        // Initiate resume before yielding the user's activation to the operation queue.
        const immediate = !this.destroyed && this.queued === 0 && this.current ? this.current.backend.play() : undefined;
        immediate?.catch(() => { });
        return this.enqueue(async () => { if (!this.current)
            throw Error('No source'); await (immediate ?? this.current.backend.play()); this.settings.pause = false; });
    }
    pause() { return this.setting(p => p.pause(), () => { this.settings.pause = true; this.observedPlaying = false; this.observedWaiting = false; }); }
    seek(seconds) {
        if (!Number.isFinite(seconds) || seconds < 0)
            throw new PlayerError('INVALID_ARGUMENT', 'Invalid seek time');
        return this.enqueue(async () => {
            if (!this.current)
                throw new Error('No source');
            const window = this.state.seekable;
            if (window && !window.some(r => seconds >= r.start && seconds <= r.end))
                throw new PlayerError('INVALID_ARGUMENT', 'Seek is outside the current seekable window');
            try {
                await this.current.backend.seek(seconds);
                await this.settled(this.current, this.mode, seconds);
            }
            catch (error) {
                if (this.activeOperation?.controller.signal.aborted || playerError(error).code === 'AUTOPLAY_BLOCKED' || !this.automatic || this.mode === 'software' || terminalSourceFailure(error) || /out of range|Invalid seek/i.test(String(error)))
                    throw error;
                await this.select(this.source, this.settings, true, this.nativeTracks, PLAYBACK_MODES.indexOf(this.mode) + 1, seconds);
            }
        }, 'seeking');
    }
    volume(value) {
        if (!Number.isFinite(value) || value < 0 || value > 100)
            throw new PlayerError('INVALID_ARGUMENT', 'Invalid volume');
        return this.setting(p => p.volume(this.muted ? 0 : value), () => { this.settings.volume = value; });
    }
    setVolume(value) { if (!Number.isFinite(value) || value < 0 || value > 1)
        throw new PlayerError('INVALID_ARGUMENT', 'Volume must be 0 to 1'); return this.volume(value * 100); }
    setMuted(value) { if (typeof value !== 'boolean')
        throw new PlayerError('INVALID_ARGUMENT', 'Expected boolean mute state'); return this.setting(p => p.volume(value ? 0 : this.settings.volume), () => { this.muted = value; }); }
    setPlaybackRate(value) { return this.rate(value); }
    selectAudioTrack(id) { return this.selectPublicTrack('audio', id); }
    selectSubtitleTrack(id) { return this.selectPublicTrack('sub', id); }
    selectPublicTrack(type, id) {
        return this.enqueue(async () => {
            if (!this.current)
                throw Error('No source');
            const raw = (this.properties.get('track-list') ?? []);
            const plan = this.current.backend.diagnostics?.plan;
            const track = raw.find(t => t.type === type && `${this.sourceSerial}:${trackKey(t, this.mode, plan)}` === id);
            if (id !== null && id !== 'auto' && !track)
                throw new PlayerError('INVALID_ARGUMENT', 'Unknown or stale public track ID');
            const backendId = id === null ? 'no' : id === 'auto' ? 'auto' : String(track.id);
            await this.current.backend.selectTrack(type, backendId);
            this.settings[type === 'audio' ? 'aid' : 'sid'] = backendId;
            if (track)
                this.publicSelections.set(type, trackKey(track, this.mode, plan));
            else
                this.publicSelections.delete(type);
        }, 'switching');
    }
    rate(value) {
        if (!Number.isFinite(value) || value < .5 || value > 2)
            throw new PlayerError('INVALID_ARGUMENT', 'Playback rate must be 0.5 to 2');
        return this.setting(p => p.rate(value), () => { this.settings.speed = value; });
    }
    selectTrack(type, id) {
        if (!['audio', 'sub'].includes(type) || !/^(?:[1-9][0-9]*|auto|no)$/.test(id))
            throw new PlayerError('INVALID_ARGUMENT', 'Invalid track selection');
        return this.setting(p => p.selectTrack(type, id), () => { this.settings[type === 'audio' ? 'aid' : 'sid'] = id; this.publicSelections.delete(type); });
    }
    subtitleVisible(visible) {
        if (typeof visible !== 'boolean')
            throw new PlayerError('INVALID_ARGUMENT', 'Expected boolean subtitle visibility');
        return this.enqueue(async () => {
            const settings = { ...this.settings, subtitles: visible };
            if (this.automatic && this.source && this.mode === 'native' && visible && !this.settings.subtitles)
                await this.select(this.source, settings, true, this.nativeTracks);
            else {
                if (this.current)
                    await this.current.backend.subtitleVisible(visible);
                this.settings = settings;
            }
        });
    }
    addSubtitle(file, options = {}) {
        if (!(file instanceof File))
            return Promise.reject(new PlayerError('INVALID_ARGUMENT', 'Expected a subtitle File'));
        const format = file.name.split('.').at(-1)?.toLowerCase();
        if (!['ass', 'ssa', 'srt', 'vtt'].includes(format ?? '') || file.size > 8 * 1024 * 1024)
            return Promise.reject(new PlayerError('INVALID_ARGUMENT', 'Expected an SRT, ASS, SSA or WebVTT file up to 8 MiB'));
        return this.enqueue(async () => {
            if (!this.source)
                throw Error('Open a movie before adding subtitles');
            if (this.subtitleAssets.length >= 16 || this.subtitleAssets.reduce((n, a) => n + a.bytes.byteLength, 0) + file.size > 16 * 1024 * 1024)
                throw Error('Subtitle budget exceeded');
            const bytes = await this.interruptible(file.arrayBuffer());
            const old = this.subtitleAssets;
            this.subtitleAssets = [...old, { bytes, format: format, label: options.label ?? file.name, language: options.language, select: options.select ?? true }];
            try {
                await this.select(this.source, { ...this.settings, sid: options.select === false ? this.settings.sid : 'auto' }, true, this.nativeTracks);
            }
            catch (error) {
                this.subtitleAssets = old;
                throw error;
            }
        });
    }
    addFont(file) {
        if (!(file instanceof File) || !/\.(ttf|otf)$/i.test(file.name) || file.size > 8 * 1024 * 1024)
            return Promise.reject(new PlayerError('INVALID_ARGUMENT', 'Expected a TTF/OTF font up to 8 MiB'));
        return this.enqueue(async () => {
            if (this.fonts.length >= 16 || this.fonts.reduce((n, a) => n + a.bytes.byteLength, 0) + file.size > 32 * 1024 * 1024)
                throw Error('Font budget exceeded');
            const bytes = await this.interruptible(file.arrayBuffer()), old = this.fonts;
            this.fonts = [...old, { name: 'user-' + old.length + '.' + file.name.split('.').at(-1).toLowerCase(), bytes }];
            try {
                if (this.source && this.mode !== 'native')
                    await this.replace(this.source, this.mode, this.settings, true, this.nativeTracks);
            }
            catch (error) {
                this.fonts = old;
                throw error;
            }
        });
    }
    setToneMapping(value) {
        if (!['off', 'hdr-to-sdr'].includes(value))
            throw new PlayerError('INVALID_ARGUMENT', 'Invalid tone mapping policy');
        return this.enqueue(async () => { const old = this.toneMapping; this.toneMapping = value; try {
            if (this.source)
                await this.select(this.source, this.settings, true, this.nativeTracks);
            else if (this.automatic && value !== 'off')
                this.currentMode = 'software';
            else
                this.validateFilters(this.mode, this.settings);
        }
        catch (error) {
            this.toneMapping = old;
            throw error;
        } });
    }
    addTextTrack(track) {
        const source = { ...track };
        return this.enqueue(async () => {
            if (this.mode !== 'native' || !this.current)
                throw new Error('External browser text tracks require an open native player');
            await this.current.backend.addTextTrack(source);
            this.nativeTracks.push(source);
        });
    }
    resize(width, height) {
        if (this.destroyed)
            throw new PlayerError('ABORTED', 'Player is destroyed');
        dimensions(width, height);
        this.width = width;
        this.height = height;
        this.current?.backend.resize(width, height);
    }
    close() {
        if (this.destroyed)
            return this.destruction;
        if (this.closing)
            return this.closing;
        this.operationEpoch++;
        this.activeOperation?.controller.abort();
        this.inspection?.abort();
        clearInterval(this.monitor);
        const cleanup = Promise.all([this.candidate, this.current].map(s => s?.backend.destroy().catch(() => { })));
        this.closing = this.enqueue(async () => { await cleanup; await this.dispose(this.current); this.current = undefined; this.candidate = undefined; this.source = undefined; this.nativeTracks = []; this.subtitleAssets = []; this.publicSelections.clear(); this.settings = { ...this.settings, pause: true, aid: 'auto', sid: 'auto' }; this.sessionError = null; this.observedPlaying = false; this.observedWaiting = false; }, 'closing').finally(() => { this.closing = undefined; });
        return this.closing;
    }
    destroy() {
        if (this.destruction)
            return this.destruction;
        this.destroyed = true;
        this.operationEpoch++;
        this.activeOperation?.controller.abort();
        this.lifetime.abort();
        this.inspection?.abort();
        clearInterval(this.monitor);
        this.destruction = (async () => {
            await Promise.all([this.candidate, this.current].map(session => session?.backend.destroy().catch(() => { })));
            await this.queue;
            try {
                await this.dispose(this.current);
            }
            finally {
                this.current = undefined;
                this.source = undefined;
                this.nativeTracks = [];
                this.subtitleAssets = [];
                this.fonts = [];
                this.settings.pause = true;
                this.sessionError = null;
                this.publish();
                this.subscribers.clear();
                this.root.remove();
            }
        })();
        return this.destruction;
    }
}
