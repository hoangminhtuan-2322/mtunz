'use strict';
/* Uses mocked Admin view state and intercepted saves; no real account writes. */
const assert=require('node:assert/strict');
const {chromium}=require('playwright-core');

(async()=>{
 const browser=await chromium.launch({
  executablePath:process.env.CHROME_BIN||'/usr/bin/google-chrome',args:['--no-sandbox']
 });
 try{
  for(const width of [390,1440]){
   const page=await browser.newPage({viewport:{width,height:820},isMobile:width<800,hasTouch:width<800});
   const errors=[];
   page.on('pageerror',err=>errors.push(err.message));
   try{
    await page.goto('http://127.0.0.1:8791/');
    await page.locator('form').first().waitFor();
    await page.evaluate(()=>{
     state.user={id:1,username:'admin',is_admin:true,pin_length:6};
     adminV5Security={maintenance:{schedule:null}};
     adminV5ScheduleMaintenance(false);
    });
    const panel=page.locator('#modal-root .premium-dialog');
    await panel.waitFor();
    assert.match(await panel.innerText(),/Thời gian bảo trì/);
    assert.match(await panel.innerText(),/Thông báo cho thành viên/);
    assert.match(await panel.innerText(),/Khi kết thúc/);
    assert.equal(await panel.locator('input[type="date"]').count(),2);
    assert.equal(await panel.locator('input[type="time"]').count(),2);
    assert.equal(await panel.locator('.v5-maint-preset').count(),4);
    assert(await panel.locator('#modal-confirm').isDisabled(),'Missing reason must disable Save');
    await panel.locator('#v5-maint-reason').fill('Nâng cấp tốc độ MTUNZ để trải nghiệm ổn định hơn.');
    assert(await panel.locator('#modal-confirm').isEnabled());
    assert.match(await panel.locator('#v5-maint-sample-text').innerText(),/Nâng cấp tốc độ/);
    await panel.locator('[data-v5-maint-minutes="120"]').click();
    assert.match(await panel.locator('#v5-maint-duration').innerText(),/2 giờ/);
    assert.equal(await panel.locator('[data-v5-maint-minutes="120"]').getAttribute('aria-pressed'),'true');
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
    assert(await panel.locator('#modal-confirm').isVisible());
    await panel.locator('#admin-v3-pin').fill('123456');
    let payload=null;
    await page.route('**/api/admin/security/maintenance/schedule',route=>{
     payload=route.request().postDataJSON();
     return route.fulfill({json:{ok:true,maintenance:{schedule:null}}});
    });
    await panel.locator('#modal-confirm').click();
    await panel.waitFor({state:'detached'});
    assert(payload,'Save must send schedule to Admin API');
    assert.equal(payload.ends_at-payload.starts_at,7200);
    assert.equal(payload.admin_pin,'123456');
    assert.match(payload.reason,/Nâng cấp tốc độ/);
    assert.deepEqual(errors,[],width+'px JS errors');
    console.log('Admin maintenance V16 browser passed at '+width+'px');
   }finally{await page.close();}
  }
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
