'use strict';
// Each file is a separate existing server message, with a stable upload/send ID.
// Only server-confirmed items are marked sent. The cursor survives a room switch.
function createMediaBatch(files,makeId){
  if(!Array.isArray(files)||files.length<2||files.length>8)throw Error('Invalid media count');
  return {started:false,caption:'',originalDraft:'',replyId:null,items:files.map(file=>({file,nonce:makeId(),attachmentId:null,sent:false}))};
}
async function runMediaBatch(batch,{active,upload,send,progress,delivered}){
  for(let i=0;i<batch.items.length;i++){
    if(!active())return;
    const item=batch.items[i];if(item.sent)continue;
    if(!item.attachmentId){
      progress('upload',i+1,batch.items.length);
      item.attachmentId=await upload(item.file,item.nonce);
    }
    if(!active())return;
    progress('send',i+1,batch.items.length);
    const result=await send(item,i===0?batch.caption:'',i===0?batch.replyId:null);
    item.sent=true;delivered(result,i);
  }
}
module.exports={createMediaBatch,runMediaBatch};
