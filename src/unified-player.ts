import {PLAYBACK_MODES} from './types.js';
import type {PlaybackMode, PlayerOptions, RemoteSource, TextTrackSource, Capabilities, Diagnostics, TrackType, PlaybackEvent} from './types.js';
import type {Backend, Session} from './internal/backend.js';

type Source = {kind: 'local'; file: File | ArrayBuffer} | {kind: 'remote'; options: RemoteSource};
type Settings = {pause: boolean; volume: number; speed: number; aid: string; sid: string; subtitles: boolean; vf: string; af: string};
const filterChain = (value: string) => {
  if (typeof value !== 'string' || value.length > 4096 || value.includes('\0')) throw new Error('Invalid filter chain');
  return value.trim();
};
const modeValue = (mode: PlaybackMode) => {
  if (!PLAYBACK_MODES.includes(mode)) throw new Error('Mode must be native, hybrid or software');
  return mode;
};
const dimensions = (width: number, height: number) => {
  if (!Number.isInteger(width) || !Number.isInteger(height) || width < 1 || height < 1 || width > 1920 || height > 1080) throw new Error('Output dimensions must be within 1920×1080');
};

/** Three explicit playback modes. Mode/filter changes reopen transactionally. */
export class Player extends EventTarget {
  readonly ready = Promise.resolve();
  private currentMode: PlaybackMode;
  private settings: Settings;
  private root: HTMLDivElement;
  private width: number;
  private height: number;
  private current?: Session;
  private candidate?: Session;
  private source?: Source;
  private nativeTracks: TextTrackSource[] = [];
  private queue: Promise<void> = Promise.resolve();
  private queued = 0;
  private destroyed = false;
  private destruction?: Promise<void>;
  private busy = false;
  private empty = new Map<string, unknown>();
  private monitor?: ReturnType<typeof setInterval>;

