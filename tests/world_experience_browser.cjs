'use strict';
const assert=require('node:assert/strict');
const {chromium}=require('playwright-core');

(async()=>{
 const browser=await chromium.launch({executablePath:process.env.CHROME_BIN||'/usr/bin/google-chrome',args:['--no-sandbox']});
 try{
  for(const width of [320,390,768,801,1024,1440]){
   const page=await browser.newPage({viewport:{width,height:820},reducedMotion:'reduce'});
   const errors=[];
   page.on('pageerror',error=>errors.push(error.message));
   await page.goto('http://127.0.0.1:8791/');
   await page.locator('form').first().waitFor();
   await page.evaluate(()=>{
    Object.assign(state,{
      user:{id:7,username:'demo',display_name:'Mình',pin_length:4,phone:'',
        bio:'Xin chào',profile_visibility:'everyone',show_online:true,
        show_receipts:true,world_anonymous:false},
      tab:'messages',selected:null,groups:[],friends:[],notices:[]
    });
    renderApp();
   });
   const mobile=width<=800;
   const profile=page.locator('.rail-mobile-profile');
   if(mobile){
    await profile.waitFor({state:'visible'});
    assert.equal(await profile.getAttribute('data-tab'),'profile');
    await profile.click();
    await page.locator('.profile-page').waitFor({state:'visible'});
    assert((await profile.getAttribute('class')).includes('active'));
   }else{
    await profile.waitFor({state:'hidden'});
    await page.locator('.rail-profile-button').waitFor({state:'visible'});
   }
   await page.evaluate(()=>{
    state.worldData={status:{enabled:true,open:true,closed_reason:'',
      server_time:Math.floor(Date.now()/1000),warnings:0,strikes:0,
      schedule_enabled:false,slow_seconds:0},
      messages:[{id:101,sender_id:12,display_name:'Một người bạn',
                 body:'Xin chào thế giới',created_at:Math.floor(Date.now()/1000)}]};
    state.tab='world';
    state.v6WorldRoom=1;state.v6Rooms=[{id:1,title:'Chung',active:true}];
    state.v6Polls=[];
    renderApp();
   });
   await page.locator('.world-chat-pane #world-feed').waitFor();
   await page.locator('.world-discovery').waitFor();
   assert.equal(await page.locator('.world-live-page [data-world-form="send"]').count(),1);

   const geometry=await page.evaluate(()=>{
     const rail=document.querySelector('.shell>.rail').getBoundingClientRect();
     const main=document.querySelector('.shell>.main').getBoundingClientRect();
     const world=document.querySelector('.main-body.world-live-page').getBoundingClientRect();
     return {railWidth:rail.width,mainWidth:main.width,mainLeft:main.left,
       worldWidth:world.width,worldLeft:world.left,worldRight:world.right,
       sideDisplay:getComputedStyle(document.querySelector('.shell>.side')).display,
       headDisplay:getComputedStyle(document.querySelector('.shell>.main>.main-head')).display};
   });
   if(!mobile){
     assert.equal(geometry.sideDisplay,'none','Unused inbox sidebar hidden on desktop at '+width);
     assert.equal(geometry.headDisplay,'none','Duplicate World heading removed at '+width);
     assert(Math.abs(geometry.mainWidth-(width-geometry.railWidth))<3,
       'World main uses all space after navigation at '+width+'px: '+JSON.stringify(geometry));
     assert(Math.abs(geometry.worldWidth-geometry.mainWidth)<3,
       'World panel fills main at '+width+'px: '+JSON.stringify(geometry));
     assert(Math.abs(geometry.worldLeft-geometry.mainLeft)<3,'World panel aligns to main');
     assert(Math.abs(geometry.worldRight-width)<3,'World panel reaches right edge');
   }

   assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true,'Horizontal overflow '+width);
   if(mobile){
    const toggle=page.locator('[data-world-experience="toggle-discovery"]');
    await toggle.waitFor({state:'visible'});
    assert.equal(await toggle.getAttribute('aria-expanded'),'false');
    await toggle.click();
    assert.equal(await toggle.getAttribute('aria-expanded'),'true');
    await page.locator('.world-discovery-content').waitFor({state:'visible'});
    await toggle.click();
    assert.equal(await toggle.getAttribute('aria-expanded'),'false');
   }else{
    await page.locator('.world-discovery-content').waitFor({state:'visible'});
   }
   await page.evaluate(()=>{
     window.__worldTestSubmitCount=0;
     const form=document.querySelector('form[data-world-form="send"]');
     form.addEventListener('submit',event=>{
       event.preventDefault();event.stopImmediatePropagation();
       window.__worldTestSubmitCount++;
     });
   });
   const compose=page.locator('#world-compose-text');
   await compose.fill('Bàn phím Chat thế giới');
   await compose.press('Enter');
   assert.equal(await page.evaluate(()=>window.__worldTestSubmitCount),mobile?0:1,
     'Enter only sends on desktop at '+width);
   assert.equal(await compose.inputValue(),mobile?'Bàn phím Chat thế giới\n':'Bàn phím Chat thế giới',
     'Mobile native Enter remains newline; desktop Enter does not insert newline');
   await compose.press('Shift+Enter');
   assert((await compose.inputValue()).includes('\n'),'Shift+Enter inserts newline');
   assert.equal(await page.evaluate(()=>window.__worldTestSubmitCount),mobile?0:1,
     'Shift+Enter never submits');
   await compose.fill('');
   await page.locator('[data-world-experience="emoji"]').first().click();
   assert.equal(await page.locator('#world-compose-text').inputValue(),'✨');
   await page.evaluate(()=>{state.worldData.status.open=false;renderApp();});
   await page.locator('.world-readonly-note').waitFor();
   assert.equal(await page.locator('[data-world-form="send"]').count(),0);
   assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true,'Closed room overflow '+width);
   assert.deepEqual(errors,[],'Browser errors at width '+width);
   await page.close();
  }
 }finally{await browser.close();}
})().catch(err=>{console.error(err);process.exitCode=1;});