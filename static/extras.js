'use strict';
// mtunz 2: attached files, replies, reactions, groups, notifications, account settings and WebRTC.
Object.assign(state, {
  groups:[], groupSelected:null,groupMessages:[],groupDetail:null,
  replyTo:null,pendingAttachment:null,uploading:false,searchResults:[],call:null
});
Object.assign(Ipaths,{
  group:'<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"/>',
  file:'<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6M8 13h8M8 17h8"/>',
  paperclip:'<path d="m21.4 11.6-8.5 8.5a6 6 0 0 1-8.5-8.5l9.2-9.2a4 4 0 0 1 5.7 5.7l-9.2 9.2a2 2 0 0 1-2.8-2.8l8.5-8.5"/>',
  reply:'<path d="m9 17-5-5 5-5"/><path d="M4 12h10a6 6 0 0 1 6 6v1"/>',
  edit:'<path d="M12 20h9M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z"/>',
  trash:'<path d="M3 6h18M8 6V4h8v2M6 6l1 14h10l1-14M10 10v7M14 10v7"/>',
  bell:'<path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9ZM10 21h4"/>',
  phone:'<path d="M22 16.9v3a2 2 0 0 1-2.2 2A19.8 19.8 0 0 1 3 5.2 2 2 0 0 1 5 3h3a2 2 0 0 1 2 1.7l.7 3a2 2 0 0 1-.6 2l-1.3 1.3a16 16 0 0 0 4.2 4.2l1.3-1.3a2 2 0 0 1 2-.6l3 .7A2 2 0 0 1 22 16.9Z"/>',
  video:'<rect x="2" y="5" width="15" height="14" rx="2"/><path d="m17 10 5-3v10l-5-3"/>',
  x:'<path d="M18 6 6 18M6 6l12 12"/>',
  archive:'<rect x="3" y="3" width="18" height="5" rx="1"/><path d="M5 8v12h14V8M10 12h4"/>',
  mute:'<path d="M9 9v6l-4 3V6l4 3ZM14 9l7 6M21 9l-7 6"/>',
});
const fmtSize = n=>n>=1048576?(n/1048576).toFixed(1)+' MB':Math.max(1,Math.ceil(n/1024))+' KB';
const safeImage = f=>f?.mime?.startsWith('image/');

