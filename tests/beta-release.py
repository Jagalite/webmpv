#!/usr/bin/env python3
"""The release flag must not bless dirty, unlicensed or mismatched build artifacts."""
import hashlib, json, pathlib, shutil, subprocess, tempfile, unittest
ROOT=pathlib.Path(__file__).resolve().parent.parent
class ReleaseGates(unittest.TestCase):
 def setUp(self):
  self.tmp=tempfile.TemporaryDirectory(dir=ROOT/'build');self.root=pathlib.Path(self.tmp.name)
  (self.root/'scripts').mkdir();shutil.copy2(ROOT/'scripts/package-beta.py',self.root/'scripts/package-beta.py')
  subprocess.run(['git','init','-q',str(self.root)],check=True)
  self.write('package.json',{'version':'0.0.0-test'})
  self.write('.gitignore','/build/\n')
  self.commit()
 def tearDown(self):self.tmp.cleanup()
 def write(self,name,value):
  p=self.root/name;p.parent.mkdir(parents=True,exist_ok=True);p.write_text(json.dumps(value)if isinstance(value,dict)else value)
 def commit(self):
  subprocess.run(['git','add','.'],cwd=self.root,check=True)
  subprocess.run(['git','-c','user.name=Test','-c','user.email=test@example.invalid','commit','-qm','fixture'],cwd=self.root,check=True)
  subprocess.run(['git','tag','-f','candidate'],cwd=self.root,check=True,stdout=subprocess.DEVNULL)
 def run_gate(self,pattern):
  p=subprocess.run(['python3','scripts/package-beta.py','--release-tag','candidate'],cwd=self.root,text=True,capture_output=True)
  self.assertNotEqual(p.returncode,0);self.assertIn(pattern,p.stderr)
 def test_dirty_tree(self):
  self.write('unreviewed.js','changed');self.run_gate('clean source checkout')
 def test_wrong_tag(self):
  self.write('new.js','new');subprocess.run(['git','add','.'],cwd=self.root,check=True)
  subprocess.run(['git','-c','user.name=Test','-c','user.email=test@example.invalid','commit','-qm','new'],cwd=self.root,check=True)
  self.run_gate('Release tag must identify HEAD')
 def test_unlicensed_source(self):self.run_gate('original-code license')
 def licensed(self):
  self.write('package.json',{'version':'0.0.0-test','license':'GPL-2.0-or-later'});self.write('LICENSE','license fixture');self.commit()
 def test_incremental_build(self):
  self.licensed();self.write('build/beta-build.json',{'clean':False});self.run_gate('completed clean engine build')
 def test_clean_build_allows_worker_sources_but_rejects_old_outputs(self):
  shutil.copy2(ROOT/'scripts/beta-build-record.py',self.root/'scripts/beta-build-record.py')
  self.write('web/engine-worker.js','source code')
  (self.root/'build').mkdir()
  command=['python3','scripts/beta-build-record.py','start','--clean']
  result=subprocess.run(command,cwd=self.root,text=True,capture_output=True)
  self.assertEqual(result.returncode,0,result.stderr)
  self.assertTrue(json.loads((self.root/'build/beta-build-start.json').read_text())['clean'])
  self.write('build/cache/old.a','compiled cache')
  result=subprocess.run(command,cwd=self.root,text=True,capture_output=True)
  self.assertNotEqual(result.returncode,0);self.assertIn('build/cache',result.stderr)
 def test_changed_binary(self):
  self.licensed();self.write('build/engine.wasm','changed');self.write('build/beta-build.json',{'clean':True,'sdk':str(self.root),'sdkSources':{},'sharedTools':{},'inputs':{},'configurations':{},'artifacts':{'build/engine.wasm':{'sha256':hashlib.sha256(b'original').hexdigest()}}});self.run_gate('Build record mismatch: build/engine.wasm')
if __name__=='__main__':unittest.main()
