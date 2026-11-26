'use strict';
function createSelectionGuard(){
  let epoch=0,key=null,revision=0;
  return {
    select(id){key=id;epoch++;revision=0;},
    visit(){return key==null?null:{key,epoch};},
    current(v){return !!v&&v.key===key&&v.epoch===epoch;},
    request(){return key==null?null:{key,epoch,revision:++revision};},
    accepts(r){return !!r&&r.key===key&&r.epoch===epoch&&r.revision===revision;}
  };
}
function createActionGate(){
  let busy=false;
  return {enter(){if(busy)return false;busy=true;return true;},leave(){busy=false;}};
}
module.exports={createSelectionGuard,createActionGate};
