'use strict';
const { EventEmitter } = require('node:events');
function deferred() { let resolve, reject; const promise = new Promise((a, b) => { resolve = a; reject = b; }); return { promise, resolve, reject }; }
function updateInfo(version = '0.7.0') { return { version, files: [{ url: `Tweakerzzz-Setup-${version}-x64.exe`, sha512: Buffer.alloc(64).toString('base64') }], releaseNotes: '<p>Optional update.</p>', releaseDate: '2026-10-08T12:00:00Z' }; }
class FakeUpdater extends EventEmitter {
  constructor() { super(); this.checks = 0; this.downloads = 0; this.installs = 0; this.available = true; this.info = updateInfo(); }
  setFeedURL(feed) { this.feed = feed; }
  async checkForUpdates() {
    this.checks++;
    if (this.checkError) { this.emit('error', this.checkError); throw this.checkError; }
    if (this.checkWait) await this.checkWait.promise;
    const token = { cancelled: false, cancel: () => { token.cancelled = true; this.downloadWait?.reject(Error('Cancelled')); } };
    return { isUpdateAvailable: this.available, updateInfo: this.info, cancellationToken: token };
  }
  async downloadUpdate(token) {
    this.downloads++; this.token = token;
    if (this.downloadError) { this.emit('error', this.downloadError); throw this.downloadError; }
    if (this.downloadWait) await this.downloadWait.promise;
    return ['a-verified-installer.exe'];
  }
  quitAndInstall(...args) { this.installs++; this.installArgs = args; if (this.installError) this.emit('error', this.installError); }
}
module.exports = { FakeUpdater, deferred, updateInfo };
