#!/usr/bin/env python3
"""Group an existing clean CPU comparison by Chrome process type."""
import json
import statistics
import sys
from pathlib import Path

source = Path(sys.argv[1])
if source.suffix == '.log':
    source = Path(source.read_text().splitlines()[0]) / 'result.json'
elif source.is_dir():
    source /= 'result.json'
data = json.loads(source.read_text())
assert data['passed'], 'A failed screen is not a clean CPU comparison'
groups = {}
for trial in data['trials']:
    assert trial['passed'] and not trial['summary']['churn']
    totals = {}
    for previous, current in zip(trial['samples'], trial['samples'][1:]):
        before = {process['id']: process for process in previous['processes']}
        assert set(before) == {process['id'] for process in current['processes']}
        for process in current['processes']:
            kind = process['type']
            assert kind == before[process['id']]['type']
            totals[kind] = totals.get(kind, 0) + process['cpuTime'] - before[process['id']]['cpuTime']
    percent = {kind: seconds / trial['summary']['elapsed'] * 100 for kind, seconds in totals.items()}
    assert abs(sum(percent.values()) - trial['summary']['cpuPercent']) < 1e-7
    groups.setdefault(trial['variant'], []).append(percent)
report = {
    'source': str(source),
    'scope': 'Percent of one CPU core, grouped by CDP process type. Not function attribution; external macOS services excluded.',
    'groups': {},
}
for variant, trials in groups.items():
    kinds = sorted(set().union(*(trial.keys() for trial in trials)))
    report['groups'][variant] = {
        'trials': len(trials),
        'meanCpuPercent': {kind: statistics.mean(trial.get(kind, 0) for trial in trials) for kind in kinds},
    }
(source.parent / 'process-costs.json').write_text(json.dumps(report, indent=2) + '\n')
print(json.dumps(report, indent=2))