async function refreshGroups(redraw=false){
 if(!state.user||state.user.is_admin)return;
 const r=await api('/api/groups');state.groups=r.groups;
 if(state.groupSelected&&!state.groups.some(x=>x.id===state.groupSelected)){
    state.groupSelected=null;state.groupDetail=null;state.tab='groups';
 }
 if(redraw){renderSideItems();if(state.tab==='groups')renderApp();}
}
function groupSideItems(){
 const q=(state.sideFilter||'').toLowerCase();
 const list=state.groups.filter(g=>g.title.toLowerCase().includes(q));
 return `<div class="side-label">Nhóm chat · ${list.length}</div>${list.map(g=>`<div class="side-item ${state.groupSelected===g.id&&state.tab==='groups'?'active':''}" data-act="open-group" data-id="${g.id}">
 <div class="avatar sm">#</div><div class="grow"><div class="row between"><b class="name truncate">${esc(g.title)}</b>${g.unread?`<span class="badge-count">${g.unread}</span>`:''}</div><div class="sub">${g.last_message?esc(short(g.last_message.deleted_at?'Tin nhắn đã thu hồi':g.last_message.body||'Đã gửi tệp',30)):`${g.member_count} thành viên`}</div></div></div>`).join('')}`;
}
function groupLobby(){
 const members=state.friends.filter(f=>f.state==='accepted'&&!f.restricted);
 return `<div class="main-body"><div class="section-wrap"><span class="eyebrow">MTUNZ CỘNG ĐỒNG</span><h1 class="section-title">Nhóm trò chuyện</h1><p class="section-lead">Tạo nhóm riêng, thêm bạn bè, chia sẻ hình ảnh và tệp tức thời.</p>
 <div class="card"><h3>${icon('add',18)} Tạo nhóm mới</h3><form data-form="create-group" class="stack" style="margin-top:15px">
 ${inputField('Tên nhóm','title','text','','maxlength="70" minlength="2"')}
 <div class="field"><label>Chọn bạn bè tham gia (ít nhất một người)</label><div class="group-pick">${members.length?members.map(f=>`<label class="group-pick-row"><input type="checkbox" name="member_ids" value="${f.other_id}">${avatar(f.username,false,'sm')} ${esc(f.display_name||f.username)}</label>`).join(''):'<div class="hint">Bạn cần kết bạn với ít nhất một người trước.</div>'}</div></div>
 <button class="btn primary" ${members.length?'':'disabled'}>${icon('group',16)} Tạo nhóm</button></form></div>
 <h3 style="margin:27px 0 12px">Nhóm bạn đang tham gia (${state.groups.length})</h3>
 ${state.groups.length?state.groups.map(g=>`<div class="people-row">${avatar(g.title)}<div class="grow"><b>${esc(g.title)}</b><div class="hint">${g.member_count} thành viên · ${g.unread} tin chưa đọc</div></div><button class="btn ghost sm" data-act="open-group" data-id="${g.id}">Mở nhóm</button></div>`).join(''):'<div class="empty">Bạn chưa tham gia nhóm nào.</div>'}</div></div>`;
}
function groupHeader(){
 const g=state.groups.find(x=>x.id===state.groupSelected);
 if(!g)return '';
 return `<header class="main-head"><button class="btn circle ghost" data-act="back-to-list" title="Trở lại">${icon('back')}</button>
 ${avatar(g.title,false,'sm')}<div class="grow"><h3>${esc(g.title)}</h3><div class="small muted">${g.member_count} thành viên</div></div>
 <button class="btn ghost sm" data-act="search-chat" title="Tìm tin nhắn">${icon('search',17)}</button>
 <button class="btn ghost sm" data-act="group-manage" title="Quản lý thành viên">${icon('users',17)} <span class="button-word">Thành viên</span></button>
 <button class="btn danger sm" data-act="group-leave" title="Rời nhóm">${icon('logout',17)}</button></header>`;
}
function uploadMarkup(m){
 const a=m.attachment;if(!a)return '';
 if(safeImage(a))return `<a href="${esc(a.url)}" target="_blank" rel="noopener" title="Xem ảnh gốc"><img class="attached-image" src="${esc(a.url)}" alt="${esc(a.name)}" loading="lazy"></a>`;
 return `<a class="attachment-link" href="${esc(a.url)}" download>${icon('file',20)} <span><b>${esc(short(a.name,35))}</b><span class="hint">${fmtSize(a.size)} · Nhấn để tải</span></span></a>`;
}
function bubblesFor(messages,isGroup=false){
 if(!messages.length)return '<div class="spacer"></div><div class="empty">Chưa có tin nhắn. Hãy bắt đầu trò chuyện! ✨</div>';
 let html='<div class="spacer"></div>',prevDay='';
 const scope=isGroup?'group':'dm';
 for(const m of messages){
  const day=new Date(m.created_at*1000).toLocaleDateString('vi-VN');
  if(prevDay!==day){html+=`<div class="day-label">${esc(day)}</div>`;prevDay=day;}
  const mine=m.sender_id===state.user.id;
  const reference=messages.find(x=>x.id===m.reply_to);
  const reacted=[...new Set((m.reactions||[]).map(r=>r.emoji))];
  const actions=(!m.deleted_at)?`<div class="bubble-actions">
   <button type="button" data-act="message-reply" data-id="${m.id}" data-scope="${scope}" title="Trả lời">${icon('reply',13)}</button>
   ${['❤️','😂','👍'].map(emoji=>`<button type="button" data-act="message-react" data-id="${m.id}" data-scope="${scope}" data-emoji="${emoji}" title="Thả cảm xúc">${emoji}</button>`).join('')}
   ${mine&&Date.now()/1000-m.created_at<=900?`<button type="button" data-act="message-edit" data-id="${m.id}" data-scope="${scope}" title="Sửa tin nhắn">${icon('edit',13)}</button>`:''}
   ${mine?`<button type="button" data-act="message-delete" data-id="${m.id}" data-scope="${scope}" title="Thu hồi">${icon('trash',13)}</button>`:''}</div>`:'';
  html+=`<div class="bubble-wrap ${mine?'mine':''}" id="msg-${scope}-${m.id}">
    ${isGroup&&!mine?`<div class="group-sender">${esc(m.username||'Thành viên')}</div>`:''}
    <div class="bubble ${mine?'mine':''} ${m.deleted_at?'deleted':''}">
    ${m.reply_to?`<div class="reply-inline">↳ ${reference?esc(short(reference.deleted_at?'Tin nhắn đã thu hồi':reference.body||(reference.attachment?'Tệp đính kèm':'Tin nhắn'),80)):'Đã trả lời tin nhắn'}</div>`:''}
    ${m.deleted_at?'<span class="muted"><i>Tin nhắn đã được thu hồi</i></span>':`${m.body?`<div>${esc(m.body)}</div>`:''}${uploadMarkup(m)}`}
    <div class="stamp">${clock(m.created_at)} ${m.edited_at?'· Đã sửa':''} ${mine&&!isGroup?(m.read_at?'<span class="seen">✓✓ Đã xem</span>':'✓ Đã gửi'):''}</div></div>
    ${reacted.length?`<div class="reaction-row">${reacted.map(emoji=>`<button class="reaction-chip ${(m.reactions||[]).some(r=>r.user_id===state.user.id&&r.emoji===emoji)?'mine':''}" data-act="message-react" data-id="${m.id}" data-scope="${scope}" data-emoji="${emoji}">${emoji} ${(m.reactions||[]).filter(r=>r.emoji===emoji).length}</button>`).join('')}</div>`:''}${actions}</div>`;
 }
 return html;
}
function composerExtras(){
 const a=state.pendingAttachment,m=state.replyTo;
 return `<div class="compose-extra" id="compose-extra">
 ${m?`<div class="compose-reply">↳ Đang trả lời: ${esc(short(m.body||'Tệp đính kèm',80))}<button class="icon-only" data-act="cancel-reply">${icon('x',13)}</button></div>`:''}
 ${a?`<div class="compose-file">${icon('paperclip',15)} ${esc(short(a.name,45))} (${fmtSize(a.size)})<button class="icon-only" data-act="cancel-file">${icon('x',13)}</button></div>`:''}
 ${state.uploading?'<div class="compose-file">Đang tải tệp lên…</div>':''}</div>`;
}
function groupConversation(){
 const g=state.groups.find(x=>x.id===state.groupSelected);
 if(!g)return groupLobby();
 return `<div class="conversation">${groupHeader()}<div class="thread" id="chat-messages">${bubblesFor(state.groupMessages,true)}</div>
 <div class="composer"><div class="typing" id="typing-text"></div>${composerExtras()}
 <form class="compose-row" data-form="send-group-message">
 <label class="btn ghost attachment-button" title="Đính kèm ảnh/tệp">${icon('paperclip',19)}<input class="upload-input" type="file" accept="image/*,.pdf,.txt,.docx,.xlsx,.zip" hidden></label>
 <textarea class="input" name="body" id="chat-text" placeholder="Viết vào nhóm…" maxlength="2000" rows="1"></textarea>
 <button type="submit" class="btn primary send" ${state.uploading?'disabled':''} title="Gửi tin nhắn">${icon('send',20)}</button></form>
 <div class="hint" style="margin-top:7px;font-size:10px">Tối đa 12 MB/tệp · Enter gửi · Shift+Enter xuống dòng</div></div></div>`;
}
async function openGroup(gid){
 state.tab='groups';state.selected=null;state.groupSelected=gid;state.groupMessages=[];state.replyTo=null;state.pendingAttachment=null;
 renderApp();await loadGroupMessages();
}
async function loadGroupMessages(scroll=true){
 const gid=state.groupSelected;if(!gid)return;
 try{
  const result=await api(`/api/groups/${gid}/messages`);
  if(state.groupSelected!==gid)return;
  state.groupMessages=result.messages;
  const box=$('#chat-messages');if(box){const near=box.scrollHeight-box.scrollTop-box.clientHeight<120;box.innerHTML=bubblesFor(state.groupMessages,true);if(scroll||near)box.scrollTop=box.scrollHeight;}
  await post(`/api/groups/${gid}/read`);
  const g=state.groups.find(x=>x.id===gid);if(g)g.unread=0;
  renderSideItems();
 }catch(e){toast(e.message,'error');}
}
function notificationsContent(){
 const ns=state.notices||[];
 return `<div class="main-body"><div class="section-wrap"><span class="eyebrow">TRUNG TÂM THÔNG BÁO</span><h1 class="section-title">Thông báo của bạn</h1>
 <p class="section-lead">Lời mời, hoạt động mới và thông báo từ quản trị viên.</p><div class="row" style="gap:12px;margin-bottom:20px"><button class="btn primary sm" data-act="notice-read">Đánh dấu tất cả đã đọc</button><button class="btn ghost sm" data-act="notice-permission">Bật thông báo trình duyệt</button></div>
 ${ns.length?ns.map(n=>`<div class="people-row ${n.read_at?'':'unread-notice'}">${icon('bell',18)}<div class="grow"><b>${esc(n.body)}</b><div class="hint">${date(n.created_at)}</div></div>${!n.read_at?'<span class="pill good">Mới</span>':''}</div>`).join(''):'<div class="empty">Chưa có thông báo nào.</div>'}</div></div>`;
}
async function loadNotices(){if(!state.user||state.user.is_admin)return;state.notices=(await api('/api/notifications')).notifications;}
function profileSettings(){
 const u=state.user;
 return `<section class="card" style="margin-bottom:18px"><h3>${icon('users',17)} Hồ sơ công khai</h3><form data-form="settings-profile" style="margin-top:14px">
 <div class="field"><label>Tên hiển thị</label><input class="input" name="display_name" value="${esc(u.display_name||'')}" maxlength="50"></div>
 <div class="field"><label>Giới thiệu</label><textarea class="input" name="bio" maxlength="220" rows="2">${esc(u.bio||'')}</textarea></div>
 <label class="profile-check"><input type="checkbox" name="show_online" ${u.show_online?'checked':''}> Hiển thị trạng thái đang hoạt động</label>
 <label class="profile-check"><input type="checkbox" name="show_receipts" ${u.show_receipts?'checked':''}> Cho phép người khác xem trạng thái đã đọc</label>
 <button class="btn primary" style="margin-top:13px">Lưu hồ sơ</button></form></section>
 <section class="card" style="margin-bottom:18px"><h3>${icon('shield',17)} Thông tin liên hệ riêng tư</h3>
 <p class="hint" style="margin:10px 0 14px">Số điện thoại và email không hiển thị trên hồ sơ công khai.</p>
 <form data-form="settings-contact">
  <div class="field"><label>Số điện thoại</label><input class="input" name="phone" type="tel" autocomplete="tel" inputmode="tel" maxlength="40" required value="${esc(u.phone||'')}"></div>
  <div class="field"><label>Email / Gmail (không bắt buộc)</label><input class="input" name="email" type="email" autocomplete="email" maxlength="254" value="${esc(u.email||'')}"></div>
  <button class="btn primary" type="submit">Lưu thông tin liên hệ</button>
 </form></section>
 <section class="card"><h3>${icon('shield',17)} Dữ liệu & phiên đăng nhập</h3><p class="hint">Tải dữ liệu tài khoản hoặc đăng xuất toàn bộ thiết bị khác.</p>
 <div class="row" style="margin-top:14px;gap:10px;flex-wrap:wrap"><a class="btn ghost sm" href="/api/me/export">${icon('file',15)} Xuất dữ liệu JSON</a>
 <button class="btn ghost sm" data-act="list-sessions">${icon('lock',15)} Phiên đăng nhập</button>
 <button class="btn danger sm" data-act="revoke-sessions">Đăng xuất thiết bị khác</button>
 ${state.savedDevice?`<button class="btn ghost sm" data-act="lock-device">${icon('lock',15)} Khóa bằng PIN</button>`:''}
 </div>
 <div class="remember-settings-note">${icon('shield',17)} ${state.savedDevice?
  'Thiết bị này đã được ghi nhớ 30 ngày. Khi đóng tab rồi mở phiên mới, bạn cần dùng PIN để truy cập. Tải lại tab đang hoạt động không yêu cầu nhập PIN. Đăng xuất sẽ xóa thiết bị đã lưu.':
  'Bạn có thể bật “Ghi nhớ thiết bị” ở bước nhập PIN khi đăng nhập. Không lưu mật khẩu hay mã PIN trên trình duyệt.'}</div></section>`;
}
function deviceDate(timestamp){
 return timestamp?new Date(timestamp*1000).toLocaleString('vi-VN',{
  year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit'
 }):'Chưa có dữ liệu';
}
function deviceSessionCard(entry,kind){
 const active=!!entry.current;
 const symbol=entry.device_type==='mobile'?'📱':entry.device_type==='tablet'?'▣':'💻';
 const label=esc(entry.label||entry.device_name||'Thiết bị cũ');
 const path=esc(entry.id);
 const category=kind==='session'?'Phiên đăng nhập':'Thiết bị ghi nhớ';
 return `<article class="device-session-card">
  <div class="device-session-heading"><span class="device-session-icon" aria-hidden="true">${symbol}</span>
   <div class="device-session-identity"><b>${label}</b>
    <span>${esc(category)} · ${esc(entry.browser||'Không rõ trình duyệt')}</span></div>
   ${active?'<span class="device-session-current">Thiết bị này</span>':''}
  </div>
  <dl class="device-session-facts">
   <div><dt>Loại thiết bị</dt><dd>${esc(entry.device_name||'Chưa có dữ liệu')}</dd></div>
   <div><dt>Hệ điều hành</dt><dd>${esc(entry.os_name||'Chưa có dữ liệu')}</dd></div>
   <div><dt>Trình duyệt</dt><dd>${esc(entry.browser||'Chưa có dữ liệu')}</dd></div>
   <div><dt>Vị trí gần đúng</dt><dd>${esc(entry.location_hint||'Không xác định')}</dd></div>
   <div><dt>Mạng (IP rút gọn)</dt><dd>${esc(entry.network_hint||'Không có dữ liệu')}</dd></div>
   <div><dt>Lần hoạt động gần nhất</dt><dd>${deviceDate(entry.last_seen)}</dd></div>
   <div><dt>${kind==='session'?'Đăng nhập lúc':'Ghi nhớ từ'}</dt><dd>${deviceDate(entry.created_at)}</dd></div>
   <div><dt>${kind==='session'?'Phiên hết hạn':'Ghi nhớ hết hạn'}</dt><dd>${deviceDate(entry.expires_at)}</dd></div>
  </dl>
  <div class="device-session-actions">
   <button type="button" class="btn ghost sm" data-act="device-rename" data-kind="${kind}" data-device="${path}" data-label="${label}">Đổi tên</button>
   ${kind==='session'&&active?'<span class="device-session-help">Dùng Đăng xuất để kết thúc phiên này.</span>':
     `<button type="button" class="btn danger sm" data-act="device-revoke" data-kind="${kind}" data-device="${path}" data-current="${active}">Thu hồi</button>`}
  </div>
 </article>`;
}
async function showSessionsDialog(){
 const details=await api('/api/me/sessions');
 const sessions=details.sessions||[],devices=details.remembered_devices||[];
 modal({title:'Quản lý phiên & thiết bị',
  description:'Kiểm tra thiết bị đăng nhập, đặt tên cho dễ nhớ và thu hồi quyền truy cập khi cần.',
  content:`<div class="device-session-manager">
   <p class="device-session-privacy">Vị trí chỉ ước lượng theo mạng IP khi có dữ liệu GeoIP. Không sử dụng GPS; thiết bị đã đăng nhập từ trước có thể thiếu thông tin.</p>
   <div class="device-session-section-title"><b>Phiên đang truy cập</b><span>${sessions.length}</span></div>
   ${sessions.map(x=>deviceSessionCard(x,'session')).join('')||'<p class="hint">Không có phiên nào.</p>'}
   <div class="device-session-section-title"><b>Thiết bị được ghi nhớ</b><span>${devices.length}</span></div>
   ${devices.map(x=>deviceSessionCard(x,'remembered')).join('')||'<p class="hint">Chưa có thiết bị được ghi nhớ.</p>'}
   <p class="device-session-privacy">Thu hồi phiên đăng nhập sẽ ngắt quyền truy cập ngay. Thu hồi thiết bị ghi nhớ chỉ xóa quyền mở khóa nhanh bằng PIN, không tự kết thúc một phiên đăng nhập khác.</p>
  </div>`,confirm:'Đóng'});
}
function groupManageDialog(){
 const gid=state.groupSelected;
 if(!gid)return;
 api(`/api/groups/${gid}`).then(({group,members})=>{
  state.groupDetail={group,members};
  const owner=group.role==='owner';
  const friendsToAdd=state.friends.filter(f=>f.state==='accepted'&&!members.some(m=>m.user_id===f.other_id));
  const html=`<div class="group-members">${members.map(m=>`<div class="people-row">${avatar(m.username,false,'sm')}<div class="grow"><b>${esc(m.display_name||m.username)}</b><div class="hint">${m.role==='owner'?'Trưởng nhóm':'Thành viên'}</div></div>
   ${owner&&m.user_id!==state.user.id?`<button class="btn danger sm" data-act="group-kick" data-id="${m.user_id}">Xóa</button>`:''}</div>`).join('')}</div>
   ${owner?`<div class="sep"></div><label class="hint">Tên nhóm</label><input id="group-title" class="input" maxlength="70" value="${esc(group.title)}"><label class="hint">Giới thiệu nhóm</label><textarea id="group-description" class="input" maxlength="350">${esc(group.description||'')}</textarea>
   <div class="sep"></div><h3>Thêm bạn bè</h3><div class="group-pick" id="group-add-members">${friendsToAdd.map(f=>`<label class="group-pick-row"><input type="checkbox" value="${f.other_id}">${esc(f.username)}</label>`).join('')||'<div class="hint">Không còn bạn bè để thêm.</div>'}</div>`:''}`;
   modal({title:'Quản lý nhóm',description:'Danh sách thành viên và quyền quản trị nhóm.',content:html,confirm:owner?'Lưu thay đổi':'Đóng',handler:async host=>{
     if(!owner)return;
     await api(`/api/groups/${gid}`,{method:'PATCH',data:{title:$('#group-title').value,description:$('#group-description').value}});
     const ids=[...host.querySelectorAll('#group-add-members input:checked')].map(x=>Number(x.value));
     if(ids.length)await post(`/api/groups/${gid}/members`,{member_ids:ids});
     await refreshGroups(true);toast('Đã cập nhật nhóm.','ok');
   }});
 }).catch(e=>toast(e.message,'error'));
}
async function showSearch(){
 const group=state.tab==='groups'&&state.groupSelected,chat=group?state.groupSelected:state.selected;
 if(!chat){toast('Chọn cuộc trò chuyện trước.','error');return;}
 const html=`<div class="field" style="margin-top:16px"><input class="input" id="chat-search-key" placeholder="Nhập từ khóa tìm kiếm…" maxlength="100"></div><div id="chat-search-results" class="search-results"></div>`;
 modal({title:'Tìm trong cuộc trò chuyện',description:'Kết quả chỉ từ nội dung bạn có quyền xem.',content:html,confirm:'Tìm kiếm',handler:async()=>{
    const q=$('#chat-search-key').value.trim();if(!q)return false;
    const url=group?`/api/search/messages?q=${encodeURIComponent(q)}&group_id=${chat}`:`/api/search/messages?q=${encodeURIComponent(q)}&other_id=${chat}`;
    const result=await api(url);
    $('#chat-search-results').innerHTML=result.results.length?result.results.map(m=>`<div class="search-hit"><b>${date(m.created_at)}</b><div>${esc(short(m.body,190))}</div></div>`).join(''):'<div class="empty">Không tìm thấy tin nhắn.</div>';
    return false;
 }});
}
async function actOnMessage(btn){
 const id=Number(btn.dataset.id),scope=btn.dataset.scope,group=scope==='group',m=(group?state.groupMessages:state.messages).find(m=>m.id===id);
 if(!m)return;
 const base=group?`/api/groups/${state.groupSelected}/messages/${id}`:`/api/messages/${id}`;
 const action=btn.dataset.act;
 if(action==='message-reply'){
   state.replyTo={id,scope,body:m.body};
   $('#compose-extra').innerHTML=composerExtras();$('#chat-text')?.focus();return;
 }
 if(action==='message-react'){
   await post(`${base}/reaction`,{emoji:btn.dataset.emoji});
   if(group)await loadGroupMessages(false);else await loadMessages(false);
   return;
 }
 if(action==='message-delete'){
   ask('Thu hồi tin nhắn','Tin nhắn sẽ bị thu hồi đối với mọi thành viên trong cuộc trò chuyện.',async()=>{
      await del(base);if(group)await loadGroupMessages(false);else await loadMessages(false);
      toast('Đã thu hồi tin nhắn.','ok');},'Thu hồi',true);
   return;
 }
 if(action==='message-edit'){
   modal({title:'Sửa tin nhắn',description:'Có thể chỉnh sửa trong 15 phút sau khi gửi.',
      content:`<div class="field"><textarea class="input" id="edit-message-body" rows="4" maxlength="2000">${esc(m.body||'')}</textarea></div>`,confirm:'Lưu sửa đổi',
      handler:async()=>{await api(base,{method:'PATCH',data:{body:$('#edit-message-body').value}});if(group)await loadGroupMessages(false);else await loadMessages(false);}});
 }
}
async function extraAction(btn){
 const act=btn.dataset.act,id=Number(btn.dataset.id);
 if(['message-reply','message-react','message-delete','message-edit'].includes(act)){await actOnMessage(btn);return;}
 switch(act){
 case 'open-group':await openGroup(id);break;
 case 'group-manage':groupManageDialog();break;
 case 'group-leave':ask('Rời khỏi nhóm','Bạn sẽ không còn đọc được tin nhắn mới hoặc truy cập tệp của nhóm.',async()=>{
  await del(`/api/groups/${state.groupSelected}/members/${state.user.id}`);state.groupSelected=null;await refreshGroups(true);toast('Đã rời khỏi nhóm.','ok');},'Rời nhóm',true);break;
 case 'group-kick':ask('Xóa thành viên','Người này sẽ mất quyền truy cập nhóm và các tệp trong nhóm.',async()=>{
   await del(`/api/groups/${state.groupSelected}/members/${id}`);await refreshGroups(false);groupManageDialog();},'Xóa thành viên',true);break;
 case 'cancel-reply':state.replyTo=null;$('#compose-extra').innerHTML=composerExtras();break;
 case 'cancel-file':state.pendingAttachment=null;$('#compose-extra').innerHTML=composerExtras();break;
 case 'search-chat':await showSearch();break;
 case 'notice-read':await post('/api/notifications/read');await loadNotices();renderApp();break;
 case 'notice-permission':{
   if(!('Notification' in window))throw Error('Trình duyệt không hỗ trợ thông báo nền.');
   const result=await Notification.requestPermission();toast(result==='granted'?'Đã bật thông báo khi tab còn hoạt động.':'Trình duyệt chưa cấp quyền.',result==='granted'?'ok':'info');break;
 }
 case 'profile-view':{
  const r=(await api(`/api/profile/${id}`)).profile;
  modal({title:'Hồ sơ người dùng',content:`<div class="row">${avatar(r.username,false,'xl')}<div><h3>${esc(r.display_name||r.username)}</h3><div class="hint">@${esc(r.username)}</div></div></div><p>${esc(r.bio||'Chưa có lời giới thiệu.')}</p><p>Tham gia: ${date(r.created_at)}</p>`,confirm:'Đóng'});break;
 }
 case 'mute-chat':case 'archive-chat':{
  const f=state.friends.find(x=>x.other_id===id);if(!f)return;
  const muted=act==='mute-chat'?!f.muted:f.muted,archived=act==='archive-chat'?!f.archived:f.archived;
  await post(`/api/chats/${id}/preferences`,{muted,archived});await refreshFriends(true);
  toast(act==='mute-chat'?(muted?'Đã tắt thông báo hội thoại.':'Đã bật thông báo.'):(archived?'Đã lưu trữ hội thoại.':'Đã bỏ lưu trữ.'),'ok');break;
 }
 case 'revoke-sessions':ask('Đăng xuất các thiết bị khác','Tất cả phiên khác sẽ bị thu hồi ngay lập tức. Thiết bị này vẫn tiếp tục sử dụng.',async()=>{await post('/api/me/sessions/revoke-others');toast('Đã đăng xuất các phiên và thu hồi thiết bị ghi nhớ khác.','ok');},'Thu hồi',true);break;
 case 'list-sessions':await showSessionsDialog();break;
 case 'device-rename':{
  const kind=btn.dataset.kind,device=btn.dataset.device;
  modal({title:'Đặt tên thiết bị',description:'Đặt tên dễ nhận biết, ví dụ: Laptop của tôi hoặc Điện thoại cá nhân.',
   content:`<div class="field"><label for="device-label-input">Tên thiết bị (tối đa 40 ký tự)</label><input class="input" id="device-label-input" maxlength="40" value="${esc(btn.dataset.label||'')}" autocomplete="off"></div>`,
   confirm:'Lưu tên',handler:async()=>{
    const label=$('#device-label-input')?.value?.trim()||'';
    if(!label)throw Error('Vui lòng nhập tên thiết bị.');
    await api('/api/me/sessions/'+kind+'/'+device+'/label',{method:'PATCH',data:{label}});
    toast('Đã cập nhật tên thiết bị.','ok');
    await showSessionsDialog();return false;
   }});
  break;
 }
 case 'device-revoke':{
  const kind=btn.dataset.kind,device=btn.dataset.device;
  const current=btn.dataset.current==='true';
  ask('Thu hồi quyền thiết bị',
   kind==='session'?'Phiên này sẽ bị đăng xuất ngay và không thể truy cập tin nhắn nữa.':
      'Thiết bị sẽ không thể mở khóa nhanh bằng PIN ở lần sau. Phiên đã đăng nhập (nếu có) không bị ảnh hưởng.',
   async()=>{
    await del('/api/me/sessions/'+kind+'/'+device);
    if(kind==='remembered'&&current){state.savedDevice=false;state.rememberedDevice=false;}
    toast(kind==='session'?'Đã thu hồi phiên đăng nhập.':'Đã xóa thiết bị ghi nhớ.','ok');
    await showSessionsDialog();return false;
   },'Thu hồi',true);
  break;
 }
 case 'admin-group-messages':{
  const data=await api(`/api/admin/groups/${id}/messages`);
  modal({title:`Lịch sử nhóm #${id}`,description:'Truy cập này được ghi vào nhật ký quản trị.',content:`<div class="moderation-log">${data.messages.map(m=>`<div class="people-row"><div class="grow"><b>${esc(m.sender)}</b><div class="hint">${date(m.created_at)}</div><div>${esc(m.deleted_at?'[Đã thu hồi]':m.body)}</div></div>${m.deleted_at?'':`<button class="btn danger sm" data-act="admin-group-delete" data-id="${m.id}" data-group="${id}">Gỡ</button>`}</div>`).join('')||'<div class="empty">Chưa có tin nhắn.</div>'}</div>`,confirm:'Đóng'});break;
 }
 case 'admin-group-delete':ask('Gỡ nội dung vi phạm','Tin nhắn này sẽ bị ẩn đối với mọi thành viên; thao tác được ghi nhật ký.',async()=>{
  await del(`/api/admin/groups/${Number(btn.dataset.group)}/messages/${id}`);await loadAdmin();toast('Đã gỡ nội dung.','ok');},'Gỡ tin',true);break;
 case 'call-audio':await startCall(id,false);break;
 case 'call-video':await startCall(id,true);break;
 }
}
async function uploadSelected(file){
 if(file.size>12*1024*1024)throw Error('Tệp tối đa 12 MB.');
 state.uploading=true;$('#compose-extra').innerHTML=composerExtras();
 try{
  const body=new FormData();body.append('file',file);
  const res=await fetch('/api/uploads',{method:'POST',body,credentials:'same-origin'});
  const payload=await res.json();if(!res.ok)throw Error(typeof payload.detail==='string'?payload.detail:'Không thể tải tệp lên.');
  state.pendingAttachment=payload.attachment;
 }finally{state.uploading=false;if($('#compose-extra'))$('#compose-extra').innerHTML=composerExtras();}
}
function notifyBrowser(message){
 if(document.hidden&&typeof Notification!=='undefined'&&Notification.permission==='granted'){
   try{const n=new Notification('mtunz',{body:message,icon:'/static/favicon.svg'});n.onclick=()=>window.focus();}catch{}
 }
}
async function extraSocket(data){
 const t=data.type;
 if(t==='groups-updated'){await refreshGroups(state.tab==='groups');return;}
 if(t==='group-message'){
  if(state.groupSelected===data.group_id&&state.tab==='groups')await loadGroupMessages(false);
  await refreshGroups();renderSideItems();
  if(data.message.sender_id!==state.user?.id&&!(state.groupSelected===data.group_id&&state.tab==='groups')){
    toast('Có tin nhắn mới trong nhóm.');notifyBrowser('Tin nhắn mới trong nhóm');
  }
 }
 if(t==='group-message-updated'&&state.groupSelected===data.group_id&&state.tab==='groups')await loadGroupMessages(false);
 if(t==='message-updated'&&state.selected&&state.tab==='messages')await loadMessages(false);
 if(t==='group-typing'&&state.tab==='groups'&&state.groupSelected===data.group_id){
  const el=$('#typing-text');if(el)el.textContent=data.on?'Một thành viên đang nhập tin nhắn…':'';
 }
 if(t.startsWith('call-'))await handleCallSignal(data);
}

