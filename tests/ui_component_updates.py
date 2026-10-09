"""Renderer fixtures exercise installed/latest comparisons, never real driver installs."""
import ast
import os
from pathlib import Path
from playwright.sync_api import sync_playwright, expect

tree = ast.parse(Path('tests/ui_driver_history.py').read_text())
fixture = next(ast.literal_eval(n.value) for n in tree.body if isinstance(n, ast.Assign) and any(isinstance(t, ast.Name) and t.id == 'fixture' for t in n.targets))
fixture += r'''(() => {
 let latest=null,checking=false,rejectPending,scanReport;window.versionMode='success';
 const original=window.tweaker.scanDrivers;
 window.tweaker.scanDrivers=async()=>{latest=null;const r=await original();const g=r.components.find(c=>c.id==='gpu');g.name='NVIDIA GeForce RTX 4060';g.values={'Installed driver':'32.0.16.1742','NVIDIA version':'617.42'};g.source='nvidia';g.sourceName='NVIDIA';
 r.components.push({id:'board',category:'Motherboard',name:'Example motherboard',values:{Model:'Example'},source:null,sourceName:'',note:'Board details',deviceIds:['chipset']},{id:'audio',category:'Audio',name:'Realtek Audio',values:{'Installed driver':'6.0.1.1'},source:null,sourceName:'',note:'Audio driver',deviceIds:[]},{id:'mouse',category:'Peripherals',name:'Logitech G203',values:{'Installed driver':'10.0.1.1'},source:'logitech',sourceName:'Logitech',note:'Device driver, not firmware',deviceIds:[]},{id:'hidden',category:'Network',name:'Miscellaneous virtual adapter',values:{'Installed driver':'1.2.3'},source:null,sourceName:'',note:'Hidden',deviceIds:[]});r.devices.push({id:'chipset',name:'Example SMBus controller',category:'SYSTEM',version:'1.2.3.4',provider:'Example chipset vendor'});scanReport=r;return r;};
 window.tweaker.getComponentUpdateStatus=async()=>({checking,result:latest});
 window.tweaker.checkComponentUpdates=async branch=>{latest=null;window.calls.push(['versions',branch]);if(window.versionMode==='failure')throw Error('Manufacturer source offline');if(window.versionMode==='cancel'){checking=true;return new Promise((_,reject)=>rejectPending=reject)}
 latest={checkedAt:'2026-10-09T13:00:00Z',scannedAt:scanReport.scannedAt,branch,windowsUpdateError:'',items:scanReport.components.map(c=>({componentId:c.id,installedVersion:c.id==='gpu'?'617.42':c.values['Installed driver']||c.values['BIOS version']||'',installedRaw:c.values['Installed driver']||'',latestVersion:c.id==='gpu'?(branch==='studio'?'619.00':'618.00'):'',status:['Processor','Motherboard'].includes(c.category)?'not-applicable':c.id==='gpu'?'newer':'unverified',source:c.id==='gpu'?'NVIDIA '+branch+' · WHQL':'',date:'2026-10-08',url:c.id==='gpu'?'https://www.nvidia.com/en-us/drivers/details/123/':'',notes:c.id==='gpu'?'Fixes and known issues from the selected release.':'',message:'Exact-model fixture. Unknown versions remain unverified.',packages:c.id==='board'?[{deviceId:'chipset',offerId:'chipset-update',latestVersion:'1.2.4.0',title:'Example platform driver',date:'2026-10-08'}]:[]}))};return latest;};
 window.tweaker.cancelComponentUpdates=async()=>{checking=false;window.calls.push('cancel-versions');rejectPending(Error('Latest-version check cancelled.'))};
 window.tweaker.openComponentRelease=async id=>window.calls.push(['release',id]);
})();'''

