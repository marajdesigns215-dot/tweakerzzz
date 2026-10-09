"""UI integration with explicit native fixtures; live NVIDIA writes are not simulated as hardware evidence."""
import os
from playwright.sync_api import sync_playwright, expect
fixture = r'''(() => {
 window.calls=[];
 let config={displayId:'\\\\.\\DISPLAY1',desktop:50,sdrConfirmed:false,profiles:[]};
 let color={active:false,activeProgram:'Desktop',supported:true,recoveryPending:false,error:'',displays:[{id:config.displayId,label:'NVIDIA test monitor',vibrance:50}]};
 const status=()=>({...color,config:JSON.parse(JSON.stringify(config))});
 window.tweaker={getTweakStatus:async()=>({checkedAt:new Date().toISOString(),tweaks:[]}),listBackups:async()=>[],getDisplayModes:async()=>[],
 colorStatus:async()=>status(),saveColorProfiles:async c=>{config=c;window.calls.push(['save-colors',c]);return status()},
 startColorProfiles:async()=>{color.active=true;window.calls.push('start-colors');return status()},
 stopColorProfiles:async()=>{color.active=false;window.calls.push('stop-colors');return status()},listPrograms:async()=>['cs2.exe','FortniteClient-Win64-Shipping.exe'],
 scanDrivers:async()=>({scannedAt:new Date().toISOString(),warnings:[],hardware:{cpu:{name:'Intel Core i7-13700K',cores:16,threads:24},gpu:{name:'NVIDIA RTX 4060',driverVersion:'test-version',vramGB:8},memory:{totalGB:64,speedMHz:5600},os:{name:'Windows 11',build:'26200'},storage:{totalGB:2000,freeGB:1000},peripherals:[],scannedAt:new Date().toISOString()},board:{manufacturer:'MSI',product:'MS-7C95',version:'1.0'},computer:{manufacturer:'Custom',model:'Test PC'},bios:{version:'test-bios'},disks:[],devices:[{name:'Realtek Audio',category:'MEDIA',provider:'Realtek',version:'1.2.3'}],recommendations:[{id:'board',category:'Motherboard',title:'Motherboard / system drivers',device:'MSI MS-7C95',source:'msi',sourceName:'MSI support',reason:'Check the exact board support page.',note:'Verify revision and Windows version.',confidence:'Model reported; verify revision'},{id:'mouse',category:'Peripherals',title:'Device software & support',device:'Logitech G203',source:'logitech',sourceName:'Logitech G HUB',reason:'Optional device software.',note:'Check compatible models.',confidence:'Reported name / product family'},{id:'camera',category:'Peripherals',title:'Identify this peripheral',device:'1080p webcam',source:null,sourceName:'',reason:'Generic UVC camera.',note:'Check label.',confidence:'Needs identification'}]}),openDriverSource:async id=>window.calls.push(['source',id])};
})();'''
with sync_playwright() as p:
 b=p.chromium.launch(executable_path='/usr/bin/chromium',headless=True,args=['--no-sandbox'])
 page=b.new_page(viewport={'width':1440,'height':1100});errors=[];page.on('pageerror',lambda e:errors.append(str(e)));page.add_init_script(fixture);page.goto(os.environ.get('TWEAKER_URL','http://127.0.0.1:5173'),wait_until='networkidle')
 page.get_by_role('button',name='Display studio',exact=True).click();expect(page.get_by_role('heading',name='Automatic program vibrance')).to_be_visible()
 page.get_by_role('button',name='Find running programs',exact=True).click();page.get_by_label('Running color program').select_option('cs2.exe');page.get_by_role('button',name='Add program',exact=True).click()
 page.get_by_label('Vibrance for cs2.exe').fill('72');page.get_by_label('Desktop digital vibrance').fill('51')
 expect(page.get_by_role('button',name='Save & start observer')).to_be_disabled();page.get_by_label('I’m using SDR',exact=False).check()
 page.get_by_role('button',name='Save profiles',exact=True).click();expect(page.get_by_role('status')).to_contain_text('No display colors were changed')
 assert 'start-colors' not in page.evaluate('window.calls')
 page.get_by_role('button',name='Save & start observer').click();expect(page.get_by_role('button',name='Stop & restore original')).to_be_visible();expect(page.get_by_label('Vibrance for cs2.exe')).to_be_disabled()
 page.screenshot(path='/tmp/tweakerzzz-validation/program-colors.png',full_page=True)
 page.get_by_role('button',name='Stop & restore original').click();expect(page.get_by_role('status')).to_contain_text('Original driver vibrance restored')
 page.get_by_role('button',name='Drivers & devices',exact=True).click();page.get_by_role('button',name='Scan drivers & devices').click();expect(page.locator('.driver-card')).to_have_count(3)
 page.get_by_role('tab',name='Advanced records',exact=True).click();expect(page.locator('.driver-inventory')).to_contain_text('1.2.3')
 page.get_by_role('tab',name='Hardware',exact=True).click()
 page.get_by_role('button',name='Logitech G HUB').click();assert ['source','logitech'] in page.evaluate('window.calls')
 page.get_by_label('Device category',exact=True).select_option('Peripherals');expect(page.locator('.driver-card')).to_have_count(2);expect(page.locator('.driver-card').filter(has_text='1080p webcam').get_by_role('button')).to_have_count(0)
 page.screenshot(path='/tmp/tweakerzzz-validation/drivers-devices.png',full_page=True)
 for width in [390,900,1366]:
  page.set_viewport_size({'width':width,'height':1000})
  for name in ['Display studio','Drivers & devices']:
   page.get_by_role('button',name=name,exact=True).click();assert page.evaluate('document.documentElement.scrollWidth <= innerWidth'),(width,name)
 assert not errors,errors
 print('PASS: program profile save/start/stop/locking, official driver links/filtering, unknown devices, and responsive layout. Native responses are fixtures.')
 b.close()
