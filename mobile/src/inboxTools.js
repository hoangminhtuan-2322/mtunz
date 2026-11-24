'use strict';
// Draft state and bounded history helpers, shared with regression tests.
function conversationKey(room){return room?room.scope+':'+room.id:'';}
function normalizeSearch(value){return String(value||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[đĐ]/g,'d').toLocaleLowerCase('vi-VN').trim();}
function updateDraft(drafts,key,value){if(!key)return drafts;const next={...drafts};delete next[key];if(value.trim())next[key]=value;return next;}
function clearSentDraft(drafts,key,value){return drafts[key]===value?updateDraft(drafts,key,''):drafts;}
function filterInbox(friends,query,filter,connected){
  const q=normalizeSearch(query);
  return friends.filter(f=>f.state==='accepted'&&!f.restricted&&
    (filter==='archived'?!!f.archived:!f.archived)&&
    [f.nickname,f.display_name,f.username].some(v=>normalizeSearch(v).includes(q))&&
    (filter==='unread'?Number(f.unread||0)>0:filter==='online'?connected&&f.online===true:filter==='pinned'?!!f.pinned:true))
    .sort((a,b)=>Number(!!b.pinned)-Number(!!a.pinned)||Number(b.last_message?.created_at||0)-Number(a.last_message?.created_at||0));
}
function sanitizeDrafts(raw){
  if(!raw||typeof raw!=='object'||Array.isArray(raw))return {};
  const entries=Object.entries(raw).filter(([k,v])=>/^(dm|group):[1-9]\d{0,15}$/.test(k)&&typeof v==='string'&&v.trim()).slice(-12);
  return Object.fromEntries(entries.map(([k,v])=>[k,v.slice(0,2000)]));
}
function mergeHydratedDrafts(saved,current,dirty){
  const merged={...sanitizeDrafts(saved),...current};
  for(const key of dirty)if(!(key in current))delete merged[key];
  return merged;
}
function isReplySwipe(g,threshold){return g.dx>=threshold&&g.dx>Math.abs(g.dy)*1.6;}
async function findHistory(existing,id,fetchPage,active,maxPages=8){
  if(existing.some(m=>Number(m.id)===id))return {found:true,rows:[],exhausted:false};
  let cursor=Math.min(...existing.map(m=>Number(m.id)).filter(n=>Number.isSafeInteger(n)&&n>0));
  if(!Number.isFinite(cursor)||id>=cursor)return {found:false,rows:[],exhausted:false};
  const rows=[];
  for(let i=0;i<maxPages&&active();i++){
    const batch=await fetchPage(cursor);
    if(!active())return {found:false,rows:[],exhausted:false};
    const older=batch.filter(m=>Number.isSafeInteger(Number(m.id))&&Number(m.id)>0&&Number(m.id)<cursor);
    rows.push(...older);
    const found=older.some(m=>Number(m.id)===id),exhausted=older.length<70;
    if(found||exhausted)return {found,rows,exhausted};
    cursor=Math.min(...older.map(m=>Number(m.id)));
    if(id>cursor)return {found:false,rows,exhausted:false};
  }
  return {found:false,rows,exhausted:false};
}
module.exports={conversationKey,normalizeSearch,updateDraft,clearSentDraft,filterInbox,sanitizeDrafts,mergeHydratedDrafts,isReplySwipe,findHistory};
