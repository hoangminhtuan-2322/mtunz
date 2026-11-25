'use strict';
function maintenanceLabel(status){
  if(!status||typeof status.active!=='boolean'||typeof status.manual!=='boolean')return 'Chưa xác định';
  if(status.active)return status.manual?'Đang bảo trì thủ công':'Đang bảo trì theo lịch';
  return status.schedule?'Đang hoạt động · Có lịch bảo trì':'Đang hoạt động';
}
function canCancelDeletion(row,serverTime){
  return Number.isSafeInteger(row?.user_id)&&row.user_id>0&&Number.isFinite(row.purge_at)&&Number.isFinite(serverTime)&&row.purge_at>serverTime;
}
// Explicit Vietnam time (UTC+7), independent of device timezone and locale.
function parseVietnamDateTime(value){
  if(typeof value!=='string')return null;
  const m=/^(\d{4})-(\d{2})-(\d{2}) (\d{2}):(\d{2})$/.exec(value.trim());
  if(!m)return null;
  const [y,mo,d,h,min]=m.slice(1).map(Number);
  if(y<2020||y>2100||mo<1||mo>12||d<1||d>31||h>23||min>59)return null;
  const utc=Date.UTC(y,mo-1,d,h,min);
  const check=new Date(utc);
  if(check.getUTCFullYear()!==y||check.getUTCMonth()!==mo-1||check.getUTCDate()!==d)return null;
  return utc/1000-7*3600;
}
function formatVietnamDateTime(seconds){
  if(!Number.isFinite(seconds))return '—';
  return new Date((seconds+7*3600)*1000).toISOString().slice(0,16).replace('T',' ');
}
function validateSchedule(start,end,reason,serverTime){
  const starts_at=parseVietnamDateTime(start),ends_at=parseVietnamDateTime(end);
  const why=typeof reason==='string'?reason.trim():'';
  if(!Number.isFinite(serverTime))return {error:'Chưa xác nhận được thời gian máy chủ.'};
  if(starts_at===null||ends_at===null)return {error:'Nhập thời gian theo mẫu YYYY-MM-DD HH:mm (giờ Việt Nam).'};
  if(starts_at<serverTime+30||starts_at>serverTime+30*86400)return {error:'Bắt đầu sau ít nhất 30 giây và trong 30 ngày tới.'};
  if(ends_at<starts_at+60||ends_at>starts_at+7*86400)return {error:'Thời lượng từ 1 phút đến 7 ngày.'};
  if(!why||why.length>240)return {error:'Nhập lý do từ 1 đến 240 ký tự.'};
  return {data:{starts_at,ends_at,reason:why}};
}
module.exports={maintenanceLabel,canCancelDeletion,parseVietnamDateTime,formatVietnamDateTime,validateSchedule};
