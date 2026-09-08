#!/usr/bin/env python3
"""Summarize completed sustained playback; sum counters separately across seeks."""
import json
import sys
from pathlib import Path

source = Path(sys.argv[1])
result = json.loads(source.read_text())
segments = result['segments']
assert segments and all('summary' in segment for segment in segments)
samples = [sample for segment in segments for sample in segment['samples']]

def delta(section, field):
    return sum(segment['samples'][-1]['state'][section][field]
               - segment['samples'][0]['state'][section][field]
               for segment in segments)

assessment = {
    'source': str(source), 'scope': result['scope'], 'passed': result['passed'],
    'measuredSeconds': result['measuredSeconds'], 'wallSeconds': result['wallSeconds'],
    'segments': len(segments),
    'presentationDrops': delta('quality', 'frameDrops'),
    'decoderDrops': delta('quality', 'decoderDrops'),
    'audioUnderruns': delta('audio', 'underruns'),
    'frames': sum(segment['summary']['frames'] for segment in segments),
    'maxAbsMpvAvsyncMs': max(abs(sample['state']['quality']['avsync']) for sample in samples) * 1000,
    'heapBytes': sorted({sample['state']['diagnostics']['backend']['heapBytes'] for sample in samples}),
    'rssBytes': {'first': samples[0]['rss'], 'last': samples[-1]['rss'],
                 'peak': max(sample['rss'] for sample in samples)},
    'workersAfterDestroy': result['workersAfterDestroy'],
    'inputsUnchanged': result['hashes'] == result['hashesAfter'],
    'failure': result.get('failure'), 'issues': result['issues'],
}
if result['mode'] == 'hybrid':
    backends = [sample['state']['diagnostics']['backend'] for sample in samples]
    assessment['presentationAfterDestroy'] = result['cleanup']['presentation']
    assessment['peakRetained'] = max(backend['presentation']['retained'] for backend in backends)
    assessment['decoderPeakFrames'] = max(backend['decoderStats']['peakFrames'] for backend in backends)
    assessment['decoderPeakOutstanding'] = max(backend['decoderStats']['peakOutstanding'] for backend in backends)
source.with_name('assessment.json').write_text(json.dumps(assessment, indent=2) + '\n')
print(json.dumps(assessment, indent=2))
