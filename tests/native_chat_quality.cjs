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
  chat.indexOf('function Message({item,own,token,onSelect,onOpen,onReply,highlighted})'));
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
assert(chat.includes('searchSeqRef.current')&&chat.includes('removeSentDraft(originalRoom,pending.originalDraft)'));
assert(chat.includes('KeyboardStickyView')&&chat.includes('KeyboardChatScrollView'));
console.log('Native inbox filters, Vietnamese search, session drafts and quick actions passed.');

const {sanitizeDrafts,mergeHydratedDrafts,isReplySwipe,findHistory}=require('../mobile/src/inboxTools');
assert.deepEqual(sanitizeDrafts({'dm:1':'test','world:1':'private','bad':'x','group:2':'group'}),{'dm:1':'test','group:2':'group'});
assert.deepEqual(mergeHydratedDrafts({'dm:1':'old','dm:2':'keep'},{'dm:3':'new'},new Set(['dm:1','dm:3'])),{'dm:2':'keep','dm:3':'new'});
assert(isReplySwipe({dx:60,dy:8},55));assert(!isReplySwipe({dx:60,dy:75},55));assert(!isReplySwipe({dx:-60,dy:0},55));
assert(chat.includes('onScrollToIndexFailed={recoverSearchScroll}')&&chat.includes('jumpToSearchResult(m)'));
assert(chat.includes('sendRef.current||')&&chat.includes('sendStage'));
assert(read('mobile/src/draftVault.js').includes('SecureStore.setItemAsync'));
assert(read('mobile/src/client.js').includes('clearDraftVault(token)'));
(async()=>{
 const a=await findHistory([{id:100}],50,async before=>Array.from({length:70},(_,i)=>({id:before-1-i})),()=>true);
 assert(a.found&&a.rows.some(m=>m.id===50));
 const b=await findHistory([{id:100}],2,async()=>[],()=>true);
 assert(!b.found&&b.exhausted);
 const d=await findHistory([{id:100}],50,async()=>[{id:50}],()=>false);
 assert(!d.found&&!d.rows.length);
 console.log('Swipe, encrypted draft isolation, bounded history and send guard: PASS');
})().catch(e=>{console.error(e);process.exitCode=1;});

const {createMediaBatch,runMediaBatch}=require('../mobile/src/mediaBatch');
(async()=>{
 let serial=0;const batch=createMediaBatch([{uri:'a'},{uri:'b'},{uri:'c'}],()=>String(++serial));
 batch.caption='caption';batch.replyId=7;
 let fail=true,uploads=[],sends=[];
 const ctx={active:()=>true,upload:async(f,id)=>{uploads.push(id);return Number(id);},send:async(item,body,reply)=>{sends.push([item.nonce,body,reply]);if(item.nonce==='2'&&fail)throw Error('network');return {};},progress:()=>{},delivered:()=>{}};
 await assert.rejects(runMediaBatch(batch,ctx));assert.deepEqual(batch.items.map(i=>i.sent),[true,false,false]);
 fail=false;await runMediaBatch(batch,ctx);
 assert.deepEqual(uploads,['1','2','3']);assert.deepEqual(sends,[['1','caption',7],['2','',null],['2','',null],['3','',null]]);
 assert(batch.items.every(i=>i.sent));
 const stop=createMediaBatch([{uri:'a'},{uri:'b'}],()=>String(++serial));let active=true;
 await runMediaBatch(stop,{...ctx,active:()=>active,upload:async()=>{active=false;return 4;}});
 assert.equal(stop.items[0].attachmentId,4);assert(!stop.items[0].sent);
 assert(chat.includes('chooseMediaBatch')&&chat.includes('runMediaBatch(batch'));
 console.log('Batch media resume and stable upload/send IDs: PASS');
})().catch(e=>{console.error(e);process.exitCode=1;});

