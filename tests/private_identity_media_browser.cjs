'use strict';
// Browser only: API calls are intercepted, no real user or database is modified.
const assert=require('node:assert/strict');
const {chromium}=require('playwright-core');
(async()=>{
 const browser=await chromium.launch({executablePath:process.env.CHROME_BIN||'/usr/bin/google-chrome',args:['--no-sandbox']});
 try{
  for(const width of [390,1440]){
   const page=await browser.newPage({viewport:{width,height:820},hasTouch:width<800,isMobile:width<800});
   const errors=[];
   page.on('pageerror',e=>errors.push(e.message));
   try{
    await page.route('**/api/me/identity/status',route=>route.fulfill({json:{
     username:'demo_member',display_name:'Demo Member',pin_configured:true,
     quota:{username:{remaining:1,limit:1,window_days:60,next_at:null},
            display_name:{remaining:2,limit:2,window_days:30,next_at:null}}
    }}));
    await page.goto('http://127.0.0.1:8791/');
    // Wait for the app's asynchronous anonymous-session bootstrap before
    // creating an isolated mock member, or it may reset state.user mid-click.
    await page.locator('form').first().waitFor();
    await page.waitForFunction(()=>typeof socialSettingsPanel==='function'&&typeof identitySettingsPanel==='function');
    await page.evaluate(()=>{
     state.user={id:99,username:'demo_member',display_name:'Demo Member',pin_length:4,
                 profile_visibility:'everyone',show_online:true,show_receipts:true};
     // Isolate the control without requiring an authenticated test session.
     document.body.insertAdjacentHTML('beforeend','<div id="v17-preview">'+
       socialSettingsPanel()+identitySettingsPanel()+'</div>');
     window.renderApp=()=>{};
    });
    const preview=page.locator('#v17-preview');
    await preview.locator('#social-private-switch').check();
    assert.equal(await preview.locator('#social-visibility').inputValue(),'friends');
    await preview.locator('#social-visibility').selectOption('only_me');
    assert.equal(await preview.locator('#social-private-switch').isChecked(),true);
    await preview.locator('#social-private-switch').uncheck();
    assert.equal(await preview.locator('#social-visibility').inputValue(),'everyone');
    await preview.locator('[data-identity-kind="username"]').click();
    await page.waitForFunction(()=>document.querySelector('#identity-new')||
      document.querySelector('#modal-root .premium-dialog'),null,{timeout:10000});
    if(!await page.locator('#identity-new').count()){
      const why=await page.evaluate(()=>({dialog:document.querySelector('#modal-root')?.innerText,
        toast:document.querySelector('#toast-root')?.innerText,
        signedIn:state.user?.username,mode:state.mode}));
      throw Error('Identity modal did not open: '+JSON.stringify(why));
    }
    assert.match(await page.locator('#modal-root').innerText(),/60 ngày/);
    await page.locator('#identity-new').fill('demo_member_new');
    await page.locator('#identity-password').fill('ExamplePassword123');
    await page.locator('#identity-pin').fill('1234');
    let body=null;
    await page.route('**/api/me/identity/username',route=>{
     body=route.request().postDataJSON();return route.fulfill({json:{ok:true,kind:'username',value:'demo_member_new',quota:{}}});
    });
    await page.route('**/api/me',route=>route.fulfill({json:{user:{
      id:99,username:'demo_member_new',display_name:'Demo Member',pin_length:4,profile_visibility:'everyone'
    }}}));
    await page.locator('#modal-confirm').click();
    await page.locator('#identity-new').waitFor({state:'detached'});
    assert(body && body.new_value==='demo_member_new');
    assert.equal(body.password,'ExamplePassword123');
    assert.equal(body.pin,'1234');
    assert.equal(await page.evaluate(()=>state.user.username),'demo_member_new');
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
    assert.deepEqual(errors,[],'Unexpected browser errors at '+width+'px');
    console.log('V17 private switch and protected identity modal OK at '+width+'px');
   }finally{await page.close();}
  }
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
