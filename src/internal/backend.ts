import type {RemoteSource, TextTrackSource, TrackType} from '../types.js';
export interface Backend extends EventTarget {
  readonly ready: Promise<void>;
  readonly properties: Map<string, unknown>;
  readonly diagnostics?: object;
  open(file: File | ArrayBuffer): Promise<void>;
  openRemote(source: RemoteSource): Promise<void>;
  play(): Promise<void>;
  pause(): Promise<void>;
  seek(seconds: number): Promise<void>;
  rate(value: number): Promise<void>;
  volume(value: number): Promise<void>;
  selectTrack(type: TrackType, id: string): Promise<void>;
  subtitleVisible(visible: boolean): Promise<void>;
  resize(width: number, height: number): void;
  command?(...args: string[]): Promise<void>;
  addTextTrack?(track: TextTrackSource): Promise<void>;
  audioDiagnostics(): object;
  destroy(): Promise<void>;
}
export type Session = {backend: Backend; surface: HTMLCanvasElement | HTMLVideoElement; error?: Error};
