"""Hardware/update/history interactions with explicit fixtures, not real Windows evidence."""
import json
import os
from pathlib import Path
from playwright.sync_api import sync_playwright, expect

fixture = r'''(() => {
 const stamp='2026-10-09T12:00:00Z'; window.calls=[]; window.offerMode='success';
 const hardware={scannedAt:stamp,cpu:{name:'Intel Core Ultra fixture',cores:16,threads:24},gpu:{name:'AMD Radeon fixture',driverVersion:'32.0.1',vramGB:16},memory:{totalGB:64,speedMHz:5600},os:{name:'Windows 11',build:'26200'},storage:{totalGB:2000,freeGB:1000},peripherals:[]};
 const devices=Array.from({length:31},(_,i)=>({id:'device'+i,instanceId:'PCI\\VEN_1002&DEV_ABCD\\PRIVATE_SERIAL_'+i,name:'Graphics device '+i,category:'DISPLAY',manufacturer:'AMD',provider:'Advanced Micro Devices',version:'32.0.1',driverDate:'2026-09-01',signed:true,signer:'Publisher',driverReported:true,infName:'oem1.inf',service:'display',status:'OK',present:true,problemCode:0,hardwareIds:['PCI\\VEN_1002&DEV_ABCD'],compatibleIds:[],source:'amd',sourceName:'AMD support'}));
 const components=[{id:'gpu',category:'Graphics',name:'AMD Radeon fixture',values:{'Installed driver':'32.0.1'},source:'amd',sourceName:'AMD support',note:'Manufacturer releases may differ from Windows Update.',deviceIds:['device0']},{id:'bios',category:'BIOS / UEFI',name:'Example motherboard',values:{'BIOS version':'F10'},source:'gigabyte',sourceName:'GIGABYTE support',note:'Select the exact model and board revision.',deviceIds:[]},{id:'cpu',category:'Processor',name:hardware.cpu.name,values:{Cores:'16',Threads:'24'},source:'intel',sourceName:'Intel support',note:'Check chipset and BIOS support.',deviceIds:[]},{id:'unknown',category:'Storage',name:'Unidentified SSD',values:{'Firmware version':'Unknown'},source:null,sourceName:'',note:'No manufacturer match assumed.',deviceIds:[]}];
 let history={monitorEnabled:false,baselineAt:stamp,lastScanAt:stamp,scans:2,deviceCount:31,limit:2000,message:'Observed differences, not installation times.',changes:[{id:'change',deviceId:'bios',instanceId:'',name:'Example motherboard',category:'BIOS / UEFI',kind:'firmware-changed',observedAt:stamp,previousScanAt:'2026-10-08T12:00:00Z',fields:[{field:'BIOS version',before:'F9',after:'F10'}]}]};
 const report=()=>({scannedAt:stamp,hardware,board:{manufacturer:'GIGABYTE',product:'Example',version:'1'},computer:{manufacturer:'Custom',model:'Fixture'},bios:{manufacturer:'Fixture',version:'F10'},disks:[],devices,components,inventoryComplete:true,componentsComplete:true,warnings:[],recommendations:[],history:structuredClone(history)});
 let offers=null,checking=false,rejectPending;
 window.tweaker={getTweakStatus:async()=>({checkedAt:stamp,tweaks:[]}),listBackups:async()=>[],
 scanDrivers:async()=>report(),openDriverSource:async id=>window.calls.push(['source',id]),
 getDriverHistory:async()=>structuredClone(history),setDriverMonitoring:async enabled=>{history.monitorEnabled=enabled;window.calls.push(['monitor',enabled]);return structuredClone(history)},
 clearDriverHistory:async()=>{window.calls.push('clear');history={...history,baselineAt:null,lastScanAt:null,scans:0,changes:[],monitorEnabled:false,message:'Local history cleared.'};return structuredClone(history)},
 getDriverInstallLog:async()=>({available:true,truncated:false,message:'Read retained Windows local log entries.',entries:[{id:'entry',operation:'Device Install',instanceId:'PCI\\VEN_1002&DEV_ABCD\\PRIVATE_SERIAL_0',deviceId:'device0',localTime:'2026/10/09 10:00:00.000',result:'success',detail:'SUCCESS'}]}),
 getDriverUpdateStatus:async()=>({checking,result:offers}),
 checkDriverUpdates:async()=>{offers=null;if(window.offerMode==='failure')throw Error('Update service unavailable');if(window.offerMode==='cancel'){checking=true;return new Promise((_,reject)=>{rejectPending=reject})}offers={checkedAt:stamp,complete:true,source:'Windows Update — configured update source',message:window.offerMode==='empty'?'No driver packages were offered. This does not verify the latest manufacturer release.':'Applicable Windows Update package; not automatically installed.',packages:window.offerMode==='empty'?[]:[{id:'offer',title:'AMD display package 32.0.2',manufacturer:'AMD',model:'Graphics fixture',driverClass:'Display',hardwareId:'PCI\\VEN_1002&DEV_ABCD',driverDate:'2026-10-01',catalogDate:'2026-10-08',description:'Publisher package information. Full known issues on manufacturer site.',links:[{label:'amd.com',url:'https://www.amd.com/en/support'}]}]};return offers},
 cancelDriverUpdateCheck:async()=>{checking=false;window.calls.push('cancel');rejectPending(Error('Cancelled by user'))},openDriverUpdateLink:async(id,index)=>window.calls.push(['offer-link',id,index])};
})();'''

