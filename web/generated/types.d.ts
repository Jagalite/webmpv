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
