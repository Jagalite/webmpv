/** This module performs no network I/O and is safe to import during SSR. */
export function runtimeBase(value) {
    const base = value === undefined ? new URL('../../../', import.meta.url) : new URL(value.endsWith('/') ? value : value + '/', document.baseURI);
    if (base.origin !== location.origin || !['http:', 'https:'].includes(base.protocol) || base.search || base.hash || base.username || base.password)
        throw new Error('Invalid assetBase: use a same-origin runtime directory');
    return base;
}
