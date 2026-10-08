'use strict';
const fs = require('node:fs/promises');
const path = require('node:path');

async function listBackups(directory) {
  let files;
  try { files = await fs.readdir(directory, { withFileTypes: true }); }
  catch (error) { if (error.code === 'ENOENT') return []; throw error; }
  const items = [];
  for (const file of files) {
    if (!file.isFile() || !/^[a-f0-9]{32}\.json$/.test(file.name)) continue;
    try {
      const backup = JSON.parse(await fs.readFile(path.join(directory, file.name), 'utf8'));
      if (backup.version !== 1 || backup.id + '.json' !== file.name || !['pending', 'applied', 'rollback-failed'].includes(backup.status) || !Number.isFinite(Date.parse(backup.createdAt)) || !Array.isArray(backup.ids)) continue;
      items.push({ id: backup.id, createdAt: backup.createdAt, count: backup.ids.length, action: backup.action || 'apply', ids: backup.ids });
    } catch (error) {
      throw new Error(`Cannot read backup ${file.name}. Keep this file and repair backup access before applying more tweaks. ${error.message}`);
    }
  }
  return items.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}
module.exports = { listBackups };
