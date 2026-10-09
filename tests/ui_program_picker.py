"""Search/scroll/select regression for the FPS process picker; mocked Windows inventory."""
import os
from pathlib import Path
from playwright.sync_api import sync_playwright, expect

fixture = '''(() => {
  const settings = {checkedAt: new Date().toISOString(), tweaks: []};
  const failed = {version:1,id:'a'.repeat(32),processName:'marvelrivals-win64-shipping.exe',phase:'before',context:'Gaming',seconds:30,scenario:'Before test',startedAt:new Date().toISOString(),status:'failed',collector:'PresentMon fixture',settings,summary:null,error:'No frames captured'};
  window.startCalls = [];
  window.tweaker = {
    getTweakStatus:async()=>settings,listBackups:async()=>[],getDisplayModes:async()=>[],
    captureStatus:async()=>({active:false}),listCaptures:async()=>[failed],
    listPrograms:async()=>[...Array.from({length:150},(_,i)=>`Background-${String(i).padStart(3,'0')}.exe`),'MarvelLauncher.exe','Marvel-Win64-Shipping.exe','cs2.exe','Unlisted Game.exe'],
    startCapture:async options=>{window.startCalls.push(options);throw new Error('Stopped after target selection by test fixture');}
  };
})();'''

with sync_playwright() as p:
    browser = p.chromium.launch(executable_path='/usr/bin/chromium', headless=True, args=['--no-sandbox'])
    page = browser.new_page(viewport={'width':1440,'height':1050})
    errors = []
    page.on('pageerror', lambda error: errors.append(str(error)))
    page.add_init_script(fixture)
    page.goto(os.environ.get('TWEAKER_URL','http://127.0.0.1:5173'), wait_until='networkidle')
    page.get_by_role('button', name='FPS recorder', exact=True).click()
    expect(page.get_by_role('button', name='Use for After run')).to_have_count(0)
    page.get_by_role('button', name='Retry recording', exact=True).click()
    expect(page.get_by_role('combobox', name='PHASE', exact=True)).to_have_value('before')
    page.get_by_label('Game profile', exact=True).select_option('rivals')
    expect(page.get_by_label('GAME OR PROGRAM EXECUTABLE', exact=True)).to_have_value('marvel-win64-shipping.exe')
    page.get_by_role('button', name='Find running programs', exact=True).click()
    picker = page.get_by_role('region', name='Choose a running program')
    expect(picker.get_by_role('button', name='Recognized games (2)', exact=True)).to_have_attribute('aria-pressed','true')
    expect(picker.locator('.running-program-option')).to_have_count(2)
    expect(page.locator('datalist#running-programs')).to_have_count(0)
    search = picker.get_by_role('searchbox', name='SEARCH RUNNING PROGRAMS')
    search.fill('rivals') # Friendly title works even though the executable omits Rivals.
    expect(picker.locator('.running-program-option')).to_have_count(1)
    picker.get_by_role('button', name='Select Marvel-Win64-Shipping.exe', exact=True).click()
    expect(page.get_by_label('GAME OR PROGRAM EXECUTABLE', exact=True)).to_have_value('Marvel-Win64-Shipping.exe')
    search.fill('not-running')
    expect(picker).to_contain_text('No recognized games match')
    search.fill('')
    picker.get_by_role('button', name='All programs (154)', exact=True).click()
    results = picker.get_by_role('list', name='Running program results')
    assert results.evaluate('(el)=>el.scrollHeight > el.clientHeight')
    results.hover()
    page.mouse.wheel(0, 600)
    page.wait_for_timeout(200)
    assert results.evaluate('(el)=>el.scrollTop > 0'), 'Mouse wheel must scroll the bounded results'
    search.fill('Unlisted')
    picker.get_by_role('button', name='Select Unlisted Game.exe', exact=True).click()
    expect(page.get_by_label('GAME OR PROGRAM EXECUTABLE', exact=True)).to_have_value('Unlisted Game.exe')
    expect(page.get_by_label('Game profile', exact=True)).to_have_value('generic')
    search.fill('Marvel-Win64')
    button = picker.get_by_role('button', name='Select Marvel-Win64-Shipping.exe', exact=True)
    button.focus()
    page.keyboard.press('Enter')
    page.get_by_role('button', name='Start background recording', exact=True).click()
    assert page.evaluate('window.startCalls[0].processName') == 'Marvel-Win64-Shipping.exe'
    assert page.evaluate('window.startCalls[0].phase') == 'before'
    search.fill('')
    artifacts = Path('/tmp/tweakerzzz-validation'); artifacts.mkdir(exist_ok=True)
    picker.screenshot(path=str(artifacts/'running-program-picker.png'))
    for width in [390,900,1366]:
        page.set_viewport_size({'width':width,'height':1000})
        assert page.evaluate('document.documentElement.scrollWidth <= innerWidth'), width
    assert not errors, errors
    print('PASS: searchable/scrollable 154-process picker, recognized-game filter, mouse/keyboard selection, unknown game, failed-run retry, selected capture target and responsive layout (Windows fixtures).')
    browser.close()
