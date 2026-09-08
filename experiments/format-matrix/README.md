# Generated codec samples

`generate.py` matches the configured software decoder registrations to locally
available FFmpeg audio/video encoders, generates short original test-pattern or
tone files, then validates the stream identity with ffprobe. Known codecs use
usual containers; less common ones try NUT, AVI or MOV. Unusable identities and
encoder/container errors are recorded as generation gaps. Packed raw-video and
H.263 variants have explicit documented aliases across FFmpeg versions.

```sh
npm run fixtures:formats
npm run test:formats
python3 experiments/format-matrix/report.py results/format-matrix/<run>/result.json
```

The current software engine must already exist; these commands do not rebuild it.
No Docker is used. Encoding happens in host FFmpeg, not in the browser library.
Each local file is limited to 32 MiB. Most video samples use 176x144 at 25 fps;
codecs with stricter requirements get suitable dimensions/rates. All samples are
approximately two seconds. Generation commands, actual codec/container metadata,
sizes and hashes remain in the manifest for reproducibility.

`generate.py --retry` retries only previously failed generations. It preserves
successful samples. `ONLY=h264,flac npm run test:formats` runs selected fixtures.
For split/diagnostic runs pass all completed result files to `report.py`; later
runs replace earlier rows for the same codec and every final fixture must have
a matching tested hash. The fixture manifest is the coverage denominator.

The browser test forbids native playback/WebCodecs, verifies actual decoded
pixels or non-silent PCM, then checks resumed seeking and worker cleanup. Its
nonzero exit status signals at least one failing sample. Failures may represent
API/timeline/container issues, not a missing FFmpeg decoder. Tests currently use
Chrome; no Native/Hybrid support or performance comparison is implied.

[Current results and gaps](../../results/format-matrix/README.md).
