'use strict';
/* Isolated frontend fixture: no Admin sign-in, database writes or session resets.
   Existing admin_workspace_browser.cjs separately covers authenticated Admin flows. */
const assert=require('node:assert/strict');
const {chromium}=require('playwright-core');
(async()=>{
 const browser=await chromium.launch({
  executablePath:process.env.CHROME_BIN||'/usr/bin/google-chrome',
  args:['--no-sandbox']
 });
 try{
  const expectedISO='2026-11-21T13:59:07.000Z';
  for(const width of [320,390,768,1440]){
   const page=await browser.newPage({viewport:{width,height:850},reducedMotion:'reduce'});
   const errors=[];
   page.on('pageerror',err=>errors.push(err.message));
   try{
    await page.goto('http://127.0.0.1:8791/');
    await page.locator('form').first().waitFor();
    await page.evaluate(iso=>{
      state.user={
        id:1,username:'admin',display_name:'Admin',is_admin:true,pin_length:4
      };
      state.adminTab='users';
      state.adminQuery='';
      state.adminData=[{
        id:57,username:'example_member',display_name:'Thành viên',
        created_at:Date.parse(iso)/1000,friend_count:3,message_count:12,
        sanction_kind:null,sanction_until:null
      }];
      renderAdmin();
    },expectedISO);
    const time=page.locator('time.admin-member-joined');
    await time.waitFor({state:'visible'});
    assert.equal(await time.locator('.admin-member-joined-date').innerText(),'21/11/2026');
    assert.match(await time.locator('.admin-member-joined-clock').innerText(),/20:59:07.*UTC\+7/);
    assert.equal(await time.getAttribute('datetime'),expectedISO);
    const cell=time.locator('xpath=..');
    assert.equal(await cell.getAttribute('data-sort-value'),String(Date.parse(expectedISO)/1000));
    assert.equal(await page.locator('[data-act="admin-user-detail"][data-id="57"]').count(),1);
    assert.equal(await page.locator('[data-act="admin-user-revoke"][data-id="57"]').count(),1);
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true,
      'Page must not overflow horizontally at '+width+'px');
    assert.deepEqual(errors,[],'Frontend page error at '+width+'px');
   }finally{await page.close();}
  }
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
