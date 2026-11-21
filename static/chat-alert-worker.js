'use strict';
// This worker displays browser notifications while a chat tab is connected.
self.addEventListener('install',event=>event.waitUntil(self.skipWaiting()));
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