with sync_playwright() as p:
    browser=p.chromium.launch(executable_path='/usr/bin/chromium',headless=True,args=['--no-sandbox'])
    page=browser.new_page(viewport={'width':1440,'height':1100},accept_downloads=True)
    errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
    page.add_init_script(fixture);page.goto(os.environ.get('TWEAKER_URL','http://127.0.0.1:5173'),wait_until='networkidle')
    page.get_by_role('button',name='Drivers & devices',exact=True).click()
    page.get_by_role('button',name='Scan drivers & devices').click()
    expect(page.locator('.component-card')).to_have_count(3)
    expect(page.locator('.component-card').filter(has_text='Unidentified SSD').get_by_role('button')).to_have_count(0)
    page.locator('.component-card').filter(has_text='AMD Radeon fixture').get_by_role('button').click()
    assert ['source','amd'] in page.evaluate('window.calls')
    page.get_by_label('Hardware component category',exact=True).select_option('BIOS / UEFI');expect(page.locator('.component-card')).to_have_count(1)
    page.get_by_label('Hardware component category',exact=True).select_option('All components')
    page.screenshot(path='/tmp/tweakerzzz-validation/hardware-components.png',full_page=True)
    expect(page.get_by_role('tab',name='Advanced records')).to_have_count(0)
    page.get_by_role('tab',name='Update offers').click();page.get_by_role('button',name='Check driver update offers').click()
    expect(page.locator('.driver-offer-card')).to_contain_text('Hardware ID matches:')
    page.get_by_text('Published package information & release links',exact=True).click()
    page.get_by_role('button',name='Release information · amd.com').click();assert ['offer-link','offer',0] in page.evaluate('window.calls')
    page.get_by_role('tab',name='Change history').click();expect(page.locator('.driver-change-list')).to_contain_text('F9 → F10')
    page.get_by_label('Check for changes every 15 minutes',exact=False).check();assert ['monitor',True] in page.evaluate('window.calls')
    page.get_by_text('Windows installation log · additional evidence',exact=True).click();page.get_by_role('button',name='Read Windows installation log').click()
    expect(page.locator('.windows-install-log')).to_contain_text('2026/10/09 10:00:00.000')
    with page.expect_download() as download:
        page.get_by_role('button',name='Export hardware & driver report').click()
    exported=Path(download.value.path()).read_text();payload=json.loads(exported)
    assert not payload['includesDeviceIdentifiers'] and 'PRIVATE_SERIAL' not in exported and 'hardwareId' not in exported
    assert payload['history']['changes'][0]['fields'][0]['after']=='F10'
    page.get_by_label('Include hardware and instance IDs',exact=False).check()
    with page.expect_download() as download:
        page.get_by_role('button',name='Export hardware & driver report').click()
    assert 'PRIVATE_SERIAL_30' in Path(download.value.path()).read_text()
    page.get_by_role('button',name='Clear local history').click();assert 'clear' not in page.evaluate('window.calls')
    page.get_by_role('button',name='Keep history').click();expect(page.locator('.driver-change-list')).to_contain_text('F9 → F10')
    for width in [390,900,1366]:
        page.set_viewport_size({'width':width,'height':1000})
        for view in ['Hardware','Update offers','Change history']:
            page.get_by_role('tab',name=view,exact=True).click()
            assert page.evaluate('document.documentElement.scrollWidth <= innerWidth'),(width,view)
    page.set_viewport_size({'width':1366,'height':1000});page.get_by_role('tab',name='Update offers').click()
    page.evaluate("window.offerMode='failure'");page.get_by_role('button',name='Check driver update offers').click()
    expect(page.get_by_role('alert')).to_contain_text('No component is marked up to date');expect(page.locator('.driver-offer-card')).to_have_count(0)
    page.evaluate("window.offerMode='cancel'");page.get_by_role('button',name='Check driver update offers').click();page.get_by_role('button',name='Cancel driver update check').click()
    expect(page.get_by_role('alert')).to_contain_text('Cancelled by user');expect(page.get_by_role('button',name='Check driver update offers')).to_be_enabled()
    page.evaluate("window.offerMode='empty'");page.get_by_role('button',name='Check driver update offers').click()
    expect(page.locator('.driver-offers')).to_contain_text('does not verify the latest');expect(page.get_by_role('alert')).to_have_count(0)
    page.get_by_role('tab',name='Change history').click();page.get_by_role('button',name='Clear local history').click();page.get_by_role('button',name='Delete local history').click()
    expect(page.locator('.driver-change-list article')).to_have_count(0);expect(page.get_by_label('Check for changes every 15 minutes',exact=False)).not_to_be_checked()
    assert not errors,errors
    print('PASS: component cards, update offers/failure/cancel, history, hidden miscellaneous records, privacy-aware exports and responsive views. Native data are fixtures.')
    browser.close()
