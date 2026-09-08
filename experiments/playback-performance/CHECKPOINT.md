# Performance checkpoint

## Publication closeout

The user authorized committing and pushing the selected changes after the
post-window Hybrid rollback and its successful validation. Statements below
about uncommitted work record the state when each measurement/check was made.
The selected runtime keeps Software SIMD/scheduling, shared timing and Hybrid's
long-GOP fix; direct shared-packet construction remains reverted. Experimental
presenters stay isolated. See Git history for the publication commit.

Authorized window: **2026-09-08 12:29:14–22:29:14 UTC**. Continue useful work through the full ten hours. All changes remain uncommitted/unpushed. No Docker, no agents, no foreground browser holds. Own isolated headless Chrome only.

HEAD/origin/main remains79c2daf. Preserve the pre-existing adaptive Hybrid scheduler, README changes, prior tests/evidence. Validated changes have now been integrated into maintained source and the two active development engines; original artifact backups and the historical release archive are preserved.

## Selected state after user follow-up (23:05 UTC)

User approved keeping Software and the Hybrid long-GOP fix while reverting the
direct shared-packet optimization. web/retained-decoder-worker.js and its
experiments/retained-presenter/prepare.py generator now match HEAD; the worker's
packet slice is restored and packet-copy.py integration helper is removed.
All Software changes, shared timing and the earlier Hybrid scheduler are kept.
No Wasm rebuild was needed. All21 API and2 strict decoder checks pass on the new
worker. Seventy other recorded inputs match the ten-hour manifest unchanged.
Evidence: results/playback-performance/hybrid-rollback-2026-09-08T23-03-00Z/README.md
and its final-manifest.json/result.json. Historical measurements and manifest are
preserved; no new CPU or endurance claim. All changes remain uncommitted/unpushed.
The ten-hour goal is complete; no running tests or new long-work goal.

## Ten-hour final state (22:29 UTC)

The authorized ten-hour window is complete. All changes remain uncommitted and
unpushed, index empty, HEAD79c2daf. All owned benchmark/server processes exited.
Final preservation and build-input manifests pass; git diff --check passes.
See results/playback-performance/README.md and closeout.json for the final record.
Software:23–34% lower H264 decoder CPU,15.81% lower movie browser CPU. Hybrid:
packet work reduced, hour clean, movie CPU gain/native parity unproven.
All56 feature trials pass;115-format outcomes unchanged with9existing gaps.
Software hour FAILS with12presentationdrops. Matched passage replay also FAILS:
last original trial1drop, both optimized trials clean; no causal conclusion.
No further runtime changes or tests are running. Historical entries below are
superseded by this final state.

## Previous state (22:24 UTC)

All browser measurements are complete. Final features (session65771) exited0:
all7cases/56trials pass. Results are in final-features-2026-09-08T21-49-57.442Z.
Software short CPU reductions:1080p60 10.84%,H26410bit16.06%,HEVC10bit6.28%,
filters+ASS11.85%;VP9 used6.32%MORE CPU with broad overlapping trial ranges.
Hybrid short ASS2.05%,plain6.24% reductions do not supersede its no-gain movie.

Matched movie passage replay(session26069) exited1. Result2026-09-08T22-14-48.082Z
and passage-assessment.json:4x90s measured, baseline/candidate/candidate/baseline.
Both candidates clean; first baseline clean; last baseline1presentationdrop at
movie584.93–587.00. All decoderDrops/audioUnderruns0. Failed screen has NO clean
CPU aggregate; baseline drop does not clear optimized Software hour's12drops.

Report is updated with both hours, all feature means and failed passage replay.
FinalpreservationPASS(19snapshot+5historical). capture-final.py and gitdiffcheck
are running; index is empty and HEAD still79c2daf. Finish verification and update
the work-window status at/after22:29:14UTC, then mark existing goal complete.

## Previous state (21:51 UTC)

Both hour runs are complete; parent session 69079 exited 1 as expected from the
Software failure. Hybrid passed 3600.080 measured seconds with no drops or audio
underruns, 107989 presented frames, a 128 MiB heap, max sampled mpv A/V estimate
20.0 ms, and 0 workers after destroy. All 109776 received frames closed. Its
result and assessment are under stability-hybrid-2026-09-08T20-48-09.084Z.

Final seven-case feature comparison is ACTIVE, session 65771, started21:49:57UTC.
Driver: experiments/playback-performance/run-final-features.mjs. Outer log:
results/playback-performance/final-features.log. Result folder:
results/playback-performance/final-features-2026-09-08T21-49-57.442Z.
Do not run other measured work, builds or tests concurrently. Estimated completion
around22:16–22:19UTC. Afterwards optional4min Software movie passage comparison,
finishreport, verify-baselines.py, capture-final.py, diff/status/index checks.
Continue the authorized window through22:29:14UTC; leave everything uncommitted.

## Previous state (20:51 UTC)

**SoftwarehourCOMPLETE**,3600.017measuredsec/3661.688wallsec,6segments,107984
presentedframes. **FAILstrictzero-dropgate:12presentationdrops** (segment2:1,
3:8,4:3;others0). DecoderDrops0,audiounderruns0,maxabsmpvAVestimate16.0003ms,
heap128MiBthroughout,workersAfterDestroy0,hashesunchanged,nofailureexception.
RSSfirst1158414336,last864976896,peak1373257728. Finalsegment600sclean.
AssessmentJSONwritteninSoftwarehourfolder;drop-observations.json nowall12events.
Usertoldfinalcountsandcleanupcandidly. ReportupdatedSoftwarehourfailure/details.

**Hybridnowactive inSAMEsession69079**, automaticsecondcommand:
results/playback-performance/stability-hybrid-2026-09-08T20-48-09.084Z;
logstability-hybrid-hour.log. At20:48:59had25measuredsec,issuesnone.
Expectedcomplete~21:49:30. Do notstopparentbecauseSoftwareexit1;Hybridcontinues
andparentshellfinalexit1expectedfromSoftwarefailedgate. NootherCPUworkduringhour.

AfterHybrid: ~40minleftuntil22:29:14UTC. Run7featurecases~26min preparedrunner;
optionally4minmatchedSoftwaremoviepassagecomparison(originalvsmaintained) tocheck
whetherdropsreproduce,samehostloadlimitation. Thenfinalreport/verification/status.
Allruntimeunchanged. No newarchitecture/sourceoptimizationexperiment needed.

