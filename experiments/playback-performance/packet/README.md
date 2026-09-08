# Compressed packet ownership

The original retained decoder sliced the shared mailbox packet before constructing
an EncodedVideoChunk. The constructor accepts shared buffer views and copies their
bytes before returning when no transfer list is used. The native requester can
reuse the mailbox only after the worker acknowledges that request.

This experiment omits the preliminary JavaScript slice. It passed ownership and
integrated runtime checks, but the longer movie comparison did not establish a
whole-player gain. After the ten-hour pass, the maintained worker restored the
slice at the user's request. The experiment remains isolated here for reference;
the maintained generator no longer enables it. Configuration/extradata copies
remain in both variants because that data outlives the request.

Primary specification: [WebCodecs EncodedVideoChunk construction](https://w3c.github.io/webcodecs/#encodedvideochunk-interface),
including EncodedVideoChunkInit.data and section 8.2.2. Runtime checks overwrite the
shared mailbox after construction and verify that chunks still contain the original
bytes in a dedicated worker. Whole-player measurements are separate.

`prepare.py` starts from the preserved original worker, so the experiment remains
reproducible independently of the maintained runtime.
