'use strict';
const assert=require('node:assert/strict');
const {chromium}=require('playwright-core');

(async()=>{
 const browser=await chromium.launch({executablePath:process.env.CHROME_BIN||'/usr/bin/google-chrome',args:['--no-sandbox']});
 try{
  for(const width of [320,390,1440]){
   const page=await browser.newPage({viewport:{width,height:780},hasTouch:width<800,reducedMotion:'reduce'});
   const now=Math.floor(Date.now()/1000);
   const history=Array.from({length:40},(_,i)=>({id:i+1,sender_id:9,recipient_id:12,body:'Tin nhắn '+i,created_at:now-60}));
   await page.route('**/api/messages/12',r=>r.fulfill({json:{messages:history}}));
   await page.goto('http://127.0.0.1:8791/');
   await page.locator('form').first().waitFor();
   await page.evaluate(()=>{
    Object.assign(state,{user:{id:9,username:'demo',display_name:'Demo'},tab:'messages',
     friends:[{state:'accepted',other_id:12,username:'Minh',display_name:'Minh'}]});
    return openChat(12);
   });
   const row=page.locator('#msg-dm-40');
   assert.equal(await row.locator('.bubble-actions').isVisible(),width>=800);
   await page.locator('.chat-header-more [data-act="call-video"]').waitFor({state:'attached'});
   if(width<800){
    await row.getByRole('button',{name:'Tùy chọn tin nhắn'}).tap();
    await page.getByRole('button',{name:'Trả lời',exact:true}).tap();
    await page.locator('.compose-reply').waitFor();
   }
   const existing=await row.elementHandle();
   let finish;
   const delayed=new Promise(resolve=>{finish=resolve;});
   await page.route('**/api/messages',async r=>{
    const {body,client_message_id}=r.request().postDataJSON();
    await delayed;
    await r.fulfill({json:{message:{id:41,sender_id:9,recipient_id:12,body,client_message_id,created_at:now}}});
   });
   const text=page.locator('#chat-text');
   await text.fill('Gửi ngay');
   await text.press('Enter');
   await page.locator('#chat-messages .bubble').filter({hasText:'Gửi ngay'}).waitFor();
   assert.equal(await text.inputValue(),'');
   assert(await existing.evaluate(el=>el.isConnected));
   await text.fill('Bản nháp mới');
   await page.locator('#chat-messages').evaluate(el=>el.scrollTo({top:120,behavior:'instant'}));
   finish();
   await page.locator('#msg-dm-41').waitFor({state:'attached'});
   assert.equal(await text.inputValue(),'Bản nháp mới');
   assert.equal(await page.locator('#chat-messages').evaluate(el=>el.scrollTop),120);
   assert(await existing.evaluate(el=>el.isConnected));
   assert(await page.locator('.main-head > [data-act="search-chat"]').isVisible());
   await page.route('**/api/chat/search/v6?*',r=>r.fulfill({json:{results:[
    {id:3,body:'Tin nhắn cần tìm',sender_id:9,created_at:now-60}
   ]}}));
   await page.locator('.main-head > [data-act="search-chat"]').click();
   await page.locator('#v6-query').fill('cần tìm');
   await page.locator('#v6-query').press('Enter');
   await page.locator('[data-found-message="3"]').click();
   await page.locator('#msg-dm-3.search-target').waitFor();
   await page.route('**/api/messages/14',r=>r.fulfill({json:{messages:history.map(m=>({...m,recipient_id:14}))}}));
   await page.evaluate(()=>{
    state.friends.push({other_id:14,username:'Bạn thứ hai',state:'accepted'});
    return openChat(14);
   });
   await page.waitForFunction(()=>{const el=document.querySelector('#chat-messages');return el.scrollHeight-el.scrollTop-el.clientHeight<=2&&!el.dataset.positioningChat;});
   await page.evaluate(()=>openChat(12));
   await page.waitForFunction(()=>{const el=document.querySelector('#chat-messages');return el.scrollHeight-el.scrollTop-el.clientHeight<=2&&!el.dataset.positioningChat;});
   const alerts=await page.evaluate(()=>{
    let tones=0;
    playChatSound=()=>tones++;
    state.friends.push({other_id:13,muted:true});
    alertChatMessage('dm',12,{id:201});
    alertChatMessage('dm',13,{id:202});
    alertChatMessage('group',7,{id:203});
    alertChatMessage('group',7,{id:203});
    localStorage.setItem(chatSoundKey(),'off');
    alertChatMessage('group',7,{id:204});
    return tones;
   });
   assert.equal(alerts,1);
   if(width===390){
    await page.context().grantPermissions(['notifications']);
    const background=await page.evaluate(async ()=>{
     Object.defineProperty(document,'hidden',{value:true,configurable:true});
     const registration=await chatNotificationRegistration();
     await notifyBrowser('Bạn có tin nhắn mới.','chat:verification',true);
     const notifications=await registration.getNotifications({tag:'chat:verification'});
     const shown=notifications.map(n=>[n.body,n.silent]);
     notifications.forEach(n=>n.close());
     return shown;
    });
    assert.deepEqual(background,[['Bạn có tin nhắn mới.',true]]);
   }
   await page.close();
  }
 }finally{await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
