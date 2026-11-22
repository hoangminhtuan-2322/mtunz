'use strict';
/* Social workspace regression: previews must be non-public, existing actions retained. */
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const read=p=>fs.readFileSync(p,'utf8');
const app=read('static/app.js'),extras=read('static/extras.js');
const js=read('static/social-upgrade.js'),css=read('static/social-upgrade.css');
const html=read('static/index.html'),features=read('features.py');
new vm.Script(app,{filename:'app.js'});
new vm.Script(extras,{filename:'extras.js'});
new vm.Script(js,{filename:'social-upgrade.js'});
assert(html.includes('social-upgrade.css?v=1.0')&&html.includes('social-upgrade.js?v=1.3'));
assert(html.indexOf('social-upgrade.css')>html.indexOf('member-experience.css'));
assert(html.indexOf('social-upgrade.js')>html.indexOf('member-experience.js'));
for(const fn of ['function drawFriendPopup(','function checkInvites(','function openForward(','function togglePin(','function upgradeSettings(']){
 assert(js.includes(fn),'Missing social flow '+fn);
}
for(const item of ['Xem hồ sơ','Chấp nhận','Từ chối','Để sau']){
 assert(js.includes(item),'Friend request option missing: '+item);
}
assert(js.includes('/api/profile/'),'Friend popup uses existing controlled profile API');
assert(js.includes('/api/friends/'),'Accept/decline uses existing friend endpoints');
assert(js.includes('source_scope:ctx.scope')&&js.includes('target_scope:target.scope'),'Forward source and target are explicit');
assert(js.includes("btn.dataset.socialAction==='pin'"),'Pin click binding exists');
assert(js.includes("btn.dataset.socialAction==='forward'"),'Forward click binding exists');
assert(js.includes('/api/chat/pins')&&js.includes('/api/chat/forward'));
assert(!/localStorage|sessionStorage|document\.cookie/.test(js),'Do not store friendship, location, or message contents');
assert(css.includes('.mt-pins-bar')&&css.includes('.mt-forward-dialog'));
assert(css.includes('.mt-settings-health')&&css.includes('.mt-friend-request-pop'));
assert(css.includes('@media(max-width:800px)'));
assert(app.includes("['world','group','Chat thế giới']"),'World Chat is available in secondary navigation');
assert(app.includes("function worldComingSoon()"),'Non-operational world preview exists');
assert(app.includes('worldPage()'),'World Chat is gated by admin launch state');
assert(fs.readFileSync('static/world-moderation.js','utf8').includes('function worldPage()'),'Public room is implemented separately');
assert(features.includes('class PinMessage(BaseModel)')&&features.includes('class ForwardMessage(BaseModel)'));
assert(features.includes('checked_chat_message(c,u['),"Server verifies source ownership and membership");
assert(features.includes('require_peer(c,u['),"Server enforces DM friend/block rules");
assert(features.includes('active_member(c,body.target_id,u['),"Server enforces group membership");
assert(features.includes("15*60"),'Original 15 minute edit limit remains');
assert(features.includes("scope='group'")&&features.includes("scope='dm'"));
console.log('Social UI OK: invites, pin/forward, protected world launch, and existing private/group guards.');
