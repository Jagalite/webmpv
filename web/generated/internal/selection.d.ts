import type { PlaybackMode } from '../types.js';
export type ProbeTrack = {
    id: string;
    index: number;
    type: string;
    codec: string;
    default?: boolean;
    forced?: boolean;
    channels?: number;
    aacObject?: number;
    attachedPicture?: boolean;
};
export type Probe = {
    tracks: ProbeTrack[];
    duration: number;
    identity?: {
        size: string;
        etag?: string;
    };
};
export type SelectionAttempt = {
    mode: PlaybackMode | 'probe';
    outcome: 'skipped' | 'failed' | 'selected';
    reason: string;
};
export declare function nativeRejection(probe: Probe, settings: {
    aid: string;
    sid: string;
    subtitles: boolean;
}, video: HTMLVideoElement): string | undefined;