// Browser-to-browser WebRTC: signaling is relayed by the authenticated websocket;
// media stays peer-to-peer. Calls need HTTPS (except localhost), NAT may require a TURN relay.
const pendingCallerIce=new Map();
const rtcConfig={iceServers:[{urls:['stun:stun.l.google.com:19302','stun:stun1.l.google.com:19302']}]};
async function startCall(peerId, video){
 if(state.call)throw Error('Đang có cuộc gọi khác.');
 if(state.ws?.readyState!==WebSocket.OPEN)throw Error('Đang mất kết nối realtime. Vui lòng thử lại.');
 if(!navigator.mediaDevices?.getUserMedia)throw Error('Cần dùng HTTPS hoặc localhost và cấp quyền mic/camera.');
 const local=await navigator.mediaDevices.getUserMedia({audio:true,video});
 const pc=new RTCPeerConnection(rtcConfig);
 state.call={peerId,video,pc,local,remote:new MediaStream(),status:'Đang gọi…',candidateQueue:[]};
 setupCallPc(state.call);
 displayCallUI();
 try{
  const offer=await pc.createOffer();await pc.setLocalDescription(offer);
  sendSignal('call-offer',peerId,offer,video);
 }catch(e){stopCall(false);throw e;}
}
function sendSignal(type,to,signal=null,video=false){
 if(state.ws?.readyState===WebSocket.OPEN)state.ws.send(JSON.stringify({type,to,signal,video}));
}
function setupCallPc(call){
 for(const t of call.local.getTracks())call.pc.addTrack(t,call.local);
 call.pc.ontrack=e=>{for(const track of e.streams[0].getTracks())call.remote.addTrack(track);
   const el=$('#remote-video');if(el)el.srcObject=call.remote;};
 call.pc.onicecandidate=e=>{if(e.candidate)sendSignal('call-ice',call.peerId,e.candidate);};
 call.pc.onconnectionstatechange=()=>{
  if(state.call!==call)return;
  call.status=({connected:'Đã kết nối',connecting:'Đang kết nối…',failed:'Kết nối thất bại',disconnected:'Mất kết nối'})[call.pc.connectionState]||call.status;
  const label=$('#call-status');if(label)label.textContent=call.status;
  if(['failed','closed'].includes(call.pc.connectionState))stopCall(false);
 };
}
function displayCallUI(){
 const call=state.call;if(!call)return;
 const f=state.friends.find(x=>x.other_id===call.peerId);
 $('#modal-root').innerHTML=`<div class="modal-backdrop call-layer"><div class="modal call-modal"><div class="call-mark">${icon(call.video?'video':'phone',26)}</div>
 <h2>${esc(f?.display_name||f?.username||'Bạn bè')}</h2><p id="call-status">${esc(call.status)}</p>
 <div class="call-videos"><video id="remote-video" autoplay playsinline></video><video id="local-video" autoplay playsinline muted></video></div>
 <button class="btn danger" id="call-hangup" style="margin-top:18px">${icon('phone')} Kết thúc cuộc gọi</button></div></div>`;
 $('#local-video').srcObject=call.local;$('#remote-video').srcObject=call.remote;
 $('#call-hangup').onclick=()=>stopCall(true);
}
function stopCall(signal=true){
 const call=state.call;if(!call)return;
 if(signal)sendSignal('call-hangup',call.peerId);
 state.call=null;
 for(const t of call.local?.getTracks()||[])t.stop();
 call.pc?.close();
 $('#modal-root .call-layer')?.remove();
}
async function handleCallSignal(d){
 if(!state.user||state.user.is_admin||!d.from_id)return;
 if(d.type==='call-offer'){
  if(state.call){sendSignal('call-decline',d.from_id);return;}
  const from=state.friends.find(x=>x.other_id===d.from_id&&x.state==='accepted');
  if(!from){sendSignal('call-decline',d.from_id);return;}
  modal({title:`${from.display_name||from.username} đang gọi ${d.video?'video':'thoại'}`,
   description:'Đây là cuộc gọi WebRTC trực tiếp. Trình duyệt sẽ hỏi quyền camera/micro nếu bạn đồng ý.',
   confirm:'Nghe máy',cancel:'Từ chối',handler:async()=>{
    const local=await navigator.mediaDevices.getUserMedia({audio:true,video:!!d.video});
    const pc=new RTCPeerConnection(rtcConfig);
    state.call={peerId:d.from_id,video:!!d.video,pc,local,remote:new MediaStream(),status:'Đang kết nối…',candidateQueue:[]};
    setupCallPc(state.call);
    await pc.setRemoteDescription(new RTCSessionDescription(d.signal));
    for(const ice of pendingCallerIce.get(d.from_id)||[])await pc.addIceCandidate(new RTCIceCandidate(ice));
    pendingCallerIce.delete(d.from_id);
    const answer=await pc.createAnswer();await pc.setLocalDescription(answer);
    sendSignal('call-answer',d.from_id,answer);
    setTimeout(displayCallUI,0);
   }});
  const decline=$('#modal-cancel');if(decline)decline.onclick=()=>{pendingCallerIce.delete(d.from_id);sendSignal('call-decline',d.from_id);$('#modal-root').replaceChildren();};
  return;
 }
 const call=state.call;
 if((!call||call.peerId!==d.from_id)&&d.type==='call-ice'&&d.signal){
    const queue=pendingCallerIce.get(d.from_id)||[];if(queue.length<50)queue.push(d.signal);
    pendingCallerIce.set(d.from_id,queue);return;
 }
 if(!call||call.peerId!==d.from_id)return;
 if(d.type==='call-decline'||d.type==='call-hangup'){toast(d.type==='call-decline'?'Cuộc gọi bị từ chối.':'Cuộc gọi đã kết thúc.');stopCall(false);return;}
 try{
  if(d.type==='call-answer')await call.pc.setRemoteDescription(new RTCSessionDescription(d.signal));
  if(d.type==='call-ice'&&d.signal){
    if(call.pc.remoteDescription)await call.pc.addIceCandidate(new RTCIceCandidate(d.signal));
    else call.candidateQueue.push(d.signal);
  }
  if(call.pc.remoteDescription&&call.candidateQueue.length){
    for(const item of call.candidateQueue.splice(0))await call.pc.addIceCandidate(new RTCIceCandidate(item));
  }
 }catch(e){toast('Có lỗi khi thiết lập cuộc gọi: '+e.message,'error');stopCall(false);}
}