const {createPendingSend,deliverPendingSend}=require('../mobile/src/pendingSend');
(async()=>{
 const file={uri:'original',type:'image/jpeg'};
 const item=createPendingSend({scope:'dm',id:42},'hello',file,7,'','stable-nonce');
 file.uri='changed';let fail=true,uploads=0,attempts=[];
 const ctx={progress:()=>{},upload:async(f,n)=>{assert.equal(f.uri,'original');assert.equal(n,'stable-nonce');uploads++;return 123;},
 send:async(endpoint,data)=>{attempts.push([endpoint,data]);if(fail)throw Error('lost response');return {message:{id:9}};}};
 await assert.rejects(deliverPendingSend(item,ctx));fail=false;await deliverPendingSend(item,ctx);
 assert.equal(uploads,1);assert.deepEqual(attempts[0],attempts[1]);assert.equal(attempts[0][1].reply_to,7);
 const world=createPendingSend({scope:'world',id:1},'hello',null,null,'anon','unused');
 await deliverPendingSend(world,ctx);await assert.rejects(deliverPendingSend(world,ctx),/not idempotent/);
 assert(chat.includes('pendingSendsRef.current.get(conversationKey(target))'));
 assert(chat.includes('deliverPendingSend(pending')&&!chat.includes('nonceRef.current'));
 console.log('Stable single-send identity, upload reuse, conversation isolation and non-idempotent world guard: PASS');
})().catch(e=>{console.error(e);process.exitCode=1;});

