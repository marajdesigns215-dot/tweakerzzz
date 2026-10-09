"""Renderer regression: multiple vendors, every scan entry point, failure and stale responses.
Native responses are fixtures; this does not verify a physical GPU or Windows driver.
"""
import json
from pathlib import Path
import os
from playwright.sync_api import sync_playwright, expect

ids = [t['id'] for t in json.loads(Path('scripts/windows/tweaks.json').read_text())]
def hardware(gpu, cpu='Intel Core i5-12400', ram=64, speed=5200, device='Fixture keyboard'):
    return dict(cpu=dict(name=cpu, cores=6, threads=12), gpu=dict(name=gpu, vramGB=None), memory=dict(totalGB=ram, speedMHz=speed), os=dict(name='Windows 11', build='26200'), storage=dict(totalGB=2000, freeGB=1000), peripherals=[dict(name=device, type='Keyboard', connection='USB')], scannedAt='2026-10-08T00:00:00Z')
amd = hardware('AMD Radeon RX 6950 XT', 'AMD Ryzen 7 5800X3D', 32, 2133, 'EPOMAKER EP-84')
nvidia = hardware('NVIDIA GeForce RTX 4070 SUPER', 'AMD Ryzen 9 9950X', 128, 6000)
intel = hardware('Intel Arc A770', 'Intel Core i9-13900K', 64, 5600)
unknown = hardware('Microsoft Basic Display Adapter', 'Processor not reported', None, None)
fixture = '''(() => {
 window.hw=HW; window.failScan=false; window.hold=false;
 const status=()=>({checkedAt:new Date().toISOString(),tweaks:IDS.map(id=>({id,status:'not-configured',message:'Fixture'}))});
 const scan=async()=>{if(window.failScan)throw Error('Fixture inventory unavailable');const copy=structuredClone(window.hw);if(window.hold)return await new Promise(resolve=>window.releaseScan=()=>resolve(copy));return copy;};
 window.tweaker={scan,getTweakStatus:async()=>status(),listBackups:async()=>[],getDisplayModes:async()=>[],openSettings:async()=>{},captureStatus:async()=>({active:false}),listCaptures:async()=>[],listPrograms:async()=>[],obsStatus:async()=>({connected:false}),
 scanPeripherals:async()=>({peripherals:window.hw.peripherals,scannedAt:window.hw.scannedAt,warnings:[]}),
 scanDrivers:async()=>{const hardware=await scan();return {hardware,components:[{id:'graphics',category:'Graphics',name:hardware.gpu.name,values:{},source:null,sourceName:'',note:'Fixture inventory',deviceIds:[]}],componentsComplete:true,scannedAt:new Date().toISOString(),warnings:[],board:{manufacturer:'',product:''},computer:{manufacturer:'',model:''},bios:{},disks:[],devices:[],recommendations:[]}}};
})();'''.replace('HW', json.dumps(amd)).replace('IDS', json.dumps(ids))

