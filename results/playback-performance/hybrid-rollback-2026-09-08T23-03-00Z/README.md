# Selective Hybrid rollback

The direct shared-packet construction optimization is reverted. The maintained
worker again slices the compressed packet before constructing EncodedVideoChunk.
Its generator matches the original behavior, and the integration helper is removed.
The isolated experiment and all prior measurement results remain available.

Software optimizations, shared timing-message coalescing, the pre-existing Hybrid
scheduler and the strict long-GOP correctness fix are unchanged. Neither engine
required rebuilding: the only runtime edit is the JavaScript decoder worker.

## Verification

- [All 21 API checks pass](../../player-api/functional-2026-09-08T23-03-19.076Z/result.json),
  including subtitles, mode switching, shared timing initialization and teardown.
  The HTTP snapshot records actual loads of the restored worker.
- [Both strict decoder checks pass](../strict-runtime-2026-09-08T23-03-39.043Z/result.json):
  long-GOP/negative-preroll playback beyond the old 256-packet cache bound, and
  injected decoder failure followed by explicit Software recovery.
- [Scope checks](scope.json) verify unchanged end-of-window inputs outside this
  rollback, original worker/generator bytes, and matching generated worker output.
- The [selected runtime manifest](final-manifest.json) verifies all five Software
  kernel sources and Software build inputs, plus the exact new API/decoder results.
- [State at validation](result.json): empty index, unchanged HEAD and no commit or push.
  The Git whitespace check passes.

The user authorized committing and pushing these selected changes after validation.

This is functional verification, with no new CPU comparison or sustained run.
The ten-hour report and its original manifest retain the bytes and results from
before this selective rollback; they are not claims about a newly measured worker.

To repeat the functional checks, pass this folder's config.json as
WEBMPV_PERFORMANCE_CONFIG to tests/player-api.mjs and tests/strict-decoder-runtime.mjs.
To capture a new manifest, pass the resulting JSON paths to capture-final.py using
--api-result and --strict-result, plus a new --output path to preserve prior evidence.
