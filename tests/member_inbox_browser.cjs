'use strict';
const assert=require('node:assert/strict');
const {chromium}=require('playwright-core');

(async()=>{
 const browser=await chromium.launch({executablePath:process.env.CHROME_BIN||'/usr/bin/google-chrome',args:['--no-sandbox']});
 try{
  for(const width of [320,390,1440]){
   const page=await browser.newPage({viewport:{width,height:850},hasTouch:width<=800,reducedMotion:'reduce'});
   await page.goto('http://127.0.0.1:8791/');
   await page.locator('form').first().waitFor();
   const history=Array.from({length:60},(_,i)=>({id:i+1,sender_id:12,recipient_id:9,body:'Tin nhắn '+i,created_at:100+i,read_at:200}));
   history[59].reply_to=2;
   history[58].attachment={name:'Ảnh mẫu',mime:'image/png',url:'/static/favicon.svg'};
   await page.route('**/api/messages/12',r=>r.fulfill({json:{messages:history}}));
   await page.evaluate(()=>{
    Object.assign(state,{user:{id:9,username:'demo',display_name:'Demo'},tab:'messages',selected:null,
     friends:[{state:'accepted',other_id:12,username:'Minh',last_message:{body:'Chào',created_at:100}}],
     groups:[{id:8,title:'Nhóm bạn',member_count:3,last_message:{body:'Chào nhóm',created_at:110}}]});
    v4WriteDraft('dm:12','Soạn tiếp');renderApp();
   });
   if(width<=800){
    await page.getByRole('button',{name:'Mở hồ sơ cá nhân'}).tap();
    await page.locator('.profile-page').waitFor();
    await page.locator('.rail-nav [data-tab="messages"]').tap();
   }
   if(width>800)assert.match(await page.locator('.start-threads button').first().innerText(),/Nhóm bạn/);
   await page.locator('button[data-filter="drafts"]').click();
   assert.equal(await page.locator('#side-items [data-act="open-group"]').count(),0);
   await page.locator('#side-items [data-act="open-chat"]').click();
   assert.equal(await page.locator('#chat-text').inputValue(),'Soạn tiếp');
   await page.locator('#msg-dm-60').waitFor({state:'attached'});
   await page.locator('#msg-dm-60 .reply-link').click();
   const back=page.locator('#msg-dm-2 .reply-return');
   await back.waitFor();await back.click();
   assert.equal(await page.locator('#msg-dm-60 .reply-link').evaluate(el=>el===document.activeElement),true);
   await page.locator('#msg-dm-59 [data-image-preview]').click();
   await page.locator('.chat-photo-preview img').waitFor();
   assert.equal(await page.locator('.photo-original').getAttribute('target'),'_blank');
   await page.keyboard.press('Escape');
   await page.locator('.chat-photo-preview').waitFor({state:'hidden'});
   await page.evaluate(()=>{document.querySelector('#chat-messages').scrollTop=0;});
   const jump=page.locator('[data-act="thread-latest"]');
   await jump.waitFor();
   await page.evaluate(()=>appendDirectMessage({id:61,sender_id:12,recipient_id:9,body:'Tin đến',created_at:201}));
   assert.match(await jump.innerText(),/1 tin mới/);
   const latest=page.locator('#msg-dm-61');
   assert.equal(await latest.locator('[data-social-action="pin"]').count(),1);
   assert.equal(await latest.locator('[data-social-action="forward"]').count(),1);
   await jump.click();
   await jump.waitFor({state:'hidden'});
   assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
   if(width<=800){
    const toggle=page.getByRole('button',{name:'Công cụ gửi tin'});
    assert.equal(await page.locator('.chat-compose-toolbar').isVisible(),false);
    await toggle.tap();
    assert.equal(await toggle.getAttribute('aria-expanded'),'true');
    await toggle.tap();
    assert.equal(await page.locator('.chat-compose-toolbar').isVisible(),false);
    await toggle.tap();
   }
   await page.locator('[data-studio="sticker"]').click();
   const photo={name:'photo.png',mimeType:'image/png',buffer:Buffer.from(await page.evaluate(()=>{
    const canvas=document.createElement('canvas');
    canvas.width=16;canvas.height=16;
    canvas.getContext('2d').fillRect(0,0,16,16);
    return canvas.toDataURL().split(',')[1];
   }),'base64')};
   await page.locator('[data-sticker-file]').setInputFiles(photo);
   await page.locator('[data-caption]').fill('Xin chào ✨');
   await page.locator('[data-save]').click();
   assert.equal(await page.locator('.sticker-shelf img').count(),1);
   let uploaded=false;
   await page.route('**/api/uploads',r=>{
    uploaded=r.request().postDataBuffer().includes(Buffer.from('mtunz-sticker.png'));
    return r.fulfill({json:{attachment:{id:17,name:'mtunz-sticker.png',mime:'image/png',size:1024,url:'/api/attachments/17'}}});
   });
   await page.locator('#modal-confirm').click();
   await page.locator('.compose-file').waitFor();
   assert(uploaded);
   await page.locator('.chat-header-more summary').click();
   await page.locator('[data-studio="wallpaper"]').click();
   await page.locator('[data-paper-file]').setInputFiles(photo);
   await page.waitForFunction(()=>document.querySelector('.paper-local input').checked);
   await page.locator('#modal-confirm').click();
   await page.waitForFunction(()=>document.querySelector('#chat-messages').style.backgroundImage.includes('data:image/jpeg'));
   await page.locator('.chat-header-more summary').click();
   await page.locator('[data-studio="wallpaper"]').click();
   await page.locator('[name="chat-paper"][value="lagoon"]').check();
   await page.route('**/api/me/appearance',r=>r.fulfill({json:{wallpaper:r.request().postDataJSON().wallpaper}}));
   await page.locator('#modal-confirm').click();
   await page.locator('#chat-messages[data-paper="lagoon"]').waitFor();
   await page.locator('.chat-header-more summary').click();
   await page.locator('[data-studio="bubble"]').click();
   assert.equal(await page.locator('[name="chat-bubble"]').count(),11);
   await page.locator('.bubble-style-grid label').filter({hasText:'Mèo Trốn'}).click();
   await page.locator('.bubble-preview[data-paper="lagoon"][data-bubble-style="cat"]').waitFor();
   assert.equal(await page.locator('#chat-messages').getAttribute('data-bubble-style'),'default');
   await page.locator('#modal-confirm').click();
   await page.locator('#chat-messages[data-bubble-style="cat"]').waitFor();
   await page.evaluate(()=>renderApp());
   await page.locator('#chat-messages[data-bubble-style="cat"]').waitFor();
   assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
   const groupHistory=[{id:101,sender_id:12,username:'Minh',body:'Tin nhóm cũ',created_at:300}];
   await page.route('**/api/groups/8/read',r=>r.fulfill({json:{ok:true}}));
   let finishHistory;
   const delayedHistory=new Promise(resolve=>{finishHistory=resolve;});
   await page.route('**/api/groups/8/messages',async r=>{
    if(r.request().method()==='POST'){
     const {body}=r.request().postDataJSON();
     return r.fulfill({json:{message:{id:104,sender_id:9,body,created_at:303}}});
    }
    await delayedHistory;
    return r.fulfill({json:{messages:groupHistory}});
   });
   await page.evaluate(()=>{void openGroup(8);});
   await page.evaluate(()=>appendGroupMessage(8,{id:102,sender_id:12,username:'Minh',body:'Tin đến trong lúc tải',created_at:301}));
   finishHistory();
   await page.locator('#msg-group-101').waitFor();
   assert.equal(await page.locator('#chat-messages').getAttribute('data-bubble-style'),'default');
   await page.locator('#msg-group-102').waitFor();
   const original=await page.locator('#msg-group-101').elementHandle();
   await page.evaluate(()=>appendGroupMessage(8,{id:103,sender_id:12,username:'Minh',body:'Tin đến tiếp theo',created_at:302}));
   await page.locator('#msg-group-103').waitFor();
   assert(await original.evaluate(el=>el.isConnected),'Ordinary group arrivals preserve existing message DOM');
   await page.locator('#chat-text').fill('Gửi từ khung chat nhóm');
   await page.getByRole('button',{name:'Gửi tin nhắn',exact:true}).click();
   await page.locator('#msg-group-104').waitFor();
   assert.equal(await page.locator('#chat-text').inputValue(),'');
   const field=page.locator('#chat-text');
   await field.fill('Bản nháp đang soạn');
   await page.route('**/api/world/status',r=>r.fulfill({json:{open:true}}));
   await page.evaluate(()=>refreshWorldNavigation());
   assert.equal(await field.inputValue(),'Bản nháp đang soạn');
   assert(await field.evaluate(el=>el===document.activeElement),'Status refresh keeps the composer focused');
   await page.route('**/api/notifications',r=>r.fulfill({status:503,json:{detail:'Thông báo đang tạm gián đoạn'}}));
   await page.locator('.rail-nav [data-tab="notices"]').click();
   await page.getByText('Thông báo đang tạm gián đoạn',{exact:true}).waitFor();
   assert.equal(await page.evaluate(()=>state.tab),'groups');
   assert.equal(await field.inputValue(),'Bản nháp đang soạn');
   await page.close();
  }
 }finally{await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
