import type { PlayerErrorCode, SessionError, OperationKind } from '../types.js';
/** Public text intentionally omits all URL queries, fragments and userinfo. */
export declare function redact(value: unknown): any;
export declare class PlayerError extends Error implements SessionError {
    readonly code: PlayerErrorCode;
    readonly operationId: number | null;
    readonly operation: OperationKind | null;
    readonly scope: 'operation' | 'session';
    readonly retryable: boolean;
    constructor(code: PlayerErrorCode, message: string, operationId?: number | null, operation?: OperationKind | null, scope?: 'operation' | 'session', retryable?: boolean);
    toJSON(): SessionError;
}
export declare function playerError(error: unknown, id?: number | null, operation?: OperationKind | null, scope?: 'operation' | 'session'): PlayerError;
