'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const root=path.resolve(__dirname,'..');
const read=p=>fs.readFileSync(path.join(root,p),'utf8');
const chat=read('mobile/src/Messenger.js');
const gallery=read('mobile/src/SharedConversationGallery.js');
const app=read('mobile/App.js');
const cfg=require('../mobile/app.json').expo;
const pkg=require('../mobile/package.json');
assert.match(cfg.version,/^\d+\.\d+\.\d+$/);
assert(Number.isInteger(cfg.android.versionCode)&&cfg.android.versionCode>=11);
assert.equal(cfg.android.package,'com.mtunz.web');
assert.equal(pkg.dependencies['@expo/vector-icons'],'^15.0.2');
assert(chat.includes("import Ionicons from '@expo/vector-icons/Ionicons';"),
  'Messenger must use shared vector icon family');
for(const name of ['chatbubbles','people','person-add','earth','settings',
  'images-outline','attach-outline','mic-outline','send','arrow-back'])
  assert(chat.includes(name),'Missing polished icon: '+name);
const attachment=chat.slice(chat.indexOf('function Attachment({file,token,onOpen})'),
  chat.indexOf('function Message({item,own,token,onSelect,onOpen})'));
assert(attachment.includes("if(file.mime?.startsWith('image/'))"),
  'Images need a separate clean photo card');
const imageBranch=attachment.slice(attachment.indexOf("if(file.mime?.startsWith('image/'))"),
  attachment.indexOf('const isVideo='));
for(const banned of ['file.name','file.size','Math.ceil',' KB','Đính kèm'])
  assert(!imageBranch.includes(banned),'Photo-only bubble must hide '+banned);
assert(imageBranch.includes('<Image')&&imageBranch.includes('resizeMode="cover"'),
  'Photos must render visually without filename, size or download caption');
assert(attachment.includes('file.name')&&attachment.includes('file.size'),
  'Other downloadable documents should retain meaningful metadata');
assert(chat.includes("item.attachment?.mime?.startsWith('image/')&&!item.body?.trim()"),
  'Image-only bubble must not waste whitespace');
assert(chat.includes("{(deleted||!!item.body?.trim())&&<Text"),
  'Do not render an empty caption over photo-only messages');
assert(chat.includes("picked.type?.startsWith('image/')")&&
  chat.includes('Ảnh đã chọn'),
  'Image composer preview must hide filename and size');
assert(chat.includes('newerMessages&&<Pressable')&&
  chat.includes('Tin nhắn mới'),
  'New-message shortcut required while reading older messages');
assert(chat.includes("if(id>previous)")&&
  chat.includes('isAtLatestRef.current'),
  'Only truly newer messages should trigger auto-scroll or jump control');
assert(app.includes('KeyboardProvider')&&chat.includes('KeyboardStickyView')&&chat.includes('KeyboardChatScrollView'),
  'Keyboard-safe input required in login and chat');
assert(chat.includes('onContentSizeChange')&&chat.includes('if(isAtLatestRef.current)'),
  'Async message and photo layout changes must keep latest message visible');
assert(chat.includes("keyboardDismissMode={Platform.OS==='ios'?'interactive':'none'}"),
  'Android scrolling must not dismiss the keyboard and hide the composer');
assert(chat.includes('removeClippedSubviews={false}'),
  'Android should not clip or blank out photo/video bubbles');
assert(gallery.includes('attachmentSource'),
  'Keep full-screen saved image access and shared-gallery parity');
const gate=read('tests/web_android_parity_gate.cjs');
for(const term of ['Parity-Impact','Parity-Reason','Release-Plan',
  'Native code changed without increasing','Web + native change needs a native regression test'])
  assert(gate.includes(term),'Web/native change gate must remain active: '+term);
console.log('Professional image bubbles, unified icon pack, chat latest-scroll, Web/Android guard: PASS');

const {conversationKey,normalizeSearch,updateDraft,clearSentDraft,filterInbox}=require('../mobile/src/inboxTools');
assert.equal(normalizeSearch('Đặng Minh Tú'),'dang minh tu');
assert.equal(conversationKey({scope:'group',id:4}),'group:4');
const fixture=[{other_id:1,state:'accepted',display_name:'Đặng Tú',pinned:true,last_message:{created_at:1}},{other_id:2,state:'accepted',nickname:'Bạn thân',last_message:{created_at:5},unread:2},{other_id:3,state:'accepted',archived:true},{other_id:4,state:'accepted',restricted:true}];
assert.deepEqual(filterInbox(fixture,'','all',true).map(f=>f.other_id),[1,2]);
assert.deepEqual(filterInbox(fixture,'dang tu','all',true).map(f=>f.other_id),[1]);
assert.deepEqual(filterInbox(fixture,'','archived',true).map(f=>f.other_id),[3]);
assert.deepEqual(filterInbox(fixture,'','unread',true).map(f=>f.other_id),[2]);
assert.deepEqual(filterInbox(fixture,'','pinned',true).map(f=>f.other_id),[1]);
let drafts=updateDraft({},'dm:1','hello');drafts=updateDraft(drafts,'group:1','group draft');
assert.equal(drafts['dm:1'],'hello');assert.equal(clearSentDraft(drafts,'dm:1','old'),drafts);
assert.deepEqual(clearSentDraft(drafts,'dm:1','hello'),{'group:1':'group draft'});
assert(chat.includes('onLongPress={()=>quickChatActions(item)}')&&chat.includes('onRefresh={refreshInbox}'));
assert(chat.includes('searchSeqRef.current')&&chat.includes('removeSentDraft(originalRoom,submittedDraft)'));
assert(chat.includes('KeyboardStickyView')&&chat.includes('KeyboardChatScrollView'));
console.log('Native inbox filters, Vietnamese search, session drafts and quick actions passed.');
