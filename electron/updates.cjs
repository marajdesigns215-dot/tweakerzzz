'use strict';
// The renderer controls timing only. Feed, filenames and installer execution stay native.
const RELEASES_URL = 'https://github.com/marajdesigns215-dot/tweakerzzz/releases';
const FEED = Object.freeze({ provider: 'github', owner: 'marajdesigns215-dot', repo: 'tweakerzzz', private: false });

function releaseDetails(info) {
  if (!info || typeof info.version !== 'string' || !/^\d+\.\d+\.\d+$/.test(info.version)) throw new Error('The release has an unsupported version. Open GitHub releases for details.');
  const name = `Tweakerzzz-Setup-${info.version}-x64.exe`;
  if (!Array.isArray(info.files) || info.files.length !== 1 || info.files[0].url !== name || !/^[A-Za-z0-9+/]{86}==$/.test(info.files[0].sha512 || '')) {
    throw new Error('The release is missing verified Windows x64 installer information. Try again after publication finishes.');
  }
  const raw = Array.isArray(info.releaseNotes) ? info.releaseNotes.map(item => item.note || '').join('\n\n') : info.releaseNotes;
  const notes = typeof raw === 'string' ? raw.slice(0, 24000).replace(/<[^>]*>/g, '').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&').trim() : '';
  return { availableVersion: info.version, releaseNotes: notes, publishedAt: typeof info.releaseDate === 'string' ? info.releaseDate : null };
}

function createUpdateManager({ engine, currentVersion, prepareInstall = async () => {} }) {
  let state = { supported: !!engine, currentVersion, phase: 'idle', availableVersion: null, releaseNotes: '', publishedAt: null, checkedAt: null, progress: null, error: '' };
  let cancellationToken = null;
  let cancelRequested = false;
  const status = () => ({ ...state, progress: state.progress && { ...state.progress } });
  const requireEngine = () => { if (!engine) throw new Error('Install the Windows desktop release to use in-app updates.'); };
  const fail = error => { state = { ...state, phase: 'error', error: String(error?.message || error).slice(0, 1800), progress: null }; };
  if (engine) {
    engine.autoDownload = false;
    engine.autoInstallOnAppQuit = false;
    engine.autoRunAppAfterInstall = true;
    engine.allowPrerelease = true; // Published builds are explicitly labeled tester prereleases.
    engine.allowDowngrade = false;
    engine.disableWebInstaller = true;
    // Use a complete checksummed installer; avoid downloading old blockmaps on slow connections.
    engine.disableDifferentialDownload = true;
    engine.setFeedURL(FEED);
    engine.on('error', error => { if (state.phase === 'installing') fail(error); });
    engine.on('download-progress', progress => {
      if (state.phase !== 'downloading') return;
      const bounded = value => Number.isFinite(value) ? Math.max(0, value) : 0;
      state.progress = { percent: Math.min(100, bounded(progress.percent)), transferred: bounded(progress.transferred), total: bounded(progress.total) };
    });
  }
  return {
    status,
    isInstalling: () => state.phase === 'installing',
    async check() {
      requireEngine();
      if (['checking', 'downloading', 'cancelling', 'downloaded', 'installing'].includes(state.phase)) return status();
      state = { ...state, phase: 'checking', error: '', progress: null, availableVersion: null, releaseNotes: '', publishedAt: null };
      cancellationToken = null;
      try {
        const result = await engine.checkForUpdates();
        if (!result) throw new Error('The update service is unavailable in this build.');
        const checkedAt = new Date().toISOString();
        if (result.isUpdateAvailable) {
          const details = releaseDetails(result.updateInfo);
          cancellationToken = result.cancellationToken;
          if (!cancellationToken) throw new Error('The update service did not prepare a download. Try checking again.');
          state = { ...state, ...details, checkedAt, phase: 'available' };
        } else state = { ...state, checkedAt, phase: 'up-to-date' };
      } catch (error) { fail(error); }
      return status();
    },
    async download() {
      requireEngine();
      if (state.phase !== 'available' || !cancellationToken) throw new Error('Check for an available update before downloading.');
      cancelRequested = false;
      state = { ...state, phase: 'downloading', error: '', progress: { percent: 0, transferred: 0, total: 0 } };
      try {
        const files = await engine.downloadUpdate(cancellationToken);
        if (cancelRequested) state = { ...state, phase: 'idle', progress: null };
        else if (!Array.isArray(files) || !files.length) throw new Error('No verified installer was downloaded. Check for updates again.');
        else state = { ...state, phase: 'downloaded', progress: { ...state.progress, percent: 100 } };
      } catch (error) {
        if (cancelRequested) state = { ...state, phase: 'idle', progress: null, error: '' };
        else fail(error);
      } finally { cancellationToken = null; }
      return status();
    },
    cancel() {
      if (state.phase === 'downloading' && cancellationToken) {
        cancelRequested = true;
        state = { ...state, phase: 'cancelling' };
        cancellationToken.cancel();
      }
      return status();
    },
    async install() {
      requireEngine();
      if (state.phase !== 'downloaded') throw new Error('Download and verify an update before installing.');
      state = { ...state, phase: 'installing', error: '' };
      try {
        // The main process checks active operations before releasing native helpers.
        await prepareInstall();
      } catch (error) {
        state = { ...state, phase: 'downloaded', error: String(error.message || error) };
        return status();
      }
      try { engine.quitAndInstall(false, true); } catch (error) { fail(error); }
      return status();
    },
  };
}
module.exports = { createUpdateManager, releaseDetails, RELEASES_URL, FEED };
