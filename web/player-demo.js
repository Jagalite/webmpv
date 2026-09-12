import {Player} from './generated/index.js';
import {displayAspect, outputDimensions} from './player-geometry.js';

const $ = id => document.getElementById(id);
let player, source = null, busy = false, cancelable = false, generation = 0, dragging = 0;
let fonts = [], subtitles = [], events = [];
let acceptedSelection = [];
let lastOpenFailure = null;
let layoutFrame = 0, geometrySurface, outputSize = '', restoreVolume = 100, subtitlesVisible = true, toastTimer;
function queueLayout() {
  if (!layoutFrame) layoutFrame = requestAnimationFrame(updateLayout);
}
function updateLayout() {
  layoutFrame = 0;
  const surface = player.surface;
  if (geometrySurface !== surface) {
    geometrySurface?.removeEventListener('resize', queueLayout);
    geometrySurface = surface;
    geometrySurface?.addEventListener('resize', queueLayout);
    outputSize = '';
  }
  const track = (player.properties.get('track-list') || []).find(track => track.type === 'video' && track.selected);
  // Hybrid feeds mpv a 2x2 timing placeholder; real geometry belongs to the demuxed video track.
  const ratio = !source ? undefined : surface instanceof HTMLVideoElement
    ? (surface.videoWidth && surface.videoHeight ? surface.videoWidth / surface.videoHeight : undefined)
    : displayAspect(player.mode === 'hybrid' ? undefined : player.properties.get('video-out-params') || player.properties.get('video-params'), track);
  const stage = $('stage');
  if (ratio) {
    stage.dataset.aspect = String(ratio);
    // Reserve room for navigation, source information and controls on short screens.
    const available = Math.max(120, (window.visualViewport?.height || innerHeight)
      - document.querySelector('.masthead').offsetHeight - $('player-frame').querySelector('.source-row').offsetHeight
      - document.querySelector('.transport').offsetHeight - 44);
    stage.style.setProperty('--stage-height', `${Math.min(stage.clientWidth / ratio, available)}px`);
    const dimensions = outputDimensions(ratio);
    const key = `${dimensions.width}x${dimensions.height}`;
    // Reopening filters/engines creates a worker before its canvas is ready.
    // controls() schedules another layout after the whole action settles.
    if (surface && !busy && !player.diagnostics.switching && outputSize !== key) {
      player.resize(dimensions.width, dimensions.height);
      outputSize = key;
    }
  } else {
    delete stage.dataset.aspect;
    stage.style.removeProperty('--stage-height');
  }
}
function feedback(message) {
  $('player-toast').textContent = message;
  $('player-toast').hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {$('player-toast').hidden = true;}, 1600);
}
window.playerErrors = [];
const modeHelp = {
  native: 'Browser playback, with packet remuxing when needed.',
  hybrid: 'Browser video decoding with mpv audio and subtitles.',
  software: 'FFmpeg decoding and filters. Up to 4K input; output up to 1080p.',
};
const formatTime = value => {
  const seconds = Math.max(0, Math.floor(Number(value) || 0));
  return seconds >= 3600 ? `${Math.floor(seconds / 3600)}:${String(Math.floor(seconds / 60) % 60).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}` : `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
};
const size = bytes => bytes >= 1024 ** 3 ? `${(bytes / 1024 ** 3).toFixed(2)} GiB` : `${(bytes / 1024 ** 2).toFixed(1)} MiB`;
function status(message, error = false) {
  $('status').textContent = message;
  $('status').parentElement.dataset.error = String(error);
}
function showError(message, name = '', title = 'Playback error') {
  $('playback-error-title').textContent = title;
  $('playback-error-source').textContent = name;
  $('playback-error-message').textContent = message;
  $('playback-error').hidden = false;
}
function clearError() {$('playback-error').hidden = true;}
function record(type, detail) {
  // Bound both the number and size of retained backend messages.
  events.push({at: new Date().toISOString(), type, detail: String(typeof detail === 'string' ? detail : JSON.stringify(detail)).slice(0, 2000)});
  if (events.length > 80) events.shift();
}
function engineExplanation() {
  const list = $('engine-attempts');
  list.replaceChildren();
  if (busy || player.diagnostics.switching) {
    $('engine-reason').textContent = 'Updating playback…';
    return;
  }
  if (!source && !lastOpenFailure) {
    $('engine-reason').textContent = 'Open media to see the selection reason.';
    return;
  }
  if (!source && lastOpenFailure) {
    $('engine-reason').textContent = 'The media could not be opened. No playback session started.';
    renderAttempts(lastOpenFailure.attempts);
    return;
  }
  const name = player.mode[0].toUpperCase() + player.mode.slice(1);
  if (!player.automaticSelection) {
    $('engine-reason').textContent = `${name} is pinned by your manual selection. Automatic fallback is off.`;
    return;
  }
  const selected = acceptedSelection.find(attempt => attempt.mode === player.mode && attempt.outcome === 'selected');
  $('engine-reason').textContent = selected ? `${name} selected automatically: playback checks passed for this media and your settings.` : `${name} is active. No completed automatic selection reason is available.`;
  // Keep the successful session's reasons if a replacement source fails to open.
  // Probe messages describe inspection, not a playback engine choice.
  renderAttempts(acceptedSelection);
}
function renderAttempts(attempts) {
  for (const attempt of attempts.filter(attempt => attempt.mode !== 'probe' && attempt.outcome !== 'selected')) {
    const item = document.createElement('li');
    const label = document.createElement('strong');
    label.textContent = `${attempt.mode[0].toUpperCase() + attempt.mode.slice(1)} ${attempt.outcome === 'failed' ? 'could not play' : 'skipped'}: `;
    item.append(label, document.createTextNode(attempt.reason));
    $('engine-attempts').append(item);
  }
}
function playbackState() {
  const paused = !source || player.properties.get('pause') !== false;
  $('play').hidden = !paused;
  $('pause').hidden = paused;
  const list = player.properties.get('track-list') || [];
  $('audio-visual').hidden = !source || busy || (player.surface instanceof HTMLVideoElement ? player.surface.videoWidth > 0 : !list.some(track => track.type === 'audio') || list.some(track => track.type === 'video'));
  $('mute').setAttribute('aria-pressed', String(Number($('volume').value) === 0));
  $('mute').setAttribute('aria-label', Number($('volume').value) === 0 ? 'Unmute' : 'Mute');
  queueLayout();
}
function timelineProgress() {
  const progress = Math.min(100, Math.max(0, Number($('timeline').value) / Number($('timeline').max) * 100));
  $('timeline').style.setProperty('--progress', `${progress}%`);
}
function controls() {
  const automatic = player.automaticSelection;
  $('automatic').checked = automatic;
  $('mode').value = player.mode;
  $('mode').disabled = busy || automatic;
  $('mode-help').textContent = automatic ? 'Automatically finds a compatible engine. Enable a feature to let the player choose.' : modeHelp[player.mode];
  $('engine-badge').textContent = source ? `${automatic ? 'AUTO · ' : ''}${player.mode.toUpperCase()}` : lastOpenFailure && !busy ? 'OPEN FAILED' : automatic ? 'AUTO' : player.mode.toUpperCase();
  for (const id of ['file', 'choose', 'demo', 'automatic', 'volume', 'speed', 'url', 'format', 'bandwidth', 'live', 'mute']) $(id).disabled = busy;
  $('remote').querySelector('button').disabled = busy;
  for (const id of ['play', 'pause', 'audio', 'subs']) $(id).disabled = busy || !source;
  $('close').disabled = busy ? !cancelable : !source && !fonts.length && !lastOpenFailure;
  $('text-track').disabled = busy || !source || !player.capabilities.externalSubtitles;
  $('font').disabled = busy || !player.capabilities.customFonts;
  for (const id of ['audio-output', 'audio-fallback']) $(id).disabled = busy || !!source;
  for (const id of ['vf', 'af', 'apply-filters', 'clear-filters']) $(id).disabled = busy || !player.capabilities.videoFilters;
  $('tone-map').disabled = busy || (!automatic && player.mode !== 'software');
  $('tone-map').checked = player.diagnostics.toneMapping === 'hdr-to-sdr';
  const duration = Number(player.properties.get('duration'));
  $('timeline').disabled = busy || !source || !Number.isFinite(duration) || duration <= 0 || source.live;
  $('empty').hidden = !!source || busy;
  $('stage').setAttribute('aria-busy', String(busy));
  $('loading').hidden = !busy;
  playbackState();
  timelineProgress();
  engineExplanation();
}
function tracks() {
  const list = player.properties.get('track-list') || [];
  for (const [type, id] of [['audio', 'audio'], ['sub', 'subs']]) {
    const selected = $(id).value;
    $(id).replaceChildren(new Option('Auto', 'auto'));
    if (type === 'sub') $(id).add(new Option('Off', 'no'));
    for (const track of list) if (track.type === type) $(id).add(new Option(track.title || track.lang || `${type} ${track.id}`, String(track.id), false, !!track.selected));
    if (selected === 'no') $(id).value = 'no';
  }
}
function attachments() {
  $('attachments').replaceChildren(...[...subtitles.map(file => `Subtitles · ${file.name}`), ...fonts.map(file => `Font · ${file.name}`)].map(name => {
    const item = document.createElement('li'); item.textContent = name; return item;
  }));
}
function create(options = {}) {
  const instance = new Player($('surface'), {width: 1920, height: 1080, ...options});
  player = window.player = instance;
  acceptedSelection = [];
  instance.addEventListener('selectionchange', event => {
    if (player !== instance) return;
    if (event.detail.outcome === 'selected' && event.detail.mode !== 'probe') {
      acceptedSelection = instance.diagnostics.selection.attempts;
    }
    engineExplanation();
  });
  for (const type of ['error', 'modechange', 'log']) instance.addEventListener(type, event => {
    if (player !== instance) return;
    record(type, event.detail);
    if (type === 'error') {
      window.playerErrors.push(String(event.detail).slice(0, 2000));
      if (window.playerErrors.length > 80) window.playerErrors.shift();
      status(String(event.detail), true);
      showError(String(event.detail), source?.name);
    }
    if (type === 'modechange') {
      if (event.detail.phase === 'loading') status(`Opening with ${event.detail.mode}…`);
      if (event.detail.phase === 'failed') status(event.detail.message || 'Engine could not open this media.', true);
      if (event.detail.phase === 'ready' && !busy && source) status(`Now using ${instance.mode}.`);
      controls();
    }
  });
  instance.addEventListener('mpv', event => {
    if (player !== instance) return;
    const property = event.detail;
    if (property.event !== 'property-change') return;
    if (property.name === 'video-params' || property.name === 'video-out-params') queueLayout();
    if (property.name === 'track-list') {tracks(); playbackState();}
    if (property.name === 'duration') {
      const duration = Number(property.data);
      $('timeline').max = Number.isFinite(duration) && duration > 0 ? duration : 1;
      $('duration').textContent = Number.isFinite(duration) ? formatTime(duration) : 'LIVE';
      controls();
    }
    if (property.name === 'time-pos') {
      if (document.activeElement !== $('timeline')) $('timeline').value = Number(property.data) || 0;
      $('time').textContent = formatTime(property.data);
      timelineProgress();
    }
    if (property.name === 'pause') {
      playbackState();
    }
  });
  controls();
}
async function run(action, success, canCancel = false, sourceName = '') {
  if (busy) return;
  const token = generation;
  if (canCancel) {lastOpenFailure = null; clearError();}
  else if (!lastOpenFailure) clearError();
  busy = true; cancelable = canCancel; controls();
  try {
    await action(() => token === generation);
    if (token === generation && success) status(success);
  } catch (error) {
    if (token === generation) {
      record('action-error', error.message); status(error.message, true);
      if (canCancel) lastOpenFailure = {name: sourceName, message: error.message, attempts: player.diagnostics.selection?.attempts || []};
      showError(error.message, sourceName, canCancel ? 'Could not open media' : 'Playback error');
    }
  } finally {
    if (token === generation) {busy = false; cancelable = false; controls(); tracks(); refreshDiagnostics();}
  }
}
async function opened(metadata, current) {
  if (!current()) return;
  const instance = player;
  source = metadata; subtitles = []; attachments();
  $('audio').value = $('subs').value = 'auto';
  $('filename').textContent = source.name;
  $('file-meta').textContent = source.description;
  controls();
  try {await instance.play(); if (current()) status(`Playing ${source.name}`);}
  catch (error) {if (current()) {status(`Media loaded. Press Play to start. ${error.message}`, true); showError(error.message, source.name, 'Media loaded, but playback could not start');}}
}
function openFile(file) {
  if (!file) return;
  if (/\.(srt|ass|ssa|vtt|ttf|otf)$/i.test(file.name)) {
    status('Use the subtitle or font button to add this file to your media.', true); return;
  }
  return run(async current => {
    status(`Opening ${file.name}…`);
    try {await player.open(file);}
    catch (error) {
      // Diagnose only after the engine rejects the file. All-zero raw audio can
      // be valid, so a zero prefix must never be an unconditional format gate.
      if (current()) {
        let prefix;
        try {prefix = new Uint8Array(await file.slice(0, 65536).arrayBuffer());} catch {}
        if (prefix?.length && prefix.every(byte => byte === 0)) {
          throw Error(`This file starts with ${prefix.length.toLocaleString()} zero bytes, and the player could not recognize a playable format. It may be an incomplete download or a damaged file. Verify or finish the download, then reopen it.`);
        }
        if (file.size === 0) throw Error('This file is empty (0 bytes). Choose a completed media file.');
      }
      throw error;
    }
    await opened({name: file.name, size: file.size, type: file.type, description: `${size(file.size)} · Local file · Stays on this device`}, current);
  }, undefined, true, file.name);
}
create();
$('choose').onclick = () => $('file').click();
$('file').onchange = event => {const file = event.target.files[0]; event.target.value = ''; void openFile(file);};
$('demo').onclick = () => run(async current => {
  status('Loading example…');
  const response = await fetch(new URL('../fixtures/example.mp4', import.meta.url));
  if (!response.ok) throw Error('Example file is unavailable. Choose a file from your device.');
  const file = new File([await response.blob()], 'example.mp4', {type: 'video/mp4'});
  if (!current()) return;
  await player.open(file);
  await opened({name: file.name, size: file.size, description: `${size(file.size)} · Included example`}, current);
}, undefined, true, 'example.mp4');
$('remote').onsubmit = event => {
  event.preventDefault();
  const url = new URL($('url').value);
  if (!['http:', 'https:'].includes(url.protocol)) {status('Use an HTTP or HTTPS media URL.', true); return;}
  const format = $('format').value;
  const streaming = format !== 'file' ? {live: $('live').checked, ...($('bandwidth').value ? {maxBandwidth: Number($('bandwidth').value) * 1000} : {})} : undefined;
  void run(async current => {
    status('Opening remote media…');
    await player.openRemote({url: url.href, format, streaming});
    await opened({name: url.pathname.split('/').pop() || url.hostname, description: `${url.hostname} · ${format.toUpperCase()}${streaming?.live ? ' · Live' : ''}`, live: !!streaming?.live}, current);
  }, undefined, true, url.pathname.split('/').pop() || url.hostname);
};
$('url').onchange = () => {
  try {const pathname = new URL($('url').value).pathname; if (/\.m3u8$/i.test(pathname)) $('format').value = 'hls'; else if (/\.mpd$/i.test(pathname)) $('format').value = 'dash';} catch {}
};
$('automatic').onchange = event => {const enabled = event.target.checked; void run(() => player.setAutomaticSelection(enabled), enabled ? 'Automatic engine selection enabled.' : 'Engine selection is now manual.');};
$('mode').onchange = event => {const mode = event.target.value; void run(() => player.setMode(mode), `Using ${mode}.`);};
$('tone-map').onchange = event => {const enabled = event.target.checked; void run(() => player.setToneMapping(enabled ? 'hdr-to-sdr' : 'off'), enabled ? 'HDR-to-SDR tone mapping enabled.' : 'Tone mapping off.');};
for (const id of ['audio-output', 'audio-fallback']) $(id).onchange = () => run(async () => {
  const options = {mode: player.mode, automaticSelection: player.automaticSelection, audioOutput: $('audio-output').value, audioFallback: $('audio-fallback').value, toneMapping: player.diagnostics.toneMapping, videoFilters: player.diagnostics.videoFilters, audioFilters: player.diagnostics.audioFilters};
  await player.destroy(); create(options);
  await player.volume(Number($('volume').value)); await player.rate(Number($('speed').value));
  for (const file of fonts) await player.addFont(file);
}, 'Audio output configured for the next file.');
$('play').onclick = () => run(() => player.play(), 'Playing.');
$('pause').onclick = () => run(() => player.pause(), 'Paused.');
$('volume').oninput = () => {$('volume-value').textContent = `${$('volume').value}%`;};
$('volume').onchange = event => {const value = Number(event.target.value); void run(() => player.volume(value));};
$('speed').onchange = event => {const value = Number(event.target.value); void run(() => player.rate(value));};
$('timeline').oninput = () => {$('time').textContent = formatTime($('timeline').value); timelineProgress();};
$('timeline').onchange = event => {const value = Number(event.target.value); void run(() => player.seek(value), `Seeked to ${formatTime(value)}.`);};
$('audio').onchange = event => {const id = event.target.value; void run(() => player.selectTrack('audio', id));};
$('subs').onchange = event => {const id = event.target.value; void run(() => player.selectTrack('sub', id));};
$('text-track').onchange = event => {
  const file = event.target.files[0]; event.target.value = '';
  if (file) void run(async () => {await player.addSubtitle(file, {label: file.name}); subtitles.push(file); attachments();}, `Added subtitles: ${file.name}`);
};
$('font').onchange = event => {
  const file = event.target.files[0]; event.target.value = '';
  if (file) void run(async () => {await player.addFont(file); fonts.push(file); attachments();}, `Added font: ${file.name}`);
};
$('filters').onsubmit = event => {
  event.preventDefault(); const vf = $('vf').value, af = $('af').value;
  void run(async () => {try {await player.setVideoFilters(vf); await player.setAudioFilters(af);} finally {$('vf').value = player.diagnostics.videoFilters; $('af').value = player.diagnostics.audioFilters;}}, 'Filters applied.');
};
$('clear-filters').onclick = () => run(async () => {
  try {await player.setVideoFilters(''); await player.setAudioFilters('');}
  finally {$('vf').value = player.diagnostics.videoFilters; $('af').value = player.diagnostics.audioFilters;}
}, 'Filters cleared.');
const settingsDialog = $('settings-dialog');
$('settings-toggle').onclick = () => settingsDialog.showModal();
$('settings-close').onclick = () => settingsDialog.close();
settingsDialog.addEventListener('click', event => {
  const bounds = settingsDialog.getBoundingClientRect();
  if (event.target === settingsDialog && (event.clientX < bounds.left || event.clientX > bounds.right || event.clientY < bounds.top || event.clientY > bounds.bottom)) settingsDialog.close();
});
function fullscreenElement() {return document.fullscreenElement || document.webkitFullscreenElement;}
function fullscreenChanged() {
  const active = fullscreenElement() === $('player-frame') || !!player.surface?.webkitDisplayingFullscreen;
  $('fullscreen').setAttribute('aria-label', active ? 'Exit fullscreen' : 'Enter fullscreen');
  $('fullscreen').title = active ? 'Exit fullscreen (F)' : 'Fullscreen (F)';
  $('fullscreen').setAttribute('aria-pressed', String(active));
  queueLayout();
}
async function toggleFullscreen() {
  $('fullscreen-error').hidden = true;
  try {
    if (fullscreenElement()) {
      await (document.exitFullscreen ? document.exitFullscreen() : document.webkitExitFullscreen());
    } else if (player.surface?.webkitDisplayingFullscreen) {
      player.surface.webkitExitFullscreen();
    } else {
      const frame = $('player-frame');
      // Call inside the click/key gesture. A queued player action loses activation.
      if (frame.requestFullscreen) await frame.requestFullscreen();
      else if (frame.webkitRequestFullscreen) await frame.webkitRequestFullscreen();
      else if (player.surface instanceof HTMLVideoElement && player.surface.webkitSupportsFullscreen) {
        player.surface.addEventListener('webkitendfullscreen', fullscreenChanged, {once: true});
        player.surface.webkitEnterFullscreen();
      } else throw Error('This browser does not provide fullscreen for this player.');
    }
    fullscreenChanged();
  } catch (error) {
    record('fullscreen-error', error.message);
    $('fullscreen-error').hidden = false;
    feedback('Fullscreen is unavailable here');
  }
}
$('fullscreen').onclick = toggleFullscreen;
$('stage').ondblclick = event => {
  if (source && !event.target.closest('button, input, a')) void toggleFullscreen();
};
document.addEventListener('fullscreenchange', fullscreenChanged);
document.addEventListener('webkitfullscreenchange', fullscreenChanged);
$('fullscreen-dismiss').onclick = () => {$('fullscreen-error').hidden = true;};
$('standalone-player').href = location.href;
function setVolume(value) {
  if (busy) return;
  const volume = Math.max(0, Math.min(100, value));
  void run(async () => {
    await player.volume(volume);
    $('volume').value = String(volume); $('volume-value').textContent = `${volume}%`;
    feedback(volume ? `Volume ${volume}%` : 'Muted');
  });
}
function toggleMute() {
  const volume = Number($('volume').value);
  if (volume > 0) restoreVolume = volume;
  setVolume(volume ? 0 : restoreVolume);
}
$('mute').onclick = toggleMute;
function seekShortcut(target) {
  if ($('timeline').disabled) return;
  const duration = Number(player.properties.get('duration'));
  const video = (player.properties.get('track-list') || []).find(track => track.type === 'video' && track.selected);
  const fps = Number(video?.['demux-fps']) || 25;
  // Seek to the last frame, not beyond EOF where mpv cannot present the target.
  const last = Math.max(0, duration - 1 / Math.max(1, fps));
  const position = Math.min(last, Math.max(0, target));
  void run(() => player.seek(position), `Seeked to ${formatTime(position)}.`);
  feedback(formatTime(position));
}
function shortcutHelp() {
  if (!settingsDialog.open) settingsDialog.showModal();
  $('shortcuts').open = true;
  $('shortcuts').scrollIntoView({block: 'nearest'});
}
$('shortcut-help').onclick = shortcutHelp;
document.addEventListener('keydown', event => {
  if (event.defaultPrevented || event.isComposing || event.ctrlKey || event.metaKey || event.altKey) return;
  const target = event.target;
  if (target instanceof Element && (target.closest('input, select, textarea, [role="textbox"]') || target.isContentEditable)) return;
  if (settingsDialog.open) return;
  const key = event.key.toLowerCase();
  // Let focused controls retain their normal activation keys.
  if (key === ' ' && target instanceof Element && target.closest('button, a, summary')) return;
  const known = [' ', 'k', 'j', 'l', 'arrowleft', 'arrowright', 'arrowup', 'arrowdown', 'm', 'f', 'c', '[', ']', 'home', 'end', '?'];
  if (!known.includes(key) && !/^[0-9]$/.test(key)) return;
  event.preventDefault();
  if (key === 'f') {if (!event.repeat) void toggleFullscreen(); return;}
  if (key === '?') {if (!event.repeat) shortcutHelp(); return;}
  if (!source || busy) return;
  if ([' ', 'k', 'm', 'c'].includes(key) && event.repeat) return;
  const position = Number(player.properties.get('time-pos')) || 0;
  if (key === ' ' || key === 'k') {const paused = player.properties.get('pause') !== false; void run(() => paused ? player.play() : player.pause(), paused ? 'Playing.' : 'Paused.');}
  else if (key === 'arrowleft' || key === 'j') seekShortcut(position - (key === 'j' ? 10 : 5));
  else if (key === 'arrowright' || key === 'l') seekShortcut(position + (key === 'l' ? 10 : 5));
  else if (key === 'home' || key === 'end' || /^[0-9]$/.test(key)) seekShortcut(Number(player.properties.get('duration')) * (key === 'home' ? 0 : key === 'end' ? 1 : Number(key) / 10));
  else if (key === 'arrowup' || key === 'arrowdown') setVolume(Number($('volume').value) + (key === 'arrowup' ? 5 : -5));
  else if (key === 'm') toggleMute();
  else if (key === 'c') void run(async () => {await player.subtitleVisible(!subtitlesVisible); subtitlesVisible = !subtitlesVisible; feedback(subtitlesVisible ? 'Subtitles on' : 'Subtitles off');});
  else if (key === '[' || key === ']') {
    const speed = Math.max(.5, Math.min(2, Number($('speed').value) + (key === ']' ? .25 : -.25)));
    void run(async () => {await player.rate(speed); $('speed').value = String(speed); feedback(`${speed}× speed`);});
  }
});
const layoutObserver = new ResizeObserver(queueLayout);
layoutObserver.observe($('player-frame'));
window.addEventListener('resize', queueLayout);
window.visualViewport?.addEventListener('resize', queueLayout);
$('close').onclick = async () => {
  generation++; busy = true; cancelable = false; controls(); status('Closing…');
  try {
    await player.destroy(); source = null; restoreVolume = 100; subtitlesVisible = true; fonts = []; subtitles = []; lastOpenFailure = null; clearError();
    for (const id of ['vf', 'af', 'file', 'text-track', 'font']) $(id).value = '';
    $('volume').value = '100'; $('volume-value').textContent = '100%'; $('speed').value = '1';
    $('audio').value = $('subs').value = 'auto';
    $('timeline').value = '0'; $('timeline').max = '1'; $('time').textContent = $('duration').textContent = '0:00';
    $('filename').textContent = 'No media loaded'; $('file-meta').textContent = 'Your next watch starts here';
    $('audio-output').value = 'stereo'; $('audio-fallback').value = 'stereo';
    create(); attachments(); tracks(); status('Closed.');
  } catch (error) {status(error.message, true);}
  finally {busy = false; controls(); refreshDiagnostics();}
};
// Prevent a dropped file from navigating away, including drops outside the stage.
window.addEventListener('dragover', event => {if (event.dataTransfer.types.includes('Files')) event.preventDefault();});
window.addEventListener('drop', event => {if (event.dataTransfer.types.includes('Files')) event.preventDefault(); dragging = 0; $('stage').classList.remove('dragging');});
$('stage').addEventListener('dragenter', event => {if (event.dataTransfer.types.includes('Files')) {event.preventDefault(); dragging++; $('stage').classList.add('dragging');}});
$('stage').addEventListener('dragleave', () => {if (--dragging <= 0) {dragging = 0; $('stage').classList.remove('dragging');}});
$('stage').addEventListener('drop', event => {
  event.preventDefault();
  if (busy) {status('Opening media. Close it to cancel before dropping another file.', true); return;}
  if (event.dataTransfer.files.length !== 1) {status('Drop one media file at a time.', true); return;}
  void openFile(event.dataTransfer.files[0]);
});
function snapshot() {
  return {created: new Date().toISOString(), browser: navigator.userAgent, isolated: crossOriginIsolated, source, lastOpenFailure, player: player.diagnostics, audio: player.audioDiagnostics(), properties: Object.fromEntries(player.properties), attachments: {subtitles: subtitles.map(f => f.name), fonts: fonts.map(f => f.name)}, events};
}
$('dismiss-error').onclick = clearError;
function refreshDiagnostics() {if ($('diagnostics-panel').open) $('diagnostics').textContent = JSON.stringify(snapshot(), null, 2);}
$('diagnostics-panel').addEventListener('toggle', refreshDiagnostics);
$('export').onclick = () => {
  const url = URL.createObjectURL(new Blob([JSON.stringify(snapshot(), null, 2)], {type: 'application/json'}));
  const link = document.createElement('a'); link.href = url; link.download = `webmpv-diagnostics-${Date.now()}.json`; link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  status('Diagnostics downloaded. Includes media names and session details.');
};
const timer = setInterval(refreshDiagnostics, 1000);
window.addEventListener('pagehide', () => {generation++; clearInterval(timer); clearTimeout(toastTimer); cancelAnimationFrame(layoutFrame); layoutObserver.disconnect(); geometrySurface?.removeEventListener('resize', queueLayout); window.removeEventListener('resize', queueLayout); window.visualViewport?.removeEventListener('resize', queueLayout); void player.destroy();}, {once: true});
if (!crossOriginIsolated) status(window.webmpvPages ? 'Enhanced playback requires a regular browser tab. Reload this page to finish setup.' : 'For all engines, open this page through npm run dev at http://127.0.0.1:4179.', true);
