export type PlayerEvent = {
    event: string;
    id?: number;
    name?: string;
    data?: unknown;
    error?: string;
    [key: string]: unknown;
};
export type PlayerDiagnostics = {
    path: 'wasm';
    rendered: number;
    heapBytes: number;
    queuedFrames: number;
    epoch: number;
};
/** M0: one isolated module per player, local files up to 32 MiB, stereo SDR. */
export declare class BrowserPlayer extends EventTarget {
    private worker;
    private audioContext;
    private audioNode?;
    private analyser?;
    private timing?;
    private nextId;
    private pending;
    private destroyed;
    private destruction?;
    private onDestroyed?;
    private readyTimer?;
    private rejectReady?;
    private eventWaiters;
    private hasFile;
    private opening;
    private audioHeader;
    diagnostics?: PlayerDiagnostics;
    browserCodecsAbsent: boolean;
    properties: Map<string, unknown>;
    readonly ready: Promise<void>;
    constructor(canvas: HTMLCanvasElement, { disableBrowserCodecs }?: {
        disableBrowserCodecs?: boolean | undefined;
    });
    private sendTiming;
    private fail;
    private request;
    open(file: File | ArrayBuffer): Promise<void>;
    private waitForEvent;
    private openLocal;
    command(...args: string[]): Promise<void>;
    play(): Promise<void>;
    pause(): Promise<void>;
    seek(seconds: number): Promise<void>;
    volume(percent: number): Promise<void>;
    selectTrack(type: 'audio' | 'sub', id: string): Promise<void>;
    subtitleVisible(visible: boolean): Promise<void>;
    resize(width: number, height: number): void;
    audioDiagnostics(): {
        state: AudioContextState;
        sampleRate: number;
        mediaFrames: number;
        underruns: number;
        rms: number;
        latencyConfidence: string;
    };
    destroy(): Promise<void>;
}
