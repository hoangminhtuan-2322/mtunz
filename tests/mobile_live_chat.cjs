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
    const errors=[];
    page.on('pageerror',error=>errors.push(error.message));
    await row.getByRole('button',{name:'Tùy chọn tin nhắn'}).tap();
    const menu=page.getByRole('dialog',{name:'Tùy chọn tin nhắn'});
    try{
     await menu.getByRole('button',{name:'Trả lời',exact:true}).tap({timeout:5000});
    }catch(error){
     error.message+=' at '+width+'px. Dialog: '+await page.locator('#modal-root').innerText()+
      '. Page errors: '+errors.join(', ');
     throw error;
    }
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
   await page.close();
  }
 }finally{await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
