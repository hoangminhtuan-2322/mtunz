'use strict';
const assert=require('node:assert/strict');
const {chromium}=require('playwright-core');

(async()=>{
 const browser=await chromium.launch({
  executablePath:process.env.CHROME_BIN||'/usr/bin/google-chrome',
  args:['--no-sandbox']
 });
 try{
  for(const width of [390,1440]){
   const page=await browser.newPage({viewport:{width,height:850},reducedMotion:'reduce'});
   const errors=[],saved=[];
   page.on('pageerror',e=>errors.push(e.message));
   await page.route('**/api/admin/tickets/3/messages',async route=>{
    const request=route.request();
    if(request.method()==='POST'){
     const message={id:101+saved.length,ticket_id:3,from_admin:1,
      body:request.postDataJSON().body,created_at:Date.now()/1000};
     saved.push(message);
     return route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({message})});
    }
    return route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({messages:saved})});
   });
   await page.route('**/api/support/tickets/3/messages',async route=>{
    const request=route.request();
    if(request.method()==='POST'){
     const message={id:101+saved.length,ticket_id:3,from_admin:0,
      body:request.postDataJSON().body,created_at:Date.now()/1000};
     saved.push(message);
     return route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({message})});
    }
    return route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({messages:saved})});
   });
   try{
    await page.goto('http://127.0.0.1:8791/');
    await page.locator('form').first().waitFor({state:'visible'});
    await page.evaluate(()=>{
     state.user={id:1,is_admin:true,username:'demo_admin',display_name:'Quản trị',
      pin_length:4};
     state.adminTab='tickets';state.adminTicket=3;
     state.adminData=[{id:3,kind:'other',claim:'Thử nhắn liên tục',
      status:'open',created_at:100}];state.adminTicketMessages=[];
     renderAdmin();
    });
    const input=page.locator('form[data-form="admin-ticket-reply"] textarea');
    await input.waitFor({state:'visible'});
    await input.evaluate(el=>el.dataset.stable='same-node');
    await input.fill('Bản nháp Admin');
    await page.evaluate(()=>{
     appendSupportMessage(true,3,{id:100,ticket_id:3,from_admin:0,
       body:'Tin người dùng đến',created_at:100});
    });
    assert.equal(await input.inputValue(),'Bản nháp Admin');
    assert.equal(await input.evaluate(el=>document.activeElement===el),true);
    for(let n=0;n<2;n++){
     await input.fill('Phản hồi liên tiếp '+n);
     if(width>800)await input.press('Enter');
     else await page.locator('form[data-form="admin-ticket-reply"] button[type=submit]').click();
     await page.waitForFunction(count=>state.adminTicketMessages.length===count,2+n);
     assert.equal(await input.inputValue(),'');
     assert.equal(await input.getAttribute('data-stable'),'same-node');
     assert.equal(await input.evaluate(el=>document.activeElement===el),true);
    }
    assert.equal(saved.length,2);
    assert.deepEqual(saved.map(x=>x.body),['Phản hồi liên tiếp 0','Phản hồi liên tiếp 1']);

    await page.evaluate(()=>{
     state.user=null;state.mode='support';state.supportTicket=3;state.ticketMessages=[];
     renderAuth();
    });
    const guest=page.locator('form[data-form="support-reply"] textarea');
    await guest.waitFor({state:'visible'});
    await guest.fill('Tin của khách');
    await page.locator('form[data-form="support-reply"] button[type=submit]').click();
    await page.waitForFunction(()=>state.ticketMessages.length===1);
    assert.equal(await guest.inputValue(),'');
    assert.equal(await guest.evaluate(el=>document.activeElement===el),true);
    await guest.fill('Bản nháp của khách');
    await page.evaluate(()=>{
     appendSupportMessage(false,3,{id:200,ticket_id:3,from_admin:1,
      body:'Admin trả lời realtime',created_at:200});
    });
    assert.equal(await guest.inputValue(),'Bản nháp của khách');
    assert.equal(await guest.evaluate(el=>document.activeElement===el),true);
    assert.deepEqual(errors,[]);
    console.log('Continuous support chat browser passed at '+width+'px');
   }finally{await page.close();}
  }
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