// Additional delegated actions and forms are separated from the base UI.
document.addEventListener('click',async e=>{
 const btn=e.target.closest('[data-act]');if(!btn)return;
 if(!['open-group','group-manage','group-leave','group-kick','cancel-reply','cancel-file',
 'message-reply','message-react','message-delete','message-edit','search-chat','notice-read','notice-permission',
 'profile-view','mute-chat','archive-chat','revoke-sessions','list-sessions','device-rename','device-revoke','admin-group-messages',
 'admin-group-delete','call-audio','call-video'].includes(btn.dataset.act))return;
 try{await extraAction(btn);}catch(err){toast(err.message,'error');}
});
document.addEventListener('change',async e=>{
 const el=e.target;if(!el.matches('.upload-input')||!el.files?.length)return;
 try{await uploadSelected(el.files[0]);}catch(err){toast(err.message,'error');}
});
document.addEventListener('submit',async event=>{
 const form=event.target.closest('form[data-form]');if(!form)return;
 const key=form.dataset.form;
 if(!['create-group','send-group-message','settings-profile','settings-contact'].includes(key))return;
 event.preventDefault();event.stopImmediatePropagation();
 const fd=new FormData(form);
 const button=form.querySelector('button[type="submit"],button:not([type])');
 if(button){button.disabled=true;button.classList.add('is-loading');button.setAttribute('aria-busy','true');}
 try{
  if(key==='create-group'){
    const ids=fd.getAll('member_ids').map(Number);if(!ids.length)throw Error('Chọn ít nhất một người bạn.');
    const res=await post('/api/groups',{title:String(fd.get('title')||''),member_ids:ids});
    await refreshGroups();await openGroup(res.id);toast('Đã tạo nhóm thành công.','ok');
  }
  if(key==='send-group-message'){
    if(state.uploading)throw Error('Tệp vẫn đang được tải lên.');
    const body=String(fd.get('body')||'').trim();
    if(!body&&!state.pendingAttachment)return;
    const gid=state.groupSelected;
    await post(`/api/groups/${gid}/messages`,{body,attachment_id:state.pendingAttachment?.id||null,reply_to:state.replyTo?.scope==='group'?state.replyTo.id:null});
    state.replyTo=null;state.pendingAttachment=null;
    if(state.ws?.readyState===WebSocket.OPEN)state.ws.send(JSON.stringify({type:'group-typing',group_id:gid,on:false}));
    await loadGroupMessages();await refreshGroups();$('#compose-extra').innerHTML=composerExtras();
    const input=$('#chat-text');if(input)input.value='';
  }
  if(key==='settings-profile'){
   const data={display_name:String(fd.get('display_name')||''),bio:String(fd.get('bio')||''),
    show_online:fd.has('show_online'),show_receipts:fd.has('show_receipts')};
   await api('/api/me/profile',{method:'PATCH',data});
   Object.assign(state.user,data);renderApp();toast('Đã lưu hồ sơ.','ok');
  }
  if(key==='settings-contact'){
   const data={display_name:state.user.display_name||'',bio:state.user.bio||'',
    show_online:!!state.user.show_online,show_receipts:!!state.user.show_receipts,
    phone:String(fd.get('phone')||'').trim(),email:String(fd.get('email')||'').trim()};
   await api('/api/me/profile',{method:'PATCH',data});
   state.user=(await api('/api/me')).user;
   renderApp();toast('Đã cập nhật thông tin liên hệ riêng tư.','ok');
  }
 }catch(e){toast(e.message,'error');}
 finally{if(button&&button.isConnected){button.disabled=false;button.classList.remove('is-loading');button.removeAttribute('aria-busy');}}
},true);
function adminGroupsContent(){
 const rows=state.adminData||[];
 return `<div class="card"><h2>${icon('group',18)} Quản lý các nhóm chat</h2><p class="hint" style="margin:10px 0 18px">Chỉ truy cập nội dung khi cần kiểm duyệt. Các lần mở lịch sử được ghi nhật ký.</p>
 <div class="table-scroll"><table class="data-table"><thead><tr><th>ID</th><th>Tên nhóm</th><th>Người tạo</th><th>Thành viên</th><th>Tin nhắn</th><th>Quản lý</th></tr></thead><tbody>
 ${rows.map(g=>`<tr><td>#${g.id}</td><td>${esc(g.title)}</td><td>${esc(g.creator)}</td><td>${g.members}</td><td>${g.messages}</td><td><button class="btn ghost sm" data-act="admin-group-messages" data-id="${g.id}">Xem lịch sử</button></td></tr>`).join('')||'<tr><td colspan="6">Chưa có nhóm nào</td></tr>'}
 </tbody></table></div></div>`;
}
