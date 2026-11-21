'use strict';
const assert=require('node:assert/strict');
const {chromium}=require('playwright-core');

(async()=>{
  const browser=await chromium.launch({executablePath:process.env.CHROME_BIN||'/usr/bin/google-chrome',args:['--no-sandbox']});
  try{
    for(const width of [360,390,768,1440]){
      const page=await browser.newPage({viewport:{width,height:780},reducedMotion:width===390?'reduce':'no-preference'});
      const errors=[];
      page.on('pageerror',error=>errors.push(error.message));
      await page.route('**/api/auth/start',route=>route.fulfill({json:{username:'demo'}}));
      await page.route('**/api/registration/request',route=>route.fulfill({json:{status:'pending',username:'demo_member'}}));
      await page.route('**/api/username/check',route=>route.fulfill({json:{available:true}}));
      await page.goto('http://127.0.0.1:8791/');
      const current=page.locator('.auth-progress [aria-current="step"]');
      await page.locator('[data-form="login-username"]').waitFor();
      assert.equal(await current.innerText(),'Tài khoản');
      await page.locator('#username').fill('demo');
      await page.locator('[data-form="login-username"] button[type="submit"]').click();
      await page.locator('[data-form="login-password"]').waitFor();
      assert.equal(await current.innerText(),'Mật khẩu');
      await page.locator('[data-act="mode-register"]').click();
      assert.equal(await current.innerText(),'Gửi yêu cầu');
      assert.equal(await page.locator('[data-act="mode-register"]').getAttribute('aria-pressed'),'true');
      if(width===390)assert.equal(await current.evaluate(el=>getComputedStyle(el).animationName),'none');
      await page.locator('#username').fill('demo_member');
      await page.locator('#phone').fill('0912345678');
      const submit=page.locator('[data-form="register-request"] button[type="submit"]');
      await submit.scrollIntoViewIfNeeded();
      const box=await submit.boundingBox();
      assert(box.x>=0 && box.x+box.width<=width && box.y>=0 && box.y+box.height<=780);
      await submit.click();
      await page.locator('[data-act="refresh-registration"]').waitFor();
      assert.equal(await current.innerText(),'Xét duyệt');
      assert.deepEqual(errors,[]);
      await page.close();
    }
  }finally{await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
