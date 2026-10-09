"""Saved-scan renderer workflow with explicit IPC fixtures; native storage is tested separately."""
import ast
import json
import os
from pathlib import Path
from playwright.sync_api import sync_playwright, expect

tree=ast.parse(Path('tests/ui_driver_history.py').read_text())
fixture=next(ast.literal_eval(n.value) for n in tree.body if isinstance(n,ast.Assign) and any(isinstance(t,ast.Name) and t.id=='fixture' for t in n.targets))
fixture+=r'''(() => {
 const scan=window.tweaker.scanDrivers;
 const original=async()=>{const r=await scan();r.hardware.gpu.name='AMD Radeon RX 6950 XT';return r;};
 const read=()=>JSON.parse(localStorage.getItem('test-native-memory')||'null')||{system:null,drivers:null,peripherals:null,warning:''};
 const save=r=>localStorage.setItem('test-native-memory',JSON.stringify(r));
 window.nativeScans=0;
 window.tweaker.getHardwareMemory=async()=>{const saved=read();if(sessionStorage.getItem('hold-memory'))return new Promise(resolve=>window.releaseMemory=()=>resolve(saved));return saved;};
 window.tweaker.scanDrivers=async()=>{window.nativeScans++;const r=await original();save({system:r.hardware,drivers:r,peripherals:{peripherals:r.hardware.peripherals,scannedAt:r.hardware.scannedAt,warnings:[]},warning:''});return r;};
 window.tweaker.scan=async()=>{window.nativeScans++;const r=(await original()).hardware;r.gpu.name='Intel Arc new scan';save({system:r,drivers:null,peripherals:{peripherals:r.peripherals,scannedAt:r.scannedAt,warnings:[]},warning:''});return r;};
 window.tweaker.getDisplayModes=async()=>[];
 window.tweaker.forgetHardwareMemory=async()=>{localStorage.removeItem('test-native-memory');return {system:null,drivers:null,peripherals:null,warning:''};};
 window.tweaker.captureStatus=async()=>({active:false});window.tweaker.listCaptures=async()=>[];window.tweaker.obsStatus=async()=>({connected:false});
})();'''

with sync_playwright() as p:
 browser=p.chromium.launch(executable_path='/usr/bin/chromium',headless=True,args=['--no-sandbox'])
 page=browser.new_page(viewport={'width':1440,'height':1100});errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
 page.add_init_script(fixture);page.goto(os.environ.get('TWEAKER_URL','http://127.0.0.1:5173'),wait_until='networkidle')
 def nav(name):page.get_by_role('button',name=name,exact=True).click()
 nav('Drivers & devices');page.get_by_role('button',name='Scan drivers & devices',exact=True).click();expect(page.locator('.component-cards')).to_contain_text('AMD Radeon fixture')
 nav('Overview');nav('Drivers & devices');expect(page.locator('.component-cards')).to_contain_text('AMD Radeon fixture');assert page.evaluate('window.nativeScans')==1
 page.reload(wait_until='networkidle');expect(page.locator('.saved-hardware-note')).to_contain_text('Using a saved scan');expect(page.locator('.hardware-grid').first).to_contain_text('AMD Radeon RX 6950 XT');assert page.evaluate('window.nativeScans')==0
 nav('Drivers & devices');expect(page.locator('.component-cards')).to_contain_text('AMD Radeon fixture');expect(page.locator('main')).to_contain_text('Saved driver scan')
 nav('Streaming lab');expect(page.locator('.obs-panel')).to_contain_text('AMD HW H.264')
 nav('FPS recorder');expect(page.locator('.game-advisor')).to_contain_text('guidance uses your saved scan')
 nav('PC scanner');expect(page.locator('.scan-banner')).to_contain_text('Saved native scan')
 imported=json.loads(page.evaluate("localStorage.getItem('test-native-memory')"))['system'];imported['gpu']['name']='NVIDIA GeForce imported PC'
 page.locator('input[type=file]').set_input_files({'name':'other-pc.json','mimeType':'application/json','buffer':json.dumps(imported).encode()});expect(page.locator('.scan-banner')).to_contain_text('Imported report')
 page.reload(wait_until='networkidle');expect(page.locator('.hardware-grid').first).to_contain_text('AMD Radeon RX 6950 XT');expect(page.locator('main')).not_to_contain_text('imported PC')
 # Hydration must not win a race against a fresh scan.
 page.evaluate("sessionStorage.setItem('hold-memory','1')");page.reload(wait_until='networkidle');page.wait_for_function('!!window.releaseMemory')
 nav('PC scanner');page.get_by_role('button',name='Run hardware scan').click();expect(page.locator('.scanner-cards')).to_contain_text('Intel Arc new scan');page.evaluate('window.releaseMemory()');expect(page.locator('.scanner-cards')).to_contain_text('Intel Arc new scan');expect(page.locator('.saved-hardware-note')).to_have_count(0)
 page.evaluate("sessionStorage.removeItem('hold-memory')");page.reload(wait_until='networkidle');expect(page.locator('.saved-hardware-note')).to_be_visible()
 for width in [390,900,1440]:
  page.set_viewport_size({'width':width,'height':1000});assert page.evaluate('document.documentElement.scrollWidth<=innerWidth'),width
 nav('PC scanner');page.get_by_role('button',name='Forget saved scan',exact=True).click();page.get_by_role('button',name='Forget this PC',exact=True).click();expect(page.locator('.scan-banner')).to_contain_text('SCAN NEEDED');assert page.evaluate("localStorage.getItem('test-native-memory')") is None
 page.reload(wait_until='networkidle');expect(page.locator('.saved-hardware-note')).to_have_count(0);assert page.evaluate('window.nativeScans')==0
 assert not errors,errors
 browser.close();print('PASS: saved scan across reload/tabs, cached advice, import isolation, startup race, forget and responsive layouts; IPC is fixture-backed.')
