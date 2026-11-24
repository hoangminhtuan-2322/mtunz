'use strict';
const MESSAGE_CATEGORY='mtunz-message-actions-v1',QUICK_REPLY='mtunz-quick-reply',OPEN_CHAT='mtunz-open-chat';
function parsePushResponse(response,binding,defaultAction){
  const data=response?.notification?.request?.content?.data||{};
  const chatId=Number(data.chat_id),action=response?.actionIdentifier;
  if(typeof binding!=='string'||!/^[a-f0-9]{64}$/.test(binding)||data.session_binding!==binding||
    !Number.isSafeInteger(chatId)||chatId<=0)return null;
  if(action!==defaultAction&&action!==OPEN_CHAT&&action!==QUICK_REPLY)return null;
  const scope=data.kind==='dm'?'dm':data.kind==='group'?'group':null;
  if(!scope&&!(data.kind==='support_reply'&&action===defaultAction))return null;
  if(action===QUICK_REPLY){
    const text=typeof response.userText==='string'?response.userText.trim():'';
    if(!scope||!text||text.length>2000)return null;
    return {kind:data.kind,scope,chatId,text};
  }
  return {kind:data.kind,scope,chatId,text:''};
}
function combineReplyDraft(existing,text){
  const draft=typeof existing==='string'?existing:'';
  const result=draft.trim()?draft+'\n'+text:text;
  return result.length<=2000?result:null;
}
module.exports={MESSAGE_CATEGORY,QUICK_REPLY,OPEN_CHAT,parsePushResponse,combineReplyDraft};
