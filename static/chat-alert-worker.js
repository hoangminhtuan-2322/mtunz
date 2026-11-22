'use strict';
// Web Push payloads intentionally contain no account names or message contents.
self.addEventListener('install',event=>event.waitUntil(self.skipWaiting()));
self.addEventListener('push',event=>{
 let payload;
 try{payload=event.data?.json();}catch{return;}
 const text={dm:'Bạn có tin nhắn mới.',group:'Bạn có tin nhắn mới trong nhóm.',
  deletion:'Tài khoản còn dưới 24 giờ trước hạn xóa. Mở mtunz để chọn giữ tài khoản.'};
 if(!Object.hasOwn(text,payload?.type))return;
 const tag=payload.type==='deletion'?'account-deletion':'chat:'+payload.type+':'+Number(payload.chat_id);
 event.waitUntil(self.registration.showNotification('mtunz',{body:text[payload.type],tag,icon:'/static/favicon.svg'}));
});
self.addEventListener('notificationclick',event=>{
 event.notification.close();
 event.waitUntil((async()=>{
  const clients=await self.clients.matchAll({type:'window',includeUncontrolled:true});
  const tabs=clients.filter(client=>new URL(client.url).pathname==='/');
  const tab=tabs.find(client=>client.focused)||tabs[0];
  if(tab)await tab.focus();
  else await self.clients.openWindow('/');
 })());
});
