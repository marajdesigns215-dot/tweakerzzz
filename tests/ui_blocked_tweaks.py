"""Review a blocked plan and explicitly retry only accessible tweaks (native fixture)."""
import json, os, re
from pathlib import Path
from playwright.sync_api import sync_playwright, expect
URL=os.environ.get('TWEAKER_URL','http://127.0.0.1:4173')
ids=[t['id'] for t in json.loads(Path('scripts/windows/tweaks.json').read_text())]
fixture='''(() => {
 window.operations=[];window.applied=[];window.blocked=true;
 const act=async(action,ids)=>{window.operations.push({action,ids});const denied=window.blocked?ids.filter(id=>id.startsWith('edge-')):[];if(denied.length)return {backupId:null,applied:[],skipped:[],blocked:denied.map(id=>({id,message:'Access denied at HKCU\\\\Software\\\\Policies\\\\Microsoft\\\\Edge'})),message:'No changes were made. Remove blocked tweaks and review again.'};window.applied.push(...ids);return {backupId:'a'.repeat(32),applied:ids,message:'Saved accessible changes.'};};
 window.tweaker={listBackups:async()=>[],getDisplayModes:async()=>[],getTweakStatus:async()=>({checkedAt:new Date().toISOString(),tweaks:IDS.map(id=>({id,status:window.applied.includes(id)?'enabled':'not-configured',message:'Fixture Windows state'}))}),applyTweaks:ids=>act('apply',ids),changePreferences:act};
})();'''.replace('IDS',json.dumps(ids))
with sync_playwright() as p:
 browser=p.chromium.launch(executable_path='/usr/bin/chromium',headless=True,args=['--no-sandbox'])
 page=browser.new_page(viewport={'width':1440,'height':1000});errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
 page.add_init_script(fixture);page.goto(URL,wait_until='networkidle')
 page.locator('.nav-item').filter(has_text='Optimizations').click()
 catalog=Path('src/data/tweaks.ts').read_text()
 control_title=re.search(r"id: 'transparency', title: '([^']+)'",catalog).group(1)
 titles=['Stop Edge background mode','Disable Edge startup boost',control_title]
 for title in titles:page.get_by_role('switch',name='Select '+title,exact=True).click()
 page.get_by_role('button',name='Review plan',exact=False).click()
 page.get_by_role('button',name='Back up & apply 3 changes',exact=True).click()
 notice=page.locator('.blocked-tweaks');expect(notice).to_contain_text('2 tweaks need to be left out')
 expect(notice).to_contain_text('No changes were made')
 for title in titles[:2]:expect(notice).to_contain_text(title)
 expect(notice).to_contain_text('System and performance')
 assert page.evaluate('window.applied')==[]
 page.get_by_role('button',name='Remove blocked tweaks',exact=True).click()
 expect(page.get_by_role('button',name='Back up & apply 1 changes',exact=True)).to_be_enabled()
 assert len(page.evaluate('window.operations'))==1,'Removing blocked entries must not automatically apply the rest'
 page.get_by_role('button',name='Back up & apply 1 changes',exact=True).click()
 expect(page.get_by_role('dialog')).to_have_count(0)
 assert page.evaluate('window.applied')==['transparency']
 assert page.evaluate('window.operations[1].ids')==['transparency']
 page.get_by_role('button',name='Restore center',exact=True).click()
 for title in [titles[0],titles[2]]:page.locator('.restore-setting').filter(has_text=title).get_by_role('checkbox').check()
 page.get_by_role('button',name='Review turning off tweaks').click();page.get_by_role('button',name='Back up & turn off',exact=True).click()
 expect(page.locator('.blocked-tweaks')).to_contain_text('1 tweak needs to be left out')
 assert len(page.evaluate('window.operations'))==3
 page.get_by_role('button',name='Remove blocked tweaks').click()
 assert len(page.evaluate('window.operations'))==3
 page.get_by_role('button',name='Review turning off tweaks').click();page.get_by_role('button',name='Back up & turn off',exact=True).click()
 expect(page.locator('.preference-review')).to_have_count(0)
 assert page.evaluate('window.operations[3]')=={'action':'disable','ids':['transparency']}
 assert not errors,errors
 browser.close()
print('PASS: blocked apply/disable name affected tweaks, retain the review, guide Edge settings, and require explicit removal/review before applying the rest.')
