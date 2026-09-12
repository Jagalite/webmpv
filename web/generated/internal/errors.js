/** Public text intentionally omits all URL queries, fragments and userinfo. */
export function redact(value) {
    if (typeof value === 'string')
        return value.replace(/https?:\/\/[^\s<>"']+/gi, text => {
            try {
                const u = new URL(text);
                return u.origin + u.pathname + (u.search || u.hash ? '?[redacted]' : '');
            }
            catch {
                return '[redacted URL]';
            }
        }).replace(/\b(authorization|proxy-authorization|cookie|set-cookie|x-api-key)\s*[:=]\s*[^\r\n]+/gi, '$1: [redacted]').replace(/\b(Bearer|Basic)\s+[^\s,;]+/gi, '$1 [redacted]');
    if (Array.isArray(value))
        return value.map(redact);
    if (value && typeof value === 'object')
        return Object.fromEntries(Object.entries(value).map(([key, v]) => [key, /authorization|cookie|token|secret|password|headers/i.test(key) ? '[redacted]' : redact(v)]));
    return value;
}
export class PlayerError extends Error {
    code;
    operationId;
    operation;
    scope;
    retryable;
    constructor(code, message, operationId = null, operation = null, scope = 'operation', retryable = false) {
        super(redact(message));
        this.code = code;
        this.operationId = operationId;
        this.operation = operation;
        this.scope = scope;
        this.retryable = retryable;
        this.name = 'PlayerError';
    }
    toJSON() { return { code: this.code, message: this.message, operationId: this.operationId, operation: this.operation, scope: this.scope, retryable: this.retryable }; }
}
export function playerError(error, id = null, operation = null, scope = 'operation') {
    if (error instanceof PlayerError)
        return new PlayerError(error.code, error.message, id ?? error.operationId, operation ?? error.operation, scope, error.retryable);
    const message = error instanceof Error ? error.message : String(error);
    const name = error instanceof Error ? error.name : '';
    const code = name === 'AbortError' || /^(?:Operation aborted|Open aborted|Player (?:element )?(?:is )?destroyed|Player element disconnected)|cancelled/i.test(message) ? 'ABORTED'
        : name === 'NotAllowedError' || /autoplay|user gesture|audio context.*suspended/i.test(message) ? 'AUTOPLAY_BLOCKED'
            : /cross.origin isolat|secure.*isolated/i.test(message) ? 'ISOLATION_REQUIRED'
                : /representation changed|changed length|Source changed/i.test(message) ? 'SOURCE_CHANGED'
                    : /401|403|permission|origin.*not allowed|authorization/i.test(message) ? 'SOURCE_PERMISSION'
                        : /timed? ?out|deadline/i.test(message) ? 'NETWORK_TIMEOUT'
                            : /fetch.*module|load.*font|\.wasm|initialization|worker.*failed|import.*module|Aborted\(.*fetch|wasm.*failed|WebAssembly.*(?:compile|instantiate)/i.test(message) ? 'ASSET_LOAD_FAILED'
                                : /Invalid|Expected|must be|limited to|queue.*full|No source/i.test(message) ? 'INVALID_ARGUMENT'
                                    : /preserve.*track|unknown.*track|require.*mode|unsupported.*feature|not supported.*source|filters require|cannot.*discard|external.*require/i.test(message) ? 'UNSUPPORTED_FEATURE'
                                        : /unsupported|no playback route|no browser bridge/i.test(message) ? 'UNSUPPORTED_MEDIA' : 'DECODE_FAILED';
    return new PlayerError(code, message, id, operation, scope, ['NETWORK_TIMEOUT', 'ASSET_LOAD_FAILED', 'AUTOPLAY_BLOCKED'].includes(code));
}
