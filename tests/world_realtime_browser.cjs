'use strict';
/* World Chat live-update resilience: duplicates, wrong rooms, scroll, drafts,
   and transient network failure. View fixtures only; no account/database writes. */
const assert=require('node:assert/strict');
const {chromium}=require('playwright-core');

(async()=>{
 const browser=await chromium.launch({executablePath:process.env.CHROME_BIN||'/usr/bin/google-chrome',args:['--no-sandbox']});
 try{
  for(const width of [390,1440]){
   const page=await browser.newPage({viewport:{width,height:820},reducedMotion:'reduce'});
   const errors=[];
   page.on('pageerror',err=>errors.push(err.message));
   try{
    await page.goto('http://127.0.0.1:8791/');
    await page.locator('form').first().waitFor();
    await page.evaluate(()=>{
     state.user={id:7,username:'world_test',display_name:'Người thử',world_anonymous:false};
     state.tab='world';state.v6WorldRoom=1;
     state.v6Rooms=[{id:1,title:'Chung',active:true}];
     state.v6Polls=[];state.friends=[];state.groups=[];state.notices=[];
     state.worldData={
      status:{enabled:true,open:true,server_time:Math.floor(Date.now()/1000),
        warnings:0,strikes:0,schedule_enabled:false,slow_seconds:0},
      messages:Array.from({length:55},(_,i)=>({
       id:i+1,room_id:1,sender_id:8,display_name:'Thành viên',
       body:'Tin '+i+' với một dòng nội dung minh họa khá dài để kiểm tra cuộn',
       created_at:Math.floor(Date.now()/1000)
      }))
     };
     renderApp();
    });
    const before=await page.locator('.world-message').count();
    assert.equal(before,55);
    const scrollable=await page.evaluate(()=>{
      const f=document.querySelector('#world-feed');
      return f.scrollHeight>f.clientHeight;
    });
    assert(scrollable,'World feed needs its own scrolling viewport');
    await page.evaluate(()=>{
      const feed=document.querySelector('#world-feed');
      feed.scrollTop=0;
      appendWorldSocket({id:56,room_id:1,sender_id:8,
        display_name:'Người mới',body:'Tin đến khi đọc lịch sử',
        created_at:Math.floor(Date.now()/1000)});
    });
    assert.equal(await page.locator('.world-message').count(),56);
    assert.equal(await page.locator('#world-feed').evaluate(e=>e.scrollTop),0,
      'Receiving messages while reading older history does not scroll-jump');
    // First let a simulated *user scroll* settle in a separate frame.
    // Assigning scrollTop and appending in one JS turn can be undone by
    // browser scroll anchoring before the layout flush.
    await page.locator('#world-feed').evaluate(feed=>{feed.scrollTop=feed.scrollHeight;});
    await page.waitForFunction(()=>{
      const feed=document.querySelector('#world-feed');
      return feed&&feed.scrollHeight-feed.scrollTop-feed.clientHeight<8;
    });
    await page.evaluate(()=>{
      window.__worldScrollTrace=[];
      const f=document.querySelector('#world-feed');
      window.__worldScrollTrace.push({phase:'before',top:f.scrollTop,height:f.scrollHeight,client:f.clientHeight});
      const previous=worldFollowBottom;
      worldFollowBottom=function(feed){
        window.__worldScrollTrace.push({phase:'called',top:feed.scrollTop,height:feed.scrollHeight,client:feed.clientHeight});
        previous(feed);
        window.__worldScrollTrace.push({phase:'after',top:feed.scrollTop,height:feed.scrollHeight,client:feed.clientHeight});
        requestAnimationFrame(()=>window.__worldScrollTrace.push({
          phase:'raf',top:feed.scrollTop,height:feed.scrollHeight,client:feed.clientHeight,
          connected:feed.isConnected
        }));
      };
      appendWorldSocket({id:57,room_id:1,sender_id:8,
        display_name:'Người mới',body:'Tin gần cuối',
        created_at:Math.floor(Date.now()/1000)});
    });
    // CSS may animate a scroll into view. Wait for layout/paint to settle
    // before checking the final at-bottom position.
    await page.waitForTimeout(180);
    const metrics=await page.locator('#world-feed').evaluate(e=>({
      top:e.scrollTop,height:e.scrollHeight,client:e.clientHeight,
      behavior:getComputedStyle(e).scrollBehavior
    }));
    const gap=metrics.height-metrics.top-metrics.client;
    assert(gap<16,'Near-bottom user follows latest messages: '+JSON.stringify(metrics)+
      ' trace='+JSON.stringify(await page.evaluate(()=>window.__worldScrollTrace)));
    await page.evaluate(()=>{
      appendWorldSocket({id:57,room_id:1,sender_id:8,body:'Trùng',created_at:0});
      appendWorldSocket({id:999,room_id:2,sender_id:8,body:'Sai phòng',created_at:0});
    });
    assert.equal(await page.locator('.world-message').count(),57,'No duplicates or cross-room leakage');
    await page.locator('#world-compose-text').fill('Bản nháp vẫn còn');
    await page.route('**/api/world/messages?room_id=1',route=>route.abort('failed'));
    const stateAfterFailure=await page.evaluate(async()=>{
      try{await loadWorld(true);}catch(_error){}
      return {
       body:document.querySelector('#world-compose-text')?.value,
       messages:document.querySelectorAll('#world-feed .world-message').length
      };
    });
    assert.equal(stateAfterFailure.body,'Bản nháp vẫn còn');
    assert.equal(stateAfterFailure.messages,57,'Network failure does not discard World history');
    assert.deepEqual(errors,[],'World realtime browser errors at '+width);
   }finally{await page.close();}
  }
 }finally{await browser.close();}
})().catch(err=>{console.error(err);process.exitCode=1;});
