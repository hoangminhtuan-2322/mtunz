'use strict';
const MESSAGE_CHANNEL='messages';
function summarizeNotificationChannel(permission,channel){
  const permissionStatus=permission===true?'allowed':permission===false?'denied':'unknown';
  if(!channel)return {permission:permissionStatus,channel:'missing',sound:'unknown',vibration:'unknown'};
  return {permission:permissionStatus,channel:channel.importance===0?'blocked':'configured',
    sound:channel.sound===null?'silent':channel.sound==='default'?'default':channel.sound==='custom'?'custom':'unknown',
    vibration:channel.enableVibrate===true?'on':channel.enableVibrate===false?'off':'unknown'};
}
module.exports={MESSAGE_CHANNEL,summarizeNotificationChannel};
