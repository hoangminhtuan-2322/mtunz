'use strict';
/* Browser-engine regression: WebKit (Safari engine) and Chromium mobile touch.
   The test injects disposable view state; it never creates real accounts. */
const assert=require('node:assert/strict');
const {chromium,webkit}=require('playwright-core');

(async()=>{
 for(const [name,engine] of [['webkit',webkit],['chromium',chromium]]){
  const browser=await engine.launch({headless:true,args:name==='chromium'?['--no-sandbox']:[]});
  try{
   for(const width of [320,375,390,768,1024,1440]){
    const mobile=width<=800;
    const context=await browser.newContext({
      viewport:{width,height:820},
      isMobile:mobile,hasTouch:mobile,
      deviceScaleFactor:mobile?2:1,
      reducedMotion:'reduce'
    });
    const page=await context.newPage();
    const errors=[];
    page.on('pageerror',err=>errors.push(err.message));
    try{
     const response=await page.goto('http://127.0.0.1:8791/');
     assert.equal(response.status(),200);
     await page.locator('form').first().waitFor();
     await page.evaluate(()=>{
      Object.assign(state,{
       user:{id:7,username:'browser_test',display_name:'Thử nghiệm',
         pin_length:4,world_anonymous:false},
       tab:'world',selected:null,friends:[],groups:[],notices:[],
       v6WorldRoom:1,v6Rooms:[{id:1,title:'Chung',active:true}],v6Polls:[],
       worldData:{status:{enabled:true,open:true,server_time:Math.floor(Date.now()/1000),
         warnings:0,strikes:0,schedule_enabled:false,slow_seconds:0},
        messages:[{id:13,sender_id:8,display_name:'Thành viên khác',
          body:'Xin chào',created_at:Math.floor(Date.now()/1000)}]}
      });
      renderApp();
     });
     await page.locator('#world-feed .world-message').waitFor();
     if(mobile){
      assert.equal(await page.locator('.rail-nav>.rail-btn').count(),5,
       'Exactly five mobile bottom destinations remain');
      const field=page.locator('#world-compose-text');
      await field.fill('Tin nhắn thử');
      await field.press('Enter');
      assert.equal(await field.inputValue(),'Tin nhắn thử\\n',name+' mobile Enter must remain newline');
      await field.evaluate(el=>el.blur());
      await page.waitForFunction(()=>!document.body.classList.contains('mt-mobile-editing'));
      await page.locator('.rail-nav>[data-tab="messages"]').click();
      const profile=page.locator('.side-top>.mobile-profile-top');
      await profile.waitFor({state:'visible'});
      assert.match(await profile.innerText(),/Thử nghiệm/);
      assert(await page.evaluate(()=>{
       const p=document.querySelector('.side-top>.mobile-profile-top').getBoundingClientRect();
       const h=document.querySelector('.side-top h2').getBoundingClientRect();
       return p.bottom<h.top;
      }),name+' top Profile must appear above Tin nhắn at '+width);
      await profile.click();
      await page.locator('.profile-page').waitFor({state:'visible'});
     }else{
      await page.locator('.mobile-profile-top').waitFor({state:'hidden'});
      const shell=page.locator('.shell.world-desktop-full');
      await shell.waitFor();
      assert.equal(await shell.locator(':scope > .side').evaluate(el=>getComputedStyle(el).display),'none');
     }
     assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),
       true,name+' viewport '+width+' must not overflow');
     assert.deepEqual(errors,[],name+' JS errors at '+width);
    }finally{await context.close();}
   }
  }finally{await browser.close();}
 }
})().catch(err=>{console.error(err);process.exitCode=1;});
