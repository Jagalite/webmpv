export declare const PLAYBACK_MODES: readonly ["native", "hybrid", "software"];
export type PlaybackMode = typeof PLAYBACK_MODES[number];
export type TrackType = 'audio' | 'sub';
export type MediaInputOptions = {
    demuxer?: string;
};
/** Select one rendition for the session; this is not automatic bitrate switching. */
export type StreamingOptions = {
    maxBandwidth?: number;
    representation?: string;
    live?: boolean;
};
export type RemoteSource = MediaInputOptions & {
    streaming?: StreamingOptions;
    url: string;
    format?: 'file' | 'hls' | 'dash';
    headers?: Record<string, string>;
    credentials?: RequestCredentials;
    allowedOrigins?: string[];
    immutable?: boolean;
    refreshAuthorization?: (resource?: {
        url: string;
    }) => Promise<{
        url?: string;
        headers?: Record<string, string>;
    }>;
};
export type TextTrackSource = {
    src: string;
    label: string;
    language?: string;
    default?: boolean;
};
export type SubtitleOptions = {
    label?: string;
    language?: string;
    select?: boolean;
};
export type SubtitleAsset = {
    bytes: ArrayBuffer;
    format: 'srt' | 'ass' | 'ssa' | 'vtt';
    label: string;
    language?: string;
    select: boolean;
};
export type FontAsset = {
    name: string;
    bytes: ArrayBuffer;
};
export type AudioOutput = 'stereo' | '5.1' | '7.1' | 'auto';
export type ToneMapping = 'off' | 'hdr-to-sdr';
/** Software decode pixels (up to 4K), and mpv's individual FFmpeg allocation cap. */
export type ResourceLimits = {
    maxDecodePixels?: number;
    maxAllocationBytes?: number;
};
export type PlayerOptions = {
    /** Package runtime root; includes web/ and fixtures/. Same-origin only. */
    assetBase?: string;
    audioOutput?: AudioOutput;
    audioFallback?: 'stereo' | 'reject';
    toneMapping?: ToneMapping;
    resourceLimits?: ResourceLimits;
    mode?: PlaybackMode;
    /** Defaults to true when mode is omitted. Explicit modes remain pinned. */
    automaticSelection?: boolean;
    /** Internal Native packaging plan; "never" disables the packet-copy fallback. */
    nativeRemux?: 'auto' | 'never' | 'always';
    /** Optional Software presenter; RGB remains the default. */
    softwarePresenter?: 'rgb' | 'experimental-yuv';
    width?: number;
    height?: number;
    videoFilters?: string;
    audioFilters?: string;
};
export type Capabilities = {
    videoFilters: boolean;
    audioFilters: boolean;
    mpvSubtitles: boolean;
    externalTextTracks: boolean;
    externalSubtitles: boolean;
    customFonts: boolean;
    customRequestHeaders: boolean;
};
export type PlaybackEvent = {
    event: string;
    name?: string;
    data?: unknown;
    [key: string]: unknown;
};
export type Diagnostics = {
    mode: PlaybackMode;
    switching: boolean;
    videoFilters: string;
    audioFilters: string;
    toneMapping?: ToneMapping;
    resourceLimits?: ResourceLimits;
    selection?: {
        automatic: boolean;
        attempts: Array<{
            mode: PlaybackMode | 'probe';
            outcome: 'skipped' | 'failed' | 'selected';
            reason: string;
        }>;
    };
    backend?: Record<string, unknown>;
};
export type OpenOptions = MediaInputOptions & {
    signal?: AbortSignal;
};
export type MediaSourceInput = File | ArrayBuffer | string | URL | RemoteSource;
export type OperationKind = 'opening' | 'seeking' | 'switching' | 'closing';
export type PendingOperation = Readonly<{
    id: number;
    kind: OperationKind;
}>;
export type PlayerErrorCode = 'INVALID_ARGUMENT' | 'ABORTED' | 'AUTOPLAY_BLOCKED' | 'SOURCE_PERMISSION' | 'SOURCE_CHANGED' | 'NETWORK_TIMEOUT' | 'UNSUPPORTED_MEDIA' | 'UNSUPPORTED_FEATURE' | 'ASSET_LOAD_FAILED' | 'ISOLATION_REQUIRED' | 'DECODE_FAILED';
export type SessionError = Readonly<{
    code: PlayerErrorCode;
    message: string;
    operationId: number | null;
    operation: OperationKind | null;
    scope: 'operation' | 'session';
    retryable: boolean;
}>;
export type TimeRange = Readonly<{
    start: number;
    end: number;
}>;
export type FeatureAvailability = Readonly<{
    availability: 'available';
} | {
    availability: 'switch';
    mode: PlaybackMode;
    reason: string;
} | {
    availability: 'unavailable';
    reason: string;
} | {
    availability: 'unknown';
    reason: string;
}>;
export type FeatureName = 'seek' | 'audioTracks' | 'subtitleTracks' | 'externalSubtitles' | 'customFonts' | 'videoFilters' | 'audioFilters';
export type PlayerCapabilities = Readonly<Capabilities & {
    deployment: Readonly<{
        isolated: boolean;
        webCodecs: boolean;
        mediaSource: boolean;
    }>;
    features: Readonly<Record<FeatureName, FeatureAvailability>>;
}>;
export type MediaTrack = Readonly<{
    id: string;
    type: 'audio' | 'subtitle' | 'video';
    label: string;
    language: string | null;
    codec: string | null;
    selected: boolean;
    external: boolean;
}>;
export type MediaInfo = Readonly<{
    displayWidth: number | null;
    displayHeight: number | null;
    aspectRatio: number | null;
    rotation: number | null;
    video: MediaTrack | null;
    audio: MediaTrack | null;
    subtitle: MediaTrack | null;
}>;
export type PlayerState = Readonly<{
    status: 'idle' | 'paused' | 'playing' | 'buffering' | 'ended' | 'error';
    playbackIntent: 'play' | 'pause';
    pendingOperation: PendingOperation | null;
    sourceId: number | null;
    currentTime: number;
    duration: number | null;
    streamType: 'unknown' | 'vod' | 'live';
    subtitlesVisible: boolean;
    volume: number;
    muted: boolean;
    playbackRate: number;
    activeMode: PlaybackMode | null;
    automaticSelection: boolean;
    buffered: readonly TimeRange[] | null;
    seekable: readonly TimeRange[] | null;
    audioTracks: readonly MediaTrack[];
    subtitleTracks: readonly MediaTrack[];
    mediaInfo: MediaInfo;
    capabilities: PlayerCapabilities;
    error: SessionError | null;
}>;
export declare const PLAYER_EVENTS: readonly ["play", "playing", "pause", "waiting", "ended", "timeupdate", "durationchange", "seeking", "seeked", "volumechange", "ratechange", "trackschange", "capabilitieschange", "sourcechange", "statechange", "error"];
export type PlayerEventName = typeof PLAYER_EVENTS[number];
export type PlayerEventMap = {
    [K in Exclude<PlayerEventName, 'error'>]: CustomEvent<PlayerState>;
} & {
    error: CustomEvent<SessionError>;
};