const {CHAT_BACKGROUNDS,chatBackground}=require('../mobile/src/chatAppearance');
assert.equal(new Set(CHAT_BACKGROUNDS.map(x=>x.id)).size,CHAT_BACKGROUNDS.length);
assert.equal(chatBackground('unknown').id,'midnight');
assert.equal(chatBackground(null).id,'midnight');
for(const item of CHAT_BACKGROUNDS){assert.match(item.color,/^#[0-9a-f]{6}$/);assert.equal(chatBackground(item.id),item);}
assert(chat.includes('backgroundColor:wallpaperColor(chatBackground(roomBackgroundId(roomBackgrounds,conversationKey(room),backgroundId)),mode)')&&chat.includes('readChatBackground()')&&chat.includes('saveChatBackground(id)'));
assert(chat.includes('appearanceBusy.current')&&chat.includes('wallpaperEmpty'));
console.log('Local chat background presets, fallback and keyboard-safe integration: PASS');

const {sanitizeRoomBackgrounds,roomBackgroundId,changeRoomBackground,MAX_ROOM_BACKGROUNDS}=require('../mobile/src/chatAppearance');
const rooms=changeRoomBackground({},'dm:1','forest');
assert.equal(roomBackgroundId(rooms,'dm:1','sand'),'forest');
assert.equal(roomBackgroundId(rooms,'group:1','sand'),'sand');
assert.equal(roomBackgroundId(rooms,'world:1','mist'),'mist');
assert.deepEqual(changeRoomBackground(rooms,'dm:1',null),{});
assert.deepEqual(rooms,{'dm:1':'forest'});
assert.deepEqual(sanitizeRoomBackgrounds({'dm:1':'forest','bad':'mist','group:2':'invalid','world:5':'plum'}),{'dm:1':'forest','world:5':'plum'});
assert.throws(()=>changeRoomBackground({},'bad','forest'));
const full=Object.fromEntries(Array.from({length:MAX_ROOM_BACKGROUNDS},(_,i)=>['dm:'+(i+1),'ocean']));
assert.throws(()=>changeRoomBackground(full,'group:1','forest'),/limit/);
assert.equal(changeRoomBackground(full,'dm:1','mist')['dm:1'],'mist');
assert(chat.includes('appearanceAccountRef.current===account')&&chat.includes('conversationKey(roomRef.current)!==key'));
assert(read('mobile/src/chatAppearanceStore.js').includes('mtunz-room-background-v1-'));
console.log('Account-scoped per-conversation wallpaper overrides and bounded persistence: PASS');

const {LIGHT_PALETTE,normalizeTheme,makeLightStyles,wallpaperColor}=require('../mobile/src/messengerTheme');
assert.equal(normalizeTheme('invalid'),'dark');assert.equal(normalizeTheme('light'),'light');
const dark={bg:'#071320',card:'#11253a',text:'#f4f8ff',soft:'#a8bfd6',accent:'#6dbaff',green:'#73e0bd',bad:'#ff9eac'};
const sample={bubbleMine:{backgroundColor:'#2760a6',maxWidth:'84%'},msg:{color:dark.text},btn:{backgroundColor:dark.accent},btnTxt:{color:dark.bg},composeInput:{backgroundColor:'#1b334f',color:dark.text},viewerAction:{backgroundColor:'#1c3656'}};
const light=makeLightStyles(sample,dark);assert.equal(light.bubbleMine.backgroundColor,LIGHT_PALETTE.mine);assert.equal(light.bubbleMine.maxWidth,'84%');assert.equal(light.msg.color,LIGHT_PALETTE.text);assert.equal(light.btnTxt.color,'#ffffff');assert.equal(light.composeInput.backgroundColor,'#ffffff');assert.equal(light.viewerAction.backgroundColor,'#1c3656');assert.equal(sample.msg.color,dark.text);
assert.equal(wallpaperColor(chatBackground('midnight'),'light'),LIGHT_PALETTE.bg);assert.equal(wallpaperColor(chatBackground('forest'),'light'),chatBackground('forest').color);
const appTheme=read('mobile/src/AppTheme.js');
assert(appTheme.includes('ThemeContext.Provider')&&appTheme.includes('saveMessengerTheme(next)')&&chat.includes('makeLightStyles(baseStyles,DARK_PALETTE)'));
console.log('Messenger light/dark palette, persisted mode, default wallpaper and fixed overlay: PASS');

const {makeScreenLightStyles}=require('../mobile/src/messengerTheme');
const screenSample={button:{backgroundColor:'#071320',minHeight:48},text:{color:'#fff',fontSize:16}};
const screenLight=makeScreenLightStyles(screenSample,{button:{backgroundColor:LIGHT_PALETTE.accent}});
assert.equal(screenLight.button.backgroundColor,LIGHT_PALETTE.accent);assert.equal(screenLight.button.minHeight,48);assert.equal(screenLight.text.color,LIGHT_PALETTE.text);assert.equal(screenSample.text.color,'#fff');
assert(app.includes('<AppThemeProvider><AppContent/></AppThemeProvider>'));
for(const path of ['mobile/App.js','mobile/src/AdminDashboard.js','mobile/src/AppLockGate.js','mobile/src/Messenger.js'])assert(read(path).includes('useAppTheme'),path);
assert(app.includes("barStyle={themeMode==='light'?'dark-content':'light-content'}"));
console.log('Shared appearance across auth, admin, lock and Messenger: PASS');

assert(app.includes('mode:themeMode,ready:themeReady')&&app.includes("const [mode,setMode]=useState('login')"),'Separate auth-flow mode from appearance mode');

assert(chat.includes('const MemoMessage=React.memo(Message)')&&chat.includes('data={newestFirst}')&&chat.includes('renderItem={renderMessage}'));
assert(chat.includes('useMemo(()=>[...messages].reverse(),[messages])')&&chat.includes('upsertMessage(old,sanitize('));

assert(chat.includes('roomWindowRef.current.reset(key)')&&chat.includes('roomWindowRef.current.reset(null)'));
assert(chat.includes('if(!guard.accepts(request)||conversationKey(roomRef.current)!==key)return'));
assert(chat.includes('guard.pageMore(request,next.length)')&&chat.includes('guard.finish(request)'));
assert(chat.includes('key={conversationKey(room)} inverted data={newestFirst}'));
assert(chat.includes('if(guard.current(visit)&&isAtLatestRef.current)listRef.current?.scrollToOffset'));
console.log('Conversation-specific list and stale response/scroll guards: PASS');

assert(chat.includes('createForegroundTicker(tick,30000)')&&chat.includes('check.stop();clearTimeout(retryTimer)'));
assert(chat.includes('const previous=socket;socket=null;wsRef.current=null;setConnection'));
assert(chat.includes('if(!closed&&activeRef.current&&wsRef.current===current)onEvent(event)'));
assert(chat.includes('applyReceipt(old,user.id,data.type,data.up_to,data.at)'));
console.log('Native foreground timer and stale socket isolation: PASS');

const {createVoiceCapture}=require('../mobile/src/voiceCapture');
(async()=>{
 const capture=createVoiceCapture();let delivered=[],events=[],allowed=true;
 let resolvePermission;const permission=new Promise(resolve=>{resolvePermission=resolve;});
 const ops={current:()=>allowed,busy:v=>events.push('busy:'+v),permission:()=>permission,enableMode:async()=>events.push('mode'),resetMode:async()=>events.push('reset'),prepare:async()=>events.push('prepare'),record:()=>events.push('record'),stop:async()=>events.push('stop'),uri:()=>'/voice.m4a',deliver:u=>delivered.push(u),error:e=>{throw e;}};
 const first=capture.start(ops);capture.cancel();assert(capture.active());assert.equal(await capture.start(ops),false);
 resolvePermission({granted:true});assert.equal(await first,false);assert(!capture.active());assert(!events.includes('record'));
 assert(await capture.start({...ops,permission:async()=>({granted:true})}));await capture.stop();assert.deepEqual(delivered,['/voice.m4a']);
 assert(await capture.start({...ops,permission:async()=>({granted:true})}));capture.cancel();await new Promise(resolve=>setImmediate(resolve));assert(!capture.active());assert.equal(delivered.length,1);
 let prepareDone;const pending=capture.start({...ops,permission:async()=>({granted:true}),prepare:()=>new Promise(resolve=>{prepareDone=resolve;})});
 while(!prepareDone)await Promise.resolve();capture.cancel();prepareDone();assert.equal(await pending,false);assert(!capture.active());assert.equal(delivered.length,1);
 console.log('Voice permission race, room cancellation, exclusive recording and explicit send preview: PASS');
})().catch(e=>{console.error(e);process.exitCode=1;});
assert(chat.includes('cancelVoice();stopTyping()')&&chat.includes('voiceCaptureRef.current.active()'));
assert(chat.includes("state==='background')cancelVoice()")&&chat.includes('Tin nhắn thoại · Chưa gửi'));
assert(chat.includes('!guard.current(visit)||conversationKey(roomRef.current)!==key'));

const {chatLayout}=require('../mobile/src/chatLayout');
assert.deepEqual(chatLayout(320,1,'dm'),{compactHeader:true,compactComposer:true});
assert.deepEqual(chatLayout(500,1,'dm'),{compactHeader:false,compactComposer:false});
assert.deepEqual(chatLayout(460,1.5,'dm'),{compactHeader:true,compactComposer:false});
assert(chatLayout(390,1.5,'group').compactComposer);
assert(!chatLayout(400,1,'group').compactHeader);
assert(!chatLayout(320,1,'world').compactHeader);
assert(chat.includes('useWindowDimensions()')&&chat.includes('chatLayout(width,fontScale,room?.scope)'));
assert(chat.includes("dialog==='compactChatActions'")&&chat.includes("dialog==='compactAttachments'"));
assert(chat.includes('toolButton:{width:44,height:44')&&chat.includes('headerAction:{minWidth:47,minHeight:44'));
assert(chat.includes('accessibilityLabel="Thông tin hội thoại"'));
console.log('Responsive chat header/composer, large text, full action access and touch targets: PASS');

const mediaSource=read('mobile/src/media.js'),webUpload=read('static/chat-workflow.js'),serverUpload=read('features.py');
assert(mediaSource.includes('MAX_VIDEO_BYTES = 16 * 1024 * 1024')&&mediaSource.includes('attachmentLimit(mime)'));
assert(mediaSource.includes("file.type.startsWith('video/')?180000:60000"));
assert(webUpload.includes('(video?16:2)*1024*1024')&&webUpload.includes('xhr.timeout=video?180000:60000'));
assert(serverUpload.includes('MAX_VIDEO_UPLOAD = 16 * 1024 * 1024')&&serverUpload.includes('substring(file_content,?,?)'));
console.log('Original video upload size, network timeout and PostgreSQL byte-window delivery: PASS');
