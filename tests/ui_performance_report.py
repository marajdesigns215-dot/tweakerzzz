"""Report UI, recalculation, diagnostics, exports and responsive layout; synthetic native bridge."""
import json, os
from pathlib import Path
from playwright.sync_api import sync_playwright, expect

fixture = '''(() => {
 const distribution={frames:12000,sampledSeconds:60,averageFps:200,onePercentLow:100,p95FrameMs:8,highestFps:250,lowestFps:90,pointOnePercentLow:50,meanFrameMs:5,p99FrameMs:10,worstFrameMs:110,frameTimeStdDevMs:3,slowFrames50ms:3,slowFrames100ms:1,timeline:[{startSecond:0,endSecond:30,frames:7500,averageFps:250},{startSecond:30,endSecond:60,frames:4500,averageFps:150}]};
 const old={id:'a'.repeat(32),version:1,processName:'game.exe',phase:'before',context:'Gaming',seconds:60,scenario:'Repeatable test',startedAt:'2026-10-09T12:00:00Z',endedAt:'2026-10-09T12:01:00Z',status:'completed',collector:'PresentMon 2.3.0',error:'',settings:{checkedAt:'2026-10-09T12:00:00Z',tweaks:[]},summary:{frames:24000,sampledSeconds:63,averageFps:380,onePercentLow:150,p95FrameMs:7,processId:42,swapChain:'0x1',otherStreamFrames:0,invalidFrames:0,streamCount:1}};
 const revised={...old,reanalyzedAt:new Date().toISOString(),summary:{...old.summary,...distribution,metricsVersion:2,measurementBasis:'cpu-start-interval',qualityIssues:[],duplicateRows:12000,displayTracking:false,displayed:null}};
 window.recalculations=0;let records=[old];
 window.tweaker={ getTweakStatus:async()=>old.settings,listBackups:async()=>[],captureStatus:async()=>({active:false}),listCaptures:async()=>records,
  reanalyzeCapture:async id=>{if(id!==old.id)throw Error('Wrong recording'); window.recalculations++;records=[revised];return revised;},exportCapture:async()=>{} };
})();'''
with sync_playwright() as p:
    browser=p.chromium.launch(executable_path='/usr/bin/chromium',headless=True,args=['--no-sandbox'])
    page=browser.new_page(viewport={'width':1440,'height':1100})
    errors=[];page.on('pageerror',lambda error:errors.append(str(error)))
    page.add_init_script(fixture)
    page.goto(os.environ.get('TWEAKER_URL','http://127.0.0.1:5199'),wait_until='networkidle')
    page.get_by_role('button',name='FPS recorder',exact=True).click()
    report=page.get_by_role('region',name='FPS and performance report')
    expect(report).to_contain_text('repeated frame starts may inflate FPS')
    page.get_by_role('button',name='Recalculate saved CSV',exact=True).click()
    expect(report).to_contain_text('12,000 repeated frame-start rows excluded')
    expect(report.locator('.report-fps-stats')).to_contain_text('250.0')
    expect(report.locator('.report-fps-stats')).to_contain_text('200.0')
    expect(report.locator('.report-fps-stats')).to_contain_text('100.0')
    expect(report).to_contain_text('Slow frames are pulling down the lows')
    expect(report).to_contain_text('Long frame intervals were measured')
    expect(page.get_by_role('button',name='Recalculate saved CSV')).to_have_count(0)
    assert page.evaluate('window.recalculations')==1
    slider=report.get_by_role('slider',name='Timeline interval');slider.focus();page.keyboard.press('End')
    expect(report.locator('.fps-timeline [aria-live]')).to_contain_text('150.0 FPS')
    report.locator('.display-fps summary').click()
    expect(report.locator('.display-fps')).to_contain_text('did not collect display timings')
    with page.expect_download() as info:page.get_by_role('button',name='Export summary',exact=True).click()
    payload=json.loads(Path(info.value.path()).read_text())
    assert payload['summary']['duplicateRows']==12000
    assert any(d['id']=='pacing' for d in payload['performanceDiagnostics'])
    Path('/tmp/tweakerzzz-validation').mkdir(exist_ok=True)
    report.screenshot(path='/tmp/tweakerzzz-validation/performance-report.png')
    for width in [390,900,1366]:
        page.set_viewport_size({'width':width,'height':1000})
        assert page.evaluate('document.documentElement.scrollWidth<=innerWidth'),f'Overflow at {width}'
    assert not errors,errors
    browser.close()
print('PASS: legacy warning, real recalculation interaction, highest/average/lows, timeline keyboard control, diagnostics, exported analysis and responsive layout.')
