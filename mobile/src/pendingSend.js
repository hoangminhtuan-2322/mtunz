'use strict';
// An immutable logical send identity, with mutable delivery bookkeeping only.
// In-memory, session-scoped; no automatic resend or offline background worker.
function createPendingSend(room,draft,file,replyId,alias,nonce){
  if(!room||!['dm','group','world'].includes(room.scope)||!Number.isSafeInteger(Number(room.id))||Number(room.id)<=0)throw Error('Invalid room');
  return {scope:room.scope,roomId:room.id,originalDraft:draft,body:draft.trim(),file:file?{...file}:null,
    replyId:replyId||null,alias:alias||'',nonce,attachmentId:null,attempted:false};
}
async function deliverPendingSend(item,{upload,send,progress}){
  if(item.scope==='world'&&item.attempted)throw Error('World delivery not idempotent');
  if(item.file&&!item.attachmentId){
    progress('upload');
    item.attachmentId=await upload(item.file,item.nonce);
  }
  progress('send');
  const data={body:item.body,attachment_id:item.attachmentId||null};
  let endpoint;
  if(item.scope==='dm'){endpoint='/api/messages';Object.assign(data,{recipient_id:item.roomId,reply_to:item.replyId,client_message_id:item.nonce});}
  else if(item.scope==='group'){endpoint='/api/groups/'+item.roomId+'/messages';Object.assign(data,{reply_to:item.replyId,client_message_id:item.nonce});}
  else{endpoint='/api/world/messages';Object.assign(data,{room_id:item.roomId,anonymous_name:item.alias});}
  item.attempted=true;
  return send(endpoint,data);
}
module.exports={createPendingSend,deliverPendingSend};
