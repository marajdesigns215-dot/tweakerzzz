"""Updater renderer lifecycle with a native-bridge fixture; never downloads or installs."""
import os
from pathlib import Path
from playwright.sync_api import sync_playwright, expect
URL = os.environ.get('TWEAKER_URL', 'http://127.0.0.1:4173')
fixture = '''(() => {
 window.updateCalls=[];
 window.update={supported:true,currentVersion:'0.6.0',phase:'idle',availableVersion:null,releaseNotes:'',checkedAt:null,progress:null,error:''};
 window.tweaker={listBackups:async()=>[],getTweakStatus:async()=>({checkedAt:new Date().toISOString(),tweaks:[]}),getDisplayModes:async()=>[],
 updateStatus:async()=>({...window.update}),
 checkForUpdates:async()=>{window.updateCalls.push('check');window.update={...window.update,phase:'available',availableVersion:'0.7.0',checkedAt:new Date().toISOString(),releaseNotes:'<img src=x onerror=alert(1)> Useful fixes.'};return {...window.update};},
 downloadUpdate:async()=>{window.updateCalls.push('download');window.update.phase='downloading';window.update.progress={percent:40,transferred:4194304,total:10485760};return {...window.update};},
 cancelUpdate:async()=>{window.updateCalls.push('cancel');window.update.phase='idle';return {...window.update};},
 installUpdate:async()=>{window.updateCalls.push('install');window.update.error=window.blockInstall?'Stop the FPS recording before installing.':'';window.update.phase=window.blockInstall?'downloaded':'installing';return {...window.update};},
 openUpdateRelease:async()=>{window.updateCalls.push('releases');}};
})();'''
with sync_playwright() as p:
 browser=p.chromium.launch(executable_path='/usr/bin/chromium',headless=True,args=['--no-sandbox'])
 page=browser.new_page(viewport={'width':1440,'height':1000}); errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
 page.add_init_script(fixture);page.goto(URL,wait_until='networkidle');page.locator('.nav-item').filter(has_text='Updates').click()
 expect(page.get_by_role('button',name='Check for updates',exact=True)).to_be_visible()
 assert page.evaluate('window.updateCalls')==[]
 page.get_by_role('button',name='Check for updates',exact=True).click()
 expect(page.get_by_role('button',name='Download v0.7.0')).to_be_visible()
 assert page.locator('.update-notes img').count()==0
 assert page.evaluate('window.updateCalls')==['check']
 page.get_by_role('button',name='Download v0.7.0').click()
 expect(page.get_by_label('Update download')).to_have_attribute('value','40')
 page.get_by_role('button',name='Cancel download').click()
 expect(page.get_by_role('button',name='Check for updates',exact=True)).to_be_visible()
 page.get_by_role('button',name='Check for updates',exact=True).click();page.get_by_role('button',name='Download v0.7.0').click()
 page.evaluate("window.update.phase='error';window.update.error='Checksum mismatch';")
 expect(page.get_by_role('alert')).to_contain_text('Checksum mismatch')
 assert page.get_by_role('button',name='Install & restart',exact=True).count()==0
 page.evaluate("window.update.phase='downloaded';window.update.error='';")
 page.get_by_role('button',name='Review installation').click()
 expect(page.get_by_role('button',name='Install & restart',exact=True)).to_be_visible()
 page.get_by_role('button',name='Later',exact=True).click()
 assert 'install' not in page.evaluate('window.updateCalls')
 page.locator('.nav-item').filter(has_text='Overview').click();page.locator('.nav-item').filter(has_text='Updates').click()
 page.get_by_role('button',name='Review installation').click();page.evaluate('window.blockInstall=true')
 page.get_by_role('button',name='Install & restart',exact=True).click()
 expect(page.get_by_role('alert')).to_contain_text('Stop the FPS recording')
 page.get_by_role('button',name='Review installation').click();page.evaluate('window.blockInstall=false')
 page.get_by_role('button',name='Install & restart',exact=True).click()
 expect(page.locator('.update-title h2')).to_contain_text('Installing')
 assert page.evaluate("window.updateCalls.filter(x=>x==='install').length")==2
 assert page.evaluate('document.documentElement.scrollWidth<=innerWidth')
 Path('/tmp/tweakerzzz-validation').mkdir(exist_ok=True)
 page.screenshot(path='/tmp/tweakerzzz-validation/updates.png',full_page=True)
 assert not errors,errors
 preview=browser.new_page(viewport={'width':1000,'height':760});preview.goto(URL,wait_until='networkidle');preview.locator('.nav-item').filter(has_text='Updates').click()
 expect(preview.get_by_text('In-app updates are available',exact=False)).to_be_visible()
 expect(preview.get_by_role('link',name='Open GitHub releases')).to_have_attribute('href','https://github.com/marajdesigns215-dot/tweakerzzz/releases')
 assert preview.get_by_role('button',name='Check for updates',exact=True).count()==0
 for width in [390,900,1440]:
  preview.set_viewport_size({'width':width,'height':850})
  preview.get_by_role('button',name='Updates',exact=True).click()
  expect(preview.get_by_role('link',name='Open GitHub releases')).to_be_visible()
  assert preview.evaluate('document.documentElement.scrollWidth<=innerWidth'),width
 browser.close()
print('PASS: manual check/download, progress, cancellation, checksum error, review/Later, blocked/successful install, text-only notes and browser fallback; no renderer errors.')