  constructor(container: HTMLElement, options: PlayerOptions = {}) {
    super();
    if (!(container instanceof HTMLElement) || container instanceof HTMLCanvasElement || container instanceof HTMLVideoElement) throw new Error('Pass a container element; Player owns its video/canvas surface');
    this.currentMode = modeValue(options.mode ?? 'native');
    this.width = options.width ?? 640;this.height = options.height ?? 360;dimensions(this.width, this.height);
    this.settings = {pause: true, volume: 100, speed: 1, aid: 'auto', sid: 'auto', subtitles: true, vf: filterChain(options.videoFilters ?? ''), af: filterChain(options.audioFilters ?? '')};
    this.validateFilters(this.currentMode, this.settings);
    this.root = document.createElement('div');this.root.className = 'webmpv-player';container.append(this.root);
  }
  get mode() {return this.currentMode;}
  get surface() {return this.current?.surface;}
  get properties(): ReadonlyMap<string, unknown> {return this.current?.backend.properties ?? this.empty;}
  get capabilities(): Capabilities {
    return {videoFilters: this.mode === 'software', audioFilters: this.mode === 'software', mpvSubtitles: this.mode !== 'native', externalTextTracks: this.mode === 'native', customRequestHeaders: this.mode !== 'native'};
  }
  get diagnostics(): Diagnostics {
    return {mode: this.mode, switching: this.busy, videoFilters: this.settings.vf, audioFilters: this.settings.af, backend: this.current?.backend.diagnostics as Record<string, unknown> | undefined};
  }
  audioDiagnostics() {return this.current?.backend.audioDiagnostics();}
  private emit(type: string, detail: unknown) {this.dispatchEvent(new CustomEvent(type, {detail}));}
  private validateFilters(mode: PlaybackMode, settings: Settings) {
    if (mode !== 'software' && (settings.vf || settings.af)) throw new Error('Filters require software mode. Clear filters before leaving software mode.');
  }
  private enqueue(operation: () => Promise<void>): Promise<void> {
    if (this.destroyed) return Promise.reject(new Error('Player is destroyed'));
    if (this.queued >= 32) return Promise.reject(new Error('Player operation queue is full'));
    this.queued++;
    const result = this.queue.then(() => {if (this.destroyed) throw new Error('Player is destroyed');return operation();});
    this.queue = result.catch(() => {}).finally(() => {this.queued--;});return result;
  }
  private async dispose(session?: Session) {
    if (!session) return;
    try {await session.backend.destroy();} finally {session.surface.remove();}
  }
  private async create(mode: PlaybackMode): Promise<Session> {
    let backend: Backend;
    const surface = document.createElement(mode === 'native' ? 'video' : 'canvas');
    surface.width = this.width;surface.height = this.height;
    surface.style.cssText = 'display:none;width:100%;background:#000';
    // Import before allocating workers; destroy during import cannot orphan an engine.
    const module = mode === 'native' ? await import('./internal/native-player.js') : await import('./internal/wasm-player.js');
    if (this.destroyed) throw new Error('Player is destroyed');
    this.root.append(surface);
    try {
      backend = 'NativePlayer' in module ? new module.NativePlayer(surface as HTMLVideoElement) : new module.WasmPlayer(surface as HTMLCanvasElement, {mode: mode as 'hybrid' | 'software'});
    } catch (error) {surface.remove();throw error;}
    const session: Session = {backend, surface};
    for (const type of ['mpv', 'error', 'log', 'output', 'source']) backend.addEventListener(type, event => {
      const detail = (event as CustomEvent).detail;
      if (type === 'error') session.error = new Error(String(detail));
      if (type === 'mpv' && detail.event === 'end-file' && detail.reason === 'error') session.error = new Error(String(detail.file_error));
      if (this.current === session && !this.busy && !this.destroyed) this.emit(type, detail);
    });
    return session;
  }
  private async settled(session: Session, mode: PlaybackMode, target: number) {
    if (mode === 'native') return;
    const deadline = performance.now() + 25000;
    while (performance.now() < deadline) {
      if (this.destroyed) throw new Error('Player is destroyed');
      if (session.error) throw session.error;
      const d = session.backend.diagnostics as {rendered?: number; seeking?: boolean; decoder?: string; presentation?: {pts?: number[]}; presentedPosition?: number} | undefined;
      const tracks = session.backend.properties.get('track-list') as Array<{type: string; codec?: string; selected?: boolean}> | undefined;
      const hasVideo = tracks?.some(t => t.type === 'video' && t.selected);
      if (hasVideo === false && tracks?.length) return;
      if (mode === 'hybrid' && tracks?.some(t => t.type === 'video' && t.selected && t.codec !== 'h264')) throw new Error('Hybrid mode requires supported WebCodecs H.264 decoding. Choose software mode for this source.');
      const position = mode === 'hybrid' ? (d?.presentation?.pts?.at(-1) ?? NaN) / 1e6 : d?.presentedPosition;
      if (d?.rendered && (mode !== 'hybrid' || d.decoder === 'webcodecs') && !d.seeking && position !== undefined && Math.abs(position - target) < .15) return;
      await new Promise(resolve => setTimeout(resolve, 25));
    }
    throw new Error(`${mode} mode did not present the requested position`);
  }
  private async replace(source: Source, mode: PlaybackMode, settings: Settings, preserve: boolean, nativeTracks: TextTrackSource[]) {
    this.validateFilters(mode, settings);
    if (source.kind === 'local' && mode !== 'native' && (source.file instanceof File ? source.file.size : source.file.byteLength) > 32 * 1024 * 1024) throw new Error('Local files in mpv modes are limited to 32 MiB');
    const old = this.current;
    const wasPaused = this.settings.pause;
    const desired = {...settings, pause: preserve ? !!wasPaused : true};
    const target = preserve ? Math.max(0, Number(old?.backend.properties.get('time-pos')) || 0) : 0;
    if (preserve && (mode === 'native') !== (this.mode === 'native')) {desired.aid = 'auto';desired.sid = 'auto';}
    this.busy = true;this.emit('modechange', {phase: 'loading', mode});
    let candidate: Session | undefined;
    try {
      if (old && !old.error) await old.backend.pause();
      candidate = this.candidate = await this.create(mode);const p = candidate.backend;await p.ready;
      if (this.destroyed) throw new Error('Player is destroyed');
      if (desired.vf) await p.command!('set', 'vf', desired.vf);
      if (desired.af) await p.command!('set', 'af', desired.af);
      await p.volume(desired.volume);await p.rate(desired.speed);
      // Native numeric track IDs only exist after metadata/text-track loading.
      if (mode !== 'native') {await p.selectTrack('audio', desired.aid);await p.selectTrack('sub', desired.sid);await p.subtitleVisible(desired.subtitles);}
      if (source.kind === 'local') await p.open(source.file);else await p.openRemote(source.options);
      if (mode === 'native') {
        for (const track of nativeTracks) await p.addTextTrack!(track);
        await p.selectTrack('audio', desired.aid);await p.selectTrack('sub', desired.sid);await p.subtitleVisible(desired.subtitles);
      }
      await this.settled(candidate, mode, 0);
      if (target > 0) {await p.seek(target);await this.settled(candidate, mode, target);}
      if (candidate.error) throw candidate.error;
      if (!desired.pause) await p.play();
      if (this.destroyed) throw new Error('Player is destroyed');
      this.current = candidate;this.candidate = undefined;this.source = source;this.currentMode = mode;this.settings = desired;this.nativeTracks = nativeTracks;
      candidate.surface.style.display = 'block';if (old) old.surface.style.display = 'none';
      clearInterval(this.monitor);
      let inactiveSamples = 0;
      if (mode === 'hybrid') this.monitor = setInterval(() => {
        const d = p.diagnostics as {decoder?: string} | undefined;
        const hasVideo = (p.properties.get('track-list') as Array<{type: string; selected?: boolean}> | undefined)?.some(t => t.type === 'video' && t.selected);
        inactiveSamples = hasVideo && !this.busy && this.queued === 0 && d?.decoder === 'software' ? inactiveSamples + 1 : 0;
        if (inactiveSamples >= 4) {
          clearInterval(this.monitor);this.settings.pause = true;void p.pause().catch(() => {});this.emit('error', 'Hybrid decoder stopped. Reopen in software mode.');
        }
      }, 250);
      // The new session is committed. Cleanup failures must not pretend to roll it back.
      try {await this.dispose(old);} catch (error) {this.emit('error', `Previous player cleanup: ${String(error)}`);}
      for (const [name, data] of p.properties) this.emit('mpv', {event: 'property-change', name, data} satisfies PlaybackEvent);
      this.emit('mpv', {event: 'file-loaded'});this.emit('modechange', {phase: 'ready', mode, position: target});
    } catch (error) {
      if (candidate && candidate !== this.current) await this.dispose(candidate).catch(() => {});
      this.candidate = undefined;
      if (old && !old.error && this.current === old && !wasPaused && !this.destroyed) await old.backend.play().catch(() => {});
      this.emit('modechange', {phase: 'failed', mode, rolledBack: this.current === old, message: String(error)});
      throw error;
    } finally {this.busy = false;}
  }
  open(file: File | ArrayBuffer) {
    if (!(file instanceof File) && !(file instanceof ArrayBuffer)) return Promise.reject(new Error('Expected File or ArrayBuffer'));
    if (file instanceof ArrayBuffer && file.byteLength > 32 * 1024 * 1024) return Promise.reject(new Error('ArrayBuffer sources are limited to 32 MiB; use File for larger native sources'));
    const source: Source = {kind: 'local', file: file instanceof File ? file : file.slice(0)};
    return this.enqueue(() => this.replace(source, this.mode, this.settings, false, []));
  }
  openRemote(options: RemoteSource) {
    const source: Source = {kind: 'remote', options: {...options, headers: options.headers ? {...options.headers} : undefined, allowedOrigins: options.allowedOrigins?.slice()}};
    return this.enqueue(() => this.replace(source, this.mode, this.settings, false, []));
  }
  setMode(mode: PlaybackMode) {
    modeValue(mode);
    return this.enqueue(async () => {
      this.validateFilters(mode, this.settings);
      if (mode === this.mode) return;
      if (this.source) await this.replace(this.source, mode, this.settings, true, this.nativeTracks);
      else {this.currentMode = mode;this.emit('modechange', {phase: 'ready', mode, position: 0});}
    });
  }
  private filters(key: 'vf' | 'af', value: string) {
    const chain = filterChain(value);
    return this.enqueue(async () => {
      if (this.mode !== 'software') throw new Error('Filters require software mode. Call setMode("software") first.');
      if (chain === this.settings[key]) return;
      const settings = {...this.settings, [key]: chain};
      if (this.source) await this.replace(this.source, this.mode, settings, true, this.nativeTracks);else this.settings = settings;
    });
  }
  setVideoFilters(value: string) {return this.filters('vf', value);}
  setAudioFilters(value: string) {return this.filters('af', value);}
  private setting(action: (p: Backend) => Promise<void>, update: () => void) {
    return this.enqueue(async () => {if (this.current) await action(this.current.backend);update();});
  }
  play() {return this.setting(p => p.play(), () => {this.settings.pause = false;});}
  pause() {return this.setting(p => p.pause(), () => {this.settings.pause = true;});}
  seek(seconds: number) {
    if (!Number.isFinite(seconds) || seconds < 0) throw new Error('Invalid seek time');
    return this.enqueue(async () => {if (!this.current) throw new Error('No source');await this.current.backend.seek(seconds);await this.settled(this.current, this.mode, seconds);});
  }
  volume(value: number) {
    if (!Number.isFinite(value) || value < 0 || value > 100) throw new Error('Invalid volume');
    return this.setting(p => p.volume(value), () => {this.settings.volume = value;});
  }
  rate(value: number) {
    if (!Number.isFinite(value) || value < .5 || value > 2) throw new Error('Playback rate must be 0.5 to 2');
    return this.setting(p => p.rate(value), () => {this.settings.speed = value;});
  }
  selectTrack(type: TrackType, id: string) {
    if (!['audio', 'sub'].includes(type) || !/^(?:[1-9][0-9]*|auto|no)$/.test(id)) throw new Error('Invalid track selection');
    return this.setting(p => p.selectTrack(type, id), () => {this.settings[type === 'audio' ? 'aid' : 'sid'] = id;});
  }
  subtitleVisible(visible: boolean) {return this.setting(p => p.subtitleVisible(visible), () => {this.settings.subtitles = visible;});}
  addTextTrack(track: TextTrackSource) {
    const source = {...track};
    return this.enqueue(async () => {
      if (this.mode !== 'native' || !this.current) throw new Error('External browser text tracks require an open native player');
      await this.current.backend.addTextTrack!(source);this.nativeTracks.push(source);
    });
  }
  resize(width: number, height: number) {
    if (this.destroyed) throw new Error('Player is destroyed');dimensions(width, height);
    this.width = width;this.height = height;this.current?.backend.resize(width, height);this.candidate?.backend.resize(width, height);
  }
  destroy(): Promise<void> {
    if (this.destruction) return this.destruction;
    this.destroyed = true;clearInterval(this.monitor);
    this.destruction = (async () => {
      await this.candidate?.backend.destroy().catch(() => {});
      await this.queue;
      try {await this.dispose(this.current);} finally {this.current = undefined;this.source = undefined;this.nativeTracks = [];this.root.remove();}
    })();return this.destruction;
  }
}