with sync_playwright() as p:
    browser=p.chromium.launch(executable_path='/usr/bin/chromium',headless=True,args=['--no-sandbox'])
    page=browser.new_page(viewport={'width':1440,'height':1100});errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
    page.add_init_script(fixture);page.goto(os.environ.get('TWEAKER_URL','http://127.0.0.1:5173'),wait_until='networkidle')
    page.get_by_role('button',name='Drivers & devices',exact=True).click();page.get_by_role('button',name='Scan drivers & devices').click()
    expect(page.locator('.component-card')).to_have_count(6)
    expect(page.locator('.component-cards')).not_to_contain_text('Miscellaneous virtual adapter');expect(page.locator('.component-cards')).not_to_contain_text('Unidentified SSD')
    expect(page.get_by_role('tab',name='Advanced records')).to_have_count(0)
    graphics=page.locator('.component-card').filter(has_text='NVIDIA GeForce RTX 4060')
    expect(graphics.locator('.component-version-pair')).to_contain_text('617.42');expect(graphics.locator('.component-version-pair')).to_contain_text('Not verified')
    expect(page.locator('.component-card').filter(has_text='Intel Core Ultra fixture').locator('.component-platform')).to_contain_text('Reported Windows processor drivers')
    page.get_by_role('button',name='Check latest versions',exact=True).click()
    expect(graphics.locator('.component-version-pair')).to_contain_text('618.00');expect(graphics.locator('.version-status')).to_contain_text('Newer release')
    graphics.get_by_text('Release notes',exact=True).click();expect(graphics.locator('.component-release-notes')).to_contain_text('Fixes and known issues')
    graphics.get_by_role('button',name='View this release & notes').click();assert ['release','gpu'] in page.evaluate('window.calls')
    board=page.locator('.component-card').filter(has_text='Example motherboard')
    board.get_by_text('Installed chipset & platform drivers (1)',exact=True).click()
    expect(board.locator('.component-platform-drivers')).to_contain_text('1.2.3.4');expect(board.locator('.component-platform-drivers')).to_contain_text('1.2.4.0')
    page.screenshot(path='/tmp/tweakerzzz-validation/installed-latest-versions.png',full_page=True)
    page.get_by_label('NVIDIA release branch').select_option('studio');expect(graphics.locator('.component-version-pair')).to_contain_text('Not verified')
    page.get_by_role('button',name='Check latest versions',exact=True).click();expect(graphics.locator('.component-version-pair')).to_contain_text('619.00')
    assert ['versions','studio'] in page.evaluate('window.calls')
    page.evaluate("window.versionMode='failure'");page.get_by_role('button',name='Check latest versions',exact=True).click()
    expect(page.get_by_role('alert')).to_contain_text('source offline');expect(graphics.locator('.component-version-pair')).to_contain_text('Not verified');expect(graphics.locator('.version-status')).to_have_count(0)
    page.evaluate("window.versionMode='cancel'");page.get_by_role('button',name='Check latest versions',exact=True).click()
    expect(page.get_by_role('button',name='Scan drivers & devices')).to_be_disabled();expect(page.get_by_label('NVIDIA release branch')).to_be_disabled()
    page.get_by_role('tab',name='Update offers').click();page.get_by_role('button',name='Cancel driver update check').click()
    expect(page.get_by_role('alert')).to_contain_text('cancelled');assert 'cancel-versions' in page.evaluate('window.calls')
    page.get_by_role('tab',name='Hardware',exact=True).click();page.evaluate("window.versionMode='success'");page.get_by_role('button',name='Check latest versions',exact=True).click()
    for width in [390,900,1366]:
        page.set_viewport_size({'width':width,'height':1000});assert page.evaluate('document.documentElement.scrollWidth <= innerWidth'),width
    page.get_by_role('button',name='Scan drivers & devices').click();expect(graphics.locator('.component-version-pair')).to_contain_text('Not verified')
    page.evaluate("""() => {const original=window.tweaker.scanDrivers; window.tweaker.scanDrivers=async()=>{const r=await original();const g=r.components.find(c=>c.id==='gpu');g.name='AMD Radeon RX 7800 XT';g.values={'Installed driver':'32.0.1.2'};g.source='amd';g.sourceName='AMD';return r;};}""")
    page.get_by_role('button',name='Scan drivers & devices').click()
    amd=page.locator('.component-card').filter(has_text='AMD Radeon RX 7800 XT')
    expect(amd.locator('.component-version-pair')).to_contain_text('32.0.1.2');expect(amd.locator('.component-version-pair')).not_to_contain_text('617.42')
    expect(page.get_by_label('NVIDIA release branch')).to_have_count(0)
    assert not errors,errors
    print('PASS: six hardware categories, installed/latest versions, selected branch, release notes, stale/error/cancel states, rescan reset and responsive layouts. Responses are fixtures.')
    browser.close()
