/* World Experience V9. Presentation-only enhancement: backend, moderation,
   room APIs, attachment policy, sockets and original World handlers are kept. */
(function(){
'use strict';
if(typeof worldPage!=='function')return;
const originalWorldPage=worldPage;
let discoveryOpen=false;
worldPage=function enhancedWorldPage(){
  const data=state.worldData,status=data?.status;
  if(!status)return originalWorldPage();
  const closed=!status.open,until=Number(status.muted_until)||0;
  const muted=until>worldClock(),blocked=closed||muted;
  const room=(state.v6Rooms||[]).find(r=>Number(r.id)===Number(state.v6WorldRoom||1));
  const roomName=worldEscape(room?.title||'Phòng chung');
  const messages=data.messages||[];
  const bubbles=messages.map(worldBubble).join('')||
    '<div class="world-empty"><span class="world-empty-symbol" aria-hidden="true">✦</span>'+
    '<strong>Chào mừng đến với phòng trò chuyện</strong>'+
    '<span>Chưa có tin nhắn nào. Hãy bắt đầu một cuộc trò chuyện lịch sự!</span></div>';
  return '<div class="main-body world-live-page"><section class="world-live-shell" aria-label="Chat thế giới">'+
    '<header class="world-live-head">'+
      '<div class="world-head-identity"><span class="world-kicker"><span class="world-kicker-star" aria-hidden="true">✦</span> MTUNZ / COMMUNITY</span>'+
      '<h1>Chat thế giới <span class="world-live-spark" aria-hidden="true">✦</span></h1>'+
      '<p>Nơi những cuộc trò chuyện nhỏ tạo nên kết nối lớn.</p></div>'+
      '<div class="world-head-badges"><span class="world-head-label">KHÔNG GIAN CHUNG</span>'+
        '<span class="world-live-state '+(status.open?'online':'offline')+'"><span class="world-status-dot" aria-hidden="true"></span>'+
        (status.open?'Đang mở':'Tạm đóng')+'</span></div>'+
    '</header>'+
    '<div class="world-layout">'+
      '<aside class="world-discovery '+(discoveryOpen?'expanded':'')+'" aria-label="Khám phá cộng đồng">'+
        '<div class="world-discovery-title"><div><span class="world-side-overline">KHÁM PHÁ</span>'+
          '<strong>Phòng & hoạt động</strong></div>'+
          '<button type="button" class="world-discovery-toggle" data-world-experience="toggle-discovery" aria-expanded="'+(discoveryOpen?'true':'false')+'" aria-controls="world-discovery-content" aria-label="Hiển thị phòng và hoạt động">'+icon('chevron',17)+'</button></div>'+
        '<div class="world-discovery-content" id="world-discovery-content">'+
          '<section class="world-side-section" aria-label="Danh sách phòng">'+
            '<div class="world-side-section-head"><span>PHÒNG TRÒ CHUYỆN</span><small>'+(state.v6Rooms||[]).length+' phòng</small></div>'+
            '<div class="v6-community-rooms">'+(typeof v6WorldRoomsBar==='function'?v6WorldRoomsBar():'')+'</div>'+
          '</section>'+
          '<div class="world-side-divider"></div>'+
          '<section class="world-side-section" aria-label="Sự kiện trong phòng">'+
            '<div id="v7-community-events">'+(typeof communityPlusEvents==='function'?communityPlusEvents():'')+'</div>'+
          '</section>'+
          '<section class="world-side-section" aria-label="Bình chọn trong phòng">'+
            '<div class="v6-community-polls" id="v6-polls-root">'+(typeof v6PollCards==='function'?v6PollCards():'')+'</div>'+
          '</section>'+
          '<div class="world-side-guide"><span class="world-guide-icon">'+icon('shield',17)+'</span>'+
            '<div><strong>Gắn kết an toàn</strong><p>Tôn trọng mọi người. Bạn có thể báo cáo nội dung không phù hợp bất cứ lúc nào.</p></div></div>'+
        '</div>'+
      '</aside>'+
      '<section class="world-chat-pane" aria-label="Hội thoại cộng đồng">'+
        '<div class="world-chat-top"><span class="world-chat-room-icon" aria-hidden="true">#</span>'+
          '<div class="world-chat-room-title"><span class="world-room-eyebrow">ĐANG XEM PHÒNG</span>'+
            '<h2>'+roomName+'</h2><p>'+(closed?'Phòng chỉ đọc · Bạn vẫn xem được lịch sử':'Hội thoại trực tiếp · Một không gian dành cho tất cả')+'</p></div>'+
          '<span class="world-recent-badge">'+messages.length+' tin gần đây</span></div>'+
        (status.announcement?'<div class="v6-world-announcement" role="note">📌 <strong>Thông báo Admin:</strong> '+worldEscape(status.announcement)+'</div>':'')+
        '<div class="world-live-toolbar"><span class="world-hours">'+icon('clock',14)+' '+worldEscape(worldTimeLabel(status))+
          (status.slow_seconds?' · Chế độ chậm '+Number(status.slow_seconds)+' giây/tin':'')+'</span>'+
          '<div class="world-toolbar-actions"><label class="world-privacy-switch"><input type="checkbox" data-social-world-anon '+(state.user?.world_anonymous?'checked':'')+'><span>Ẩn danh khi gửi</span></label>'+
          '<button type="button" class="btn ghost sm" data-world-action="refresh" title="Làm mới Chat thế giới">'+icon('refresh',14)+' <span>Làm mới</span></button>'+
          (typeof communityPlusAppealsButton==='function'?communityPlusAppealsButton():'')+'</div></div>'+
        (status.open&&status.schedule_enabled&&status.next_change_at?
          '<div class="world-closing-clock" role="status">'+icon('clock',17)+' Tự động đóng sau <strong id="world-close-countdown" data-world-close-at="'+Number(status.next_change_at)+'">'+worldCountdown(status.next_change_at)+'</strong></div>':'')+
        (closed?'<div class="world-banner warn" role="status">'+icon('clock',18)+' '+worldEscape(status.closed_reason||'Phòng đang tạm đóng')+
          (status.next_change_at?' · Mở dự kiến '+worldDate(status.next_change_at):'')+'</div>':'')+
        (muted?'<div class="world-banner danger" role="alert">'+icon('shield',18)+
          '<span>Bạn vẫn đọc được tin nhắn nhưng chưa thể gửi tại Chat thế giới. Còn <strong data-world-countdown="'+until+'">'+worldCountdown(until)+'</strong>. '+
          (status.mute_reason?worldEscape(status.mute_reason):'')+'</span></div>':'')+
        '<div class="world-feed-heading"><span><span class="world-feed-heading-dot" aria-hidden="true"></span> DÒNG TRÒ CHUYỆN</span>'+
          '<small>Lịch sử trong phòng hiện tại</small></div>'+
        (messages.length>=70&&!worldOlderExhausted?
          '<button type="button" class="btn ghost sm world-load-older" data-world-action="older">'+icon('clock',14)+' Xem tin nhắn cũ hơn</button>':'')+
        '<div class="world-feed" id="world-feed" role="log" aria-live="polite" aria-label="Tin nhắn cộng đồng">'+bubbles+'</div>'+
        (closed?'<div class="world-readonly-note" role="status">'+icon('shield',16)+' Phòng hiện đóng. Bạn vẫn được xem toàn bộ lịch sử và phương tiện; chỉ mở lại tính năng gửi khi Admin cho phép.</div>':
          '<form data-world-form="send" class="world-compose">'+
            '<div class="world-compose-row"><label class="world-file-pick" title="Đính kèm ảnh hoặc tệp" aria-label="Chọn tệp đính kèm">'+icon('file',17)+
            '<input id="world-upload-file" type="file" accept="image/png,image/jpeg,image/webp,image/gif,.pdf,.txt,.docx,.xlsx,.zip" hidden '+(blocked?'disabled':'')+'></label>'+
            '<label for="world-compose-text" class="sr-only">Tin nhắn Chat thế giới</label>'+
            '<textarea id="world-compose-text" maxlength="1200" rows="2" class="input" placeholder="'+(blocked?'Đang hạn chế gửi tin...':'Chia sẻ một điều thú vị với cộng đồng...')+'" '+(blocked?'disabled':'')+'></textarea>'+
            '<button type="submit" class="btn primary" '+(blocked?'disabled':'')+'>'+icon('send',16)+' <span>Gửi</span></button></div>'+
            '<div class="world-compose-bottom"><span class="world-file-preview" id="world-file-preview">'+
              (worldPendingAttachment?'Tệp: '+worldEscape(worldPendingAttachment.name):'')+'</span>'+
              '<div class="world-compose-tools"><span class="world-quick-label">Cảm xúc</span>'+
                '<button type="button" class="world-quick-emoji" data-world-experience="emoji" data-world-emoji="✨" aria-label="Chèn biểu cảm lấp lánh">✨</button>'+
                '<button type="button" class="world-quick-emoji" data-world-experience="emoji" data-world-emoji="💜" aria-label="Chèn trái tim">💜</button>'+
                '<button type="button" class="world-quick-emoji" data-world-experience="emoji" data-world-emoji="👋" aria-label="Chèn lời chào">👋</button>'+
                '<span class="world-compose-hint">Tối đa 1.200 ký tự</span></div></div></form>')+
        '<div class="world-rule-footer">'+icon('shield',14)+' <span>5 tin trong 3 giây = 1 cảnh cáo · Đủ 3 cảnh cáo sẽ bị khóa gửi. <strong>'+
          Number(status.warnings||0)+'/3 cảnh cáo · Cấp '+Number(status.strikes||0)+'/5</strong></span></div>'+
      '</section>'+
    '</div></section></div>';
};
document.addEventListener('click',event=>{
 const button=event.target.closest('[data-world-experience]');
 if(!button||button.disabled)return;
 const action=button.dataset.worldExperience;
 if(action==='toggle-discovery'){
   discoveryOpen=!discoveryOpen;
   button.closest('.world-discovery')?.classList.toggle('expanded',discoveryOpen);
   button.setAttribute('aria-expanded',String(discoveryOpen));
   return;
 }
 if(action==='emoji'){
   const field=document.getElementById('world-compose-text');
   const emoji=button.dataset.worldEmoji||'';
   if(!field||field.disabled||!emoji)return;
   const start=field.selectionStart??field.value.length;
   const end=field.selectionEnd??start;
   if(field.value.length-end+start+emoji.length>field.maxLength)return;
   field.setRangeText(emoji,start,end,'end');
   field.dispatchEvent(new Event('input',{bubbles:true}));
   field.focus({preventScroll:true});
 }
});
})();