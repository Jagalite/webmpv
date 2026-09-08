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
  backend?: Record<string, unknown>;
};
