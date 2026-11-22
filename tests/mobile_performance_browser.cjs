'use strict';
/* Browser checks use disposable view state; no real user/account writes. */
const assert=require('node:assert/strict');
const {chromium}=require('playwright-core');

(async()=>{
 const browser=await chromium.launch({
  executablePath:process.env.CHROME_BIN||'/usr/bin/google-chrome',args:['--no-sandbox']
 });
 try{
  for(const width of [390,1440]){
   const mobile=width<=800;
   const page=await browser.newPage({viewport:{width,height:820},isMobile:mobile,hasTouch:mobile,
    reducedMotion:'no-preference'});
   const errors=[];
   page.on('pageerror',e=>errors.push(e.message));
   try{
    await page.goto('http://127.0.0.1:8791/');
    await page.locator('form').first().waitFor();
    await page.evaluate(()=>{
      Object.assign(state,{
       user:{id:9,username:'demo',display_name:'Demo',chat_wallpaper:'midnight'},
       tab:'messages',selected:12,
       friends:[{state:'accepted',other_id:12,username:'Minh',display_name:'Minh',
         online:false,last_seen:123,receipt_visible:true}],
       groups:[],notices:[],blocks:[],
       messages:Array.from({length:65},(_,i)=>({
        id:i+1,sender_id:i%3?12:9,recipient_id:i%3?9:12,
        body:'Tin nhắn thử '+i,created_at:1000+i,reactions:[],read_at:null
       }))
      });
      renderApp();
    });
    await page.locator('#msg-dm-65').waitFor();
    assert.equal(await page.locator('.bubble-wrap').count(),65);
    const metrics=await page.evaluate(()=>{
      const bubble=document.querySelector('.thread .bubble-wrap');
      const feed=document.querySelector('#chat-messages');
      return {
       bubbleAnimation:getComputedStyle(bubble).animationName,
       scrollBehavior:getComputedStyle(feed).scrollBehavior,
       overflow:document.documentElement.scrollWidth>window.innerWidth
      };
    });
    assert.equal(metrics.overflow,false,'No mobile horizontal overflow');
    if(mobile){
      assert.equal(metrics.bubbleAnimation,'none','Mobile message history must be static');
      assert.equal(metrics.scrollBehavior,'auto','Mobile history uses immediate scrolling');
    }else{
      assert.notEqual(metrics.bubbleAnimation,'none','Desktop bubble motion remains unchanged');
    }
    const stable=await page.evaluate(()=>{
      const before=document.querySelector('#chat-header .main-head');
      const chat=document.querySelector('#chat-text');
      chat.focus();
      for(let i=0;i<10;i++)updateChatHeader();
      return {
       preserved:before===document.querySelector('#chat-header .main-head'),
       focused:chat===document.activeElement
      };
    });
    assert(stable.preserved,'Unchanged friend refresh must preserve the chat menu DOM');
    assert(stable.focused,'Unchanged friend refresh must preserve message input focus');
    await page.evaluate(()=>{
      appendDirectMessage({id:66,sender_id:9,recipient_id:12,body:'Tin mới',
        created_at:1100,reactions:[]});
    });
    // New bubbles may be outside the overflow-clipped mobile viewport.
    // Test insertion (as in the existing inbox suite), not on-screen visibility.
    await page.locator('#msg-dm-66').waitFor({state:'attached'});
    assert.equal(await page.locator('.bubble-wrap').count(),66);
    assert.equal(await page.locator('button[data-act="back-to-list"]').count(),1);
    assert.deepEqual(errors,[],'Browser errors at '+width);
    console.log('V15 mobile paint and input preservation passed at '+width+'px');
   }finally{await page.close();}
  }
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
