'use strict';
// Session-only drafts: no persistent private text storage.
function conversationKey(room){return room?room.scope+':'+room.id:'';}
function normalizeSearch(value){return String(value||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[đĐ]/g,'d').toLocaleLowerCase('vi-VN').trim();}
function updateDraft(drafts,key,value){if(!key)return drafts;const next={...drafts};if(value.trim())next[key]=value;else delete next[key];return next;}
function clearSentDraft(drafts,key,value){return drafts[key]===value?updateDraft(drafts,key,''):drafts;}
function filterInbox(friends,query,filter,connected){
  const q=normalizeSearch(query);
  return friends.filter(f=>f.state==='accepted'&&!f.restricted&&
    (filter==='archived'?!!f.archived:!f.archived)&&
    [f.nickname,f.display_name,f.username].some(v=>normalizeSearch(v).includes(q))&&
    (filter==='unread'?Number(f.unread||0)>0:filter==='online'?connected&&f.online===true:filter==='pinned'?!!f.pinned:true))
    .sort((a,b)=>Number(!!b.pinned)-Number(!!a.pinned)||Number(b.last_message?.created_at||0)-Number(a.last_message?.created_at||0));
}
module.exports={conversationKey,normalizeSearch,updateDraft,clearSentDraft,filterInbox};
