// Match original media PTS to submission wall time across worker/main task order.
// Chromium's live-video sink can retain the underlying timestamp when a
// VideoFrame clone overrides only its JavaScript-visible timestamp.
export function createTrackClock(limit=128){
 const submissions=new Map(),presentations=new Map();
 const stats={delayCount:0,delaySum:0,delayMin:Infinity,delayMax:0,delays:[],evictedSubmissions:0,evictedPresentations:0};
 const key=pts=>Math.round(pts);
 function bounded(map,name){while(map.size>limit){map.delete(map.keys().next().value);stats[name]++;}}
 function match(pts){
  if(!submissions.has(pts)||!presentations.has(pts))return;
  const delay=presentations.get(pts)-submissions.get(pts);submissions.delete(pts);presentations.delete(pts);
  stats.delayCount++;stats.delaySum+=delay;stats.delayMin=Math.min(stats.delayMin,delay);stats.delayMax=Math.max(stats.delayMax,delay);stats.delays.push(delay);if(stats.delays.length>120)stats.delays.shift();
 }
 return {stats,
  submit({pts,wall}){if(!Number.isFinite(pts)||!Number.isFinite(wall))throw Error('Invalid submission clock');pts=key(pts);submissions.set(pts,wall);match(pts);bounded(submissions,'evictedSubmissions');},
  present(pts,wall){if(!Number.isFinite(pts)||!Number.isFinite(wall))throw Error('Invalid display clock');pts=key(pts);presentations.set(pts,wall);match(pts);bounded(presentations,'evictedPresentations');},
  reset(){submissions.clear();presentations.clear();Object.assign(stats,{delayCount:0,delaySum:0,delayMin:Infinity,delayMax:0,delays:[],evictedSubmissions:0,evictedPresentations:0});},
  pending(){return {submissions:submissions.size,presentations:presentations.size};}
 };
}
