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
   assert(await page.locator('.chat-compose-toolbar [data-v4-act="record"]').isVisible());
   assert(await page.locator('.chat-compose-toolbar [data-v4-act="schedule-new"]').isVisible());
   assert(await page.locator('.chat-compose-toolbar').evaluate(el=>el.scrollWidth<=el.clientWidth));
   if(width<800){
    await row.getByRole('button',{name:'Tùy chọn tin nhắn'}).tap();
    await page.getByRole('button',{name:'Trả lời',exact:true}).tap();
    await page.locator('.compose-reply').waitFor();
   }
   const existing=await row.elementHandle();
   let finish;
   const delayed=new Promise(resolve=>{finish=resolve;});
   const requests=[];
   await page.route('**/api/messages',async r=>{
    const {body,client_message_id}=r.request().postDataJSON();
    requests.push(body);
    const id=40+requests.length;
    if(id===41)await delayed;
    await r.fulfill({json:{message:{id,sender_id:9,recipient_id:12,body,client_message_id,created_at:now}}});
   });
   const text=page.locator('#chat-text');
   const thread=page.locator('#chat-messages');
   await page.waitForFunction(()=>!document.querySelector('#chat-messages').dataset.positioningChat);
   await thread.evaluate(el=>{
    el.dispatchEvent(new WheelEvent('wheel',{bubbles:true,deltaY:-700}));
    el.scrollTo({top:120,behavior:'instant'});
   });
   await page.getByRole('button',{name:'Về tin nhắn mới nhất'}).waitFor();
   await text.fill('Gửi ngay');
   await text.evaluate(el=>{
    el.form.requestSubmit();
    // Simulate a delayed viewport change restoring the previous scroll offset.
    const thread=document.querySelector('#chat-messages');
    thread.style.paddingBottom='180px';
    thread.scrollTo({top:120,behavior:'instant'});
    thread.dispatchEvent(new Event('scroll'));
   });
   const sent=page.locator('#chat-messages .bubble-wrap').filter({hasText:'Gửi ngay'});
   await sent.waitFor();
   await page.waitForFunction(row=>{
    const thread=row.closest('#chat-messages');
    if(!thread)return false;
    const bounds=thread.getBoundingClientRect(),message=row.getBoundingClientRect();
    return message.top>=bounds.top-1&&message.bottom<=bounds.bottom+1;
   },await sent.elementHandle(),{timeout:8000});
   await thread.evaluate(el=>{el.style.removeProperty('padding-bottom');el.dispatchEvent(new Event('scroll'));});
   assert.equal(await text.inputValue(),'');
   assert(await existing.evaluate(el=>el.isConnected));
   await text.fill('Gửi tiếp');
   await text.press('Enter');
   await page.locator('#chat-messages .bubble').filter({hasText:'Gửi tiếp'}).waitFor();
   assert.equal(await text.inputValue(),'');
   assert(await text.evaluate(el=>document.activeElement===el));
   await text.fill('Bản nháp mới');
   await page.locator('#chat-messages').evaluate(el=>{
    el.dispatchEvent(new WheelEvent('wheel',{bubbles:true,deltaY:-500}));
    el.scrollTo({top:120,behavior:'instant'});
   });
   await page.getByRole('button',{name:'Về tin nhắn mới nhất'}).waitFor();
   finish();
   await page.locator('#msg-dm-42').waitFor({state:'attached'});
   assert.deepEqual(requests,['Gửi ngay','Gửi tiếp']);
   assert.equal(await text.inputValue(),'Bản nháp mới');
   assert.equal(await page.locator('#chat-messages').evaluate(el=>el.scrollTop),120);
   assert(await existing.evaluate(el=>el.isConnected));
   assert(await page.locator('.main-head > [data-act="search-chat"]').isVisible());
   await page.route(/\/api\/chat\/search\/v6\?/,r=>r.fulfill({json:{results:[
    {id:3,body:'Tin nhắn cần tìm',sender_id:9,created_at:now-60}
   ]}}));
   await page.locator('.main-head > [data-act="search-chat"]').click();
   await page.locator('#v6-query').fill('cần tìm');
   const searched=page.waitForResponse(r=>r.url().includes('/api/chat/search/v6?'));
   await page.getByRole('button',{name:'Tìm kiếm',exact:true}).click();
   assert((await searched).ok(),'Search response on '+width+'px');
   await page.locator('[data-found-message="3"]').click({timeout:8000});
   await page.locator('#msg-dm-3.search-target').waitFor();
   // Use the real sidebar and back controls, including the collapsed mobile sidebar.
   const latest=async()=>{
    try{
     await page.waitForFunction(()=>{
      const thread=document.querySelector('#chat-messages');
      return thread&&thread.scrollHeight-thread.scrollTop-thread.clientHeight<=2&&!thread.dataset.positioningChat;
     },null,{timeout:8000});
    }catch(error){
     const metrics=await page.locator('#chat-messages').evaluate(el=>({
      ...el.dataset,top:el.scrollTop,height:el.scrollHeight,viewport:el.clientHeight,
      rows:el.querySelectorAll('.bubble-wrap').length
     }));
     throw Error('Latest message was not reached on '+width+'px '+JSON.stringify(metrics),{cause:error});
    }
   };
   const selectChat=async id=>{
    if(width<800)await page.locator('.main-head [data-act="back-to-list"]').click();
    await page.locator('.side-item[data-act="open-chat"][data-id="'+id+'"]').click();
    await page.waitForFunction(id=>{
     const thread=document.querySelector('#chat-messages');
     return thread?.dataset.chatKey==='dm-'+id&&thread.dataset.historyReady==='true';
    },id);
    await latest();
   };
   await page.route('**/api/messages/14',r=>r.fulfill({json:{messages:history.map(m=>({...m,recipient_id:14}))}}));
   await page.evaluate(()=>{
    state.friends.push({other_id:14,username:'Bạn thứ hai',state:'accepted'});
    renderSideItems();
   });
   await selectChat(14);
   assert.equal(await page.locator('#chat-messages .bubble-wrap').count(),40);
   await selectChat(12);
   assert.equal(await text.inputValue(),'Bản nháp mới');

   // A layout shift can happen after the initial frames, with a scroll event already queued.
   await thread.evaluate(el=>{
    el.style.paddingBottom='300px';
    el.dispatchEvent(new Event('scroll'));
   });
   await latest();
   await thread.evaluate(el=>{
    el.dispatchEvent(new WheelEvent('wheel',{bubbles:true,deltaY:-500}));
    el.scrollTo({top:0,behavior:'instant'});
   });
   await page.getByRole('button',{name:'Về tin nhắn mới nhất'}).waitFor();
   assert.equal(await thread.evaluate(el=>el.scrollTop),0);
   // Desktop reselects the active row. Mobile returns to the list and reopens it.
   await selectChat(12);
   assert.equal(await text.inputValue(),'Bản nháp mới');
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
    const members=[{id:7,title:'Nhóm thử',member_count:2}];
    await page.route('**/api/groups',r=>r.fulfill({json:{groups:members}}));
    await page.route('**/api/groups/7/messages',r=>{
     if(r.request().method()==='GET'){
      return r.fulfill({json:{messages:history.map(m=>({...m,group_id:7}))}});
     }
     const {body}=r.request().postDataJSON();
     return r.fulfill({json:{message:{id:41,group_id:7,sender_id:9,body,created_at:now}}});
    });
    await page.evaluate(async groups=>{state.groups=groups;await openGroup(7);},members);
    await latest();
    await thread.evaluate(el=>{
     el.dispatchEvent(new WheelEvent('wheel',{bubbles:true,deltaY:-500}));
     el.scrollTo({top:120,behavior:'instant'});
    });
    await page.getByRole('button',{name:'Về tin nhắn mới nhất'}).waitFor();
    await text.fill('Gửi vào nhóm');
    await text.press('Enter');
    await page.locator('#msg-group-41').waitFor();
    await latest();

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