## Latest observation (20:29 UTC)

Softwarehascompleted4x600ssegments. Frame-drop counters RESET on eachseek.
CUMULATIVE presentationdrops=9 (segment2:1,segment3:8); decoderDrops0 andaudio
underruns0. Previous commentary reporting livecounter8omittedpriorsegment1drop;
userhasnowbeenexplicitlycorrectedto9total. Fifthsegmentrunning,69079unchanged.
Wasmheap128MiBallsegments. Segment3ChromeCPU66.37% vsprior47–49%; no causalproof.
Read-onlyhostobservation **software-hour-host-observation.json** showed concurrent
Renderconformance~87.8%CPU,Shopperprecision~70.8%,andotherbusyChromerenderers.
Do notstopforeignprocesses. Memoryfreeindicator48%; no memorypressureclaim.
Source/dropintervalrecordsoftware-hour-drop-observations.json nowhas9eventsacross
multiplemoviepositions,notjust511s. StrictSoftwarezerodropgateFAILED;stillfinish
hour,thenHybridautomatically. Current~20:29,Hybridexpectedcomplete~21:50,39minleft
for~26minfeatures,optional4minmatchedSoftwaredrop-sectionrepeat,andfinalreport.

## Latest observation (20:21 UTC)

Softwarehour remainsrunningin69079; at2006measuredsec countersframeDrops1,
decoderDrops0,audioUnderruns0,heap128MiB. **STRICT ZERO-DROP CRITERION FAILED**.
Onepresentationdropinsegment2,observedbetweenUTC20:15:48.771and20:15:53.778,
moviepositions506.566→511.633. No sampledA/Vspike(1–7ms),IOpendingfalse,
maxRenderMsunchanged11.195. CauseNOTestablished. Evidence
results/playback-performance/software-hour-drop-observations.json.
Preservefailure;donotlabelSoftwarehourpassed. Stillfinishfullhour;Hybridwillrun
nextautomatically. Atendconsider4minmatchedbaseline/candidate replayaround
movie490–540sec iftimepermits, then7featurecases~26min. Deadline22:29:14.
Allruntimeunchanged,otherfinalregressionspass. First2Software600ssegmentsclean;
third1presentationdrop. RSSdeclinedinsecond/third;heap128allcompletedsegments.

## Current work (19:50 UTC)

**Only active owned session69079**: sequential one-hour measured headless
stability runs. Software first, then Hybrid automatically, even if first exits1.
Logs results/playback-performance/stability-software-hour.log and
stability-hybrid-hour.log. Final shell writesstability-hour-exits.json.
Software result **stability-software-2026-09-08T19-46-55.738Z**; at19:49:20 it
had115measuredseconds,issuesnone. Six600ssegments,warm10aftereachremote seek,
oneplayerwholehour,actualcurrentruntime. Expectsoftwaredone~20:48,Hybriddone
~21:50. No otherCPUmeasurements/tests/builds whilethese run. Docs/read-onlyreview
arefine. Do notmodifyruntime orstabilityharness inputs.

FINAL REGRESSIONS DONE:
- driverresults/playback-performance/final-checks-2026-09-08T19-37-56.001Z/result.json
  passed. tsc--noEmit;46coreunits;5RGBXexperimentunits;bothnarrowSIMD1/0M4suites;
  bothactual4module/Wasmloadsverifiedagainstmanifest;Softwarelegacy21.
