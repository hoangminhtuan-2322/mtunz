'use strict';
// Fixed local presets: no remote URLs, account data, or media permissions.
const CHAT_BACKGROUNDS=Object.freeze([
  {id:'midnight',label:'Mặc định',color:'#071320'},
  {id:'ocean',label:'Đại dương',color:'#10334b'},
  {id:'forest',label:'Rừng xanh',color:'#16362d'},
  {id:'plum',label:'Tím đêm',color:'#33213f'},
  {id:'sand',label:'Cát sáng',color:'#e8decc'},
  {id:'mist',label:'Sương sáng',color:'#e3edf5'},
].map(Object.freeze));
function chatBackground(id){return CHAT_BACKGROUNDS.find(option=>option.id===id)||CHAT_BACKGROUNDS[0];}
module.exports={CHAT_BACKGROUNDS,chatBackground};
