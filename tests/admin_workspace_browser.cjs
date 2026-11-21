'use strict';
const assert=require('node:assert/strict');
const {chromium}=require('playwright-core');

(async()=>{
 const browser=await chromium.launch({executablePath:process.env.CHROME_BIN||'/usr/bin/google-chrome',args:['--no-sandbox']});
 try{
  const context=await browser.newContext({baseURL:'http://127.0.0.1:8791'});
  await context.request.get('/');
  const login=await context.request.post('/api/auth/password',{data:{username:'admin',password:'mtunz7'}});
  assert.equal(login.status(),200);
  const {user}=await (await context.request.get('/api/me')).json();
  await context.addInitScript(uid=>sessionStorage.setItem('mtunz.active-tab.v1',JSON.stringify({uid})),user.id);
  const page=await context.newPage();
  for(const width of [1440,390]){
   await page.setViewportSize({width,height:850});
   await page.goto('/');
   const queue=page.locator('[data-admin-ui="queue-reports"]');
   await queue.click();
   await page.locator('.admin-queue-toolbar [data-status="pending"][aria-pressed="true"]').waitFor();
   await page.locator('[data-act="admin-queue-filter"][data-status="reviewed"]').click();
   await page.locator('[data-status="reviewed"][aria-pressed="true"]').waitFor();
   await page.keyboard.press('Control+k');
   await page.locator('#admin-command-overlay input').fill('tong quan');
   await page.locator('#admin-command-overlay input').press('Enter');
   await queue.waitFor();
   assert.equal(await page.locator('.admin-nav-group').count(),4);
   assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
  }
 }finally{await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
