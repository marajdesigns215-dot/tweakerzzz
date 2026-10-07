'use strict';

// This is also enforced in PowerShell. The renderer cannot supply commands,
// registry paths, filenames, or arbitrary URLs to the privileged process.
const TWEAK_IDS = Object.freeze([
  'game-mode', 'game-dvr', 'mouse-acceleration', 'transparency', 'animations',
  'background-apps', 'game-bar-tips', 'startup-delay', 'menu-delay',
  'taskbar-animations', 'peek', 'content-suggestions', 'tailored-experiences',
  'advertising-id', 'tips-notifications', 'lockscreen-suggestions',
  'explorer-sync-notifications', 'search-highlights', 'widgets',
  'edge-background', 'edge-startup-boost', 'power-plan',
]);
const SETTINGS = Object.freeze({
  gaming: 'ms-settings:gaming-gamemode',
  graphics: 'ms-settings:display-advancedgraphics',
  display: 'ms-settings:display',
  startup: 'ms-settings:startupapps',
  apps: 'ms-settings:appsfeatures',
  mouse: 'ms-settings:mousetouchpad',
  keyboard: 'ms-settings:easeofaccess-keyboard',
  camera: 'ms-settings:camera',
  sound: 'ms-settings:sound',
  network: 'ms-settings:network-status',
  power: 'ms-settings:powersleep',
  nvidia: 'nvidia',
});

function validateTweakIds(ids) {
  if (!Array.isArray(ids) || ids.length < 1 || ids.length > TWEAK_IDS.length) {
    throw new Error(`Select between 1 and ${TWEAK_IDS.length} supported Windows tweaks.`);
  }
  if (ids.some(id => typeof id !== 'string' || !TWEAK_IDS.includes(id))) {
    throw new Error('An unsupported optimization was requested.');
  }
  if (new Set(ids).size !== ids.length) throw new Error('Duplicate optimization IDs are not allowed.');
  return [...ids];
}

function validateBackupId(id) {
  if (typeof id !== 'string' || !/^[a-f0-9]{32}$/.test(id)) throw new Error('Invalid backup ID.');
  return id;
}

function validateSettingsTarget(target) {
  if (typeof target !== 'string' || !Object.hasOwn(SETTINGS, target)) throw new Error('Unsupported settings target.');
  return SETTINGS[target];
}

function validateDisplayMode(mode) {
  if (!mode || typeof mode !== 'object' || Array.isArray(mode)) throw new Error('Invalid display mode.');
  const { width, height, refreshRate } = mode;
  if (!Number.isInteger(width) || width < 320 || width > 16384 ||
      !Number.isInteger(height) || height < 200 || height > 16384 ||
      !Number.isInteger(refreshRate) || refreshRate < 23 || refreshRate > 1000) {
    throw new Error('Invalid display resolution or refresh rate.');
  }
  return { width, height, refreshRate };
}

module.exports = { TWEAK_IDS, SETTINGS, validateTweakIds, validateBackupId, validateSettingsTarget, validateDisplayMode };
