export type PlayerEvent = {
    event: string;
    id?: number;
    name?: string;
    data?: unknown;
    error?: string;
    [key: string]: unknown;
};
export type RemoteSource = {
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
export type PlayerDiagnostics = {
    path: 'wasm';
    presentation?: {
        pts?: number[];
        retained?: number;
        pending?: number;
        received?: number;
        closed?: number;
    };
    decoder?: 'software' | 'webcodecs';
    decoderStats?: Record<string, number | boolean>;
    rendered: number;
    heapBytes: number;
    queuedFrames: number;
    epoch: number;
    io?: Record<string, number | string>;
    seeking?: boolean;
    position?: number;
    presentedPosition?: number;
    ioPending?: boolean;
    interruptions?: number;
    renderMs?: number;
    copyMs?: number;
};
/** One isolated software engine per player; bounded remote ranges or local files up to 32 MiB. */
export declare class WasmPlayer extends EventTarget {
    private worker;
    private workerOwner;
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
    private refreshAuthorization?;
    private audioHeader;
    diagnostics?: PlayerDiagnostics;
    browserCodecsAbsent: boolean;
    properties: Map<string, unknown>;
    readonly ready: Promise<void>;
    constructor(canvas: HTMLCanvasElement, { disableBrowserCodecs, measureOutput, mode }?: {
        disableBrowserCodecs?: boolean;
        measureOutput?: boolean;
        mode?: 'hybrid' | 'software';
    });
    private sendTiming;
    private fail;
    private request;
    open(file: File | ArrayBuffer): Promise<void>;
    openRemote(source: RemoteSource): Promise<void>;
    private waitForEvent;
    private openLocal;
    command(...args: string[]): Promise<void>;
    private setPause;
    play(): Promise<void>;
    pause(): Promise<void>;
    seek(seconds: number): Promise<void>;
    rate(rate: number): Promise<void>;
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
