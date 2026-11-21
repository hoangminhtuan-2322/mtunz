'use strict';
const assert=require('node:assert/strict');
const {chromium}=require('playwright-core');

(async()=>{
 const browser=await chromium.launch({executablePath:process.env.CHROME_BIN||'/usr/bin/google-chrome',args:['--no-sandbox']});
 try{
  for(const width of [390,1440]){
   const page=await browser.newPage({viewport:{width,height:850},reducedMotion:'reduce'});
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
   await jump.click();
   await jump.waitFor({state:'hidden'});
   assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
   await page.locator('[data-studio="sticker"]').click();
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
   await page.locator('[name="chat-paper"][value="lagoon"]').check();
   await page.route('**/api/me/appearance',r=>r.fulfill({json:{wallpaper:r.request().postDataJSON().wallpaper}}));
   await page.locator('#modal-confirm').click();
   await page.locator('#chat-messages[data-paper="lagoon"]').waitFor();
   assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
   await page.close();
  }
 }finally{await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
