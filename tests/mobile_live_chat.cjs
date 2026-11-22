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
   await page.route(/\/api\/chats\/dm\/12\/shared\?/,r=>{
    const query=new URL(r.request().url()).searchParams;
    if(query.get('kind')==='links'&&query.get('before')){
     return r.fulfill({json:{items:[{id:10,display_name:'Minh',created_at:now,
      links:[{url:'https://docs.example.org/old',host:'docs.example.org'}]}],next_before:null}});
    }
    if(query.get('kind')==='links'){
     return r.fulfill({json:{items:[{id:40,display_name:'Minh',created_at:now,
      links:[{url:'https://example.org/new',host:'example.org'}]}],next_before:40}});
    }
    return r.fulfill({json:{items:query.get('kind')==='files'?[{id:30,display_name:'Minh',created_at:now,
     attachment_id:5,name:'Bản tóm tắt.pdf',size:2048,mime:'application/pdf'}]:
     [{id:20,display_name:'Minh',created_at:now,attachment_id:6,name:'Đoạn phim.mp4',size:4096,mime:'video/mp4'}],
     next_before:null}});
   });
   const libraryButton=page.getByRole('button',{name:'Nội dung đã chia sẻ'});
   await libraryButton.click();
   await page.locator('.chat-library-media video[preload="none"]').waitFor();
   assert.equal(await page.getByRole('link',{name:'Tải video Đoạn phim.mp4'}).getAttribute('href'),'/api/attachments/6?download=1');
   await page.getByRole('button',{name:'Liên kết',exact:true}).click();
   await page.locator('a[href="https://example.org/new"]').waitFor();
   await page.getByRole('button',{name:'Xem thêm',exact:true}).click();
   await page.locator('a[href="https://docs.example.org/old"]').waitFor();
   assert.equal(await page.locator('.chat-library-list a').count(),2);
   await page.getByRole('button',{name:'Tệp',exact:true}).click();
   assert.equal(await page.getByRole('link',{name:/Bản tóm tắt/}).getAttribute('href'),'/api/attachments/5?download=1');
   assert(await page.locator('.chat-library').evaluate(el=>el.scrollWidth<=el.clientWidth+1));
   await page.locator('#modal-confirm').click();

   await page.route('**/api/chats/12/nickname',r=>r.fulfill({json:{nickname:r.request().postDataJSON().nickname}}));
   await page.locator('.chat-header-more summary').click();
   await page.locator('[data-chat-nickname="12"]').click();
   await page.locator('#chat-nickname').fill('Minh 🐱');
   await page.locator('#modal-confirm').click();
   await page.locator('.main-head h3').filter({hasText:'Minh 🐱'}).waitFor();
   assert(await page.locator('.main-head').evaluate(el=>el.scrollWidth<=el.clientWidth+1));
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
   // React while reading history. Keep the viewport, draft, and unrelated rows intact.
   let reactionRequests=0,unexpectedHistoryFetches=0;
   await page.route('**/api/messages/12',r=>{
    unexpectedHistoryFetches++;
    return r.fulfill({json:{messages:history}});
   });
   await page.route('**/api/messages/14/reaction',r=>{
    reactionRequests++;
    return r.fulfill({json:{ok:true,message_id:14,user_id:9,emoji:'❤️',active:true}});
   });
   const target=page.locator('#msg-dm-14');
   await thread.evaluate(async el=>{
    el.dispatchEvent(new WheelEvent('wheel',{bubbles:true,deltaY:-500}));
    const row=el.querySelector('#msg-dm-14');
    el.scrollTop+=row.getBoundingClientRect().top-el.getBoundingClientRect().top-95;
    await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));
   });
   const targetTop=()=>target.evaluate(el=>el.getBoundingClientRect().top);
   const top=await targetTop();
   if(width<800){
    await target.getByRole('button',{name:'Tùy chọn tin nhắn'}).tap();
    await page.getByRole('button',{name:'Thả ❤️',exact:true}).tap();
   }else await target.locator('.bubble-actions [data-emoji="❤️"]').click();
   await target.locator('.reaction-chip').filter({hasText:'❤️ 1'}).waitFor();
   assert(Math.abs((await targetTop())-top)<=1,'Reacting must preserve the visible row');
   await page.evaluate(()=>extraSocket({type:'message-reaction',peer_id:12,message_id:1,user_id:12,emoji:'👍',active:true}));
   await page.locator('#msg-dm-1 .reaction-chip').waitFor({state:'attached'});
   assert(Math.abs((await targetTop())-top)<=1,'Reaction above the viewport must preserve the visible row');
   await page.evaluate(({now})=>extraSocket({
    type:'message-updated',peer_id:12,message_id:1,body:'Tin đã sửa\nNội dung dài hơn',edited_at:now,deleted_at:null
   }),{now});
   assert.equal(await page.locator('#msg-dm-1 .bubble > div').first().textContent(),'Tin đã sửa\nNội dung dài hơn');
   assert(Math.abs((await targetTop())-top)<=1,'Editing above the viewport must preserve the visible row');
   const recall=await page.evaluate(async now=>{
    const thread=document.querySelector('#chat-messages');
    const row=document.querySelector('#msg-dm-14');
    const geometry=()=>({
     top:row.getBoundingClientRect().top,viewport:thread.getBoundingClientRect().top,
     scroll:thread.scrollTop,height:thread.scrollHeight,following:thread.dataset.followChatEnd,
     first:document.querySelector('#msg-dm-1').getBoundingClientRect().height,
     root:window.scrollY,anchor:getComputedStyle(thread).overflowAnchor
    });
    const before=geometry(),position=captureMutationPosition(thread,document.querySelector('#msg-dm-1'));
    await extraSocket({type:'message-updated',peer_id:12,message_id:1,body:'',edited_at:now,deleted_at:now});
    const immediate=geometry();
    await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));
    return {before,position,immediate,after:geometry()};
   },now);
   await page.locator('#msg-dm-1 .deleted').waitFor({state:'attached'});
   assert(Math.abs((await targetTop())-top)<=1,
    `Recalling above the viewport at ${width}px changed the position ${JSON.stringify(recall)}`);
   assert.equal(reactionRequests,1);
   assert.equal(unexpectedHistoryFetches,0);
   assert.equal(await text.inputValue(),'Bản nháp mới');
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

    // A full page exposes older history and prepending keeps the current first row in place.
    await page.route('**/api/groups/7/messages?before=100',r=>r.fulfill({json:{messages:[
     {id:99,group_id:7,sender_id:9,body:'Trang cũ hơn',created_at:now-120}
    ]}}));
    await page.evaluate(()=>{
     state.groupMessages=Array.from({length:70},(_,i)=>({id:i+100,group_id:7,sender_id:9,
      body:'Lịch sử nhóm '+i,created_at:Math.floor(Date.now()/1000)}));
     paintGroupThread(true);
    });
    await latest();
    const prepend=await page.evaluate(async()=>{
     const thread=document.querySelector('#chat-messages');
     pauseChatFollow(thread);
     thread.scrollTop=85;
     const first=()=>document.querySelector('#msg-group-100').getBoundingClientRect().top;
     const before=first();
     await loadOlderChat(thread);
     return [Math.abs(first()-before),!!thread.querySelector('#msg-group-99'),!!thread.querySelector('.chat-older')];
    });
    assert(prepend[0]<=2&&prepend[1]&&!prepend[2],JSON.stringify(prepend));

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
   await page.evaluate(()=>{
    Object.assign(state.user,{bio:'Giới thiệu chỉ bạn bè',profile_visibility:'friends',public_id:1234567});
    state.tab='profile';
    state.selected=null;
    state.groupSelected=null;
    renderApp();
   });
   await page.getByRole('button',{name:'Xem như người khác'}).click();
   const preview=page.locator('#member-profile-preview');
   await preview.getByText('Giới thiệu chỉ bạn bè').waitFor();
   await page.locator('#member-profile-audience').selectOption('everyone');
   await preview.getByText('Chi tiết hồ sơ đang được giới hạn theo quyền riêng tư.').waitFor();
   assert.equal(await preview.getByText('Giới thiệu chỉ bạn bè').count(),0);
   await page.close();
  }
 }finally{await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
