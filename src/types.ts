export const PLAYBACK_MODES = Object.freeze(['native', 'hybrid', 'software'] as const);
export type PlaybackMode = typeof PLAYBACK_MODES[number];
export type TrackType = 'audio' | 'sub';
export type RemoteSource = {
  url: string;
  format?: 'file' | 'hls' | 'dash';
  headers?: Record<string, string>;
  credentials?: RequestCredentials;
  allowedOrigins?: string[];
  immutable?: boolean;
  refreshAuthorization?: (resource?: {url: string}) => Promise<{url?: string; headers?: Record<string, string>}>;
};
export type TextTrackSource = {src: string; label: string; language?: string; default?: boolean};
export type PlayerOptions = {
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
  customRequestHeaders: boolean;
};
export type PlaybackEvent = {event: string; name?: string; data?: unknown; [key: string]: unknown};
export type Diagnostics = {
  mode: PlaybackMode;
  switching: boolean;
  videoFilters: string;
  audioFilters: string;
  selection?: {automatic: boolean; attempts: Array<{mode: PlaybackMode | 'probe'; outcome: 'skipped' | 'failed' | 'selected'; reason: string}>};
  backend?: Record<string, unknown>;
};
