'use strict';

function nativeError(detail, operation = 'Windows operation') {
  const clean = String(detail || '').replace(/_x000D__x000A_/g, '\n').replace(/<[^>]*>/g, '').trim().slice(0, 2000);
  if (/PSSecurityException|running scripts is disabled|not digitally signed|execution polic|AuthorizationManager/i.test(clean)) {
    return new Error(`${operation}: Windows blocked a downloaded PowerShell script. If you trust the ZIP downloaded from your Tweakerzzz GitHub repository, close the app, right-click that ZIP > Properties > Unblock > Apply, then extract it into a new folder. Organization-managed policies may require an approved signed build. No execution policy was changed.\nDetails: ${clean}`);
  }
  return new Error(`${operation}: ${clean || 'Windows returned no diagnostic details.'}`);
}

module.exports = { nativeError };
