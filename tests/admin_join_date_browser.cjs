'use strict';
const assert=require('node:assert/strict');
const {chromium}=require('playwright-core');
(async()=>{
 const browser=await chromium.launch({
  executablePath:process.env.CHROME_BIN||'/usr/bin/google-chrome',
  args:['--no-sandbox']
 });
 try{
  const ctx=await browser.newContext({baseURL:'http://127.0.0.1:8791'});
  await ctx.request.get('/');
  const login=await ctx.request.post('/api/auth/password',{
    data:{username:'admin',password:'mtunz7'}
  });
  assert.equal(login.status(),200,'Local test Admin may log in');
  const {user}=await (await ctx.request.get('/api/me')).json();
  await ctx.addInitScript(uid=>sessionStorage.setItem('mtunz.active-tab.v1',JSON.stringify({uid})),user.id);
  const page=await ctx.newPage();
  const expectedISO='2026-11-21T13:59:07.000Z';
  for(const width of [320,390,768,1440]){
   await page.setViewportSize({width,height:850});
   await page.goto('/');
   await page.locator('.admin-shell').waitFor();
   await page.evaluate(iso=>{
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
   await time.waitFor();
   assert.equal(await time.locator('.admin-member-joined-date').innerText(),'21/11/2026');
   assert.match(await time.locator('.admin-member-joined-clock').innerText(),/20:59:07.*UTC\+7/);
   assert.equal(await time.getAttribute('datetime'),expectedISO);
   const cell=time.locator('xpath=..');
   assert.equal(await cell.getAttribute('data-sort-value'),String(Date.parse(expectedISO)/1000));
   assert.equal(await page.locator('[data-act="admin-user-detail"][data-id="57"]').count(),1);
   assert.equal(await page.locator('[data-act="admin-user-revoke"][data-id="57"]').count(),1);
   assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true,
     'Page must not overflow horizontally at '+width+'px');
  }
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
