'use strict';
function maintenanceLabel(status){
  if(!status||typeof status.active!=='boolean'||typeof status.manual!=='boolean')return 'Chưa xác định';
  if(status.active)return status.manual?'Đang bảo trì thủ công':'Đang bảo trì theo lịch';
  return status.schedule?'Đang hoạt động · Có lịch bảo trì':'Đang hoạt động';
}
function canCancelDeletion(row,serverTime){
  return Number.isSafeInteger(row?.user_id)&&row.user_id>0&&Number.isFinite(row.purge_at)&&Number.isFinite(serverTime)&&row.purge_at>serverTime;
}
module.exports={maintenanceLabel,canCancelDeletion};
