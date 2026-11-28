'use strict';
function fishingPhase(data,now){
  if(!data?.cast||now>data.cast.expires_at)return 'idle';
  return now<data.cast.bite_at?'wait':'bite';
}
module.exports={fishingPhase};