- Finalmatrixresults/format-matrix/**2026-09-08T19-40-57.096Z**:112decode,
  106seek,115cleanup. All115caseflagsidenticaltoexactoriginalfixturehashes;
  baseline-comparison.json differences[]. Nineexistinggapsremain;rawexit1preserved.
- verify-baselines.py PASS19snapshotfiles+5historicalartifacts includingrelease.
- capture-final.py PASS **integrated-build/final-manifest.json**,73files,
  5nativekernelssameas3.97mtestbuild/decoderbuild/Softwarebuild;allSoftwarebuild
  inputsunchanged;exactcurrentAPI21andstrictruntime2inputsverified. Actualnative
  SoftwareWasm7153a26494cec767bc7fc859d353b56e774f0ac57dd9da4bf9f535e3984283e9.

FINAL PERFORMANCE:
- Softwaremovie12armsallpass,results18:44:48.067.51.76135→43.57758%onecoreCPU,
  **15.81058%lesswholebrowserCPU**, Native5.24657%;exactseekpixels,0drops/underruns.
  Renderer42.137→34.100%;GPUprocess8.717→8.581%. Noidleclaimfrom2ssamples.
- Matcheddecoderbenchmarkmovie33.68094%CPU /30.85829%elapsedless,782exactframes,
  decode18:37:18.758.1080p6023.40046%CPU /24.34991%elapsedless,1560exactframes,
  decode18:38:10.045.6trials/arm,matchingarchives/sourceverified,cleanup8workers[].
- **Hybridmovie12armsallpass but4.84497%MORECPU**,18.75132→19.65982%,Native6.14047.
  results19:06:41.935. Rangesoverlap;Native4.91–7.38. DONOTCLAIMwholeHybridgain.
  BaselineadjustedonlyforstrictlongGOPnative/workerfix; originaltiming+packetslice.
  SnapshotALREADYincludesearlieradaptiveHybrid scheduler.
- Timingisolation19:29:31.681(all8pass):baselineCURRENTclient18.241%,candidate
  OLDrepeatedmessages22.694%,candidate24.4%more. Rangeshuge12.69–28.19vs14.38–36.55;
  shorter10prewarm/6warm/30measure. Notdependablegain; doesn'timplicatecoalescing
  asearlierincreasecause. Maintainedruntimeunchanged. Usertoldthiscandidly.
  Renderer/GPU/audioCPUvaried;read-onlypsshowedChromium+Codex, noRustbuildobserved.

AFTER BOTH HOURS:
1. Inspecthourresults, allissues/drop/audio/cleanup/resourcebounds; noforegroundclaim.
2. Run **node experiments/playback-performance/run-final-features.mjs** withlocal
   Chromeescalation. Preparednotexecuted, now~26min (NOT35):7casesx8ABBAarms,
   warm6/measure12/sample2;IDLE15 ONLYsoftware1080p60andHybridplain,othersIDLE2.
   CasesSoftware1080p60,H26410bit,HEVC10bit,VP9,ASS+hflip,eqbrightness.1+volume.5,
   HybridASS,Hybridplain. Originalsnapshot(noHybridcorrectnessoverride neededfor
   syntheticGOP60). Runnerclearsstaleenvs;keepsfailedscreens;assess/processcosts.
   Itwritesfinal-features-<timestamp>/result.json andpercaselogs;redirectouterlog
   results/playback-performance/final-features.log. Expectdone~22:16.
3. Finishresults/playback-performance/README.md withhour+featureoutcomes, bounds,
   reproduciblecommandsifuseful. CurrentREADMEhasallfinalmovie/decoder/regression/
   preservationresults; hour+featurespending. Do notclaimHybridnativeparity.
4. Finalverify-baselines.py /capture-final.py (optionalposttestrecheck),gitdiff--check,
   status/indexempty/noheadchange. Alluncommitted/unpushed, noDocker/agents.
   Continuefullwindowthrough**22:29:14UTC**, goalcompleteonlythenafterreportdone.
   Goalactivealready;donotcreatenew. No tokenbudget.

FinalmemorycitationrequiredMEMORY.md231–232,rollout01a07835-7fce-7da3-b2bc-78507a3a6805.
Fullmaintainedsetandrejectionsinhistorical18:22below. No newarchitectureexperiments.

## Historical work (18:22 UTC)

**Only active owned session56445**: sequential final builds, no CPU measurements
or browser tests running. It builds `link-decode.sh maintained`, then production
`scripts/link.sh` to isolated `build/.../narrow-simd` and `narrow-no-simd`, both
WEBMPV_BROWSER_DECODER1, SIMD1/0 respectively. Logsbuild-maintained-decoder.log,
build-narrow-simd.log,build-narrow-no-simd.log. Resultmanifestsunder
results/playback-performance/narrow-{simd,no-simd}. Historicalengines untouched.

Final intended maintained set is now selected:
- native/simd fiveCfiles: chroma,biweight,qpel,deblock,dspdispatcher. Actualnative
  driverPASS3,972,224cases+20dispatchcases. ActiveSoftwareWasm rebuiltwiththese.
- Software active5ms/paused100ms scheduler; ImageData presenter remainsdefault.
- Bothmpvmodes timingcoalescingwithforcedreadyhandoff. npmtestincludesfourtiming
  cases (newdestroyedcasenotyetexecuted); no publicAPI changes.
- Hybridnative strictretainedmode2(noSWreplay), originalCanvas2D renderer.
- **NEWPROMOTED** web/retained-decoder-worker.js removesonlypacket `.slice()` before
  EncodedVideoChunk. Retainsconfigurationcopy. Exactbytecopyoftestedcandidate.
  Helperexperiments/retained-presenter/packet-copy.py preservesgeneration; decoder
  subsectionofprepare.py verifiedbyteidenticalwithoutrewritingotherartifacts.
  Historicalpacketexperimentprepare.pynowreadsoriginalbaselinesource.

Directpacketvalidation:
-24actualdedicatedworkerownershipcasesPASS,includingplainSAB/WasmMemorygrowth,
  unalignedoffsets,negativePTS,bytes1..8MiB andmailboxoverwriteafterconstruction.
  Constructoronlymicro57–65%lesselapsed(no wholeplayerclaim),logchunk-ownership.log,
  output18:05:26.670.
-21APIchecksPASS withcandidateexactworker; finalassetsnapshotshows11actualworker
  loads. Logapi-packet-direct.log. Softwarealsohasnewdeblock inthistest.
-Strictretainedruntime **DEFAULTmaintainedsources** PASS2checks,log
  strict-runtime-integrated-packet.log,output18:19:58.436. LongGOP/negativepreroll
  >400packets plusinjectedfaultafter48frames andexplicitSoftwarerecovery.
  tests/strict-decoder-runtime.mjsnowdefaultscurrentassets; optionalconfigsupported.

**Rejecteddefaultpresenterchanges**:
- Opaquefullcanvasfastpath:192exactpixelcasesPASS;short8arm+1.60%CPU, long4arm
  +9.827%CPU(allqualityPASS),logcanvas-opaque-bbb-long-screen.log,18:07:20.154.
  OriginalHybridrendererremains. Userwaspromisedlongcheck; completed.
- RGBXVideoFrameSoftwareupload:24pixelcasesPASS;startupNaNtimestampbugfixed;
  short8arm3.434%lessCPU, long4arm **9.950%MORECPU**,allqualityPASS. Longlog
  rgbx-bbb-long-screen.log. No reliablewholeplayerbenefit; ImageDataremains.
  Fivehelperunitcaseswritten(firstfourpreviouslypassed); no maintaineddependency
  onVideoFrameforSoftware. Rawfailedinitialscreenspreserved.

Next required work:
1. Wait56445. Finalmaintaineddecoder benchmarkbaseline vsmaintained onBBB and
   1080p60 (CYCLES3,2threads), exactMD5 expectedvaluesbelow.
2. FinalwholeSoftwarecurrentvsoriginalsnapshot, plusNative reference, balanced
   realmovie. Prefer12arms native,baseline,candidate,candidate,baseline,native twice;
   remoteBBB start236.9/prewarm30/warm10/measure60/sample5/reusebrowser/page.
   CPUrunsmustnotcoincidewithbuilds/tests/profiles. No presenter overrides.
3. FinalHybrid comparison: **build/.../hybrid-correctness-baseline.json** mapsjust
   currentstrictworker+nativeengine, so baselinehaslongGOPcorrectnessfix butkeeps
   originaltimingmessagesandpacketcopy. Candidatecurrentdefaults,Native reference.
   Labelthisbaselineadjustment; originaloldHybridcannotreliablyplaylongGOPmovie.
   Also a shortsynthetic comparisonagainsttruestartofwindowbaselineifuseful.
4. LegacyM4testbothnewnarrowengines withsnapshotconfigmappingweb/engine and
   web/engine-m4 module/Wasm toisolatedoutputs. HEADLESS1. FinallegacySoftware21,
   fullformat115, defaultAPI21+46units (rangeorigin4180/4181required) asappropriate.
5. **NEWtests/playback-stability.mjs remainsUNEXECUTED**. Short30s/twosegment
   smokesbothmodesbefore1hmeasuredpermode. Oneplayeracrossremoteseeks; snapshot
   nowincludespublicentrymodules,io/range/resource/vodfilesandfont. Resources16
   retained/8decoderframes/512MiBWasm. Signalhandlers/ownedservercleanupwritten.
6. Reserve2h+warmupsforheadlessstability. Current~18:22;end22:29:14,~4h07remain.
7. Finalrepeatbuild/sourcegenerationprovenance,verify-baselines.py (writtenonly),
   curatedREADMEfinalresults,Gitscope,nocommit/nopush. RootREADME/newperformance
   READMEareinprogressdrafts. Updateinitialintegrationmanifestwithseparatefinal.

Tests/playback-performance.mjs nowalsoassertszeroaudioUnderrunDelta; appliedafter
lastcompletedCPUrun. No activeCPUruncurrentlyusesit. CapturesfailureStateonerror.
Additionalprimarysource: https://w3c.github.io/webcodecs/#encodedvideochunk-interface
confirmsconstructorownedcopyofAllowSharedBufferSourcebeforeitreturns.

## Historical work (17:47 UTC)

**Active session42150**: one Software RGBX upload debug trial; log
`rgbx-runtime-debug.log`. No other owned tests/builds running. Inspect failureState
for the reason the raw VideoFrame uploader deactivated. The prior eight-arm
`rgbx-bbb-screen.log` failed all four candidate readiness checks; preserve it.

New maintained Software integration: both inter luma deblocking directions,
with packed four-byte row loads/stores in horizontal filtering. Dispatcher now
lives in native/simd/h264-dsp.c; biweight/deblock export separate initialization
functions. Chromatic/qpel native sources unchanged. scripts/decoder-simd.sh links
all five C files. Active Software engine rebuilt successfully, log
build-integrated-deblock-software.log. No new Hybrid artifact changes.

`test-maintained-kernels.sh` compiles actual native sources and small test-only
slot adapters, then runs all checks only after every link exits. PASS3,972,224
cases and20 combined-dispatch checks; output
build/playback-performance/maintained-kernels-20260908T173553Z,
logmaintained-kernels-deblock.log. `npm run test:decoder-simd` invokes this driver.
Default npmtest now includes timing-coalescing, which has a new destroyed-player
case (fourth unit; not yet rerun). Generated TS unchanged since initialintegration.

Deblocking evidence (all exact MD5):
- vertical adds4.5305% movieCPU /4.9487%elapsed over simd-qpel.
- scalar horizontal adds2.5874% movieCPU /1.6181%60fps; superseded.
- packed horizontal adds5.7709% movieCPU /2.7102%60fps over vertical-only,
  six balanced trials each. Logsdecode-deblock-packed-{bbb,60fps}.log.
- packedmicro614400cases; clean isolated active~3.1x /rejected~1.37x.
  Initialnon-isolated micro started before compilerexit confirmed; useisolatedlog.

Two new presentation experiments remain ISOLATED:
1. experiments/playback-performance/canvas/retained-video.js omits clear/transform
   only for opaque,unrotated,exactly full-surface frames.192 exactpixelcasesPASS
   at17:34:06.118. Eight-arm movieCPU screenALLPASS butcandidate1.60165%MORECPU;
   result17:40:19.506,logcanvas-opaque-bbb-screen.log. Notpromoted. Promised user
   one longercheck beforediscarding; usecurrentHybridbaseline overrides so strict
   decoder correctness iscommon. Rawcurrentmapping underbuild/.../canvas-opaque.
2. RGBX rawVideoFrame upload forSoftware, preservingImageDatafallback andFFmpeg
   decodeownership. experiments/.../rgbx-frame/{uploader.js,prepare.py}.4unitchecks
   PASS;24 exactRGBXpixels casesPASS inclSAB/ordinary buffers,oddsize,inputmutation
   afterdrawprovingcopyownership (17:43:47.355). Fullworker deactivates path; debug
   active. No productionchanges. Configs build/.../rgbx-frame/{baseline,candidate}-overrides.json.
   Worker generatedfrommaintainedSoftware5ms; nativeengine/commonTSsame inbotharms.

`tests/playback-stability.mjs` NEW and syntaxcheckedONLY. One player acrossremote
seeks,default3600measuredseconds in600ssegments,10s postseekwarmup,5ssampling,
checkpoint/phasecountdown,error/drop/audio/avsync/resource/cleanup/hashchecks.
Signalhandlers explicitSIGTERM/SIGINT,ownedservercleanup. It needs short30s
smokes onboth modes beforelongruns. No longrun startedyet. Retainedbound16matches
production. Optionalfailedqualitycountersrecordissues andcontinue; harderrorsabort.

`tests/playback-performance.mjs` now checksrawuploadcreated==closed andzero
failures, andcapturesfailureStateonerror. Donoteditwhileanyrunactive.

README andnewresults/playback-performance/README.md have draftin-progresswork
record. Updatewithfinalintegratedwholeplayer/stabilityresults beforeclosing.
Currenttime~17:47UTC; targetend22:29:14UTC;~4h42remain. Need cleanwholeSoftware
baselinecomparison withnewdeblock, integratedHybridcomparison, finalnarrow/M4
SIMD+optoutbuilds/tests, finalformat/APIchecks, andreserve~2h forheadlessstability.
NoDocker,noagents,nocommits,nopushes,noforegroundholds.

## Historical integration (17:14 UTC)


**Active session28975** compares isolated `simd-qpel` versus
`simd-qpel-deblock` on bbb-key-240.mp4; log `decode-deblock-bbb.log`. No other CPU
measurement/build/profile should run concurrently. Inspect result when done.
The new deblocking candidate is NOT integrated. No other active owned processes.

### Important change to the earlier artifact policy

Validated changes have now been integrated into maintained source and the two
**active development engines** rebuilt. They intentionally differ from the old
accepted bytes. Original engine/module pairs for engine, engine-m4,
engine-retained-subs and engine-software-full are preserved byte-for-byte under
`build/playback-performance/accepted-artifacts/`, with a manifest. The original
runtime comparison snapshot remains unchanged. The accepted release tarball and
historical engine / engine-m4 files have NOT been replaced. Do not treat the two
rebuilt active development engines as accidental baseline corruption.

Original native/player.c, vd_browser.c and browser_decoder_bridge.h are also
saved under `build/playback-performance/source-baseline/native/`. Historical
prepare-strict-decoder and prepare-hints now read that vd_browser.c snapshot.
prepare-timing now reads the original baseline generated WasmPlayer, so it does
not accidentally reapply changes to the integrated implementation.

### Maintained integration applied

- `native/simd/h264-{chroma,biweight,qpel}.c`: byte-identical copies of validated
  candidates, with a README. No deblocking kernel in maintained source yet.
- `scripts/decoder-simd.sh`: default link-time DSP replacements for both narrow
  software (`scripts/link.sh`) and expanded software build. Set
  WEBMPV_DECODER_SIMD0 to omit the additional wrappers. The disabled argument
  array deliberately contains a harmless include argument for Bash3.2 nounset.
- `scripts/manifest.py` recursively hashes native sources and records the flag;
  `experiments/software-full/inventory.py` records kernels and build selection.
- `native/vd_browser.c`: validated strict retained mode2, keeping legacy mode1
  replay. Only further changes are accurate file/log descriptions.
- Maintained Hybrid worker enables2; retained-fixes.py preserves that on rebuild.
- `experiments/software-full/scheduler.py` and generator preserve active5ms,
  settle paused playback to100ms, immediate commands/resize and200ms diagnostics.
  Generated worker exactly matched the tested scheduler5 candidate.
- `src/internal/wasm-player.ts`: coalesces unchanged timing observations, forces
  engine-ready handoff, suppresses timing after destroy. Generated JS/types built.
- `tests/timing-coalescing.mjs` now tests maintained generated WasmPlayer.

Both production build recipes completed successfully (Software full with two
jobs; retained-subtitles with browser decoder enabled). Logs
`build-integrated-software.log`, `build-integrated-hybrid.log`.
`results/playback-performance/integrated-build/initial-manifest.json` records
initial integrated sources and actual module/Wasm hashes. Later source edits
will require a refreshed final manifest; preserve this initial one.
All work remains uncommitted, no Docker, no agents, no foreground holds.

### Validation since integration

- **21 default public API checks pass**, no asset overrides:
  `results/player-api/functional-2026-09-08T16-58-32.358Z`, logapi-integrated.log.
- **45 unit checks pass**, including timing, audio, geometry, browser decoder,
  range and resource behavior: integrated-units-with-origin.log. Required owned
  scripts/media-server.mjs origins4180/4181 were started and stopped by the runner.
  Earlier integrated-units.log failed sandbox EPERM; loopback retry lacked the
  origins and failed ECONNREFUSED. Keep those failed attempts distinct.
- Production-O2 kernel driver passes663552 chroma +1752192 biweight +327680 qpel
  cases: integrated-kernels-o2.log points to ignored kernel output and manifest.
- **1080p60 isolated decode** passes1560 exact frames, MD5
  f45eb7866de9b40297b15245671d4be9, four trials per variant,20.44% less processCPU /
  21.51% less elapsed: decode-simd-qpel-60fps.log. Clean eight-worker teardown.
- Candidate API21 before integration passed at16:31:02 with strict Hybrid and
  Software SIMD-qpel/scheduler5 overrides.
- **Full115 format matrix** with that candidate at16:33:10.926 matches every
  baseline result:112 decode,106 seek,115 cleanup. Baseline comparison aggregates
  the90 original +25 added +3 corrected-fixture reruns, matching exact fixture
  hashes; baseline-comparison.json lists each source. No differing case flags.
  Matrix exits1 for existing gaps; that is not a regression.
- Strict legacy copy-back test passes at
  `results/m4/browser-2026-09-08T16-29-52.327Z`: injected fallback, software/browser
  pixels and ASS, seeks and20 lifecycles. This binary did not yet include the new
  SIMD wrappers and predates the native log-string change. A final isolated
  narrow/M4 build with the production link recipe would validate that combination.
- Range-origin cancellation regression passes; no shared-FD close on abort.

### New deblocking candidate (NOT integrated)

`simd/h264-deblock.c` specializes eight-bit h264_v_loop_filter_luma only: two
8-lane i16 operations across16 columns, no extra source overreads, exact clip /
rounding and masked p1/p0/q0/q1 writes. Other DSP dispatch stays FFmpeg.
`test-deblock.c` passes614400 cases (alpha/beta boundaries, mixed signed tc0,
positive/negative strides, offsets, full4096-byte guard comparisons, other depths).
Raw deblock-kernel.jsonl: active filtering~5.3x, rejected-edge~1.6x, disabled~1.3x.
CompiledO2 and clean exit. No h-loop, chroma or intra specialization yet.

prepare-deblock.py composes biweight and deblock initialization into ignored
`build/playback-performance/deblock/combined.c`. link-decode/link-software accept
`simd-qpel-deblock`; their manifests now include actual EXTRA C inputs, including
that generated initializer. Only the decoder variant has been built so far.
Active comparison28975 tests its added decoder CPU benefit and exact movie MD5.

### Hybrid track experiment outcome so far

Original movie screen failed its clock check because Chrome's live-video sink
uses the underlying media timestamp even when a VideoFrame clone overrides its
JS timestamp. This is proved by `tests/track-timestamps.mjs` at16:42:35.093:
JS timestamp1788885755948600 while callback mediaTime0. Chromium primary source
matches this behavior (references in track/README.md). Huge old delay values are
invalid and excluded.

Current prototype keeps original frame timestamps, posts submission wall times,
and joins them with video callbacks via bounded track/clock.js. Two clock unit
checks pass, covering either task order, seek reset and bounded storage.
The performance harness resets the clock for measurement, counts actual
compositor frames/drops, requires95% timestamp matching, and captures the explicit
video+subtitle composition. It does not pretend the public canvas includes video.

**Corrected six-arm short screen passes**:
`2026-09-08T16-45-38.660Z`, logtrack-clock-fixed-screen.log.
Canvas baselineCPU17.678/13.145; track15.352/13.561: **6.20% mean reduction**,
only two trials each, with substantial run variation. Same raw exact-seek pixels;
composite PNG visually inspected and correctly shows the movie.
Chrome expected-display estimates average53.7ms and2.7ms; the latter includes
negative predictions (min-16.3ms). These are predictions, NOT independent physical
A/V latency. The actual browser presentationTime should also be instrumented if
pursuing this further. No native parity or release qualification claim.

The track path remains experimental and **not public-surface-compatible**;
only unrotated square pixels accepted. Default Hybrid remains Canvas2D. Its
small variable gain has not earned a public surface/overlay architecture change.
WebGPU also remains experimental; earlier color/lifetime proof is still valid.

### Longer Software screen preserved as a failed whole comparison

`2026-09-08T16-06-01.179Z`, software-simd-qpel-long.log, eight120s measurements,
remote BBB starting236.9,30s prewarm /10s warmup, same browser/page.
Seven pass, one10ms-cadence candidate drops two presentation frames. CPU values:
baseline57.339,54.441,72.188,57.991;
candidate44.417,47.860,64.011(failed),46.266.
Two unrelated Rust compilers were observed around80%CPU each during the high-cost
portion; host-load-observation.json records this limited evidence, not causality.
No foreign processes were changed. assess-playback.py refuses an aggregate CPU
comparison for this failed run. The maintained Software active cadence is5ms.
A clean balanced whole-player comparison of the integrated5ms build remains due.

## Historical checkpoint (16:26 UTC)

**Active session19626**: eight balanced Software movie trials, remote full BBB,
START_SECONDS236.9, PREWARM30, WARMUP10, MEASURE120, SAMPLE5, REUSE_BROWSER1 /
REUSE_PAGE1. Log `software-simd-qpel-long.log`, result folder
`2026-09-08T16-06-01.179Z`. Last trial is measuring; should finish about16:28UTC.
Do not edit its script or served inputs, build, encode or run another browser
while it measures. It already has **one failed candidate trial: two presentation
drops**, with much higher CPU/render time. Preserve the failure. Two unrelated
Rust compilers were observed around80%CPU each; a separate
`host-load-observation.json` records the limited evidence. Do not stop them.
This snapshot does not prove the cause; the full run is not a clean comparison.

First completed CPUs: baseline57.339, candidate44.417, candidate47.860,
baseline54.441, candidate64.011(two drops), baseline72.188, baseline57.991.
No other completed trial has dropped a frame; final candidate remains pending.

### New Software qpel SIMD

`simd/h264-qpel.c` replaces eight-bit luma interpolation at sizes16/8 for all
16 fractions, both put/avg. Other sizes/depths remain FFmpeg. Exact six-tap
horizontal/vertical/diagonal rounding with signed16/32-bit intermediates.
`test-qpel.c` passes327,680 differential cases, positive/negative strides,
32 patterns, offsets, entire8192-byte guard/source comparisons. Its microbench
is substantially faster. Raw result `qpel-kernel.jsonl`.

Full movie decoder results (four measured trials per variant,782frames, identical
MD5 `5caed1881b0939caa8b8c34113b571a7`, explicit eight-worker cleanup):
- `decode-qpel-bbb.log`: qpel alone10.31% less elapsed /12.15% less processCPU.
- `decode-simd-qpel-bbb.log`: chroma+biweight+qpel22.90% less elapsed /
  **26.55% less processCPU**. These exclude rendering/audio.

Built isolated `decode-qpel`, `decode-simd-qpel`, `native-simd-qpel`.
The running player candidate is `software-simd-qpel-scheduler/overrides.json`
(active10ms). **Prepared, untested** `software-simd-qpel-scheduler5/overrides.json`
keeps active5ms, settled pause100ms, coalesced timing. Use it to separate decoder
wins from the active cadence change. `software-scheduler.py` now accepts5/10;
its default remains the previously measured10. No maintained source promoted.
`test-kernels.sh` is a new reproducible compile-then-run driver, not yet executed.
`assess-playback.py` summarizes trials and refuses an aggregate comparison if the
complete run failed; not yet executed.

### Remote harness validated

Full634.6s `bbb-stream.mp4` is completed: video copied unchanged, first audio
converted toAAC128k stereo,248805945bytes. Attribution/command/hash/probe in
`bbb-stream-manifest.json`. Runtime range-origin smoke passes Native, Canvas2D
Hybrid and WebGPU: `remote-reuse-smoke-fixed.log`.

The first origin failed because destroying a FileHandle-created response stream
closed the shared descriptor. It now uses positional reads in a Readable
async-generator, preserving the descriptor on cancellation. Regression test
`tests/performance-range-origin.mjs` is prepared but **not executed**. Do it after
the active measurement. It checks repeated canceled full responses followed by
exact bounded ranges, EOF clamping, invalid ranges, CORS, ETag and cleanup.

### Hybrid video compositor prototype prepared

`track/prepare.py` builds ignored `build/playback-performance/track/` overrides.
It transfers a main-realm MediaStreamTrackGenerator writable to the engine
worker, sends mpv-selected VideoFrame references with monotonic wall timestamps,
and uses a separate transparent canvas for changed subtitle tiles. Max two
pending writes, main-video callbacks measure actual delivery and added delay.
**Not public-API-compatible:** the canvas contains only subtitles; only
unrotated square pixels accepted. Keep experimental pending CPU, timing and
surface-contract assessment. Read `track/README.md`.

Synthetic `tests/track-presenter-probe.mjs` passes:
`track-probe-2026-09-08T16-05-22.501Z`:60 generated /60 compositor frames,
zero drops, each write closes its submitted frame, exact final RGBA pixel.
Chrome152 exposes legacy generator in main realm, neither generator in worker.
The first probe captured after closing the track and got black; corrected by
capturing while live before teardown. **Actual mpv movie prototype not run.**
Need extend playback harness AFTER current run for trackOutput delivery/drop
checks, displayed latency and video+canvas composite pixel capture.

### Legacy strict-decoder regression prepared

`link-hybrid.sh strict-copyback` now links strict native C with the ordinary
native SW renderer into a separate ignored directory. **Not built yet**.
`build/playback-performance/api-strict-copyback.json` mounts only its M4 binaries.
`tests/m4.mjs` now supports HEADLESS1 and WEBMPV_PERFORMANCE_CONFIG, recording
actual snapshot bytes while preserving default foreground/manual-server mode.
Run build then HEADLESS1 WEBMPV_PERFORMANCE_CONFIG=... node tests/m4.mjs after
measurement. This checks legacy mode1 software fallback, pixels/ASS, seeks and
20 lifecycles before promoting strict mode2 changes.

### Completed earlier sessions

One-thread decoding is rejected: movie64% slower /only6.9%CPU less;1080p60
56% slower /only3.3%CPU less. Keep two threads. Movie Node benchmark finished
results but lingered; exact owned processes stopped, no clean-exit claim for it.
The later60fps test explicitly terminates eight pool workers and exits cleanly.
Movie profile `profile-2026-09-08T15-45-45.277Z` identifies qpel as significant;
IDCT only~40ms across two workers in10s, too small to prioritize.

`webgpu/presenter-next.js` remains an untested factory-hardening candidate;
current `presenter.js` has the proven strong external-texture reference, no
extra VideoFrame clones. Long same-page WebGPU comparisons remain pending.

## Strong Software result

- Chroma SIMD:663,552 differential cases, all fractional positions, negative/positive strides, guards; about4.7x kernel speed.
- Biweight SIMD:1,752,192 differential cases including boundary signed weights, offsets, denominators, guards; about2.9x weighted /13x averaging kernel speed.
- Combined full-video decode at `decode-2026-09-08T14-09-55.287Z`: all782frames identical MD5 `79f59cafdf345f4c308b281a7df6df73`; four measured trials per variant,10.29% less elapsed and9.58% less processCPU. These are isolated decoder numbers, not whole-player CPU.
- Combined Software SIMD+scheduler+timing on a licensed1080p movie: `software-bbb-balanced.log` points to results. Eight balanced trials pass, actual mpv drop counters stay unchanged, pixels stable. BaselineCPU62.228,60.699,61.149,55.261; candidate56.405,54.221,52.987,49.374 (about11% mean reduction). Headless development evidence; host CPU varies.
- Synthetic1080p30/60 screens at14:27:32/14:29:19 pass identical pixels and modest CPU gains; those older runs did not yet record actual mpv drop counters.
- Legacy Software21 functional checks pass: `results/software-full/functional-2026-09-08T14-42-05.350Z`, including codecs, audio, subtitles, filters, remote playback.
- SIMD source remains experimental under `experiments/playback-performance/simd/`; build output `native-simd`; composition `software-simd-scheduler/overrides.json`.
- Scheduler candidate: active10ms, settled pause100ms, immediate commands/resize,300ms busy grace, next timer scheduled before tick, wall-clock diagnostics200ms. Paused CPU benefit has not been established.
- Timing candidate suppresses identical messages, forces republish on engine-ready to avoid losing state during asynchronous initialization. Three unit checks and21 API checks passed.

## Hybrid correctness discovery and fix candidate

The real movie exposed a pre-existing replay bound race in current Hybrid: a250-packet GOP plus decoder lookahead can reach the256-packet replay limit before its next keyframe is delivered. Both Canvas2D and WebGPU stopped at submitted256/frames250. Evidence: `2026-09-08T14-58-11.875Z`; failed trials are not clean performance comparisons.

`prepare-strict-decoder.py` + `link-hybrid.sh strict` build an isolated fix at `build/playback-performance/decoder-strict/`:
- mode1 retains legacy native copy-back/software replay;
- mode2, requested by the retained-frame worker, does not clone/cache packets for incompatible software replay;
- retained decode failure closes the browser decoder and marks the native filter failed; public explicit Software switching owns recovery;
- first-keyframe validation is tracked independently of replay count.

Runtime proof: `strict-runtime-2026-09-08T15-18-54.650Z` passes the negative-preroll movie through549 submissions beyond the old bound, plus injected failure reaching the public error event and explicit Software recovery. Diagnostic decoder string becomes `software` when inactive (legacy convention), although strict native does not decode software frames. Do not claim it actually replayed software.

Strict native/worker remains experimental. Legacy copy-back regression with the modified native source still needs testing before promotion. Native C source hash/binary match was checked after idempotent regeneration; GPU-worker JavaScript changed later, so refresh only the JS portions of the manifest with explicit provenance.

## WebGPU renderer: promising on synthetic, not a proven movie CPU win

- Native VideoFrame external textures, mpv frame selection unchanged, cached native subtitle tiles, SAR/rotation/letterboxing; Canvas2D fallback when unavailable.
- Original synthetic4-trial screen14:35:12 showed about14.45% lower whole-browser CPU, all real drop/audio/ownership checks passed.
- Latest12-trial movie screen (`strict-gpu-fixed-bbb-balanced.log`, started15:22:47) passes all functional checks but **does not show a CPU win**. Strict Canvas2DCPU26.885,37.130,34.223,34.930; WebGPU36.875,35.909,38.015,35.540. Native3.717,12.753,13.384,12.722. Large host/renderer variation; use longer same-page measurements before deciding whether to keep WebGPU. Do not promote because the earlier synthetic result looked attractive.

### Color proof

`tests/inspect-hybrid-frame.mjs` compares the exact same held frame with Canvas2D and WebGPU, traces actual Chromium external-texture imports and screenshots Native video.
- `frame-color-2026-09-08T14-50-34.104Z` proves **zero_copy:true**, actual VideoToolbox hardware frame, hidden **BT709_APPLE** transfer even though JS reports genericbt709.
- Canvas2D treats that transfer as sRGB; WebGPU applies Apple gamma1.961→sRGB. Untagged and consistently tagged709 Native display matches WebGPU within1channel value; Canvas2D can differ by12.
-601/2020 tests also mostly favor WebGPU versus Native but include edge/gamut differences; do not claim universal exact parity. Conflicting container/bitstream tag fixtures intentionally expose different decoder metadata handling.
- Controlled renderer test `gpu-presenter-2026-09-08T15-10-29.351Z` passes24 cases **exact pixels**:RGBA and independently computed BT.709NV12 reference, rotations0/90/180/270, anamorphic geometry, subtitle alpha/scaling/clipping. Initial tests sampled before OffscreenCanvas commit; corrected to two animation frames. Raw Canvas2D NV12 blue coefficient is approximate, so it is not an exact mathematical oracle.

### Texture lifetime proof

An intermittent destroyed-IOSurface-texture error was **not** fixed by cloning VideoFrames. That experiment is preserved as ignored `build/playback-performance/webgpu/presenter-with-clone.js` and was removed from the active candidate.

Root cause: Chromium external-texture cache has weak references; bind group retains the native handle but not the JS wrapper/mailbox resource. Current presenter keeps `this.videoTexture=texture` strongly reachable for the held frame, clearing it on destroy. No extra clones or GPU completion callbacks needed.

`gpu-lifetime-2026-09-08T15-21-42.131Z` proves this with forced HeapProfiler collection: weak variant fails on first redraw twice; fixed variant passes eight GC/redraw cycles twice, clean workers. Two formerly failing movie startup screens at15:19:45 also pass. This is strong correctness evidence, not a performance benchmark.

## Other experiments

- Decoder readiness hints + stats/timing coalescing:9 protocol units,4 compatibility/fault runtime cases,21 API checks pass. Only about2% mean wholeCPU gain in14:19:55 screen; protocol complexity may not be justified. Not promoted.
- ThinLTO: exact same496decoders/352demuxers/472filters; only~1.8% isolatedCPU gain, bigger Wasm, slower builds. Not promoted.
- Direct Software WebGL upload: identical raw pixels, lower copy cost, no convincing wholeCPU win (~2% variable). Composition with SIMD+scheduler prepared, still needs60fps/functional qualification if pursued.
- Single-pass JS Uint32 copy rejected as slower.
- Exact SIMD YUV→RGB kernel passed all comparisons but was~18%slower; reject. Raw test counter overflowed32bits; source changed to64bitcounter but not rerun.
- Native SIMD alpha-normalization and RGBA variants have no established end-to-end gain; not promoted.

## Fixtures and evidence discipline

- Original synthetic sample `build/hybrid-performance/sample.mp4`,26s1080p30H264/AAC,sha256cf07e7c5fe25d2b1e4ed1bb8a9f32ce59f428bc61eeea2222d858ae066399de7.
- Added26s720p60,1080p60, H264/HEVC10bit, VP9 andASS fixtures under `build/fixtures/playback-performance`.
- Licensed Big Buck Bunny source downloaded from Blender's known public ZIP URL (directory listing denied but object public): `bbb-source.mp4`,634.6s1080p30H264, MP3+AC3 audio. Attribution and source hashes inbbb-manifest.json andbbb-key-manifest.json. Clips remux video unchanged, convert audio toAACstereo. Preserve attribution when sharing any excerpt.
- `bbb-240.mp4` has legitimate negative video preroll (-3.1s) from stream-copy cutting; use it for regression, not fair startup comparisons.
- `movie-fixtures.py` creates keyframe-aligned26s clips bbb-key-060/240/480, source starts52.133333/236.9/477.3. All below32MiB.
- Full video-copy/AACstereo remux is complete; see the current-work section and bbb-stream-manifest.json.
- Snapshot server now persists exact served override bytes under ignored content-addressed `build/playback-performance/assets/`, with source/snapshotFile/hash/hits metadata. Nested decoder worker overrides MUST use actual HTTP mounts; DevTools routing did not reach them.
- Never edit a running script or its input assets. Never build/encode/profile concurrently with measuredCPU windows. Older route/edited-harness failures are explicitly excluded.
- Link manifests currently glob unused SIMD test sources, causing stale unused-source hashes after test edits. Fresh final builds should record only actual used source/header inputs; runtime bytes and within-run hashes remain authoritative for existing comparisons.

## Remaining work

1. Finish current long Software run; preserve its failed trial. Run range-origin regression, strict legacy functional test, API and full format matrix with SIMD-qpel / active5ms candidate. Check external host load before more CPU comparisons.
2. Validate extended remote/same-page benchmark harness, then longer balanced Hybrid screens and Software comparisons with realistic clips,60fps, filters/subtitles.
3. Decide whether WebGPU actually earns its complexity. Validate factory fallback/device-loss/rapid seeks if keeping it. Strong-reference fix must remain.
4. Validate strict retained decoder's legacy mode1 behavior; integrate only proven useful changes into maintained native/build/generators/TS, preserving three public modes.
5. Full115-format matrix (known baseline112decode/106seek/115cleanup), API/audio/range/resource/lifecycle checks; representative sustained headless runs. No foreground/endurance equivalence claims.
6. Finish by22:29:14UTC with source/build provenance, protected artifact hashes, exact Git status, clear kept/rejected evidence report. Leave everything uncommitted.

## Follow-up (18:02 UTC)

Current only active session **64546** is RGBX Software longcomparison,
logrgbx-bbb-long-screen.log, remoteBBB start236.9,30spre/10swarm/90smeasure,
fourABBAtrials, samebrowser/page. Finalbaselineprewarming ormeasuring. Do notrun
otherCPUwork ormodifytests/playback-performance.mjs orservedinputs untilitexits.

RGBXstartupbugresolvedinexperimentalhelper: initialmpvtime-poscanbeundefined,
whichmadeVideoFrameconstructorrejectNaNtimestamp. Canvasuploadnowusesneutral0
(defaultarg),since mpvownsdrawtiming. Fixedsingletrial17:48:35.123PASS. Corrected
8-armshortmovie17:49:22.858 ALLPASS,3.43435%CPUless, exactseekpixels. Notpromoted.
Fiveunitcasesnowwritten(defaulttimestamp added), firstfourpassedbeforefix; rerun
allfiveafterlongrun. Controlled24RGBXpixelcasespassedbeforetimestampfix.

NewisolatedHybridpacketcopyexperiment: experiments/.../packet/{prepare.py,README.md},
configsbuild/.../packet-direct. RemoveonlypacketUint8Array.slice beforechunk
constructor; keepconfiguration/extradata copies. WebCodecsprimaryspecsection8.2.2
confirmsAllowSharedBufferSource inputand synchronousownedcopy(no transferlist).
https://w3c.github.io/webcodecs/#encodedvideochunk-interface
NEW tests/encoded-chunk-ownership.mjs syntaxcheckedONLY: actualdedicatedworker
chunkconstruction,mainoverwritesSABafterack,workerchunkcopyToverifiesoriginalbytes,
plainSABandgrowableWasmMemory cases,24cases1byte..8MiB,unalignedoffsets,negativePTS.
Includesbalancedwarmedconstructor microbenchmark. RunaftercurrentCPUcomparison.
Noactualweb/retained-decoder-worker.jschangesyet.

CurrentSoftwaremaintainedworkerremainsImageData+5ms; activeWasmhasallfiveSIMD
nativeCfiles withdeblock. NoRGBX/canvas-shortcut/direct-packetpromotionyet.
Newtests/playback-performance.mjsfailureStatecaptureworkedandprovedtimestampbug.
RawfailedRGBXreadinessscreenanddebugtrialremainpreserved.
