"""Browser integration with mocked Windows responses; run while npm run dev is active."""
from pathlib import Path
import json
from playwright.sync_api import sync_playwright,expect
root=Path(__file__).resolve().parents[1]; ids=[r['id'] for r in json.loads((root/'scripts/windows/tweaks.json').read_text())]
fixture='''(() => {
 const ids=IDS; const states=()=>({checkedAt:new Date().toISOString(),tweaks:ids.map(id=>({id,status:['game-mode','transparency'].includes(id)?'enabled':'not-enabled',message:'Windows test fixture'}))});
 let active={active:false},history=[],backups=[]; window.calls=[];
 window.tweaker={ getTweakStatus:async()=>states(), listBackups:async()=>backups, getDisplayModes:async()=>[],
 listPrograms:async()=>['game.exe'], captureStatus:async()=>active,listCaptures:async()=>history,
 startCapture:async options=>{active={active:true,...options,id:String(history.length+1).padStart(32,'0'),status:'recording',startedAt:new Date(Date.now()+history.length*1000).toISOString(),frames:100,stopping:false,settings:states(),collector:'PresentMon test fixture',version:1};return active;},
 stopCapture:async()=>{const summary={frames:12000,sampledSeconds:120,averageFps:history.length?110:100,onePercentLow:history.length?66:60,p95FrameMs:history.length?12:15,otherStreamFrames:0,invalidFrames:0,processId:10,swapChain:'0x1',streamCount:1}; const record={...active,active:undefined,status:'completed',endedAt:new Date().toISOString(),error:'',summary};history=[record,...history];active={active:false};return record;},
 minimizeToTray:async()=>window.calls.push('tray'),exportCapture:async id=>window.calls.push(['csv',id]),deleteCapture:async id=>{history=history.filter(r=>r.id!==id)},
 changePreferences:async(action,chosen)=>{window.calls.push([action,chosen]);backups.unshift({id:String(backups.length+1).padStart(32,'a'),createdAt:new Date().toISOString(),count:chosen.length,ids:chosen,action});return {message:'Saved with backup',backupId:backups[0].id}},
 openSettings:async target=>window.calls.push(['settings',target]),restoreBackup:async()=>({message:'Restored'})};
})();'''.replace('IDS',json.dumps(ids))
with sync_playwright() as p:
 b=p.chromium.launch(executable_path='/usr/bin/chromium',headless=True,args=['--no-sandbox']); page=b.new_page(viewport={'width':1440,'height':1100});errors=[];page.on('pageerror',lambda e:errors.append(str(e)));page.add_init_script(fixture);page.goto('http://127.0.0.1:5173',wait_until='networkidle')
 page.get_by_role('button',name='FPS recorder',exact=True).click();page.get_by_role('button',name='Find running programs').click();page.get_by_label('GAME OR PROGRAM EXECUTABLE').fill('game.exe');page.get_by_label('SCENE & SETTINGS').fill('1080p benchmark');page.get_by_role('button',name='Start background recording').click();expect(page.get_by_role('heading',name='Recording in progress')).to_be_visible();page.get_by_role('button',name='Minimize to tray').click();page.get_by_role('button',name='Stop & save').click();expect(page.locator('.recording-card')).to_have_count(1);page.get_by_role('button',name='Use for After run').click();expect(page.get_by_role('combobox',name='PHASE',exact=True)).to_have_value('after');page.get_by_role('button',name='Start background recording').click();page.get_by_role('button',name='Stop & save').click();expect(page.locator('.recording-card')).to_have_count(2)
 page.get_by_role('combobox',name='BEFORE RUN',exact=True).select_option('1'.zfill(32));page.get_by_role('combobox',name='AFTER RUN',exact=True).select_option('2'.zfill(32));expect(page.locator('.fps-table')).to_contain_text('+10.0%');page.screenshot(path='/tmp/tweakerzzz-validation/fps-recorder.png',full_page=True)
 page.get_by_role('button',name='Restore center',exact=True).click();page.get_by_role('button',name='Save settings snapshot').click();expect(page.locator('.backup-row')).to_have_count(1);page.get_by_role('button',name='Select configured').click();expect(page.locator('.restore-settings input:checked')).to_have_count(2);page.get_by_role('button',name='Review turning off tweaks').click();expect(page.get_by_role('region',name='Review preference changes')).to_contain_text('Turn Game Mode off.');page.get_by_role('button',name='Back up & turn off',exact=True).click();expect(page.locator('.backup-row')).to_have_count(2);page.get_by_role('button',name='Review Windows defaults').click();expect(page.get_by_role('region',name='Review preference changes')).to_contain_text('Unset values do not necessarily mean the tweak is off.');page.get_by_role('button',name='Back up & use defaults').click();expect(page.locator('.backup-row')).to_have_count(3);page.get_by_role('button',name='Open System Protection').click();page.screenshot(path='/tmp/tweakerzzz-validation/restore-center.png',full_page=True)
 calls=page.evaluate('window.calls');assert 'tray' in calls;assert ['settings','protection'] in calls;assert len(next(x for x in calls if isinstance(x,list) and x[0]=='snapshot')[1])==22
 for width in [390,900,1366]:
  page.set_viewport_size({'width':width,'height':1000})
  for name in ['Restore center','FPS recorder']:
   page.get_by_role('button',name=name,exact=True).click();assert page.evaluate('document.documentElement.scrollWidth <= innerWidth'),(width,name)
 assert not errors,errors
 print('PASS: FPS start/stop/tray/comparison UI; snapshot/disable/default/protection flows; 390/900/1366 layout. Native responses are fixtures.')
 b.close()
