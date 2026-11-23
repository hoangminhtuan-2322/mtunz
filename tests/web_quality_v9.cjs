'use strict';
/* Real browser regression: large contact lists, keyboard navigation,
   realtime banner and Admin form focus must work on mobile and desktop. */
const assert=require('node:assert/strict');
const {chromium}=require('playwright-core');
(async()=>{
 const browser=await chromium.launch({
  executablePath:process.env.CHROME_BIN||'/usr/bin/google-chrome',
  args:['--no-sandbox']
 });
 try{
  for(const width of [320,390,1440]){
   const page=await browser.newPage({
    viewport:{width,height:780},hasTouch:width<800,reducedMotion:'reduce'
   });
   await page.route(/\/api\/messages\/\d+(?:\?.*)?$/,route=>
    route.fulfill({json:{messages:[],first_unread_id:null,more_after:false}}));
   await page.goto('http://127.0.0.1:8791/');
   await page.locator('form').first().waitFor();
   await page.evaluate(()=>{
    state.user={id:9,username:'demo',display_name:'Demo',public_id:9};
    state.tab='messages';
    state.selected=null;
    state.friends=Array.from({length:180},(_,i)=>({
      state:'accepted',other_id:i+10,username:'Bạn '+String(i+1).padStart(3,'0'),
      display_name:'Bạn '+String(i+1).padStart(3,'0'),online:i%3===0
    }));
    renderApp();
   });
   const chats=page.locator('#side-items button[data-act="open-chat"]');
   assert.equal(await chats.count(),60,'Initial sidebar must be DOM-bounded at '+width);
   await page.locator('#side-items [data-act="sidebar-more"]').click();
   assert.equal(await chats.count(),120,'Show more should add 60 contacts');
   await page.locator('#side-filter').fill('Bạn 17');
   assert.equal(await chats.count(),10,'Search must show only relevant matches');
   assert.equal(await page.locator('#side-items .side-more').count(),0);
   await page.locator('#side-filter').fill('');
   assert.equal(await chats.count(),60,'Changing search must reset row cap');
   assert.equal(await chats.first().getAttribute('aria-label'),'Mở trò chuyện với Bạn 001');
   await chats.first().focus();
   await page.keyboard.press('Enter');
   await page.waitForFunction(()=>state.selected===10);
   await page.locator('#chat-messages').waitFor();
   await page.evaluate(()=>window.dispatchEvent(new Event('offline')));
   const banner=page.locator('#mt-realtime-status');
   await banner.waitFor();
   assert.equal(await banner.getByRole('button',{name:'Thử lại'}).count(),1);
   await page.evaluate(()=>v9ConnectionBanner(true));
   await banner.waitFor({state:'detached'});
   await page.evaluate(()=>{
    state.user={id:9,username:'admin',is_admin:true};
    const pane=document.createElement('div');
    pane.className='admin-page';pane.innerHTML='<textarea aria-label="Đang soạn phản hồi"></textarea>';
    document.body.append(pane);
    pane.querySelector('textarea').focus();
    window.__v9AdminReloads=0;
    loadAdmin=async()=>{window.__v9AdminReloads++;};
    v9ScheduleAdminRefresh(5);
   });
   await page.waitForTimeout(70);
   assert.equal(await page.evaluate(()=>window.__v9AdminReloads),0,
    'Incoming Admin event must not replace an active input');
   await page.locator('.admin-page textarea').evaluate(el=>el.blur());
   await page.waitForFunction(()=>window.__v9AdminReloads===1,{timeout:2000});
   const at=Math.floor(Date.now()/1000);
   await page.route('**/api/admin/online-users',route=>route.fulfill({json:{
    total:1,checked_at:at,users:[{id:12,public_id:100012,username:'online_member',
      display_name:'Thành viên online',sessions:1,connections:2,last_seen:at}]
   }}));
   await page.route('**/api/admin/users/12/details',route=>route.fulfill({json:{
    user:{id:12,username:'online_member',display_name:'Thành viên online',session_count:1}
   }}));
   await page.evaluate(()=>{
    document.querySelector('body > .admin-page')?.remove();
    state.adminTab='overview';
    state.adminData={stats:{online:1,messages:0}};
    renderAdmin();
   });
   await page.getByRole('button',{name:/Đang online/}).click();
   const online=page.locator('#admin-online-list');
   await online.getByText('1 phiên · 2 kết nối').waitFor();
   await online.getByRole('button',{name:'Chi tiết',exact:true}).click();
   await page.getByRole('heading',{name:'Hồ sơ quản trị: online_member'}).waitFor();
   await page.close();
  }
  console.log('Web V9 browser tests passed on 320px, 390px and desktop.');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
