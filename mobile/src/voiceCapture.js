'use strict';
// One owner for microphone preparation, recording and finalization.
// Cancellation during permission/prepare waits for that operation to settle
// before allowing another recording; no cancelled URI is delivered.
function createVoiceCapture(){
  let session=null;
  function active(){return !!session;}
  function recording(){return session?.phase==='recording';}
  function release(s){
    if(session===s){session=null;s.ops.busy(false);}
  }
  async function cleanup(s,save){
    if(s.phase==='stopping')return;
    s.phase='stopping';clearTimeout(s.timer);s.ops.busy(true);
    try{
      if(s.prepared)await s.ops.stop();
      if(save&&!s.cancelled&&s.ops.current()){
        const uri=s.ops.uri();if(!uri)throw Error('Không tìm thấy bản ghi âm.');
        s.ops.deliver(uri);
      }
    }catch(error){if(!s.cancelled&&s.ops.current())s.ops.error(error);}
    finally{
      if(s.mode){try{await s.ops.resetMode();}catch{}}
      release(s);
    }
  }
  async function start(ops){
    if(session)return false;
    const s={ops,phase:'starting',cancelled:false,prepared:false,mode:false,timer:null};
    session=s;ops.busy(true);
    const current=()=>!s.cancelled&&ops.current();
    try{
      const permission=await ops.permission();
      if(!current())return false;
      if(!permission.granted)throw Error('Chưa cấp quyền micro để ghi âm.');
      s.mode=true;await ops.enableMode();
      if(!current())return false;
      await ops.prepare();s.prepared=true;
      if(!current())return false;
      ops.record();s.phase='recording';ops.busy(false);
      s.timer=setTimeout(()=>{void cleanup(s,true);},110000);
      return true;
    }catch(error){if(current())ops.error(error);return false;}
    finally{if(s.phase==='starting')await cleanup(s,false);}
  }
  function stop(){return recording()?cleanup(session,true):Promise.resolve();}
  function cancel(){
    if(!session)return;
    session.cancelled=true;
    if(recording())void cleanup(session,false);
  }
  return {active,recording,start,stop,cancel};
}
module.exports={createVoiceCapture};
