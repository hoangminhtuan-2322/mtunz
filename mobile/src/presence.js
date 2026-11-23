'use strict';
// Same public presence rules as static/app.js friendLastActiveText and
// adminLastActivityRelative. Do not infer presence from login sessions.
// Server filters show_online/profile visibility and publishes exact last_seen.
const validSeconds=value=>{
  const seconds=Number(value);
  return Number.isFinite(seconds)&&seconds>0&&seconds<1e11?seconds:0;
};
const exactTime=seconds=>new Date(seconds*1000).toLocaleString('vi-VN',{
  day:'2-digit',month:'2-digit',year:'numeric',hour:'2-digit',minute:'2-digit'});
function friendLastActiveText(seconds,clock=Date.now()){
  const stamp=validSeconds(seconds);
  if(!stamp)return '';
  const elapsed=Math.max(0,Math.floor(clock/1000-stamp));
  const exact=exactTime(stamp);
  if(elapsed<60)return 'Vừa hoạt động · '+exact;
  if(elapsed<3600)return 'Hoạt động '+Math.floor(elapsed/60)+' phút trước · '+exact;
  if(elapsed<86400)return 'Hoạt động '+Math.floor(elapsed/3600)+' giờ trước · '+exact;
  return 'Hoạt động gần nhất: '+exact;
}
function adminLastActivityRelative(seconds,online=false,clock=Date.now()){
  const ts=validSeconds(seconds);
  if(online)return 'Đang trực tuyến';
  if(!ts)return 'Chưa ghi nhận';
  const age=Math.max(0,Math.floor((clock-ts*1000)/1000));
  if(age<60)return 'Vừa xong';
  if(age<3600)return Math.floor(age/60)+' phút trước';
  if(age<86400)return Math.floor(age/3600)+' giờ trước';
  const day=new Date(clock),seen=new Date(ts*1000);
  const midnight=new Date(day.getFullYear(),day.getMonth(),day.getDate()).getTime();
  if(seen.getTime()>=midnight-86400000&&seen.getTime()<midnight)
    return 'Hôm qua '+seen.toLocaleTimeString('vi-VN',{hour:'2-digit',minute:'2-digit'});
  if(age<7*86400)return Math.floor(age/86400)+' ngày trước';
  return seen.toLocaleDateString('vi-VN');
}
// A stale cached online flag is not proof of activity when OUR socket is offline.
function friendPresence(friend,connected=true,clock=Date.now()){
  if(!connected)return {online:false,kind:'syncing',short:'Đang đồng bộ trạng thái',
    detail:'Đang kết nối lại để cập nhật trạng thái'};
  if(friend?.online===true)return {online:true,kind:'online',
    short:'Đang hoạt động',detail:'Đang hoạt động'};
  const last=validSeconds(friend?.last_seen);
  if(!last)return {online:false,kind:'hidden',short:'',detail:''};
  const full=friendLastActiveText(last,clock);
  return {online:false,kind:'last-seen',
    short:full.split(' · ')[0],detail:full};
}
function adminPresence(user,clock=Date.now()){
  const timestamp=validSeconds(user?.last_active_at)||validSeconds(user?.last_seen);
  return {online:user?.online===true,short:adminLastActivityRelative(timestamp,user?.online===true,clock),
    exact:timestamp?exactTime(timestamp):'',last_seen:timestamp};
}
module.exports={validSeconds,exactTime,friendLastActiveText,adminLastActivityRelative,friendPresence,adminPresence};
