#!/usr/bin/env python3
"""Bind passing exact-archive tests and corresponding source to a release record."""
import argparse, hashlib, json, os, pathlib, subprocess, tarfile, tempfile
root=pathlib.Path(__file__).resolve().parent.parent
p=argparse.ArgumentParser();p.add_argument('--archive',type=pathlib.Path,required=True);p.add_argument('--source',type=pathlib.Path,required=True);p.add_argument('--consumer',type=pathlib.Path,nargs=2,required=True);p.add_argument('--streaming',type=pathlib.Path,nargs=2,required=True);args=p.parse_args()
def sha(data):return hashlib.sha256(data).hexdigest()
def archive_sha(path):
 h=hashlib.sha256()
 with path.open('rb')as f:
  for b in iter(lambda:f.read(1048576),b''):h.update(b)
 return h.hexdigest()
runtime_hash=archive_sha(args.archive)
with tarfile.open(args.archive)as tar:
 manifest=json.load(tar.extractfile('package/release-manifest.json'))
 if manifest['dirtySource']or not manifest['sourceTag']or not manifest['sourceArchive']:raise SystemExit('Not a tagged source-backed release candidate')
 for name,expected in manifest['files'].items():
  if sha(tar.extractfile('package/'+name).read())!=expected['sha256']:raise SystemExit('Runtime hash mismatch: '+name)
 build=json.load(tar.extractfile('package/engine-build.json'))
 reader=tar.extractfile('package/web/range-reader.js').read()
source_hash=archive_sha(args.source)
if source_hash!=manifest['sourceArchive']['sha256']:raise SystemExit('Source archive does not match runtime')
with tarfile.open(args.source)as tar:
 source=json.load(tar.extractfile('source-manifest.json'))
 if (source['sourceCommit'],source['sourceTag'])!=(manifest['sourceCommit'],manifest['sourceTag']):raise SystemExit('Source revision mismatch')
 for name,digest in source['files'].items():
  if sha(tar.extractfile(name).read())!=digest:raise SystemExit('Source content mismatch: '+name)
 for name,digest in build['sdkSources'].items():
  if source['files'].get('toolchain/emscripten/'+name)!=digest:raise SystemExit('Missing corresponding SDK source: '+name)
 for name,digest in build['inputs'].items():
  if source['files'].get('webmpv/'+name)!=digest:raise SystemExit('Missing corresponding engine source: '+name)
consumer_cases={'automatic-local','native-no-isolation','hybrid-pin','software-pin','automatic-ass','native-remux','transitions','rollback','missing-engine','isolation-error','omitted-yuv','av1-software','hdr-software','external-subtitles','surround-output','hls-expanded','dash-periods'}
streaming_cases={f'{mode}:{test}'for mode in ['hybrid','software']for test in ['seek-completes-packet','seek-deadline','destroy-progress']}
evidence=[]
for paths,script,expected in [(args.consumer,'tests/beta-consumer.mjs',consumer_cases),(args.streaming,'tests/beta-streaming.mjs',streaming_cases)]:
 families=set()
 for file in paths:
  data=json.loads(file.read_text());families.add(data['family'])
  if data['archiveSHA256']!=runtime_hash:raise SystemExit('Test used different archive: '+str(file))
  if not data['passed']or not all(c.get('passed')for c in data['cases'])or {c['name']for c in data['cases']}!=expected:raise SystemExit('Incomplete/failed test suite: '+str(file))
  if data['testHarnessSHA256']!=source['files'].get('webmpv/'+script):raise SystemExit('Test harness differs from tagged source: '+str(file))
  evidence.append({'file':str(file.resolve()),'sha256':archive_sha(file),'browser':data['family'],'cases':len(data['cases'])})
 if families!={'chrome','firefox'}:raise SystemExit('Both Chrome and Firefox results are required')
# Run the tagged deterministic deadline tests against this archive's reader bytes.
with tempfile.TemporaryDirectory(dir=root/'build')as temporary:
 work=pathlib.Path(temporary);module=work/'range-reader.mjs';module.write_bytes(reader)
 with tarfile.open(args.source)as tar:test=tar.extractfile('webmpv/tests/range-reader-deadline.mjs').read()
 testfile=work/'range-reader-deadline.mjs';testfile.write_bytes(test)
 process=subprocess.run(['node','--test',str(testfile)],env={**os.environ,'RANGE_READER_MODULE':str(module)},text=True,capture_output=True)
 if process.returncode:raise SystemExit(process.stdout+process.stderr)
 log=args.archive.parent/'deadline-tests.txt';log.write_text(process.stdout+process.stderr)
 evidence.append({'file':str(log.resolve()),'sha256':archive_sha(log),'testHarnessSHA256':sha(test),'suite':'range-reader-deadline'})
record={'status':'developer-beta-candidate-tested','sourceCommit':manifest['sourceCommit'],'sourceTag':manifest['sourceTag'],'runtime':{'file':args.archive.name,'sha256':runtime_hash},'source':{'file':args.source.name,'sha256':source_hash},'tests':evidence,'qualification':'Functional developer beta only; not production, legal, physical AV or universal codec qualification'}
out=args.archive.parent/'verification.json';out.write_text(json.dumps(record,indent=2)+'\n');print(out)
