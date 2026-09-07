#!/usr/bin/env python3
"""Recompute three-way summaries from saved raw CPU samples."""
import hashlib
import json
import pathlib
import statistics
import sys

folder = pathlib.Path(sys.argv[1])
result = json.loads((folder / 'result.json').read_text())
raw = [json.loads(line) for line in (folder / 'raw.jsonl').read_text().splitlines()]
assert result['passed'] and result['performanceEligible'] and not result['smoke']
assert result['runtimeUnchanged'] and result['hashes'] == result['hashesAfter']
expected = [(r, v) for r, order in enumerate(result['protocol']['orders']) for v in order]
assert [(t['round'], t['variant']) for t in result['trials']] == expected
assert len(expected) == 9
for trial in result['trials']:
    samples = [s for s in raw if s['round'] == trial['round'] and s['variant'] == trial['variant']]
    assert [{k: v for k, v in s.items() if k not in ('round', 'variant')} for s in samples] == trial['samples']
    assert trial['passed'] and trial['cleanup']['retainedWorkers'] == 0
    assert trial['originAfterCleanup']['active'] == 0
    assert all(s['foreground']['matched'] and not s['state']['errors'] for s in samples)
    samples = [s for s in samples if s['phase'] == 'measurement']
    elapsed = (samples[-1]['at'] - samples[0]['at']) / 1000
    assert elapsed >= 60
    cpu = 0
    for previous, current in zip(samples, samples[1:]):
        before = {p['id']: p['cpuTime'] for p in previous['processes']}
        after = {p['id']: p['cpuTime'] for p in current['processes']}
        assert before.keys() == after.keys()
        cpu += sum(max(0, after[pid] - before[pid]) for pid in after)
    assert abs(cpu / elapsed * 100 - trial['summary']['cpuPercentOfOneCore']) < 1e-9
    assert statistics.median(s['totalRSS'] for s in samples) == trial['summary']['medianRSSBytes']

summary = {}
for variant in ('native', 'software', 'webcodecs'):
    trials = [t['summary'] for t in result['trials'] if t['variant'] == variant]
    values = [t['cpuPercentOfOneCore'] for t in trials]
    summary[variant] = {'cpuMedianPercentOfOneCore': statistics.median(values),
                        'cpuRangePercentOfOneCore': [min(values), max(values)],
                        'medianOfTrialRSSMiB': statistics.median(t['medianRSSBytes'] for t in trials) / 1048576,
                        'droppedFrames': sum(t['dropped'] for t in trials)}
paired = []
for r in range(3):
    values = {t['variant']: t['summary']['cpuPercentOfOneCore'] for t in result['trials'] if t['round'] == r}
    paired.append(1 - values['webcodecs'] / values['software'])
assessment = {'verified': True, 'source': str(folder / 'result.json'),
              'sourceSha256': hashlib.sha256((folder / 'result.json').read_bytes()).hexdigest(),
              'rawSha256': hashlib.sha256((folder / 'raw.jsonl').read_bytes()).hexdigest(),
              'summary': summary, 'pairedWebcodecsSavingsVsSoftware': paired,
              'medianPairedWebcodecsSavingsVsSoftware': statistics.median(paired),
              'webcodecsFasterRounds': sum(s > 0 for s in paired),
              'scope': 'Three complete playback pipelines on the recorded synthetic test video and host',
              'limitations': ['CPU advantage over software reversed in one round',
                              'RSS is process residency, not a long-term memory bound',
                              'Native and mpv frame-counter semantics differ',
                              'Hardware selection, energy and native independent A/V sync were not measured']}
(folder / 'assessment.json').write_text(json.dumps(assessment, indent=2) + '\n')
print(json.dumps(assessment, indent=2))
