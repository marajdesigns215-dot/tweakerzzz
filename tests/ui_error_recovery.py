"""Production renderer QA with explicit failure fixtures; no host settings change."""
import json, os
from pathlib import Path
from playwright.sync_api import sync_playwright, expect
URL=os.environ.get('TWEAKER_URL','http://127.0.0.1:4173')
ids=[t['id'] for t in json.loads(Path('scripts/windows/tweaks.json').read_text())]
hardware={'cpu':{'name':'Intel Core i7-13700K','cores':16,'threads':24},'gpu':{'name':'Intel Arc A770','vramGB':16},'memory':{'totalGB':64,'speedMHz':5600},'os':{'name':'Windows 11','build':'26200'},'storage':{'totalGB':2000,'freeGB':1000},'peripherals':[],'scannedAt':'2026-10-08T00:00:00Z'}
fixture='''(() => {
 window.calls=[];window.modeFailure=false;window.snapshotFailure=false;window.records=[];
 window.modes=[{width:2560,height:1440,refreshRate:75}];
 window.tweaker={listBackups:async()=>[],getTweakStatus:async()=>({checkedAt:new Date().toISOString(),tweaks:IDS.map(id=>({id,status:'not-configured',message:'Fixture'}))}),
 getDisplayModes:async()=>{if(window.modeFailure)throw Error('Fixture display provider unavailable');return window.modes;},setDisplayMode:async mode=>{window.calls.push(mode);return {message:'Fixture test'};},confirmDisplayMode:async()=>{},
 scan:async()=>new Promise((resolve,reject)=>{window.rejectScan=reject;}),
 captureStatus:async()=>({active:false,historyWarnings:['Could not load damaged.json. The original JSON and CSV were preserved.']}),listCaptures:async()=>window.records,obsStatus:async()=>({connected:false}),
 changePreferences:async()=>{throw Error('Fixture snapshot access denied');},scanDrivers:async()=>{throw Error('Fixture driver provider unavailable');},scanPeripherals:async()=>{throw Error('Fixture peripheral provider unavailable');}};
})();'''.replace('IDS',json.dumps(ids))
with sync_playwright() as p:
 browser=p.chromium.launch(executable_path='/usr/bin/chromium',headless=True,args=['--no-sandbox'])
 page=browser.new_page(viewport={'width':1440,'height':1000});errors=[];console=[]
 page.on('pageerror',lambda e:errors.append(str(e)));page.on('console',lambda msg:console.append(msg.text) if msg.type=='error' else None)
 page.add_init_script(fixture);page.goto(URL,wait_until='networkidle')
 def nav(name):page.locator('.nav-item').filter(has_text=name).click()
 nav('Display studio');expect(page.get_by_label('Display resolution',exact=True)).to_have_value('2560x1440');expect(page.get_by_label('Display refresh rate',exact=True)).to_have_value('75')
 page.get_by_role('button',name='Test resolution',exact=False).click();page.get_by_role('button',name='Keep this display mode').click()
 assert page.evaluate('window.calls')==[{'width':2560,'height':1440,'refreshRate':75}]
 page.evaluate('window.modeFailure=true');page.get_by_role('button',name='Refresh display modes').click();expect(page.get_by_role('alert')).to_contain_text('Fixture display provider unavailable');expect(page.get_by_role('button',name='Test resolution',exact=False)).to_be_disabled();expect(page.get_by_label('Display refresh rate',exact=True).locator('option')).to_have_count(1)
 page.evaluate('window.modeFailure=false;window.modes=[]');page.get_by_role('button',name='Refresh display modes').click();expect(page.get_by_role('alert')).to_contain_text('did not report any supported display modes')
 page.evaluate('window.modes=[{width:3440,height:1440,refreshRate:100}]');page.get_by_role('button',name='Refresh display modes').click();expect(page.get_by_label('Display resolution',exact=True)).to_have_value('3440x1440');expect(page.locator('.resolution-diagram')).to_contain_text('43:18')
 nav('PC scanner');page.get_by_role('button',name='Run hardware scan').click();page.wait_for_function('typeof window.rejectScan==="function"')
 page.locator('input[type=file]').set_input_files({'name':'hardware.json','mimeType':'application/json','buffer':json.dumps({'source':'native','system':hardware}).encode()});expect(page.locator('.scan-banner')).to_contain_text('Imported report')
 page.evaluate("window.rejectScan(Error('Obsolete request failed'))")
 expect(page.get_by_role('status')).to_contain_text('Imported report loaded');expect(page.get_by_role('alert')).to_have_count(0)
 nav('FPS recorder');expect(page.locator('.diagnostic-panel')).to_contain_text('original JSON and CSV were preserved');expect(page.get_by_role('heading',name='Start a recording')).to_be_visible()
 nav('Drivers & devices');page.get_by_role('button',name='Scan drivers & devices').click();expect(page.get_by_role('alert')).to_contain_text('Fixture driver provider unavailable')
 nav('Peripherals');page.get_by_role('button',name='Scan devices').click();expect(page.get_by_role('alert')).to_contain_text('Fixture peripheral provider unavailable')
 nav('Restore center');page.get_by_role('button',name='Save settings snapshot').click();expect(page.get_by_role('alert')).to_contain_text('Fixture snapshot access denied');expect(page.get_by_role('button',name='Save settings snapshot')).to_be_enabled()
 for width in [900,390,1440]:
  page.set_viewport_size({'width':width,'height':1000})
  for tab in ['Overview','Optimizations','PC scanner','FPS recorder','Display studio','Drivers & devices','Peripherals','Streaming lab','Restore center']:
   nav(tab);assert page.evaluate('document.documentElement.scrollWidth<=innerWidth'),(width,tab)
 assert not errors,errors
 assert not console,console
 page.screenshot(path='/tmp/tweakerzzz-validation/error-recovery.png',full_page=True)
 browser.close()
 print('PASS: production UI modes/refresh/errors, stale scan failure, history warning, native failure recovery, all tabs at 390/900/1440; no uncaught or console errors.')
