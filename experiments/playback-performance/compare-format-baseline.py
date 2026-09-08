#!/usr/bin/env python3
"""Compare exact fixture outcomes without hiding the existing format gaps."""
import json
import sys
from pathlib import Path

source = Path(sys.argv[1])
if source.suffix == '.log':
    source = Path(source.read_text().splitlines()[0]) / 'result.json'
elif source.is_dir():
    source /= 'result.json'
candidate = json.loads(source.read_text())
baseline_sources = [
    'results/format-matrix/2026-09-08T11-33-37.367Z/result.json',
    'results/format-matrix/2026-09-08T11-37-43.125Z/result.json',
    'results/format-matrix/2026-09-08T11-38-52.482Z/result.json',
]
baseline = {}
for path in baseline_sources:
    for case in json.loads(Path(path).read_text())['cases']:
        baseline[case['file'], case['sha256']] = (case, path)

assert candidate['inputsUnchanged']
assert len(candidate['cases']) == 115
differences, case_sources, gaps = [], {}, []
for case in candidate['cases']:
    previous, path = baseline[case['file'], case['sha256']]
    case_sources[case['file']] = path
    before = {key: previous[key] for key in ['decode', 'seek', 'cleanup']}
    after = {key: case[key] for key in before}
    if before != after:
        differences.append({'file': case['file'], 'before': before, 'after': after})
    if not all(after.values()):
        gaps.append({'file': case['file'], **after, 'error': case.get('error')})
report = {
    'baselineSources': baseline_sources,
    'selection': 'Latest pre-optimization outcome for each identical fixture SHA256',
    'candidate': str(source),
    'candidateCounts': candidate['counts'],
    'differences': differences,
    'remainingGaps': gaps,
    'baselineCaseSources': case_sources,
    'noOutcomeRegressions': not differences,
    'interpretation': 'Unchanged outcomes do not mean all formats pass or all profiles are qualified.',
}
output = source.parent / 'baseline-comparison.json'
output.write_text(json.dumps(report, indent=2) + '\n')
print(json.dumps({key: report[key] for key in ['candidateCounts', 'differences', 'noOutcomeRegressions']}))
assert not differences, 'Inspect every changed format outcome'