with sync_playwright() as p:
    browser = p.chromium.launch(executable_path='/usr/bin/chromium', headless=True, args=['--no-sandbox'])
    page = browser.new_page(viewport={'width':1440, 'height':1100})
    errors=[]; page.on('pageerror', lambda e: errors.append(str(e)))
    page.add_init_script(fixture); page.goto(os.environ.get('TWEAKER_URL','http://127.0.0.1:5173'), wait_until='networkidle')
    def nav(name): page.locator('.nav-item').filter(has_text=name).click()
    def set_hw(scan): page.evaluate('(hw)=>window.hw=hw', scan)
    def scan_pc(scan):
        set_hw(scan); nav('PC scanner'); page.get_by_role('button',name='Run hardware scan').click()
        expect(page.locator('.scanner-cards')).to_contain_text(scan['gpu']['name'].replace('NVIDIA GeForce ', ''))
    def no_reference():
        text=page.locator('main').inner_text()
        assert '5900X' not in text and 'RTX 4060' not in text and '3,200' not in text, text
    for tab in ['Overview','PC scanner','Optimizations','Streaming lab','Display studio']:
        nav(tab); no_reference()
    nav('Streaming lab'); expect(page.locator('.obs-panel')).to_contain_text('Choose an available encoder')
    scan_pc(amd); expect(page.locator('.insight').nth(0)).to_contain_text('AMD HW H.264'); expect(page.locator('.insight').nth(1)).to_contain_text('2,133 MHz'); no_reference()
    nav('Overview'); page.locator('.profile-card').filter(has_text='Streaming').click(); expect(page.locator('.next-move')).to_contain_text('AMD HW'); no_reference()
    nav('Streaming lab'); page.locator('.segmented').get_by_role('button',name='Recording',exact=True).click()
    expect(page.locator('.obs-panel')).to_contain_text('AMD HW H.264'); assert 'P6' not in page.locator('.obs-panel').inner_text()
    with page.expect_download() as d: page.get_by_role('button',name='Export settings guide').click()
    exported=Path(d.value.path()).read_text(); assert 'AMD Radeon RX 6950 XT' in exported and 'NVENC' not in exported
    nav('Display studio'); expect(page.locator('.resolution-panel')).to_contain_text('AMD Software'); no_reference()
    nav('Optimizations'); page.get_by_role('textbox',name='Search optimizations').fill('NVENC'); expect(page.locator('.tweak-card')).to_have_count(0)
    page.get_by_role('textbox',name='Search optimizations').fill('memory configuration'); page.locator('.tweak-copy').click(); expect(page.get_by_role('dialog')).to_contain_text('2,133 MHz'); page.keyboard.press('Escape')
    nav('Peripherals'); page.locator('.device-card').filter(has_text='EPOMAKER').click(); expect(page.get_by_role('heading',name='Epomaker EP-84',exact=True)).to_be_visible()
    # A scan initiated inside FPS recorder updates the shared hardware and clears the old peripheral selection.
    set_hw(nvidia); nav('FPS recorder'); page.get_by_label('Game profile',exact=True).select_option('fortnite'); page.get_by_role('button',name='Scan for recommendations').click()
    expect(page.locator('.game-advisor')).to_contain_text(nvidia['gpu']['name'])
    nav('PC scanner'); expect(page.locator('.scanner-cards')).to_contain_text('128 GB'); expect(page.locator('.insight').nth(1)).to_contain_text('6,000 MHz')
    nav('Streaming lab'); expect(page.locator('.obs-panel')).to_contain_text('NVIDIA NVENC AV1')
    nav('Peripherals'); expect(page.locator('.device-list')).to_contain_text('Fixture keyboard'); expect(page.get_by_role('heading',name='Epomaker EP-84',exact=True)).to_have_count(0)
    # Drivers scan is another producer of the same shared report.
    set_hw(intel); nav('Drivers & devices'); page.get_by_role('button',name='Scan drivers & devices').click(); expect(page.locator('.component-cards')).to_contain_text('Intel Arc A770')
    nav('Streaming lab'); expect(page.locator('.obs-panel')).to_contain_text('Intel Quick Sync AV1'); assert 'NVIDIA' not in page.locator('.obs-panel').inner_text()
    nav('Display studio'); expect(page.locator('.resolution-panel')).to_contain_text('Intel')
    scan_pc(unknown); expect(page.locator('.insight').nth(1)).to_contain_text('configured speed was not reported')
    nav('Streaming lab'); expect(page.locator('.obs-panel')).to_contain_text('Choose an available encoder')
    # A failed rescan cannot leave old GPU guidance visible.
    scan_pc(nvidia); page.evaluate('window.failScan=true'); page.get_by_role('button',name='Run hardware scan').click(); expect(page.get_by_role('alert')).to_contain_text('Fixture inventory unavailable')
    nav('Streaming lab'); expect(page.locator('.obs-panel')).to_contain_text('Choose an available encoder'); expect(page.locator('.stream-hero')).not_to_contain_text('4070')
    # Import wins over an earlier in-flight native request.
    page.evaluate('window.failScan=false;window.hold=true'); set_hw(nvidia); nav('PC scanner'); page.get_by_role('button',name='Run hardware scan').click()
    page.wait_for_function('typeof window.releaseScan === "function"')
    page.locator('input[type=file]').set_input_files({'name':'hardware.json','mimeType':'application/json','buffer':json.dumps({'source':'native','system':intel}).encode()})
    expect(page.locator('.scan-banner')).to_contain_text('Imported report'); page.evaluate('window.releaseScan();window.hold=false')
    expect(page.locator('.scanner-cards')).to_contain_text('Intel Arc A770')
    nav('Streaming lab'); expect(page.locator('.obs-panel')).to_contain_text('Intel Quick Sync AV1'); expect(page.locator('.obs-panel')).to_contain_text('imported hardware report')
    with page.expect_download() as d: page.get_by_role('button',name='Export settings guide').click()
    assert 'Hardware source: imported' in Path(d.value.path()).read_text()
    assert not errors, errors
    page.screenshot(path='/tmp/tweakerzzz-validation/hardware-guidance.png',full_page=True)
    browser.close()
    print('PASS: hardware guidance across tabs for AMD, NVIDIA, Intel and unknown hardware; scan sources, stale responses, failures, peripherals and exports.')
