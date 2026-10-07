"""Browser workflow checks. Run after npm run dev with Python Playwright installed.
Optional: TWEAKER_URL=http://127.0.0.1:4173 to test a production preview.
The native fixture verifies renderer integration, not actual Windows behavior.
"""
import json
import os
from pathlib import Path
from playwright.sync_api import sync_playwright, expect

URL = os.environ.get('TWEAKER_URL', 'http://127.0.0.1:5173')
ARTIFACTS = Path(os.environ.get('TWEAKER_ARTIFACTS', '/tmp/tweakerzzz-validation'))
ARTIFACTS.mkdir(parents=True, exist_ok=True)

with sync_playwright() as p:
    browser = p.chromium.launch(executable_path=os.environ.get('CHROMIUM_PATH', '/usr/bin/chromium'), headless=True, args=['--no-sandbox'])
    page = browser.new_page(viewport={'width': 1440, 'height': 1000})
    errors = []
    page.on('pageerror', lambda e: errors.append(str(e)))
    page.goto(URL, wait_until='networkidle')
    expect(page.get_by_role('heading', name='Let’s find your next frame.')).to_be_visible()
    page.screenshot(path=str(ARTIFACTS / 'overview.png'), full_page=True)
    page.get_by_role('button', name='Build my optimization plan').click()
    expect(page.get_by_role('dialog')).to_be_visible()
    expect(page.locator('.review-list > div')).to_have_count(5)
    with page.expect_download() as transfer:
        page.get_by_role('button', name='Export my setup plan').click()
    data = json.loads(Path(transfer.value.path()).read_text())
    assert len(data['changes']) == 5
    assert data['hardwareSource'] == 'user-supplied-reference'
    page.get_by_role('button', name='Keep editing').click()
    page.get_by_role('button', name='Clear', exact=True).click()
    page.locator('.nav-item').filter(has_text='Optimizations').click()
    expect(page.locator('.tweak-card')).to_have_count(87)
    page.get_by_role('button', name='Windows', exact=True).click()
    assert 0 < page.locator('.tweak-card').count() < 87
    page.get_by_role('button', name='All tweaks', exact=True).click()
    page.get_by_role('textbox', name='Search optimizations').fill('Game Mode')
    assert page.locator('.tweak-card').count() >= 1
    page.get_by_role('button', name='Details for Windows Game Mode').click()
    page.get_by_role('button', name='Add to plan').click()
    expect(page.locator('.plan-number')).to_have_text('1')
    page.reload(wait_until='networkidle')
    expect(page.locator('.plan-number')).to_have_text('1')
    page.keyboard.press('Control+k')
    page.get_by_role('textbox', name='Find a tweak').fill('NVENC')
    assert page.locator('.command-results > button').count() > 0
    page.keyboard.press('Escape')
    expect(page.get_by_role('dialog')).to_have_count(0)

    page.locator('.nav-item').filter(has_text='PC scanner').click()
    page.get_by_role('button', name='Run hardware scan').click()
    expect(page.get_by_role('status')).to_contain_text('Windows desktop app')
    page.locator('input[type=file]').set_input_files({'name': 'bad.json', 'mimeType': 'application/json', 'buffer': b'{"cpu":{"name":"a"},"gpu":{"name":"b"},"memory":{"totalGB":32},"os":{"name":"Windows"},"storage":{"totalGB":1},"peripherals":[null]}'})
    expect(page.get_by_role('status')).to_contain_text('Import failed')
    expect(page.get_by_role('heading', name='PC scanner', exact=True)).to_be_visible()
    with page.expect_download() as transfer:
        page.get_by_role('button', name='Export hardware report').click()
    report = json.loads(Path(transfer.value.path()).read_text())
    assert report['source'] == 'reference'
    assert report['system']['gpu']['name'] == 'NVIDIA GeForce RTX 4060'

    page.locator('.nav-item').filter(has_text='Display studio').click()
    page.get_by_role('button', name='Competitive', exact=True).click()
    expect(page.get_by_label('PROFILE NAME')).to_have_value('Competitive')
    page.get_by_role('button', name='Save preview profile').click()
    expect(page.locator('.saved-profiles')).to_contain_text('Competitive')
    page.get_by_label('Display resolution', exact=True).select_option('1440x1080')
    expect(page.locator('.resolution-diagram')).to_contain_text('4:3')
    page.get_by_role('button', name='Test resolution').click()
    expect(page.get_by_role('status')).to_contain_text('requires the Windows app')
    page.screenshot(path=str(ARTIFACTS / 'display.png'), full_page=True)
    page.locator('.nav-item').filter(has_text='Streaming lab').click()
    page.get_by_role('button', name='YouTube', exact=True).click()
    expect(page.locator('.settings-list')).to_contain_text('NVIDIA NVENC AV1')
    page.locator('.priority-options button').filter(has_text='Competitive').click()
    expect(page.locator('.settings-list')).to_contain_text('1280 × 720')
    with page.expect_download() as transfer:
        page.get_by_role('button', name='Export settings guide').click()
    assert 'NVIDIA NVENC AV1' in Path(transfer.value.path()).read_text()
    page.locator('.nav-item').filter(has_text='Peripherals').click()
    page.get_by_role('button', name='Audio', exact=True).click()
    expect(page.get_by_role('heading', name='Audio setup guide')).to_be_visible()
    page.locator('.nav-item').filter(has_text='Restore center').click()
    expect(page.get_by_role('heading', name='Your safety net starts here.')).to_be_visible()
    page.locator('.nav-item').filter(has_text='Overview').click()
    page.set_viewport_size({'width': 390, 'height': 844})
    page.screenshot(path=str(ARTIFACTS / 'mobile.png'), full_page=True)
    assert page.evaluate('document.documentElement.scrollWidth <= innerWidth'), 'Mobile page overflows horizontally'
    page.locator('.nav-item').filter(has_text='Optimizations').click()
    assert page.evaluate('document.documentElement.scrollWidth <= innerWidth'), 'Mobile optimizations overflow'
    for name in ['PC scanner', 'Display studio', 'Peripherals', 'Streaming lab', 'Restore center']:
        page.locator('.nav-item').filter(has_text=name).click()
        assert page.evaluate('document.documentElement.scrollWidth <= innerWidth'), f'Mobile {name} overflows'
    page.locator('.nav-item').filter(has_text='Overview').click()
    assert not errors, errors
    print('PASS: browser planning, filtering, persistence, exports, import rejection, display, OBS, peripherals, restore, and mobile layout')

    # Corrupted preferences must fall back safely.
    page.evaluate("localStorage.setItem('tz-reviewed','{}');localStorage.setItem('tz-colors','{}');localStorage.setItem('tz-color-profiles','{}');localStorage.setItem('tz-profile','{}')")
    page.reload(wait_until='networkidle')
    expect(page.get_by_role('heading', name='Let’s find your next frame.')).to_be_visible()
    assert not errors, errors
    print('PASS: corrupted browser preferences recover without renderer errors')

    # Native operations below are deliberate fixtures; no host settings change.
    context = browser.new_context(viewport={'width': 1440, 'height': 1000})
    automatic_ids = [t['id'] for t in json.loads(Path('scripts/windows/tweaks.json').read_text())]
    context.add_init_script("""(() => {
      let backups = [], enabled = new Set(['game-mode']), previous = new Set(enabled);
      window.__testScan = { failDevices: false, partial: false, enable: id => enabled.add(id) };
      window.tweaker = {
        scan: async () => ({cpu:{name:'AMD Ryzen 9 5900X',cores:12,threads:24},gpu:{name:'NVIDIA GeForce RTX 4060',vramGB:null},memory:{totalGB:32,speedMHz:window.__testScan.partial ? null : 3200},os:{name:'Windows 11 Pro',build:'26200'},storage:window.__testScan.partial ? {totalGB:null,freeGB:null} : {totalGB:2740,freeGB:1550},peripherals:[{name:'Test Mouse',type:'Mouse',connection:'USB'}],scannedAt:new Date().toISOString(),warnings:window.__testScan.partial ? [{component:'storage',message:'Fixture provider unavailable'}] : []}),
        scanPeripherals: async () => { if(window.__testScan.failDevices) throw new Error('Fixture peripheral provider unavailable'); return {peripherals:[{name:'Test Mouse',type:'Mouse',connection:'USB'},{name:'Test Keyboard',type:'Keyboard',connection:'HID'}],scannedAt:new Date().toISOString(),warnings:[]}; },
        getTweakStatus: async () => ({checkedAt:new Date().toISOString(),tweaks:__IDS__.map(id=>({id,status:enabled.has(id)?'enabled':id==='game-dvr'?'not-enabled':'not-configured',message:enabled.has(id)?'Matches saved Windows settings':'Preference is not configured'}))}),
        applyTweaks: async ids => {previous = new Set(enabled);ids.forEach(id=>enabled.add(id));backups=[{id:'a'.repeat(32),createdAt:new Date().toISOString(),count:ids.length}];return {backupId:'a'.repeat(32),applied:ids,message:'Fixture changes applied'}},
        restoreBackup: async () => {enabled = new Set(previous);backups=[];return {message:'Fixture restored'}},
        listBackups: async () => backups,
        openSettings: async () => {},
        getDisplayModes: async () => [{width:1920,height:1080,refreshRate:60},{width:1440,height:1080,refreshRate:144}],
        setDisplayMode: async () => ({message:'Fixture display test started'}),
        confirmDisplayMode: async () => {}
      };
    })()""".replace('__IDS__', json.dumps(automatic_ids)))
    desktop = context.new_page()
    desktop.on('pageerror', lambda e: errors.append(str(e)))
    desktop.goto(URL, wait_until='networkidle')
    expect(desktop.locator('.windows-status-bar')).to_contain_text('1 of 22 automatic tweaks already configured')
    desktop.get_by_role('button', name='Scan my PC').click()
    expect(desktop.locator('.scanner-cards')).to_contain_text('VRAM not reported by driver')
    desktop.locator('.nav-item').filter(has_text='Peripherals').click()
    expect(desktop.locator('.device-list')).to_contain_text('Test Mouse')
    desktop.get_by_role('button', name='Scan devices', exact=True).click()
    expect(desktop.locator('.device-list')).to_contain_text('Test Keyboard')
    expect(desktop.get_by_role('heading', name='Peripherals', exact=True)).to_be_visible()
    desktop.evaluate('window.__testScan.failDevices = true')
    desktop.get_by_role('button', name='Scan devices', exact=True).click()
    expect(desktop.get_by_role('alert')).to_contain_text('Fixture peripheral provider unavailable')
    desktop.evaluate('window.__testScan.partial = true')
    desktop.locator('.nav-item').filter(has_text='PC scanner').click()
    desktop.get_by_role('button', name='Run hardware scan').click()
    expect(desktop.locator('.scanner-cards')).to_contain_text('Storage not reported')
    expect(desktop.locator('.diagnostic-panel')).to_contain_text('Hardware scan completed with warnings')
    desktop.locator('.nav-item').filter(has_text='Optimizations').click()
    expect(desktop.get_by_role('switch', name='Already configured: Windows Game Mode')).to_be_checked()
    expect(desktop.get_by_role('switch', name='Already configured: Windows Game Mode')).to_be_disabled()
    desktop.get_by_label('Filter settings').select_option('Already configured')
    expect(desktop.locator('.tweak-card')).to_have_count(1)
    desktop.get_by_label('Filter settings').select_option('All settings')
    desktop.locator('.nav-item').filter(has_text='Overview').click()
    desktop.get_by_role('button', name='Build my optimization plan').click()
    expect(desktop.locator('.review-list > div')).to_have_count(4)
    desktop.get_by_role('button', name='Back up & apply 4 changes').click()
    expect(desktop.get_by_role('status')).to_contain_text('Fixture changes applied')
    expect(desktop.locator('.windows-status-bar')).to_contain_text('5 of 22 automatic tweaks already configured')
    desktop.locator('.nav-item').filter(has_text='Restore center').click()
    desktop.get_by_role('button', name='Restore', exact=True).click()
    desktop.get_by_role('button', name='Restore settings', exact=True).click()
    expect(desktop.get_by_role('status')).to_contain_text('Fixture restored')
    desktop.locator('.nav-item').filter(has_text='Optimizations').click()
    expect(desktop.locator('.windows-status-bar')).to_contain_text('1 of 22 automatic tweaks already configured')
    desktop.evaluate("window.__testScan.enable('transparency')")
    desktop.get_by_role('button', name='Check Windows settings').click()
    expect(desktop.locator('.windows-status-bar')).to_contain_text('2 of 22 automatic tweaks already configured')
    desktop.get_by_label('Filter settings').select_option('Already configured')
    expect(desktop.locator('.tweak-card')).to_have_count(2)
    desktop.locator('.nav-item').filter(has_text='Display studio').click()
    desktop.get_by_label('Display resolution', exact=True).select_option('1440x1080')
    desktop.get_by_role('button', name='Test resolution').click()
    desktop.get_by_role('button', name='Keep this display mode', exact=True).click()
    expect(desktop.get_by_role('status')).to_contain_text('Display mode confirmed')
    assert not errors, errors
    print('PASS: mocked Windows bridge scan/apply/restore/resolution UI integration (not a native Windows test)')
    browser.close()
