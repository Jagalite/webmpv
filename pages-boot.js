const startup = document.getElementById('pages-startup');
const main = document.querySelector('main');
const reloadKey = `webmpv-isolation:${new URL('.', import.meta.url).pathname}`;
async function start() {
  window.webmpvPages = true;
  if (crossOriginIsolated) {
    try {sessionStorage.removeItem(reloadKey);} catch {}
    startup.remove(); main.inert = false;
    await import('./web/player-demo.js');
    // Check for worker updates without disrupting an active playback session.
    navigator.serviceWorker?.getRegistration().then(registration => registration?.update()).catch(() => {});
    return;
  }
  if (!isSecureContext || !navigator.serviceWorker) throw Error('This browser cannot enable the playback engines here.');
  let previous = 0;
  try {previous = Number(sessionStorage.getItem(reloadKey)) || 0;} catch {}
  if (Date.now() - previous < 30000 && navigator.serviceWorker.controller) throw Error('This browser or embedded preview is blocking enhanced playback.');
  await navigator.serviceWorker.register(new URL('./pages-isolation-sw.js', import.meta.url), {updateViaCache: 'none'});
  await navigator.serviceWorker.ready;
  if (!navigator.serviceWorker.controller) await new Promise(resolve => navigator.serviceWorker.addEventListener('controllerchange', resolve, {once: true}));
  try {sessionStorage.setItem(reloadKey, String(Date.now()));} catch {}
  // The next navigation receives the isolation headers before any engine loads.
  location.reload();
}
const timeout = new Promise((_, reject) => setTimeout(() => reject(Error('Playback setup timed out. Try reloading in a regular browser tab.')), 15000));
Promise.race([start(), timeout]).catch(error => {
  startup.querySelector('strong').textContent = 'Playback setup needs a browser tab';
  startup.querySelector('p').textContent = error.message;
  startup.querySelector('a').hidden = false;
  startup.querySelector('a').href = location.href;
});
