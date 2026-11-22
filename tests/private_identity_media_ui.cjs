'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const read=file=>fs.readFileSync(file,'utf8');
const app=read('static/app.js'),extras=read('static/extras.js');
const social=read('static/social-v2.js'),world=read('static/world-moderation.js');
const voice=read('static/messenger-v4.js'),css=read('static/social-v2.css');
const html=read('static/index.html'),api=read('features.py');
const backend=read('social_profile.py');
for(const [path,s] of [['app.js',app],['extras.js',extras],['social-v2.js',social],
                       ['world-moderation.js',world],['messenger-v4.js',voice]]){
 new vm.Script(s,{filename:path});
}
assert(html.includes('/static/app.js?v=20.6'));
assert(html.includes('/static/extras.js?v=18.2'));
assert(html.includes('/static/social-v2.js?v=1.1'));
assert(html.includes('/static/social-v2.css?v=1.2'));
assert(html.includes('/static/messenger-v4.js?v=1.2'));
assert(html.includes('/static/world-moderation.js?v=4.3'));
assert(app.includes('identitySettingsPanel()'),'Identity controls appear inside member profile');
assert(extras.includes("display_name:state.user.display_name||''"),
 'Old profile editor cannot overwrite display name');
assert(api.includes("name!=(current['display_name'] or '')"),
 'Legacy profile API refuses unverified display name edits');
assert(api.includes("UPDATE users SET bio=?,show_online=?,show_receipts=?"),
 'Legacy profile API cannot write the display_name column');
assert(backend.includes("identity_change_events"),'Rolling quotas persisted in database');
assert(backend.includes("FOR UPDATE"),'Verified identity mutations serialize on PostgreSQL');
assert(backend.includes("BEGIN IMMEDIATE"),'Verified identity mutations serialize on SQLite');
assert(backend.includes("not core.verify_secret(current['password_hash'],body.password)"));
assert(backend.includes("not core.verify_secret(current['pin_hash'],body.pin)"));
assert(backend.includes("('username',60,1),('display_name',30,2)"));
assert(social.includes('social-private-switch')&&social.includes("el.checked?'friends':'everyone'"));
assert(social.includes("api('/api/me/social',{method:'PATCH',data:{profile_visibility:desired}})"));
assert(social.includes("visibility.value=previous;toggle.checked=previous!=='everyone'"));
assert(social.includes('Tên đăng nhập')&&social.includes('Tên hiển thị'));
assert(social.includes("post('/api/me/identity/'+kind,{new_value,password,pin})"));
assert(!social.includes('localStorage.setItem(')&&!social.includes('sessionStorage.setItem('),
 'PIN should never persist in browser storage');
assert(css.includes('.identity-settings-panel')&&css.includes('@media(max-width:600px)'));
assert(extras.includes('chat-media-save')&&extras.includes('download=1'));
assert(world.includes('download=1')&&world.includes('video/mp4'));
assert(voice.includes('download=1'));
assert(api.includes("download:bool=False")&&api.includes("'video/mp4'"));
const start=social.indexOf('function socialSettingsPanel(){'),stop=social.indexOf('function identitySettingsPanel(){',start);
assert(start>=0&&stop>start);
const state={user:{username:'example_me',display_name:'Tên Ví Dụ',profile_visibility:'friends',
  allow_message_requests:false,world_anonymous:true,avatar_url:null,cover_url:null}};
const ctx={state,icon:()=>'',esc:val=>String(val)};
vm.runInNewContext(social.slice(start,stop),ctx,{timeout:1000});
let markup=ctx.socialSettingsPanel();
assert(markup.includes('id="social-private-switch" checked'));
assert(markup.includes('value="friends" selected'));
state.user.profile_visibility='everyone';markup=ctx.socialSettingsPanel();
assert(!markup.includes('id="social-private-switch" checked'));
assert(markup.includes('value="everyone" selected'));
console.log('V17: identity and private profile UI contracts, media download, security checks OK');
