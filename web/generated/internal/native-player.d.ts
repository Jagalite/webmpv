import type { RemoteSource, TextTrackSource, TrackType } from '../types.js';
import type { Backend } from './backend.js';
/** Browser media ownership, including listeners, pending loads and object URLs. */
export declare class NativePlayer extends EventTarget implements Backend {
    private video;
    private remuxPolicy;
    readonly ready: Promise<void>;
    readonly properties: Map<string, unknown>;
    private stopped;
    private opening;
    private remux?;
    private remuxSource?;
    private directFailure?;
    private shiftedCues;
    private sourceTime;
    private sourceDuration;
    private objectURL?;
    private selectedSub;
    private subsVisible;
    private cancelers;
    private listeners;
    constructor(video: HTMLVideoElement, remuxPolicy?: 'auto' | 'never' | 'always');
    private emit;
    private assertActive;
    private wait;
    private refresh;
    get diagnostics(): {
        path: string;
        plan: string;
        directFailure: string | undefined;
        remux: Record<string, unknown> | undefined;
        position: number;
        rendered: number;
        dropped: number;
        readyState: number;
    };
    private load;
    private startRemux;
    private loadPlan;
    open(file: File | ArrayBuffer): Promise<void>;
    openRemote(source: RemoteSource): Promise<void>;
    play(): Promise<void>;
    pause(): Promise<void>;
    seek(seconds: number): Promise<void>;
    rate(value: number): Promise<void>;
    volume(value: number): Promise<void>;
    selectTrack(type: TrackType, id: string): Promise<void>;
    private applySubtitles;
    subtitleVisible(visible: boolean): Promise<void>;
    addTextTrack(source: TextTrackSource): Promise<void>;
    private shiftTextTrack;
    resize(width: number, height: number): void;
    audioDiagnostics(): {
        state: string;
        source: string;
        decodedSampleCountersAvailable: boolean;
    };
    destroy(): Promise<void>;
}
