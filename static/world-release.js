/* Chat thế giới: live open/close menu, deterministic scheduled reminders. */
'use strict';
let worldV3LastPoll=0,worldV3Busy=false,worldV3ChangeHandled=0;
let worldV3ClosingKey=0,worldV3Notified=new Set(),worldV3LastRemaining=Infinity;
const worldV3Milestones=[10,60,180,300,900];
const worldV3NoticeName={900:'15 phút',300:'5 phút',180:'3 phút',60:'1 phút',10:'10 giây'};
async function worldV3RefreshStatus(){
 if(worldV3Busy||!state.user||state.user.is_admin)return;
 worldV3Busy=true;
 const before=state.worldData?.status;
 try{
  await loadWorldStatus();
  const after=state.worldData?.status;
  if(!after)return;
  const changed=!before||before.open!==after.open||before.enabled!==after.enabled
    ||before.next_change_at!==after.next_change_at;
  if(changed){
   if(state.tab==='world')await loadWorld(true);
   else if(document.querySelector('.shell:not(.admin-shell)'))renderApp();
   if(before&&before.open!==after.open){
    toast(after.open?'🌍 Chat thế giới đã mở!':'🔒 Chat thế giới đã đóng theo lịch của Admin. Lịch sử vẫn xem được.','info');
    if(typeof notifyBrowser==='function'&&document.hidden)
      notifyBrowser(after.open?'Chat thế giới đã mở':'Chat thế giới đã đóng, lịch sử còn xem được');
   }
  }
 }catch(err){/* Network changes are retried; never assume room open. */}
 finally{worldV3Busy=false;}
}
function worldV3TimerTick(){
 if(!state.user||state.user.is_admin)return;
 const nowSec=worldClock();
 const current=state.worldData?.status;
 const interval=document.hidden?30:15;
 if(nowSec-worldV3LastPoll>=interval && !worldV3Busy){
  worldV3LastPoll=nowSec;worldV3RefreshStatus();
 }
 if(!current)return;
 const closeAt=Number(current.open&&current.schedule_enabled&&current.next_change_at)||0;
 const el=document.getElementById('world-close-countdown');
 if(closeAt&&el)el.textContent=worldCountdown(closeAt);
 if(!closeAt){
  worldV3ClosingKey=0;worldV3Notified.clear();worldV3LastRemaining=Infinity;return;
 }
 if(closeAt!==worldV3ClosingKey){
  worldV3ClosingKey=closeAt;worldV3Notified.clear();worldV3LastRemaining=Infinity;
 }
 const remaining=Math.max(0,closeAt-nowSec);
 if(remaining<=0){
  if(worldV3ChangeHandled!==closeAt){
   worldV3ChangeHandled=closeAt;worldV3RefreshStatus();
  }
  return;
 }
 const due=worldV3Milestones.find(x=>remaining<=x&&!worldV3Notified.has(x));
 if(due!==undefined&&worldV3LastRemaining>due){
  // If a user joins when already near closing, show only the nearest warning.
  for(const x of worldV3Milestones)if(x>=due)worldV3Notified.add(x);
  const message='⏳ Chat thế giới sẽ tự động đóng sau '+worldV3NoticeName[due]+'. Bạn vẫn xem được lịch sử và phương tiện.';
  toast(message,'info');
  if(typeof notifyBrowser==='function'&&document.hidden)notifyBrowser(message);
 }
 worldV3LastRemaining=remaining;
}
setInterval(worldV3TimerTick,1000);
document.addEventListener('visibilitychange',()=>{
 if(!document.hidden&&state.user&&!state.user.is_admin){
  worldV3LastPoll=0;worldV3RefreshStatus();
 }
});
