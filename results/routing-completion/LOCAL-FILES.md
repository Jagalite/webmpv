# Bounded local-file input

Implementation: Local Files are structured-cloned to the existing I/O worker and
read through the existing native AVIO mailbox. Hybrid and Software no longer call
File.arrayBuffer or write the entire file into WasmFS. ArrayBuffer inputs retain
their 32 MiB cap. Native remux shares the local reader. No native mpv patch is needed.

Passed eight browser cases in each run:

- [Chrome](large-files-2026-09-10T00-37-47.298Z/result.json)
- [Firefox](large-files-2026-09-10T00-42-11.453Z/result.json)

| Browser | Case | Open ms | Cumulative bytes read | Peak reader-owned bytes |
| --- | --- | ---: | ---: | ---: |
| chrome 152.0.7977.83 | hybrid-64m | 1787 | 947876 | 292976 |
| chrome 152.0.7977.83 | hybrid-1g | 415 | 947876 | 292976 |
| chrome 152.0.7977.83 | hybrid-4g | 547 | 947876 | 323808 |
| chrome 152.0.7977.83 | software-64m | 1406 | 947876 | 292976 |
| chrome 152.0.7977.83 | software-1g | 903 | 947876 | 323808 |
| chrome 152.0.7977.83 | software-4g | 796 | 947876 | 292976 |
| chrome 152.0.7977.83 | large-movie-recovery | — | 44277480 | 327680 |
| chrome 152.0.7977.83 | destroy-during-file-read | — | — | — |
| firefox 146.0.1 | hybrid-64m | 2271 | 947876 | 292976 |
| firefox 146.0.1 | hybrid-1g | 1221 | 947876 | 292976 |
| firefox 146.0.1 | hybrid-4g | 1083 | 947876 | 292976 |
| firefox 146.0.1 | software-64m | 1665 | 947876 | 292976 |
| firefox 146.0.1 | software-1g | 802 | 947876 | 292976 |
| firefox 146.0.1 | software-4g | 809 | 947876 | 292976 |
| firefox 146.0.1 | large-movie-recovery | — | 44015336 | 327680 |
| firefox 146.0.1 | destroy-during-file-read | — | — | — |

The 64 MiB, 1 GiB and >4 GiB inputs are valid sparse MP4s whose tail index lies after
a free box. They test actual browser File handles, 64-bit offsets and absence of
full-file allocation, not sustained bitrate or long duration. Both engines also
seek forward and backward. The large movie is 258,966,476 bytes, with two explicitly
labelled audio streams and subtitles. A browser-decoder fault is injected while
Hybrid is confirmed active; Software recovers with the selected second audio track,
volume, rate and playback intent preserved. The test then seeks to 120 s, 500 s,
back to 2 s and issues 100 seeks in five bursts within the 32-command API bound.
This is queued-seek coverage, not latest-target-only seek coalescing.

The reader uses no application cache. Its 256 KiB output allocation can coexist
with a stream chunk (64 KiB in these runs). Counters do not measure browser/OS file
cache, decoder memory or RSS. No CPU or whole-browser memory improvement is claimed.
Cleanup checks require zero remaining workers; blocked-read cancellation, truncation,
64-bit positions and a cancellation-during-cleanup race also pass four isolated
[reader tests](file-reader-tests.log).

Two initial movie tests injected a decoder fault after a 120 s seek had already
caused automatic Software fallback. They are retained as failed test runs. The
corrected test asserts Hybrid immediately before fault injection. That earlier
Hybrid long-seek fallback remains a timeline/presentation qualification item; this
change does not claim it fixed the decoder's seek behavior.

Reproduce:

```sh
python3 scripts/generate-large-file-fixtures.py
# Additional real-movie fixture (create once, preserve original media):
ffmpeg -i build/pipeline-separation/fixtures/movie.mkv -i build/fixtures/software-full/captions.srt -map 0:v:0 -map 0:a:0 -map 0:a:0 -map 1:s:0 -c copy -metadata:s:a:0 language=eng -metadata:s:a:1 language=jpn -disposition:s:0 default build/routing-completion/fixtures/large-subtitles.mkv
npm run test:large-files
BROWSER=firefox node tests/large-files.mjs
```
