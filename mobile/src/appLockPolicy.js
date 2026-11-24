'use strict';
const LOCK_DELAY_MS=30000;
function lockOnResume(enabled,leftAt,now){
  return enabled===true&&Number.isFinite(leftAt)&&(now<leftAt||now-leftAt>=LOCK_DELAY_MS);
}
function lockFlag(value){return value===null?false:value==='enabled'?true:null;}
module.exports={LOCK_DELAY_MS,lockOnResume,lockFlag};
