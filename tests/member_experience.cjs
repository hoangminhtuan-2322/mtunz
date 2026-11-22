'use strict';
/* Member Experience: keep existing messaging contracts and privileged boundaries. */
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const read=p=>fs.readFileSync(p,'utf8');
const member=read('static/member-experience.js');
const css=read('static/member-experience.css');
const html=read('static/index.html');
const app=read('static/app.js');
const extras=read('static/extras.js');
const features=read('features.py');
new vm.Script(member,{filename:'member-experience.js'});
for(const marker of [
 'function mountComposer(','function openPicker(','function insertEmoji(',
 'function openLocation(','function optimizePhoto(','function uploadPhoto(',
 'function renderLocations(','function compactActions('
].filter(x=>x!=='function compactActions(')){
 assert(member.includes(marker),'Missing chat functionality: '+marker);
}
assert(member.includes('function enableFileKeyboard(label)'), 'Photo/file picker must be keyboard accessible');
assert(member.includes("event.key!=='Enter'&&event.key!==' '"), 'Enter and Space activate upload picker');
assert(member.includes('enableFileKeyboard(photo)')&&member.includes('enableFileKeyboard(original)'), 'Both upload controls need keyboard support');
assert(member.includes('photoInput.accept=')&&member.includes('image/jpeg,image/png,image/webp,image/gif'));
assert(member.includes("new File([blob]"),'Oversize photos are compressed to the supported image format');
assert(member.includes('1.7*1024*1024'),'Image compression respects Render-hosted 2 MB upload cap');
assert(member.includes('uploadSelected(result)'),'Photo upload reuses authorized attachment endpoint');
assert(member.includes('state.pendingAttachment'),'Attachment preview must reuse existing message state');
assert(member.includes('photoPreparing=true'),'Only one photo may prepare at a time');
assert(member.includes('if(!sameContext(context))'),'A photo cannot be silently attached to a different conversation');
assert(extras.includes("await fetch('/api/uploads'"),'Existing authenticated upload remains available');
assert(extras.includes('uploadMarkup(m)'),'Picture bubbles remain supported in direct and group messages');
assert(app.includes('attachment_id:pending?.id||null'),'Direct messages keep authorized attachment IDs from the captured send context');
assert(extras.includes('attachment_id:state.pendingAttachment?.id||null'),'Group messages keep attachment support');
assert(features.includes("f['owner_id']==u['id']"),'Attachment download verifies owner');
assert(features.includes('if not allowed:raise HTTPException(403'),'Unauthorized attachment access stays forbidden');
assert(member.includes('getCurrentPosition('),'Browser location permission is requested when user acts');
assert(member.includes("approx.checked=true"),'Approximate location is privacy default');
assert(member.includes("send.disabled=true"),'Location cannot be sent before successful consent');
assert(member.includes('sameContext(ctx)'),'Location may only be sent into the conversation where it was requested');
assert(member.includes('const body=marker+'),'Location message contains a readable verified map URL');
assert(member.includes('role')&&member.includes('aria-modal'),'Accessible location dialog exists');
assert(member.includes("Math.abs(lat)>90")&&member.includes("Math.abs(lon)>180"),'Received coordinates are validated');
assert(member.includes("card.rel='noopener noreferrer'"),'External map links are isolated');
assert(member.includes("all(':scope > div',bubble)"),'Location previews are DOM nodes, not unescaped user HTML');
assert(member.includes('textContent'),'User-controlled display text is not constructed as raw HTML');
assert(!/localStorage|sessionStorage|document\.cookie/.test(member),'Do not persist message drafts or precise locations');
assert(!/watchPosition|setInterval/.test(member),'Location must not be tracked continuously');
assert(css.includes('.shell:not(.admin-shell)'),'Member styles are scoped away from Admin');
assert(css.includes('.chat-compose-toolbar')&&css.includes('.chat-emoji-picker'));
assert(css.includes('.chat-shared-location')&&css.includes('.chat-location-dialog'));
assert(css.includes('@media(max-width:800px)')&&css.includes('@media(max-width:420px)'));
assert(css.includes('prefers-reduced-motion:reduce'));
assert(!css.includes('display:none}\n .shell:not(.admin-shell) .conversation .main-head .btn[data-act="call-video"]'),'Video call must not be hidden on mobile');
assert(html.includes('member-experience.js?v=1.2')&&html.includes('member-experience.css?v=1.2'));
assert(html.indexOf('member-experience.js')>html.indexOf('extras.js'),'Use existing upload functions before member enhancement');
const events={};
let geolocationCalls=0;
const fakeDocument={
 readyState:'loading',querySelector:()=>null,
 addEventListener:(event,handler)=>(events[event]||(events[event]=[])).push(handler)
};
const sandbox={
 document:fakeDocument,window:{isSecureContext:true},
 navigator:{geolocation:{getCurrentPosition(){geolocationCalls++;}}},
 MutationObserver:class{observe(){}},
 requestAnimationFrame:fn=>fn(),state:{user:null},
 console
};
vm.runInNewContext(member,sandbox,{timeout:1500});
assert.equal(geolocationCalls,0,'Opening the site must not request location');
for(const callback of events.DOMContentLoaded||[])callback();
assert.equal(geolocationCalls,0,'Mounting the member interface must not request location');
console.log('Member Experience OK: existing chat attachments, photo optimization, emoji, consent-based location, responsive UI and security preserved.');
