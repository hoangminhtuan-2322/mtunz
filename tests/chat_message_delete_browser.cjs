'use strict';
/* Browser-only UI fixture: no user account creation and no real data mutation. */
const assert=require('node:assert/strict');
const {chromium}=require('playwright-core');
(async()=>{
 const browser=await chromium.launch({
   executablePath:process.env.CHROME_BIN||'/usr/bin/google-chrome',
   args:['--no-sandbox']
 });
 try{
  for(const width of [320,390,768,1440]){
   const page=await browser.newPage({viewport:{width,height:850},reducedMotion:'reduce'});
   const errors=[];
   page.on('pageerror',e=>errors.push(e.message));
   try{
    await page.route('**/api/messages/42/hide',route=>route.fulfill({
      status:200,contentType:'application/json',body:JSON.stringify({ok:true})
    }));
    await page.route('**/api/messages/8',route=>route.fulfill({
      status:200,contentType:'application/json',
      body:JSON.stringify({messages:[{
        id:41,sender_id:7,recipient_id:8,body:'Tin của tôi',
        created_at:Date.now()/1000,reactions:[]
      }]})
    }));
    await page.route('**/api/groups/2/messages/202/hide',route=>route.fulfill({
      status:200,contentType:'application/json',body:JSON.stringify({ok:true})
    }));
    await page.route('**/api/groups/2/messages',route=>route.fulfill({
      status:200,contentType:'application/json',body:JSON.stringify({messages:[{
        id:201,sender_id:7,group_id:2,body:'Tin của tôi trong nhóm',
        username:'Người gửi',created_at:Date.now()/1000,reactions:[]
      }]})
    }));
    await page.route('**/api/groups/2/read',route=>route.fulfill({
      status:200,contentType:'application/json',body:JSON.stringify({ok:true})
    }));
    await page.goto('http://127.0.0.1:8791/');
    await page.locator('form').first().waitFor();
    await page.evaluate(()=>{
     const now=Math.floor(Date.now()/1000);
     Object.assign(state,{
      user:{id:7,username:'delete_ui',display_name:'Người gửi',
        show_online:true,show_receipts:true},
      tab:'messages',selected:8,groupSelected:null,
      groups:[],notices:[],friends:[{
        other_id:8,username:'Bạn chat',display_name:'Bạn chat',
        state:'accepted',online:false,unread:0
      }],
      messages:[
       {id:41,sender_id:7,recipient_id:8,body:'Tin của tôi',created_at:now,reactions:[]},
       {id:42,sender_id:8,recipient_id:7,body:'Tin người khác',created_at:now,reactions:[]}
      ],replyTo:null,pendingAttachment:null
     });
     renderApp();
    });
    const controls=page.locator('button.message-delete-menu-trigger');
    assert.equal(await controls.count(),2);
    assert.equal(await controls.first().isVisible(),true);
    await page.locator('[data-act="message-options"][data-id="42"]').click();
    assert.equal(await page.locator('.message-delete-choice').count(),1,
      'Received messages may only be deleted for me');
    await page.locator('#dialog-close').click();
    await page.locator('[data-act="message-options"][data-id="41"]').click();
    assert.equal(await page.locator('.message-delete-choice').count(),2,
      'Own messages may be hidden or recalled globally');
    await page.locator('#dialog-close').click();
    await page.locator('[data-act="message-options"][data-id="42"]').click();
    await page.locator('.message-delete-choice[data-act="message-hide"]').click();
    await page.locator('#modal-confirm').click();
    await page.waitForFunction(()=>!document.querySelector('#msg-dm-42'));
    assert.equal(await page.locator('#msg-dm-41').count(),1,
      'Deleting one message leaves the other intact');

    await page.evaluate(()=>{
      const now=Math.floor(Date.now()/1000);
      state.tab='groups';state.selected=null;state.groupSelected=2;
      state.groups=[{id:2,title:'Nhóm thử',description:'',member_count:2,
        role:'owner',created_by:7,last_read_id:0,unread:0}];
      state.groupMessages=[
       {id:201,group_id:2,sender_id:7,body:'Tin của tôi trong nhóm',username:'Người gửi',created_at:now,reactions:[]},
       {id:202,group_id:2,sender_id:8,body:'Tin người khác trong nhóm',username:'Bạn chat',created_at:now,reactions:[]}
      ];
      renderApp();
    });
    await page.locator('[data-act="message-options"][data-id="202"]').click();
    assert.equal(await page.locator('.message-delete-choice').count(),1);
    await page.locator('.message-delete-choice[data-act="message-hide"]').click();
    await page.locator('#modal-confirm').click();
    await page.waitForFunction(()=>!document.querySelector('#msg-group-202'));
    assert.equal(await page.locator('#msg-group-201').count(),1);
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true,
      'No horizontal overflow after delete UI at '+width);
    assert.deepEqual(errors,[],'No uncaught JavaScript errors on '+width);
   }finally{await page.close();}
  }
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
