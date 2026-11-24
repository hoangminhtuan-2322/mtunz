import AndroidUpdate from './AndroidUpdate';
import React,{useCallback,useEffect,useRef,useState} from 'react';
import * as Crypto from 'expo-crypto';
import * as Notifications from 'expo-notifications';
import {AudioModule,RecordingPresets,useAudioRecorder,useAudioRecorderState,setAudioModeAsync} from 'expo-audio';
import {ActivityIndicator,Alert,Animated,AppState,FlatList,Image,Keyboard,PanResponder,
  Linking,Modal,Platform,Pressable,ScrollView,StyleSheet,Text,TextInput,View} from 'react-native';
import {KeyboardChatScrollView,KeyboardStickyView} from 'react-native-keyboard-controller';
import Ionicons from '@expo/vector-icons/Ionicons';
import {SafeAreaView,useSafeAreaInsets} from 'react-native-safe-area-context';
import {API_ORIGIN,api,wsUrl} from './client';
import {attachmentSource,avatarSource,chooseFile,chooseMedia,chooseMediaBatch,copyChatText,
  saveSharedFile,uploadAttachment} from './media';

import DevicePushSettings,{reportPushVisibility} from './DevicePushSettings';
import {useNativeCall,NativeCallOverlay} from './NativeCall';
import {createRefreshQueue,mergeRecentWindow} from './realtime';
import {conversationKey,filterInbox,normalizeSearch,updateDraft,clearSentDraft,mergeHydratedDrafts,isReplySwipe,findHistory} from './inboxTools';
import {readDraftVault,writeDraftVault} from './draftVault';
import {createMediaBatch,runMediaBatch} from './mediaBatch';
import SharedConversationGallery from './SharedConversationGallery';
import {friendPresence} from './presence';

const P={bg:'#071320',card:'#11253a',border:'#294661',text:'#f4f8ff',soft:'#a8bfd6',accent:'#6dbaff',mine:'#2760a6',bad:'#ff9eac',green:'#73e0bd'};
const order=rows=>[...rows].sort((a,b)=>Number(a.id)-Number(b.id));
const dedupe=rows=>order([...new Map(rows.map(m=>[m.id,m])).values()]);
const label=f=>f?.nickname||f?.display_name||f?.username||f?.title||'Thành viên';
const readableTime=t=>t?new Date(t*1000).toLocaleTimeString('vi-VN',{hour:'2-digit',minute:'2-digit'}):'';
const sanitize=m=>({ ...m,reactions:m.reactions||[] });
const route=room=>room.scope==='dm'?'/api/messages/'+room.id:
  room.scope==='group'?'/api/groups/'+room.id+'/messages':
  '/api/world/messages?room_id='+room.id;
const toQuery=(path,params)=>path+(path.includes('?')?'&':'?')+new URLSearchParams(params).toString();

function Btn({children,onPress,quiet=false,disabled=false,danger=false,small=false}){
  return <Pressable accessibilityRole="button" onPress={onPress} disabled={disabled}
    style={({pressed})=>[css.btn,quiet&&css.ghost,danger&&css.danger,small&&css.smallBtn,
      pressed&&!disabled&&{opacity:.8},disabled&&css.disabled]}>
    <Text style={[css.btnTxt,(quiet||danger)&&{color:P.text}]}>{children}</Text>
  </Pressable>;
}
function Field({value,onChangeText,placeholder,secureTextEntry=false,revealPassword=false,multiline=false,keyboardType}){
  const [visible,setVisible]=useState(false);
  useEffect(()=>{if(!value||!revealPassword)setVisible(false);},[value,revealPassword]);
  useEffect(()=>{
    if(!revealPassword)return;
    const sub=AppState.addEventListener('change',state=>{if(state!=='active')setVisible(false);});
    return()=>sub.remove();
  },[revealPassword]);
  const field=<TextInput value={value} onChangeText={onChangeText} placeholder={placeholder}
    placeholderTextColor={P.soft} secureTextEntry={secureTextEntry&&(!revealPassword||!visible)} multiline={multiline}
    keyboardType={keyboardType} autoCapitalize={secureTextEntry?'none':undefined}
    autoCorrect={secureTextEntry?false:undefined}
    style={[css.input,revealPassword&&{paddingRight:56},multiline&&{minHeight:72,textAlignVertical:'top'}]}/>;
  if(!revealPassword)return field;
  return <View style={{position:'relative'}}>
    {field}
    <Pressable accessibilityRole="button" accessibilityLabel={visible?'Ẩn mật khẩu':'Hiển thị mật khẩu'}
      accessibilityState={{selected:visible}} onPress={()=>setVisible(v=>!v)}
      style={{position:'absolute',right:3,top:2,bottom:2,width:48,alignItems:'center',justifyContent:'center'}}>
      <Ionicons name={visible?'eye-off-outline':'eye-outline'} size={22} color={P.soft}/>
    </Pressable>
  </View>;
}
function Section({title,children}){return <View style={css.section}><Text style={css.h2}>{title}</Text>{children}</View>;}
function AccountGroup({title,children}){
 return <View style={css.accountGroup}>
  <Text style={css.accountGroupTitle}>{title}</Text>
  <View style={css.accountGroupBody}>{children}</View>
 </View>;
}
const ACCOUNT_ICON={'◉':'person-outline','♢':'shield-checkmark-outline',
  '▣':'notifications-outline','?':'help-circle-outline','↪':'log-out-outline'};
function AccountRow({symbol,title,subtitle,detail,onPress,danger=false}){
 return <Pressable accessibilityRole="button" accessibilityLabel={title}
   onPress={onPress} style={({pressed})=>[css.accountRow,pressed&&{opacity:.76}]}>
   <View style={[css.accountSymbol,danger&&css.accountSymbolDanger]}>
     <Ionicons name={ACCOUNT_ICON[symbol]||'ellipse-outline'} size={21}
       color={danger?'#ffb3ba':P.accent}/>
   </View>
   <View style={css.accountText}>
     <Text style={[css.accountTitle,danger&&css.accountDangerText]} numberOfLines={1}>{title}</Text>
     {!!subtitle&&<Text style={css.accountSubtitle} numberOfLines={2}>{subtitle}</Text>}
   </View>
   {!!detail&&<View style={css.accountCount}><Text style={css.accountCountText}>{detail}</Text></View>}
   <Text style={css.accountChevron}>›</Text>
 </Pressable>;
}
function EmptyState({symbol,title,subtitle}) {
  return <View style={css.emptyPanel}>
    <View style={css.emptySymbol}><Text style={css.emptySymbolText}>{symbol}</Text></View>
    <Text style={css.emptyTitle}>{title}</Text>
    <Text style={css.emptySubtitle}>{subtitle}</Text>
  </View>;
}
function ModalSheet({visible,onClose,title,children}){
  return <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
    <View style={css.overlay}><View style={css.sheet}>
      <View style={css.hrow}><Text style={css.h2}>{title}</Text>
        <Pressable onPress={onClose}><Text style={css.link}>Đóng</Text></Pressable></View>
      <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{gap:10,paddingBottom:20}}>{children}</ScrollView>
    </View></View>
  </Modal>;
}
function ConversationInfoSheet({title,avatar,onClose,children}){
  return <Modal visible animationType="slide" onRequestClose={onClose}>
    <SafeAreaView style={css.detailsScreen}>
      <View style={css.detailsHeader}>
        <View style={css.detailsAvatar}>
          {avatar?<Image source={avatar} style={css.detailsAvatarImage}/>:
            <Text style={css.detailsAvatarLetter}>{String(title||'?').slice(0,1).toUpperCase()}</Text>}
        </View>
        <View style={{flex:1,minWidth:0,gap:4}}> 
          <Text style={css.detailsEyebrow}>CHI TIẾT HỘI THOẠI</Text>
          <Text style={css.detailsTitle} numberOfLines={2}>{title}</Text>
          <Text style={css.detailsSubtitle}>Nội dung đã chia sẻ và tùy chọn trò chuyện</Text>
        </View>
        <Pressable accessibilityRole="button" onPress={onClose} style={css.detailsClose}>
          <Text style={css.detailsCloseText}>✕</Text>
        </Pressable>
      </View>
      <ScrollView keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}
        contentContainerStyle={css.detailsContent}>
        {children}
      </ScrollView>
    </SafeAreaView>
  </Modal>;
}
function Attachment({file,token,onOpen}){
  if(!file)return null;
  if(file.mime?.startsWith('image/')){
    return <Pressable accessibilityRole="button" accessibilityLabel="Xem ảnh trong cuộc trò chuyện"
      onPress={()=>onOpen(file)} style={css.photoAttachment}>
      <Image source={attachmentSource(file,token)} style={css.photoThumb}
        resizeMode="cover" accessibilityLabel="Ảnh đã chia sẻ"/>
    </Pressable>;
  }
  const isVideo=file.mime?.startsWith('video/');
  const isAudio=file.mime?.startsWith('audio/');
  return <Pressable accessibilityRole="button" accessibilityLabel={'Mở '+(file.name||'tệp đính kèm')}
    onPress={()=>onOpen(file)} style={css.attachment}>
    <Ionicons name={isVideo?'videocam-outline':isAudio?'musical-notes-outline':'document-attach-outline'}
      size={21} color={P.accent}/>
    <View style={{flex:1,minWidth:0,gap:4}}>
      <Text numberOfLines={1} style={css.attachmentText}>{file.name||'Tệp đính kèm'}</Text>
      <Text style={css.attachmentDetail}>{Math.ceil((file.size||0)/1024)} KB · Chạm để mở</Text>
    </View>
  </Pressable>;
}
function Message({item,own,token,onSelect,onOpen,onReply,highlighted}){
  const deleted=!!(item.deleted_at||item.deleted);
  const drag=useRef(new Animated.Value(0)).current;
  const swipeRef=useRef(null);
  swipeRef.current={enabled:!deleted&&!!onReply,reply:()=>onReply?.(item)};
  const responder=useRef(null);
  if(!responder.current)responder.current=PanResponder.create({
    onMoveShouldSetPanResponderCapture:(_,g)=>swipeRef.current.enabled&&isReplySwipe(g,15),
    onPanResponderMove:(_,g)=>drag.setValue(Math.max(0,Math.min(70,g.dx))),
    onPanResponderRelease:(_,g)=>{
      Animated.spring(drag,{toValue:0,useNativeDriver:true,speed:30,bounciness:0}).start();
      if(swipeRef.current.enabled&&isReplySwipe(g,55))swipeRef.current.reply();
    },
    onPanResponderTerminate:()=>Animated.spring(drag,{toValue:0,useNativeDriver:true}).start(),
    onPanResponderTerminationRequest:()=>true,
  });
  const reactions=item.reactions||[];
  const reactionCounts=new Map();
  for(const r of reactions)reactionCounts.set(r.emoji,(reactionCounts.get(r.emoji)||0)+1);
  return <Animated.View {...responder.current.panHandlers} style={{transform:[{translateX:drag}]}}>
    <Pressable onLongPress={()=>onSelect(item)} delayLongPress={330}
    style={[css.bubble,own?css.bubbleMine:css.bubbleOther,highlighted&&css.foundBubble,
      item.attachment?.mime?.startsWith('image/')&&!item.body?.trim()&&!deleted&&css.photoBubble]}>
    {!own&&(item.display_name||item.username)&&<Text style={css.sender}>{item.display_name||item.username}</Text>}
    {item.reply_to&&<Text style={css.reply}>↪ Trả lời tin #{item.reply_to}</Text>}
    {!!item.forwarded&&<Text style={css.reply}>↪ Đã chuyển tiếp</Text>}
    {(deleted||!!item.body?.trim())&&<Text style={[css.msg,deleted&&{color:P.soft,fontStyle:'italic'}]}>
      {deleted?'Tin nhắn đã thu hồi':item.body}
    </Text>}
    {!deleted&&<Attachment file={item.attachment} token={token} onOpen={onOpen}/>}
    {!!reactionCounts.size&&<Text style={css.reactionText}>
      {[...reactionCounts].map(([emoji,n])=>emoji+(n>1?' '+n:'')).join('  ')}
    </Text>}
    <View style={{flexDirection:'row',justifyContent:'flex-end',gap:5}}>
      {!!item.edited_at&&<Text style={css.muted}>Đã sửa</Text>}
      <Text style={css.time}>{readableTime(item.created_at)}</Text>
      {own&&item.read_at&&<Text style={css.time}>✓✓ Đã xem</Text>}
      {own&&!item.read_at&&item.delivered_at&&<Text style={css.time}>✓✓</Text>}
      {own&&!item.delivered_at&&!item.read_at&&<Text style={css.time}>✓</Text>}
    </View>
    </Pressable>
  </Animated.View>;
}

function FriendPresenceBadge({friend,connected,clock}){
  const presence=friendPresence(friend,connected,clock);
  if(!presence.short)return null;
  return <View style={css.chatPresenceRow}>
    <View style={[css.chatPresenceDot,presence.online?css.chatPresenceOnline:css.chatPresenceAway]}/>
    <Text numberOfLines={1} style={css.chatPresenceText}>{presence.short}</Text>
  </View>;
}
// Native IME animation drives both the composer and the inverted list.
// The outer App SafeAreaView already reserves the navigation-bar inset.
const ChatScrollView=React.forwardRef(function ChatScrollView({inverted,...props},ref){
  const {bottom}=useSafeAreaInsets();
  return <KeyboardChatScrollView {...props} ref={ref} inverted={inverted}
    offset={bottom} keyboardLiftBehavior="always"
    automaticallyAdjustContentInsets={false} contentInsetAdjustmentBehavior="never"/>;
});

export default function Messenger({token,user,onLogout,onExpired,onProfile}){
  const {bottom:keyboardBottomInset}=useSafeAreaInsets();
  const renderChatScroll=useCallback(props=><ChatScrollView {...props} inverted/>,[]);
  const [inboxQuery,setInboxQuery]=useState(''),[groupQuery,setGroupQuery]=useState('');
  const [drafts,setDrafts]=useState({}),[refreshingInbox,setRefreshingInbox]=useState(false);
  const [searchBusy,setSearchBusy]=useState(false),[searchDone,setSearchDone]=useState(false),[searchError,setSearchError]=useState('');
  const draftsRef=useRef({}),searchSeqRef=useRef(0),inboxRefreshRef=useRef(false),preferenceBusyRef=useRef(false);
  const draftDirtyRef=useRef(new Set()),draftReadyRef=useRef(false),draftSaveTimer=useRef(null);
  const inputRef=useRef(null),jumpRef=useRef(null),jumpTimer=useRef(null),jumpSeq=useRef(0),historyBusyRef=useRef(false);
  const [highlightId,setHighlightId]=useState(null),[historyBusy,setHistoryBusy]=useState(false),[sendStage,setSendStage]=useState('');
  const [mediaBatch,setMediaBatch]=useState(null);
  const batchesRef=useRef(new Map()),pickerBusyRef=useRef(false);
  function showBatch(key){if(conversationKey(roomRef.current)===key)setMediaBatch(batchesRef.current.get(key)||null);}
  function discardBatch(key){batchesRef.current.delete(key);showBatch(key);}
  const onSearchTargetVisible=useRef(({viewableItems})=>{
    const target=jumpRef.current;
    if(target&&viewableItems.some(v=>v.isViewable&&Number(v.item?.id)===target.id)){
      jumpRef.current=null;clearTimeout(jumpTimer.current);
    }
  }).current;
  const searchViewabilityConfig=useRef({itemVisiblePercentThreshold:20}).current;
  function persistDrafts(){
    clearTimeout(draftSaveTimer.current);
    if(draftReadyRef.current)void writeDraftVault(token,draftsRef.current).catch(()=>{});
  }
  function scheduleDraftSave(){
    clearTimeout(draftSaveTimer.current);
    if(draftReadyRef.current)draftSaveTimer.current=setTimeout(persistDrafts,250);
  }
  function changeStoredDraft(key,value){draftDirtyRef.current.add(key);draftsRef.current=updateDraft(draftsRef.current,key,value);setDrafts(draftsRef.current);scheduleDraftSave();}
  function removeSentDraft(key,value){draftDirtyRef.current.add(key);draftsRef.current=clearSentDraft(draftsRef.current,key,value);setDrafts(draftsRef.current);scheduleDraftSave();}
  const [inboxFilter,setInboxFilter]=useState('all'),[presenceClock,setPresenceClock]=useState(Date.now());
  const [newerMessages,setNewerMessages]=useState(false);
  const [tab,setTab]=useState('dm'),[room,setRoom]=useState(null),[friends,setFriends]=useState([]),
    [groups,setGroups]=useState([]),[notices,setNotices]=useState([]),[requests,setRequests]=useState([]),
    [worldStatus,setWorldStatus]=useState({open:false}),[worldRooms,setWorldRooms]=useState([]),
    [worldAlias,setWorldAlias]=useState(''),
    [connection,setConnection]=useState('connecting'),[error,setError]=useState(''),
    [loading,setLoading]=useState(false),[sending,setSending]=useState(false),
    [messages,setMessages]=useState([]),[more,setMore]=useState(false),
    [draft,setDraft]=useState(''),[picked,setPicked]=useState(null),
    [reply,setReply]=useState(null),[selection,setSelection]=useState(null),
    [dialog,setDialog]=useState(''),[friendQuery,setFriendQuery]=useState(''),
    [results,setResults]=useState([]),[nickname,setNickname]=useState(''),[groupTitle,setGroupTitle]=useState(''),
    [groupCandidates,setGroupCandidates]=useState([]),[groupDetail,setGroupDetail]=useState(null),
    [searchText,setSearchText]=useState(''),[searchResults,setSearchResults]=useState([]),
    [social,setSocial]=useState({}),[profile,setProfile]=useState(null),
    [displayName,setDisplayName]=useState(user.display_name||''),[bio,setBio]=useState(user.bio||''),
    [headline,setHeadline]=useState(''),[identityKind,setIdentityKind]=useState('display_name'),
    [secret,setSecret]=useState(''),[pin,setPin]=useState(''),[identityQuota,setIdentityQuota]=useState(null),
    [typing,setTyping]=useState(false),
    [noticesUnread,setNoticesUnread]=useState(0),[blocked,setBlocked]=useState([]),
    [requestInbox,setRequestInbox]=useState([]),[viewer,setViewer]=useState(null),
    [groupEditTitle,setGroupEditTitle]=useState(''),[groupEditDescription,setGroupEditDescription]=useState(''),
    [addGroupMembers,setAddGroupMembers]=useState([]),
    [reportReason,setReportReason]=useState('fraud'),[reportDescription,setReportDescription]=useState(''),
    [reportTarget,setReportTarget]=useState(null),
    [supportTickets,setSupportTickets]=useState([]),
    [supportPaused,setSupportPaused]=useState(false),
    [supportTicket,setSupportTicket]=useState(null),
    [supportMessages,setSupportMessages]=useState([]),
    [supportClaim,setSupportClaim]=useState(''),
    [supportDraft,setSupportDraft]=useState(''),
    [supportBusy,setSupportBusy]=useState(false),
    [deviceSessions,setDeviceSessions]=useState([]),
    [rememberedDevices,setRememberedDevices]=useState([]),
    [sessionsLoading,setSessionsLoading]=useState(false),
    [sessionMessage,setSessionMessage]=useState('');
  const roomRef=useRef(null),wsRef=useRef(null),activeRef=useRef(true),
    typingRef=useRef({active:false,lastSentAt:0,roomKey:'',timer:null}),
    remoteTypingRef=useRef(null),listRequestRef=useRef(0),
    keyRef=useRef(null),nonceRef=useRef(null),uploadRef=useRef(null),olderRef=useRef(false),
    listRef=useRef(null),loadSeq=useRef(0),liveRef=useRef({}),
    isAtLatestRef=useRef(true),lastNewestIdRef=useRef(null),
    presenceVersionRef=useRef(0),presenceEventsRef=useRef(new Map()),
    supportTicketRef=useRef(null),
    sendRef=useRef(false);
  roomRef.current=room;
  supportTicketRef.current=supportTicket;
  const replyRef=useRef(null);
  replyRef.current=reply;
  useEffect(()=>{
    let active=true;
    draftReadyRef.current=false;
    readDraftVault(token).then(saved=>{
      if(!active)return;
      draftsRef.current=mergeHydratedDrafts(saved,draftsRef.current,draftDirtyRef.current);
      setDrafts(draftsRef.current);draftReadyRef.current=true;
      const key=conversationKey(roomRef.current);
      if(key&&!draftDirtyRef.current.has(key)&&!replyRef.current?.edit_id)setDraft(draftsRef.current[key]||'');
      persistDrafts();
    }).catch(()=>{if(active)draftReadyRef.current=true;});
    const sub=AppState.addEventListener('change',state=>{if(state!=='active')persistDrafts();});
    return()=>{active=false;sub.remove();persistDrafts();clearTimeout(draftSaveTimer.current);};
  },[token]);
  useEffect(()=>()=>{clearTimeout(jumpTimer.current);jumpSeq.current++;},[]);
  const nativeCall=useNativeCall(wsRef,friends);
  const onCallSignal=nativeCall.onSignal;
  const endNativeCall=nativeCall.endCall;
  // Voice notes use the phone microphone only when explicitly requested.
  const recorder=useAudioRecorder(RecordingPresets.HIGH_QUALITY);
  const recordState=useAudioRecorderState(recorder,400);
  const [voiceBusy,setVoiceBusy]=useState(false);
  const voiceDeadlineRef=useRef(null);

  // Emit native typing transitions and recover if the peer disconnects abruptly.
  const transmitTyping=useCallback((target,on)=>{
    const socket=wsRef.current;
    if(!target||!['dm','group'].includes(target.scope)||socket?.readyState!==WebSocket.OPEN)return;
    try{socket.send(JSON.stringify(target.scope==='dm'?
      {type:'typing',to:target.id,on}:{type:'group-typing',group_id:target.id,on}));}catch{}
  },[]);
  const stopTyping=useCallback(()=>{
    const state=typingRef.current;
    if(state.timer)clearTimeout(state.timer);
    if(state.active&&roomRef.current)transmitTyping(roomRef.current,false);
    typingRef.current={active:false,lastSentAt:0,roomKey:'',timer:null};
  },[transmitTyping]);
  const sendTyping=useCallback(value=>{
    const target=roomRef.current;
    if(!target||!['dm','group'].includes(target.scope))return;
    if(!value.trim()){stopTyping();return;}
    const state=typingRef.current, key=target.scope+':'+target.id, at=Date.now();
    if(!state.active||state.roomKey!==key||at-state.lastSentAt>3000){
      transmitTyping(target,true);state.active=true;state.lastSentAt=at;state.roomKey=key;
    }
    if(state.timer)clearTimeout(state.timer);
    state.timer=setTimeout(stopTyping,3500);
  },[stopTyping,transmitTyping]);
  const updateRemoteTyping=useCallback(on=>{
    if(remoteTypingRef.current)clearTimeout(remoteTypingRef.current);
    remoteTypingRef.current=null;setTyping(!!on);
    if(on)remoteTypingRef.current=setTimeout(()=>{
      setTyping(false);remoteTypingRef.current=null;
    },5000);
  },[]);
  const alertError=useCallback(e=>{
    if(e?.status===401){onExpired();return;}
    setError(e?.message||'Không thể hoàn tất thao tác.');
  },[onExpired]);
  const invoke=useCallback(async(path,method='GET',data)=>{
    try{return await api(path,{token,method,data});}
    catch(e){if(e.status===401)onExpired();throw e;}
  },[token,onExpired]);
  const refreshLists=useCallback(async()=>{
    const requested=++listRequestRef.current;
    const presenceBefore=presenceVersionRef.current;
    const tasks=await Promise.allSettled([
      invoke('/api/friends'),invoke('/api/groups'),invoke('/api/notifications')]);
    if(requested!==listRequestRef.current)return;
    if(tasks[0].status==='fulfilled')setFriends((tasks[0].value.friends||[]).map(friend=>{
      const event=presenceEventsRef.current.get(friend.other_id);
      if(!event||event.version<=presenceBefore)return friend;
      return {...friend,online:event.online,last_seen:event.last_seen||friend.last_seen};
    }));
    if(tasks[1].status==='fulfilled')setGroups(tasks[1].value.groups||[]);
    if(tasks[2].status==='fulfilled'){
      const n=tasks[2].value.notifications||[];
      setNotices(n);setNoticesUnread(n.filter(x=>!x.read_at).length);
    }
  },[invoke]);
  const refreshSocial=useCallback(async()=>{
    try{
      const result=await invoke('/api/me/social');
      setSocial(result.profile||{});
      setHeadline(result.profile?.headline||'');
      setBio(result.profile?.bio||user.bio||'');
    }catch(e){alertError(e);}
  },[invoke,alertError,user.bio]);

  const loadWindow=useCallback(async(target,before=0)=>{
    if(!target)return;
    const generation=++loadSeq.current;
    const key=target.scope+':'+target.id;
    if(!before)setLoading(true);
    try{
      const path=route(target);
      const url=before?toQuery(path,{before:String(before)}):path;
      const response=await invoke(url);
      if(roomRef.current?.scope!==target.scope||roomRef.current?.id!==target.id)return;
      const next=(response.messages||[]).map(sanitize);
      setMessages(current=>{
        if(before)return dedupe([...next,...current]);
        // Keep live events received while the REST request was in flight.
        // Only the overlapping IDs should be replaced by the server snapshot.
        return mergeRecentWindow(current,next);
      });
      keyRef.current=key;
      if(next.length&&(!before || liveRef.current[key]===undefined))
        liveRef.current[key]=Math.max(Number(liveRef.current[key]||0),Number(next[next.length-1].id));
      setMore(next.length>=70);
      if(!before&&activeRef.current&&target.scope!=='world'){
        const newest=next.reduce((max,m)=>m.sender_id!==user.id&&!m.deleted_at?
          Math.max(max,Number(m.id)):max,0);
        if(newest){
          const endpoint=target.scope==='dm'?'/api/messages/read/'+target.id:
            '/api/groups/'+target.id+'/read';
          invoke(endpoint+'?up_to='+newest,'POST').catch(()=>{});
        }
      }
    }catch(e){alertError(e);}
    finally{if(!before&&generation===loadSeq.current)setLoading(false);olderRef.current=false;}
  },[invoke,alertError,user.id]);

  // Reconcile every unseen batch when a socket reconnects after network loss.
  // A latest-only refresh would silently skip messages during longer outages.
  const reconcileRoom=useCallback(async(target)=>{
    if(!target)return;
    if(target.scope==='world'){await loadWindow(target);return;}
    const key=target.scope+':'+target.id;
    let cursor=Number(liveRef.current[key]||0);
    if(!cursor){await loadWindow(target);return;}
    let page=0,moreAfter=false;
    try{
      do{
        const result=await invoke(toQuery(route(target),{after:String(cursor)}));
        if(roomRef.current?.scope!==target.scope||roomRef.current?.id!==target.id)return;
        const rows=(result.messages||[]).map(sanitize);
        if(!rows.length)break;
        setMessages(old=>dedupe([...old,...rows]));
        cursor=Number(rows[rows.length-1].id);
        liveRef.current[key]=Math.max(Number(liveRef.current[key]||0),cursor);
        moreAfter=!!result.more_after;
      }while(moreAfter&&++page<20);
      if(moreAfter){
        setError('Cuộc trò chuyện có nhiều tin mới. Đang giới hạn tải nền để tránh giật lag; hãy mở lại để tải thêm.');
        return;
      }
      await loadWindow(target);
    }catch(e){alertError(e);await loadWindow(target);}
  },[invoke,loadWindow,alertError]);

  const loadInbox=useCallback(async()=>{
    const results=await Promise.allSettled([invoke('/api/message-requests'),invoke('/api/blocks')]);
    if(results[0].status==='fulfilled')setRequestInbox(results[0].value.requests||[]);
    if(results[1].status==='fulfilled')setBlocked(results[1].value.users||[]);
  },[invoke]);
  const openRoom=useCallback(target=>{
    stopTyping();updateRemoteTyping(false);Keyboard.dismiss();
    searchSeqRef.current++;cancelHistoryJump();setSearchBusy(false);setDialog('');setSelection(null);
    isAtLatestRef.current=true;lastNewestIdRef.current=null;setNewerMessages(false);
    roomRef.current=target;keyRef.current=null;setMessages([]);setRoom(target);
    setDraft(draftsRef.current[conversationKey(target)]||'');setMediaBatch(batchesRef.current.get(conversationKey(target))||null);setPicked(null);setReply(null);setError('');setMore(false);setTyping(false);
    nonceRef.current=null;uploadRef.current=null;
    void loadWindow(target);
  },[loadWindow,stopTyping,updateRemoteTyping]);

  // One WebSocket for the entire authenticated mobile session. Reconcile on resume.
  useEffect(()=>{
    let closed=false,socket=null,retryDelay=1200,retryTimer=null,heartbeatTimer=null;
    const stopHeartbeat=()=>{clearInterval(heartbeatTimer);heartbeatTimer=null;};
    // A second event must not cancel a pending catch-up after reconnect.
    const refreshQueue=createRefreshQueue(kinds=>{
      if(!activeRef.current||closed)return;
      if(!kinds||kinds.includes('lists'))refreshLists().catch(alertError);
      const target=roomRef.current;
      if(target&&kinds?.includes('catchup'))reconcileRoom(target);
      else if(target&&(!kinds||kinds.includes('chat')))loadWindow(target);
    });
    const schedule=kinds=>refreshQueue.schedule(kinds);
    const onEvent=event=>{
      let data;try{data=JSON.parse(event.data);}catch{return;}
      if(typeof data.type==='string'&&data.type.startsWith('call-')){
        void onCallSignal(data);return;
      }
      const target=roomRef.current;
      if(data.type==='session-ended'||data.type==='account-sanction'){
        onExpired();return;
      }
      if(data.type==='typing'&&target?.scope==='dm'&&data.from_id===target.id){
        updateRemoteTyping(data.on);return;
      }
      if(data.type==='group-typing'&&target?.scope==='group'&&data.group_id===target.id){
        updateRemoteTyping(data.on);return;
      }
      if(data.type==='message'&&target?.scope==='dm'){
        const m=data.message;
        if(m&&(m.sender_id===target.id||m.recipient_id===target.id)){
          setMessages(old=>dedupe([...old,sanitize(m)]));
          if(m.sender_id!==user.id&&activeRef.current){
            invoke('/api/messages/delivered/'+target.id,'POST',{up_to:m.id}).catch(()=>{});
            invoke('/api/messages/read/'+target.id+'?up_to='+m.id,'POST').catch(()=>{});
          }
        }
      }
      if(data.type==='presence'&&Number.isSafeInteger(data.user_id)){
        const stamp=Number(data.last_seen);
        const event={online:data.online===true,
          last_seen:Number.isFinite(stamp)&&stamp>0?stamp:null,
          version:++presenceVersionRef.current};
        presenceEventsRef.current.set(data.user_id,event);
        setFriends(old=>old.map(friend=>friend.other_id===data.user_id?
          {...friend,online:event.online,last_seen:event.last_seen||friend.last_seen}:friend));
        setPresenceClock(Date.now());
      }
      if(data.type==='group-message'&&target?.scope==='group'&&data.group_id===target.id&&data.message){
        setMessages(old=>dedupe([...old,sanitize(data.message)]));
        if(activeRef.current&&data.message.sender_id!==user.id)
          invoke('/api/groups/'+target.id+'/read?up_to='+data.message.id,'POST').catch(()=>{});
      }
      if(data.type==='message-updated'&&target?.scope==='dm'&&data.peer_id===target.id||
         data.type==='group-message-updated'&&target?.scope==='group'&&data.group_id===target.id){
        setMessages(old=>old.map(m=>m.id===data.message_id?
          {...m,body:data.body,deleted_at:data.deleted_at,edited_at:data.edited_at,
           attachment:data.deleted_at?null:m.attachment,reactions:data.deleted_at?[]:m.reactions}:m));
      }
      if(data.type==='message-reaction'&&target?.scope==='dm'&&data.peer_id===target.id||
         data.type==='group-message-reaction'&&target?.scope==='group'&&data.group_id===target.id){
        setMessages(old=>old.map(m=>{
          if(m.id!==data.message_id)return m;
          const others=(m.reactions||[]).filter(r=>!(r.user_id===data.user_id&&r.emoji===data.emoji));
          return {...m,reactions:data.active?[...others,{user_id:data.user_id,emoji:data.emoji}]:others};
        }));
      }
      if(data.type==='read'&&target?.scope==='dm'&&data.by===target.id||
         data.type==='delivered'&&target?.scope==='dm'&&data.by===target.id){
        setMessages(old=>old.map(m=>m.sender_id===user.id&&m.id<=data.up_to?
          {...m,[data.type==='read'?'read_at':'delivered_at']:data.at}:m));
      }
      if(data.type==='world-message'&&target?.scope==='world'&&data.message?.room_id===target.id)
        setMessages(old=>dedupe([...old,sanitize(data.message)]));
      if(data.type==='world-message-removed'&&target?.scope==='world')loadWindow(target);
      if(data.type==='support-message'){
        const ticket=supportTicketRef.current;
        if(ticket&&data.ticket_id===ticket.id&&data.message)
          setSupportMessages(old=>old.some(m=>m.id===data.message.id)?old:[...old,data.message]);
        loadSupport().catch(()=>{});
      }
      if(data.type==='support-updated'||data.type==='support-deleted'){
        loadSupport().catch(()=>{});
        const ticket=supportTicketRef.current;
        if(ticket&&data.ticket_id===ticket.id){
          if(data.type==='support-deleted'){supportTicketRef.current=null;setSupportTicket(null);setSupportMessages([]);}
          else openSupportTicket(ticket).catch(()=>{});
        }
      }
      if(data.type==='world-status')setWorldStatus(old=>({...old,...data}));
      if(data.type==='world-rooms-updated')
        invoke('/api/world/rooms').then(value=>setWorldRooms(value.rooms||[])).catch(()=>{});
      if(['message','group-message','groups-updated','friends-updated','read','delivered',
          'message-updated','group-message-updated','message-reaction','group-message-reaction',
          'identity-updated','profile-updated','message-requests-updated','chat-alert-settings',
          'world-message','world-message-removed','world-status','world-rooms-updated','session-security-updated'].includes(data.type)){
        schedule(['lists']);
      }
      if(data.type==='groups-updated'&&target?.scope==='group')schedule();
      if(data.type==='friends-updated'&&target?.scope==='dm')schedule();
      if(data.type==='identity-updated'||data.type==='profile-updated'){
        onProfile?.();
        refreshSocial();
      }
      if(data.type==='message-requests-updated')loadInbox().catch(()=>{});
    };
    function connect(){
      if(closed||!activeRef.current)return;
      if(socket?.readyState===WebSocket.OPEN||socket?.readyState===WebSocket.CONNECTING)return;
      clearTimeout(retryTimer);retryTimer=null;
      try{socket=new WebSocket(wsUrl(),[],{headers:{Authorization:'Bearer '+token}});}
      catch{retryTimer=setTimeout(connect,retryDelay);return;}
      const current=socket;
      wsRef.current=current;setConnection('connecting');
      current.onopen=()=>{
        if(closed||wsRef.current!==current||!activeRef.current){current.close();return;}
        reportPushVisibility(current,true);
        const beat=()=>{
          if(!closed&&wsRef.current===current&&activeRef.current&&current.readyState===WebSocket.OPEN)
            current.send(JSON.stringify({type:'presence-heartbeat'}));
        };
        stopHeartbeat();
        beat();
        heartbeatTimer=setInterval(beat,6000);
        retryDelay=1200;setConnection('online');schedule(['lists','catchup']);
      };
      current.onmessage=event=>{if(wsRef.current===current)onEvent(event);};
      current.onerror=()=>{if(wsRef.current===current)setConnection('offline');};
      current.onclose=()=>{
        if(wsRef.current!==current)return;
        stopHeartbeat();endNativeCall(false);if(closed)return;
        setConnection('offline');
        typingRef.current.active=false;
        if(activeRef.current){retryTimer=setTimeout(connect,retryDelay);retryDelay=Math.min(30000,retryDelay*2);}
      };
    }
    connect();
    const sub=AppState.addEventListener('change',state=>{
      activeRef.current=state==='active';
      reportPushVisibility(socket,activeRef.current);
      if(!activeRef.current){stopTyping();updateRemoteTyping(false);stopHeartbeat();socket?.close();return;}
      if(socket?.readyState!==WebSocket.OPEN&&socket?.readyState!==WebSocket.CONNECTING)connect();
      schedule(['lists','catchup']);
    });
    const check=setInterval(()=>{if(activeRef.current&&socket?.readyState!==WebSocket.OPEN)schedule();},15000);
    return()=>{closed=true;stopTyping();if(remoteTypingRef.current)clearTimeout(remoteTypingRef.current);refreshQueue.stop();clearTimeout(retryTimer);stopHeartbeat();clearInterval(check);
      sub.remove();socket?.close();wsRef.current=null;};
  },[token,user.id,invoke,refreshLists,loadWindow,loadInbox,refreshSocial,reconcileRoom,alertError,onExpired,onProfile,stopTyping,updateRemoteTyping,onCallSignal,endNativeCall]);

  useEffect(()=>{refreshLists().catch(alertError);loadInbox().catch(()=>{});},[refreshLists,loadInbox,alertError]);
  useEffect(()=>{
    const onResponse=response=>{
      const data=response?.notification?.request?.content?.data||{};
      const scope=data.kind==='dm'?'dm':data.kind==='group'?'group':null;
      const chatId=Number(data.chat_id);
      if(!Number.isSafeInteger(chatId)||chatId<=0)return;
      if(scope){openRoom({scope,id:chatId});return;}
      if(data.kind==='support_reply'){
        setRoom(null);
        setDialog('support');
        invoke('/api/support/tickets').then(result=>{
          setSupportTickets(result.tickets||[]);
          setSupportPaused(!!result.paused);
          const item=(result.tickets||[]).find(ticket=>ticket.id===chatId);
          if(item)openSupportTicket(item).catch(alertError);
        }).catch(alertError);
      }
    };
    const sub=Notifications.addNotificationResponseReceivedListener(onResponse);
    Notifications.getLastNotificationResponseAsync().then(result=>{if(result)onResponse(result);}).catch(()=>{});
    return()=>sub.remove();
  },[openRoom]);
  const jumpBack=()=>{Keyboard.dismiss();stopTyping();updateRemoteTyping(false);searchSeqRef.current++;cancelHistoryJump();setSearchBusy(false);persistDrafts();
    roomRef.current=null;isAtLatestRef.current=true;lastNewestIdRef.current=null;
    setNewerMessages(false);setRoom(null);setSelection(null);setDialog('');refreshLists().catch(()=>{});};
  useEffect(()=>{
    const tick=()=>{if(AppState.currentState==='active')setPresenceClock(Date.now());};
    const interval=setInterval(tick,30000);
    const sub=AppState.addEventListener('change',tick);
    return()=>{clearInterval(interval);sub.remove();};
  },[]);
  const peer=friends.find(f=>f.other_id===room?.id),group=groups.find(g=>g.id===room?.id);
  const peerStatus=friendPresence(peer,connection==='online',presenceClock);
  async function openAttachment(file){
    if(file?.mime?.startsWith('image/')){setViewer(file);return;}
    await saveSharedFile(file,token).catch(alertError);
  }
  const roomTitle=room?.scope==='dm'?label(peer):room?.scope==='group'?(group?.title||'Nhóm'):worldRooms.find(r=>r.id===room?.id)?.title||'Chat thế giới';

  async function doSend(){
    if(!room||sending||sendRef.current)return;
    if(mediaBatch){await sendMediaBatch();return;}
    if(!draft.trim()&&!picked)return;
    if(room.scope==='world'&&draft.length>1200){setError('Tin nhắn thế giới tối đa 1200 ký tự.');return;}
    setSending(true);sendRef.current=true;setError('');setSendStage(picked?'Đang tải tệp…':'Đang gửi tin nhắn…');
    const scope=room.scope,originalRoom=room.scope+':'+room.id,text=draft.trim();
    const submittedDraft=draft;
    const key=originalRoom+':'+text+':'+(picked?.uri||'');
    const nonce=nonceRef.current?.key===key?nonceRef.current.id:Crypto.randomUUID();
    nonceRef.current={key,id:nonce};
    try{
      let attachmentId=uploadRef.current?.key===key?uploadRef.current.id:null;
      if(picked&&!attachmentId){
        const file=await uploadAttachment(token,picked,nonce);
        attachmentId=file.id;uploadRef.current={key,id:attachmentId};
      }
      setSendStage('Đang gửi tin nhắn…');
      const data={body:text,attachment_id:attachmentId||null};
      let endpoint='';
      if(scope==='dm'){endpoint='/api/messages';Object.assign(data,{recipient_id:room.id,reply_to:reply?.id||null,client_message_id:nonce});}
      if(scope==='group'){endpoint='/api/groups/'+room.id+'/messages';Object.assign(data,{reply_to:reply?.id||null,client_message_id:nonce});}
      if(scope==='world'){endpoint='/api/world/messages';Object.assign(data,{room_id:room.id,anonymous_name:social.world_anonymous?worldAlias.trim():''});}
      const result=await invoke(endpoint,'POST',data);
      removeSentDraft(originalRoom,submittedDraft);
      if(roomRef.current?.scope===scope&&roomRef.current?.id===room.id){
        if(!draftsRef.current[originalRoom])stopTyping();
        if(result.message)setMessages(old=>dedupe([...old,sanitize(result.message)]));
        if(scope==='world'&&!result.message)loadWindow(room);
        setDraft(draftsRef.current[originalRoom]||'');setPicked(null);setReply(null);nonceRef.current=null;uploadRef.current=null;
        scrollToLatest();
      }
      persistDrafts();refreshLists().catch(()=>{});
    }catch(e){
      if(conversationKey(roomRef.current)===originalRoom){
        alertError(e);setError((e.message||'Gửi thất bại')+' · Nhấn Gửi để thử lại, hệ thống giữ mã chống trùng.');
      }else if(e.status===401)onExpired();
    }finally{sendRef.current=false;setSending(false);setSendStage('');}
  }
  async function toggleVoice(){
    if(voiceBusy||sending||sendRef.current||mediaBatch||reply?.edit_id)return;
    setVoiceBusy(true);
    try{
      if(recordState.isRecording){
        await recorder.stop();
        clearTimeout(voiceDeadlineRef.current);
        voiceDeadlineRef.current=null;
        await setAudioModeAsync({allowsRecording:false,playsInSilentMode:true});
        if(!recorder.uri)throw Error('Không tìm thấy bản ghi âm.');
        const name='mtunz-voice-'+Date.now()+'.m4a';
        setPicked({uri:recorder.uri,name,type:'audio/mp4',size:recordState.fileSize||0});
        uploadRef.current=null;nonceRef.current=null;
      }else{
        const permission=await AudioModule.requestRecordingPermissionsAsync();
        if(!permission.granted)throw Error('Chưa cấp quyền micro để ghi âm.');
        await setAudioModeAsync({allowsRecording:true,playsInSilentMode:true});
        await recorder.prepareToRecordAsync();
        recorder.record();
        voiceDeadlineRef.current=setTimeout(async()=>{
          try{
            await recorder.stop();
            await setAudioModeAsync({allowsRecording:false,playsInSilentMode:true});
            if(recorder.uri)setPicked({
              uri:recorder.uri,name:'mtunz-voice-'+Date.now()+'.m4a',
              type:'audio/mp4',size:0});
          }catch(e){alertError(e);}
        },110000);
      }
    }catch(e){alertError(e);}
    finally{setVoiceBusy(false);}
  }
  useEffect(()=>()=>clearTimeout(voiceDeadlineRef.current),[]);
  async function pick(kind){
    if(sendRef.current||!room||pickerBusyRef.current||mediaBatch||recordState.isRecording||reply?.edit_id)return;
    const key=conversationKey(room),multi=kind==='media'&&room.scope!=='world';
    pickerBusyRef.current=true;
    try{
      const result=multi?await chooseMediaBatch():kind==='media'?await chooseMedia():await chooseFile();
      if(!result||conversationKey(roomRef.current)!==key||sendRef.current)return;
      const assets=multi?result:[result];
      if(!assets.length)return;
      if(assets.length===1){setPicked(assets[0]);}
      else{
        const batch=createMediaBatch(assets,()=>Crypto.randomUUID());
        batchesRef.current.set(key,batch);showBatch(key);setPicked(null);
      }
      nonceRef.current=null;uploadRef.current=null;
    }catch(e){alertError(e);}
    finally{pickerBusyRef.current=false;}
  }
  async function sendMediaBatch(){
    if(!room||room.scope==='world'||sendRef.current||reply?.edit_id)return;
    const target=room,key=conversationKey(target),batch=batchesRef.current.get(key);
    if(!batch)return;
    if(!batch.started){
      batch.started=true;batch.caption=draft.trim();batch.originalDraft=draft;batch.replyId=reply?.id||null;
    }
    sendRef.current=true;setSending(true);setError('');
    const active=()=>conversationKey(roomRef.current)===key&&batchesRef.current.get(key)===batch;
    try{
      await runMediaBatch(batch,{
        active,
        upload:async(file,nonce)=>{const result=await uploadAttachment(token,file,nonce);return result.id;},
        send:async(item,body,replyId)=>{
          const data={body,attachment_id:item.attachmentId,client_message_id:item.nonce,reply_to:replyId};
          if(target.scope==='dm')data.recipient_id=target.id;
          return invoke(target.scope==='dm'?'/api/messages':'/api/groups/'+target.id+'/messages','POST',data);
        },
        progress:(stage,index,total)=>{if(active())setSendStage((stage==='upload'?'Đang tải ảnh/video ':'Đang gửi ')+index+'/'+total+'…');},
        delivered:(result,index)=>{
          if(index===0){
            removeSentDraft(key,batch.originalDraft);persistDrafts();
            if(active()){setDraft(draftsRef.current[key]||'');setReply(null);}
          }
          if(active()&&result.message){setMessages(old=>dedupe([...old,sanitize(result.message)]));scrollToLatest();}
          if(active())setMediaBatch({...batch});
        }
      });
      if(batch.items.every(item=>item.sent)){discardBatch(key);}
      refreshLists().catch(()=>{});
    }catch(e){
      if(active()){setMediaBatch({...batch});setError((e.message||'Gửi thất bại')+' · Nhấn Gửi để tiếp tục các tệp còn lại, không gửi lại tệp đã xác nhận.');}
    }finally{sendRef.current=false;setSending(false);setSendStage('');}
  }
  function removeBatchItem(index){
    if(sendRef.current||!room||!mediaBatch||mediaBatch.started)return;
    const key=conversationKey(room),batch=batchesRef.current.get(key);
    if(!batch)return;
    batch.items=batch.items.filter((_,i)=>i!==index);
    if(!batch.items.length)discardBatch(key);else setMediaBatch({...batch});
  }
  function cancelBatch(){
    if(sendRef.current||!room||!mediaBatch)return;
    const key=conversationKey(room),expected=batchesRef.current.get(key);
    if(mediaBatch.started)Alert.alert('Bỏ lô đính kèm?','Tệp đã gửi sẽ không bị thu hồi. Tệp chưa xác nhận có thể đã tới máy chủ.',[
      {text:'Tiếp tục',style:'cancel'},{text:'Bỏ lô',style:'destructive',onPress:()=>{if(!sendRef.current&&batchesRef.current.get(key)===expected)discardBatch(key);}}]);
    else discardBatch(key);
  }
  function replyToMessage(message){
    if(!room||room.scope==='world'||sendRef.current||message.deleted_at||message.deleted)return;
    if(reply?.edit_id)setDraft(draftsRef.current[conversationKey(room)]||'');
    setReply(message);setSelection(null);
    requestAnimationFrame(()=>inputRef.current?.focus());
  }
  async function action(message,what){
    const scope=room.scope,id=room.id;
    try{
      if(what==='reply'){replyToMessage(message);return;}
      if(what==='copy'){await copyChatText(message.body);setSelection(null);return;}
      if(what==='edit'){if(mediaBatch||sendRef.current)return;setDraft(message.body);setReply({edit_id:message.id});setSelection(null);return;}
      if(what==='forward'){setDialog('forward');return;}
      if(what==='save'){if(message.attachment)await saveSharedFile(message.attachment,token);return;}
      if(what==='pin'){await invoke('/api/chat/pins','POST',{scope,chat_id:id,message_id:message.id});setSelection(null);return;}
      if(what==='delete'){
        Alert.alert('Thu hồi tin nhắn','Tin nhắn sẽ bị thu hồi trên web và app.',[
          {text:'Hủy',style:'cancel'},{text:'Thu hồi',style:'destructive',onPress:async()=>{
            try{await invoke(scope==='dm'?'/api/messages/'+message.id:'/api/groups/'+id+'/messages/'+message.id,'DELETE');}
            catch(e){alertError(e);}
          }}]);setSelection(null);return;
      }
      if(what.startsWith('react:')){
        const endpoint=scope==='dm'?'/api/messages/'+message.id+'/reaction':
          '/api/groups/'+id+'/messages/'+message.id+'/reaction';
        await invoke(endpoint,'POST',{emoji:what.slice(6)});setSelection(null);return;
      }
    }catch(e){alertError(e);}
  }
  async function sendEdit(){
    const mid=reply?.edit_id;if(!mid||!draft.trim()||!room||sendRef.current)return;
    sendRef.current=true;setSending(true);setSendStage('Đang lưu chỉnh sửa…');
    try{
      await invoke(room.scope==='dm'?'/api/messages/'+mid:
        '/api/groups/'+room.id+'/messages/'+mid,'PATCH',{body:draft.trim()});
      if(conversationKey(roomRef.current)===conversationKey(room)){
        setDraft(draftsRef.current[conversationKey(room)]||'');setReply(null);
      }
    }catch(e){alertError(e);}
    finally{sendRef.current=false;setSending(false);setSendStage('');}
  }
  function loadOlder(){
    if(!more||olderRef.current||historyBusyRef.current||loading||!messages.length||!room)return;
    const oldest=Math.min(...messages.map(m=>Number(m.id)));
    if(!oldest||oldest<1)return;
    olderRef.current=true;loadWindow(room,oldest);
  }

  async function openInfo(){
    if(!room||room.scope==='world')return;
    setDialog('info');
    try{
      if(room.scope==='dm')setNickname(peer?.nickname||'');
      if(room.scope==='group'){
        const detail=await invoke('/api/groups/'+room.id);setGroupDetail(detail);
        setGroupEditTitle(detail.group?.title||group?.title||'');
        setGroupEditDescription(detail.group?.description||'');setAddGroupMembers([]);
      }
    }catch(e){alertError(e);}
  }
  async function browsePeople(){
    if(!friendQuery.trim()){setResults([]);return;}
    try{const data=await invoke('/api/people/search?q='+encodeURIComponent(friendQuery.trim()));
      setResults(data.users||[]);}catch(e){alertError(e);}
  }
  async function perform(path,method='POST',data,after){
    setError('');
    try{const result=await invoke(path,method,data);
      if(after)await after(result);else await refreshLists();
      return result;
    }catch(e){alertError(e);return null;}
  }
  async function openProfile(id){
    setDialog('profile');
    try{const result=await invoke('/api/profile/'+id);setProfile(result.profile);}
    catch(e){alertError(e);}
  }
  async function initWorld(){
    try{
      const [status,rooms]=await Promise.all([invoke('/api/world/status'),invoke('/api/world/rooms')]);
      setWorldStatus(status);setWorldRooms(rooms.rooms||[]);
      if(status.open)openRoom({scope:'world',id:rooms.rooms?.[0]?.id||1});
    }catch(e){alertError(e);}
  }
  async function loadSupport(){
    const data=await invoke('/api/support/tickets');
    setSupportTickets(data.tickets||[]);setSupportPaused(!!data.paused);
  }
  async function openSupportTicket(item){
    const data=await invoke('/api/support/tickets/'+item.id+'/messages');
    setSupportTicket({...item,status:data.status||item.status});
    setSupportMessages(data.messages||[]);
  }
  async function createSupportTicket(){
    if(!supportClaim.trim()||supportBusy)return;
    setSupportBusy(true);
    try{
      const created=await invoke('/api/support/tickets','POST',{
        kind:'other',claim:supportClaim.trim(),
      });
      setSupportClaim('');
      await loadSupport();
      await openSupportTicket({id:created.id,kind:'other',claim:supportClaim.trim(),status:'open'});
    }catch(e){alertError(e);}finally{setSupportBusy(false);}
  }
  async function sendSupportMessage(){
    const ticket=supportTicketRef.current;
    const body=supportDraft.trim();
    if(!ticket||ticket.status!=='open'||!body||supportBusy)return;
    setSupportBusy(true);
    try{
      const result=await invoke('/api/support/tickets/'+ticket.id+'/messages','POST',{body});
      setSupportMessages(old=>old.some(m=>m.id===result.message.id)?old:[...old,result.message]);
      setSupportDraft('');
    }catch(e){alertError(e);}finally{setSupportBusy(false);}
  }
  async function loadDevices(){
    setSessionsLoading(true);setSessionMessage('');
    try{
      const result=await invoke('/api/me/sessions');
      setDeviceSessions(result.sessions||[]);
      setRememberedDevices(result.remembered_devices||[]);
    }catch(error){setSessionMessage(error.message||'Không lấy được danh sách thiết bị.');}
    finally{setSessionsLoading(false);}
  }
  async function revokeDevice(kind,item){
    if(item.current&&kind==='session')return;
    Alert.alert('Thu hồi thiết bị','Phiên đăng nhập này sẽ bị đăng xuất ngay. Bạn muốn tiếp tục?',[
      {text:'Hủy',style:'cancel'},
      {text:'Thu hồi',style:'destructive',onPress:()=>perform(
        '/api/me/sessions/'+kind+'/'+encodeURIComponent(item.id),'DELETE',undefined,loadDevices)},
    ]);
  }
  async function loadSettings(){
    await refreshSocial();
    try{setIdentityQuota((await invoke('/api/me/identity/status')).quota);}
    catch(e){alertError(e);}
  }
  // Inverted FlatList: visual bottom/newest is offset zero. Keep the user's
  // position while older history is loaded; follow live messages only if already
  // near the bottom, and always jump after a local send or input focus.
  function scrollToLatest(animated=true){
    jumpRef.current=null;clearTimeout(jumpTimer.current);setHighlightId(null);
    isAtLatestRef.current=true;setNewerMessages(false);
    // The inverted list may not have measured a just-sent image or message yet.
    // Scroll on the next frame, then let onContentSizeChange finish positioning.
    requestAnimationFrame(()=>listRef.current?.scrollToOffset({offset:0,animated}));
  }
  useEffect(()=>{
    if(!room)return;
    const newest=messages[messages.length-1];
    if(!newest)return;
    const id=Number(newest.id);
    if(!Number.isFinite(id))return;
    const previous=lastNewestIdRef.current;
    lastNewestIdRef.current=id;
    if(previous===null){scrollToLatest(false);return;}
    if(id>previous){
      if(isAtLatestRef.current)scrollToLatest(true);
      else setNewerMessages(true);
    }
  },[messages,room?.scope,room?.id]);
  function cancelHistoryJump(){
    jumpSeq.current++;historyBusyRef.current=false;setHistoryBusy(false);
    jumpRef.current=null;clearTimeout(jumpTimer.current);setHighlightId(null);
  }
  async function jumpToSearchResult(message){
    const target=roomRef.current,id=Number(message.id);
    if(!target||target.scope==='world'||!Number.isSafeInteger(id)||id<=0||historyBusyRef.current)return;
    if(olderRef.current||loading){setSearchError('Đang tải hội thoại. Hãy thử lại khi hoàn tất.');return;}
    const key=conversationKey(target),seq=++jumpSeq.current;
    historyBusyRef.current=true;setHistoryBusy(true);setSearchError('');
    const current=()=>seq===jumpSeq.current&&conversationKey(roomRef.current)===key;
    try{
      const found=await findHistory(messages,id,async before=>{
        const result=await invoke(toQuery(route(target),{before:String(before)}));
        return (result.messages||[]).map(sanitize);
      },current,8);
      if(!current())return;
      if(found.rows.length)setMessages(old=>dedupe([...found.rows,...old]));
      if(found.exhausted)setMore(false);
      if(!found.found){setSearchError(found.exhausted?'Tin nhắn không còn trong lịch sử.':'Tin nhắn nằm xa hơn giới hạn tải nhanh. Hãy mở thêm lịch sử rồi thử lại.');return;}
      searchSeqRef.current++;setSearchBusy(false);setDialog('');Keyboard.dismiss();
      isAtLatestRef.current=false;setHighlightId(id);
      jumpRef.current={id,key,attempts:0};
    }catch(e){if(current())setSearchError(e.message||'Không tải được lịch sử.');}
    finally{if(current()){historyBusyRef.current=false;setHistoryBusy(false);}}
  }
  useEffect(()=>{
    const target=jumpRef.current;
    if(!target||target.key!==conversationKey(room)||target.id!==highlightId)return;
    const index=[...messages].reverse().findIndex(m=>Number(m.id)===target.id);
    if(index<0)return;
    clearTimeout(jumpTimer.current);
    jumpTimer.current=setTimeout(()=>{
      if(jumpRef.current!==target)return;
      listRef.current?.scrollToIndex({index,animated:false,viewPosition:0.5});
    },100);
  },[messages,highlightId,room?.scope,room?.id]);
  function recoverSearchScroll(info){
    const target=jumpRef.current;
    if(!target||target.key!==conversationKey(roomRef.current))return;
    if(++target.attempts>4){jumpRef.current=null;setError('Đã tải tin nhắn, nhưng chưa thể cuộn đúng vị trí. Hãy thử tìm lại.');return;}
    const index=[...messages].reverse().findIndex(m=>Number(m.id)===target.id);
    if(index<0)return;
    listRef.current?.scrollToOffset({offset:Math.max(0,index*info.averageItemLength),animated:false});
    clearTimeout(jumpTimer.current);
    jumpTimer.current=setTimeout(()=>{if(jumpRef.current===target)listRef.current?.scrollToIndex({index,animated:false,viewPosition:0.5});},180);
  }
  // Do not wait for keyboardDidShow or drive keyboard position through JS.
  // Focus jumps to the latest message; the native IME animation handles movement.

  const tabs=[['dm','Tin nhắn','chatbubbles'],['groups','Nhóm','people'],
    ['people','Bạn bè','person-add'],['world','Thế giới','earth'],['settings','Cá nhân','settings']];
  const currentTab=tabs.find(x=>x[0]===tab)?.[1]||'Tin nhắn';
  const acceptedFriends=friends.filter(f=>f.state==='accepted'&&!f.archived&&!f.restricted);
  const activeFriends=connection==='online'?acceptedFriends.filter(f=>f.online===true):[];
  const unreadTotal=acceptedFriends.reduce((total,f)=>total+Number(f.unread||0),0);
  const matchingFriends=filterInbox(friends,inboxQuery,inboxFilter,connection==='online');
  const matchingGroups=groups.filter(g=>normalizeSearch(g.title).includes(normalizeSearch(groupQuery)));
  const archivedCount=friends.filter(f=>f.state==='accepted'&&f.archived&&!f.restricted).length;
  async function refreshInbox(){
    if(inboxRefreshRef.current)return;
    inboxRefreshRef.current=true;setRefreshingInbox(true);
    try{await refreshLists();}finally{inboxRefreshRef.current=false;setRefreshingInbox(false);}
  }
  function quickChatActions(friend){
    Keyboard.dismiss();
    Alert.alert(label(friend),'Quản lý cuộc trò chuyện',[
      {text:friend.pinned?'Bỏ ghim':'Ghim lên đầu',onPress:()=>quickPreference(friend,'pinned')},
      {text:friend.archived?'Khôi phục':'Lưu trữ',onPress:()=>quickPreference(friend,'archived')},
      {text:'Tùy chọn khác',onPress:()=>Alert.alert(label(friend),'Thông báo cuộc trò chuyện',[
        {text:'Hủy',style:'cancel'},{text:friend.muted?'Bật thông báo':'Tắt thông báo',onPress:()=>quickPreference(friend,'muted')},
      ])},
    ],{cancelable:true});
  }
  async function quickPreference(friend,field){
    if(preferenceBusyRef.current)return;
    preferenceBusyRef.current=true;
    try{
      const current=friends.find(f=>f.other_id===friend.other_id)||friend;
      const prefs={muted:!!current.muted,archived:!!current.archived,pinned:!!current.pinned};
      prefs[field]=!prefs[field];
      await perform('/api/chats/'+current.other_id+'/preferences','POST',prefs);
    }finally{preferenceBusyRef.current=false;}
  }
  function openMessageSearch(){
    Keyboard.dismiss();searchSeqRef.current++;setSearchText('');setSearchResults([]);
    setSearchBusy(false);setSearchDone(false);setSearchError('');setDialog('search');
  }
  function closeMessageSearch(){
    searchSeqRef.current++;cancelHistoryJump();setSearchBusy(false);setDialog('');
  }
  async function searchMessages(){
    const target=roomRef.current,query=searchText.trim();
    if(!target||target.scope==='world'||!query||searchBusy)return;
    const seq=++searchSeqRef.current;
    setSearchBusy(true);setSearchDone(false);setSearchError('');setSearchResults([]);
    try{
      const q=target.scope==='dm'?{q:query,other_id:String(target.id)}:{q:query,group_id:String(target.id)};
      const data=await invoke('/api/search/messages?'+new URLSearchParams(q));
      if(seq===searchSeqRef.current&&conversationKey(roomRef.current)===conversationKey(target)){
        setSearchResults(data.results||[]);setSearchDone(true);
      }
    }catch(e){if(seq===searchSeqRef.current)setSearchError(e.message||'Không thể tìm kiếm.');}
    finally{if(seq===searchSeqRef.current)setSearchBusy(false);}
  }

  return <View style={{flex:1,backgroundColor:P.bg}}>
    <NativeCallOverlay call={nativeCall}/>
    <View style={css.top}>
      <Pressable accessibilityRole="button" accessibilityLabel={room?'Trở lại danh sách':'Về tin nhắn'}
        style={css.headerMark}
        onPress={room?jumpBack:()=>{setTab('dm');refreshLists().catch(()=>{});}}>
        {room?<Ionicons name="arrow-back" size={25} color={P.text}/>:
          <Image source={require('../assets/brand-logo.png')} style={css.webIcon} resizeMode="contain"/>}
      </Pressable>
      {!!room&&room.scope==='dm'&&<View style={css.headerPeerAvatar}>
        {peer?.avatar_url?<Image source={avatarSource(peer.avatar_url,token)} style={css.headerPeerImage}/>:
          <Text style={css.headerPeerInitial}>{roomTitle.slice(0,1).toUpperCase()}</Text>}
        {peerStatus.online&&<View style={css.headerPeerOnline}/>}
      </View>}
      <View style={{flex:1,minWidth:0,gap:4}}>
        {!room&&<Text style={css.eyebrow}>MTUNZ · KẾT NỐI REALTIME</Text>}
        <Text style={css.title} numberOfLines={1}>{room?roomTitle:currentTab}</Text>
        <View style={css.statusRow}>
          {(room?.scope!=='dm'||peerStatus.kind!=='hidden')&&<View
            style={[css.statusDot,room?.scope==='dm'?
              (peerStatus.online?null:peerStatus.kind==='syncing'?css.statusOffline:css.statusIdle):
              connection!=='online'?css.statusOffline:null]}/>}
          <Text numberOfLines={2} style={css.statusText}>
            {room?.scope==='dm'?(typing?'Đang nhập tin nhắn…':
              peerStatus.short||'Không chia sẻ trạng thái hoạt động'):
              room?.scope==='group'?(typing?'Đang nhập tin nhắn…':
                (group?.member_count||'Nhóm')+' thành viên · '+(connection==='online'?'Đã đồng bộ':'Đang kết nối')):
              room?.scope==='world'?(typing?'Đang nhập tin nhắn…':connection==='online'?'Chat thế giới · Trực tuyến':'Đang kết nối lại…'):
              connection==='online'?'Đã kết nối · Đồng bộ trực tiếp':'Đang kết nối lại…'}
          </Text>
        </View>
      </View>
      {!!room&&room.scope==='dm'&&<>
        <Pressable accessibilityRole="button" accessibilityLabel={'Gọi thoại cho '+roomTitle}
          disabled={connection!=='online'} style={css.headerAction}
          onPress={()=>{Keyboard.dismiss();void nativeCall.startCall(room.id,roomTitle,false);}}>
          <Ionicons name="call-outline" color={connection==='online'?P.accent:P.soft} size={22}/>
        </Pressable>
        <Pressable accessibilityRole="button" accessibilityLabel={'Gọi video cho '+roomTitle}
          disabled={connection!=='online'} style={css.headerAction}
          onPress={()=>{Keyboard.dismiss();void nativeCall.startCall(room.id,roomTitle,true);}}>
          <Ionicons name="videocam-outline" color={connection==='online'?P.accent:P.soft} size={23}/>
        </Pressable>
      </>}
      {!!room&&room.scope!=='world'&&<Pressable accessibilityRole="button" accessibilityLabel="Tìm tin nhắn"
        style={css.headerAction} onPress={openMessageSearch}>
        <Ionicons name="search-outline" color={P.accent} size={21}/></Pressable>}
      {!!room&&room.scope!=='world'&&<Pressable accessibilityRole="button" style={css.headerAction} onPress={openInfo}>
        <Ionicons name="information-circle-outline" color={P.accent} size={23}/></Pressable>}
      {!room&&<Pressable accessibilityRole="button" accessibilityLabel="Làm mới"
        style={css.headerAction} onPress={()=>refreshLists().catch(alertError)}>
        <Ionicons name="refresh-outline" color={P.accent} size={23}/></Pressable>}
    </View>
    {!!error&&<Pressable onPress={()=>setError('')} style={css.errorBar}>
      <Text style={{color:P.bad}}>{error}  ×</Text>
    </Pressable>}
    {room?<View style={css.chatKeyboardArea}>
      {loading&&<ActivityIndicator color={P.accent}/>}
      <FlatList ref={listRef} inverted data={[...messages].reverse()} keyExtractor={m=>String(m.id)}
        renderScrollComponent={renderChatScroll} style={css.chatListViewport}
        onScrollToIndexFailed={recoverSearchScroll}
        onViewableItemsChanged={onSearchTargetVisible} viewabilityConfig={searchViewabilityConfig}
        onScrollBeginDrag={()=>{jumpRef.current=null;clearTimeout(jumpTimer.current);}}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode={Platform.OS==='ios'?'interactive':'none'}
        onScroll={event=>{
          if(jumpRef.current||historyBusyRef.current)return;
          const closeToLatest=event.nativeEvent.contentOffset.y<=100;
          isAtLatestRef.current=closeToLatest;
          if(closeToLatest&&newerMessages)setNewerMessages(false);
        }}
        scrollEventThrottle={16}
        onContentSizeChange={()=>{
          // Keep the most recent bubble visible after async image sizing and sends.
          // Never pull someone away from older messages they are reading.
          if(isAtLatestRef.current)listRef.current?.scrollToOffset({offset:0,animated:false});
        }}
        renderItem={({item})=><Message item={item} own={item.sender_id===user.id||item.is_mine}
          token={token} onSelect={room.scope==='world'?()=>{}:setSelection}
          onReply={room.scope==='world'?null:replyToMessage} highlighted={highlightId===Number(item.id)}
          onOpen={openAttachment}/>}
        initialNumToRender={15} maxToRenderPerBatch={10} windowSize={7}
        removeClippedSubviews={false} // avoid disappearing photo/video cells on Android
        contentContainerStyle={css.messageList}
        ListEmptyComponent={!loading?<EmptyState symbol="✉" title="Chưa có tin nhắn" subtitle="Hãy gửi lời chào đầu tiên. Tin nhắn sẽ đồng bộ với website."/>:null}
        onEndReached={loadOlder} onEndReachedThreshold={0.25}
        maintainVisibleContentPosition={{minIndexForVisible:0}}/>
      <KeyboardStickyView offset={{closed:0,opened:keyboardBottomInset}} style={css.stickyComposer}>
      {newerMessages&&<Pressable accessibilityRole="button" accessibilityLabel="Chuyển tới tin nhắn mới nhất"
        onPress={()=>scrollToLatest()} style={css.jumpLatest}>
        <Ionicons name="arrow-down" size={17} color="#f7fbff"/>
        <Text style={css.jumpLatestText}>Tin nhắn mới</Text>
      </Pressable>}
      {!!reply&&<View style={css.replyBar}>
        <View style={{flex:1,minWidth:0,gap:3}}><Text style={css.muted}>{reply.edit_id?'Chỉnh sửa tin nhắn':'↪ Trả lời tin nhắn'}</Text>
          {!reply.edit_id&&<Text style={css.strong} numberOfLines={1}>{reply.body||'Tệp đính kèm'}</Text>}</View>
        <Pressable onPress={()=>{setReply(null);if(reply.edit_id)setDraft(draftsRef.current[conversationKey(room)]||'');}}><Text style={css.link}>Hủy</Text></Pressable></View>}
      {recordState.isRecording&&<View style={css.replyBar}><Text style={css.muted}>🔴 Đang ghi âm {Math.round((recordState.durationMillis||0)/1000)} giây · nhấn ■ để dừng (tối đa 110 giây)</Text></View>}
      {!!mediaBatch&&<View style={css.batchPanel}>
        <View style={css.hrow}><Text style={[css.strong,{flex:1}]}>{mediaBatch.items.filter(item=>!item.sent).length} tệp chờ gửi</Text>
          <Pressable disabled={sending} accessibilityRole="button" accessibilityLabel="Bỏ lô đính kèm" onPress={cancelBatch}><Ionicons name="close-circle" size={23} color={P.accent}/></Pressable></View>
        <ScrollView horizontal keyboardShouldPersistTaps="handled" showsHorizontalScrollIndicator={false} contentContainerStyle={{gap:8}}>
          {mediaBatch.items.map((item,i)=>!item.sent&&<View key={item.nonce} style={css.batchTile}>
            {item.file.type.startsWith('image/')?<Image source={{uri:item.file.uri}} style={css.batchPhoto}/>:<Ionicons name="videocam" size={26} color={P.accent}/>}
            {!mediaBatch.started&&<Pressable disabled={sending} accessibilityRole="button" accessibilityLabel={'Bỏ tệp '+(i+1)} style={css.batchRemove} onPress={()=>removeBatchItem(i)}><Ionicons name="close-circle" size={20} color="#fff"/></Pressable>}
          </View>)}
        </ScrollView>
        {mediaBatch.started&&<Text style={css.muted}>Tiếp tục lô đã chọn; nội dung mới đang nhập được giữ lại.</Text>}
      </View>}
      {!!picked&&<View style={css.replyBar}>
        {picked.type?.startsWith('image/')?
          <><Image source={{uri:picked.uri}} style={css.pendingPhoto}/>
            <Text style={css.muted}>Ảnh đã chọn</Text></>:
          <><Ionicons name="attach-outline" size={19} color={P.accent}/>
            <Text style={[css.muted,{flex:1}]} numberOfLines={1}>{picked.name}</Text></>}
        <Pressable accessibilityRole="button" accessibilityLabel="Bỏ tệp đính kèm"
          disabled={sending} onPress={()=>{setPicked(null);uploadRef.current=null;}}>
          <Ionicons name="close-circle" size={22} color={P.accent}/></Pressable>
      </View>}
      {room.scope==='world'&&<Pressable accessibilityRole="button"
        accessibilityLabel="Chỉnh sửa tên ẩn danh" onPress={()=>{
          jumpBack();setTab('world');refreshSocial();
        }}><Text style={[css.muted,{paddingHorizontal:15,paddingVertical:4}]}>
          {social.world_anonymous?'Ẩn danh: '+(worldAlias.trim()||'Ẩn danh')+' · Đổi tên':'Đang hiện tên · Chọn ẩn danh'}
        </Text></Pressable>}
      {!!sendStage&&<View style={css.sendStatus}><ActivityIndicator size="small" color={P.accent}/><Text style={css.muted}>{sendStage}</Text></View>}
      <View style={css.compose}>
        <Pressable accessibilityLabel="Gửi ảnh hoặc video" accessibilityRole="button"
          style={css.toolButton} onPress={()=>pick('media')}><Ionicons name="images-outline" size={21} color={P.accent}/></Pressable>
        <Pressable accessibilityLabel="Đính kèm tệp" accessibilityRole="button"
          style={css.toolButton} onPress={()=>pick('file')}><Ionicons name="attach-outline" size={23} color={P.accent}/></Pressable>
        <Pressable accessibilityLabel={recordState.isRecording?'Dừng ghi âm':'Ghi âm'}
          accessibilityRole="button" style={css.toolButton}
          onPress={toggleVoice} disabled={voiceBusy||sending}><Ionicons name={recordState.isRecording?'stop-circle':'mic-outline'} size={21}
              color={recordState.isRecording?P.bad:P.accent}/></Pressable>
        <TextInput ref={inputRef} style={css.composeInput} multiline maxLength={room.scope==='world'?1200:2000}
          textAlignVertical="center" blurOnSubmit={false}
          onFocus={()=>scrollToLatest(false)}
          value={draft} placeholder="Tin nhắn…" placeholderTextColor={P.soft}
          onChangeText={value=>{
            if(!reply?.edit_id)changeStoredDraft(conversationKey(room),value);
            sendTyping(value);
            if(value!==draft){nonceRef.current=null;if(value.trim()!==draft.trim())uploadRef.current=null;}
            setDraft(value);
          }}/>
        <Pressable accessibilityRole="button" accessibilityLabel={sending?'Đang gửi tin nhắn':'Gửi tin nhắn'}
          disabled={sending||(!draft.trim()&&!picked&&!mediaBatch)} onPress={reply?.edit_id?sendEdit:doSend}
          style={[css.sendIconButton,(sending||(!draft.trim()&&!picked&&!mediaBatch))&&css.disabled]}>
          {sending?<ActivityIndicator size="small" color={P.bg}/>:
            <Ionicons name="send" size={20} color={P.bg}/>}
        </Pressable>
      </View>
      </KeyboardStickyView>
    </View>:<>
      {tab==='dm'&&<FlatList data={matchingFriends} refreshing={refreshingInbox} onRefresh={refreshInbox}
        keyboardShouldPersistTaps="handled" keyExtractor={f=>String(f.other_id)}
        contentContainerStyle={css.inboxContent}
        ListHeaderComponent={<View style={css.listHeader}>
          <View style={css.headerTitleRow}><View style={{flex:1,gap:4}}>
            <Text style={css.eyebrow}>HỘP THƯ CỦA BẠN</Text>
            <Text style={css.h2}>Cuộc trò chuyện</Text></View>
            <Text style={css.countPill}>{matchingFriends.length} liên hệ</Text></View>
          <View style={css.searchWrap}><Ionicons name="search-outline" size={19} color={P.soft}/>
            <TextInput value={inboxQuery} onChangeText={setInboxQuery}
              placeholder="Tìm cuộc trò chuyện..." placeholderTextColor={P.soft}
              style={css.searchInput}/>{!!inboxQuery&&<Pressable accessibilityRole="button" accessibilityLabel="Xóa tìm kiếm" onPress={()=>setInboxQuery('')}><Ionicons name="close-circle" color={P.soft} size={20}/></Pressable>}</View>
          <View style={css.filterRow}>{[
            ['all','Tất cả'],['unread','Chưa đọc'+(unreadTotal?' · '+unreadTotal:'')],
            ['online','Hoạt động'+(activeFriends.length?' · '+activeFriends.length:'')],
            ['pinned','Đã ghim'],['archived','Lưu trữ'+(archivedCount?' · '+archivedCount:'')]
          ].map(([value,title])=><Pressable key={value} accessibilityRole="button"
            accessibilityState={{selected:inboxFilter===value}} onPress={()=>setInboxFilter(value)}
            style={[css.filterChip,inboxFilter===value&&css.filterChipActive]}>
            <Text style={[css.filterText,inboxFilter===value&&css.filterTextActive]}>{title}</Text>
          </Pressable>)}</View>
          {connection==='online'&&activeFriends.length>0&&inboxFilter==='all'&&
            <View style={css.activeFriendsSection}>
              <View style={css.activeHeading}><Text style={css.activeLabel}>ĐANG HOẠT ĐỘNG</Text>
                <Text style={css.activeCount}>{activeFriends.length} bạn bè</Text></View>
              <ScrollView horizontal showsHorizontalScrollIndicator={false}
                contentContainerStyle={css.activeList}>{activeFriends.slice(0,12).map(friend=>
                <Pressable key={friend.other_id} accessibilityRole="button"
                  accessibilityLabel={'Nhắn tin với '+label(friend)+', đang hoạt động'}
                  onPress={()=>openRoom({scope:'dm',id:friend.other_id})} style={css.activePerson}>
                  <View style={css.activeAvatarWrap}><View style={css.activeAvatar}>
                    {friend.avatar_url?<Image source={avatarSource(friend.avatar_url,token)} style={css.activeAvatarImage}/>:
                      <Text style={css.activeInitial}>{label(friend).slice(0,1).toUpperCase()}</Text>}
                  </View><View style={css.activeDot}/></View>
                  <Text numberOfLines={1} style={css.activeName}>{label(friend)}</Text>
                </Pressable>)}</ScrollView>
            </View>}
        </View>}
        ListEmptyComponent={<EmptyState symbol="✉"
          title={inboxFilter==='online'?'Chưa có bạn bè trực tuyến':
            inboxFilter==='unread'?'Không có tin nhắn chưa đọc':
            inboxFilter==='archived'?'Chưa có hội thoại lưu trữ':inboxFilter==='pinned'?'Chưa có hội thoại ghim':
            inboxQuery?'Không tìm thấy hội thoại':'Bắt đầu kết nối'}
          subtitle={inboxFilter==='online'?(connection==='online'?
            'Danh sách tự cập nhật khi bạn bè trực tuyến.':'Đang kết nối lại để lấy trạng thái chính xác.'):
            inboxFilter==='unread'?'Tất cả tin nhắn đã được đọc.':
            inboxFilter==='archived'||inboxFilter==='pinned'?'Nhấn giữ hội thoại để quản lý.':
            inboxQuery?'Thử nhập tên khác hoặc mở tab Bạn bè.':
            'Kết bạn để gửi những tin nhắn đầu tiên.'}/>}
        renderItem={({item})=><Pressable accessibilityRole="button" style={css.chatRow}
          onLongPress={()=>quickChatActions(item)} delayLongPress={350}
          onPress={()=>openRoom({scope:'dm',id:item.other_id})}>
          <View style={css.avatarWrap}>
            <View style={css.avatar}>{item.avatar_url?<Image source={avatarSource(item.avatar_url,token)} style={css.avatarImage}/>:
              <Text style={css.avatarText}>{label(item).slice(0,1).toUpperCase()}</Text>}</View>
            {connection==='online'&&item.online===true&&<View style={css.onlineBadge}/>}
          </View>
          <View style={css.chatCopy}>
            <View style={css.chatTopLine}><Text style={css.chatName} numberOfLines={1}>{label(item)}</Text>
              {!!item.pinned&&<Ionicons name="pin" size={13} color={P.accent}/>}
              {!!item.muted&&<Ionicons name="notifications-off-outline" size={14} color={P.soft}/>}
              {!!item.last_message?.created_at&&<Text style={css.chatTime}>
                {readableTime(item.last_message.created_at)}</Text>}</View>
            <View style={css.chatBottomLine}><Text numberOfLines={1}
              style={[css.previewText,item.unread>0&&css.previewUnread]}>
              {drafts['dm:'+item.other_id]?'Bản nháp: '+drafts['dm:'+item.other_id]:item.last_message?.body||(connection==='online'&&item.online?'Đang hoạt động · Bắt đầu trò chuyện':'Nhấn để bắt đầu trò chuyện')}</Text>
              {item.unread>0&&<Text style={css.badge}>{item.unread>99?'99+':item.unread}</Text>}</View>
            <FriendPresenceBadge friend={item} connected={connection==='online'} clock={presenceClock}/>
          </View>
        </Pressable>}/>}
      {tab==='groups'&&<FlatList data={matchingGroups} refreshing={refreshingInbox} onRefresh={refreshInbox} keyExtractor={g=>String(g.id)}
        keyboardShouldPersistTaps="handled" contentContainerStyle={css.inboxContent}
        ListHeaderComponent={<View style={css.listHeader}>
          <View style={css.headerTitleRow}><View style={{flex:1,gap:3}}>
            <Text style={css.eyebrow}>CỘNG ĐỒNG RIÊNG</Text>
            <Text style={css.h2}>Nhóm của tôi</Text></View>
            <Btn small onPress={()=>setDialog('createGroup')}>＋ Tạo</Btn></View>
          <View style={css.searchWrap}><Ionicons name="search-outline" size={19} color={P.soft}/>
            <TextInput value={groupQuery} onChangeText={setGroupQuery}
              placeholder="Tìm nhóm..." placeholderTextColor={P.soft} style={css.searchInput}/></View>
        </View>}
        ListEmptyComponent={<EmptyState symbol="♧" title={groupQuery?'Không tìm thấy nhóm':'Chưa có nhóm nào'}
          subtitle="Tạo nhóm riêng để trò chuyện cùng bạn bè."/>}
        renderItem={({item})=><Pressable style={css.chatRow} onPress={()=>openRoom({scope:'group',id:item.id})}>
          <View style={[css.avatar,{backgroundColor:'#24466a'}]}>
            <Text style={[css.avatarText,{fontSize:24}]}>▦</Text></View>
          <View style={css.chatCopy}><View style={css.chatTopLine}>
            <Text style={css.chatName} numberOfLines={1}>{item.title}</Text>
            {!!item.last_message?.created_at&&<Text style={css.chatTime}>
              {readableTime(item.last_message.created_at)}</Text>}</View>
            <View style={css.chatBottomLine}><Text numberOfLines={1} style={css.previewText}>
              {drafts['group:'+item.id]?'Bản nháp: '+drafts['group:'+item.id]:item.member_count+' người · '+(item.last_message?.body||'Chưa có tin nhắn')}</Text>
              {item.unread>0&&<Text style={css.badge}>{item.unread}</Text>}</View></View>
        </Pressable>}/>}
      {tab==='people'&&<ScrollView showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled" contentContainerStyle={css.sectionContent}>
        <View style={css.screenIntro}>
          <Text style={css.eyebrow}>KẾT NỐI MỚI</Text>
          <Text style={css.h2}>Tìm bạn bè</Text>
          <Text style={css.muted}>Tìm theo tên hiển thị hoặc mã tài khoản để bắt đầu một cuộc trò chuyện.</Text>
        </View>
        <View style={css.section}>
          <Field value={friendQuery} onChangeText={setFriendQuery} placeholder="Tên hiển thị hoặc ID"/>
          <Btn onPress={browsePeople}>⌕  Tìm thành viên</Btn>
        </View>
        {results.map(p=><View key={'p'+p.id} style={css.rowCard}>
          <Pressable onPress={()=>openProfile(p.id)} style={{flex:1}}>
            <Text style={css.strong}>{p.display_name||p.username}</Text>
            <Text style={css.muted}>ID: {p.public_id}{p.private_profile?' · Riêng tư':''}</Text>
          </Pressable>
          {p.friend_state==='none'&&<Btn small onPress={()=>perform('/api/friends/request/'+p.id)}>Kết bạn</Btn>}
          {p.friend_state==='accepted'&&<Btn small quiet onPress={()=>openRoom({scope:'dm',id:p.id})}>Nhắn tin</Btn>}
          {p.friend_state==='pending'&&<Text style={css.muted}>Đang chờ</Text>}
        </View>)}
        <Text style={css.h2}>Lời mời kết bạn</Text>
        {friends.filter(f=>f.state==='pending'&&f.requested_by!==user.id).map(f=>
          <View key={'f'+f.other_id} style={css.rowCard}>
            <Text style={[css.strong,{flex:1}]}>{label(f)}</Text>
            <Btn small onPress={()=>perform('/api/friends/accept/'+f.other_id)}>Chấp nhận</Btn>
          </View>)}
        <Btn quiet onPress={()=>loadInbox().catch(alertError)}>Tải tin nhắn chờ</Btn>
        {requestInbox.map(r=><View key={'r'+r.id} style={css.section}>
          <Text style={css.strong}>{r.display_name||'Thành viên'} · Tin nhắn chờ</Text>
          <Text style={css.muted}>{r.intro}</Text>
          <View style={css.hrow}>
            <Btn small onPress={()=>perform('/api/message-requests/'+r.id+'/decision','POST',{accept:true},loadInbox)}>Đồng ý</Btn>
            <Btn quiet small onPress={()=>perform('/api/message-requests/'+r.id+'/decision','POST',{accept:false},loadInbox)}>Từ chối</Btn>
          </View>
        </View>)}
        <Text style={css.h2}>Bạn bè ({friends.filter(f=>f.state==='accepted').length})</Text>
        {friends.filter(f=>f.state==='accepted').map(f=><Pressable key={'a'+f.other_id}
          style={css.rowCard} onPress={()=>openRoom({scope:'dm',id:f.other_id})}>
          <Text style={[css.strong,{flex:1}]}>{label(f)}</Text>
          <Text style={css.link}>Nhắn tin</Text>
        </Pressable>)}
      </ScrollView>}
      {tab==='world'&&<ScrollView showsVerticalScrollIndicator={false}
        contentContainerStyle={css.sectionContent}>
        <View style={css.worldHero}>
          <Text style={css.eyebrow}>MTUNZ COMMUNITY</Text>
          <Text style={css.h2}>Chat thế giới</Text>
          <Text style={css.worldDesc}>Gặp gỡ những người mới, chia sẻ câu chuyện và kết nối trong các phòng trò chuyện.</Text>
          <View style={css.worldStatus}><View style={[css.statusDot,!worldStatus.open&&css.statusOffline]}/>
            <Text style={css.worldStatusText}>{worldStatus.open?'Đang mở':'Chưa mở hoặc tạm dừng'}</Text></View>
        </View>
        <View style={css.section}>
          <Text style={css.muted}>Các phòng chỉ hoạt động khi được quản trị viên cho phép. Hãy tôn trọng quy định cộng đồng.</Text>
          <Btn onPress={initWorld}>Kiểm tra trạng thái và vào phòng</Btn>
        </View>
        <View style={css.section}>
          <Text style={css.h2}>Danh tính khi chat thế giới</Text>
          <Text style={css.muted}>Chế độ ẩn danh đồng bộ với website; biệt danh áp dụng cho tin gửi mới.</Text>
          <Btn quiet onPress={()=>perform('/api/me/social','PATCH',
            {world_anonymous:!social.world_anonymous},async result=>{
              setSocial(result.profile||{});await onProfile?.();
            })}>
            {social.world_anonymous?'✓ Đang ẩn danh · Hiện tên thật':'Sử dụng tên ẩn danh'}
          </Btn>
          {social.world_anonymous&&<Field value={worldAlias}
            onChangeText={value=>setWorldAlias(value.slice(0,24))}
            placeholder="Biệt danh ẩn danh (2–24 ký tự)"/>}
          {social.world_anonymous&&<Text style={css.muted}>
            {worldAlias.trim()?'Gửi tin với tên '+worldAlias.trim():'Để trống sẽ hiển thị Ẩn danh'}
          </Text>}
        </View>
        {worldRooms.map(w=><Pressable key={w.id} style={css.rowCard}
          onPress={()=>openRoom({scope:'world',id:w.id})}>
          <View style={css.worldRoomIcon}><Text style={css.worldRoomGlyph}>◎</Text></View>
          <View style={{flex:1,gap:4}}><Text style={css.strong}>{w.title||'Phòng '+w.id}</Text>
            <Text style={css.muted}>Nhấn để tham gia phòng</Text></View>
          <Text style={css.link}>›</Text>
        </Pressable>)}
      </ScrollView>}
      {tab==='settings'&&<ScrollView keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false} contentContainerStyle={css.accountPage}>
        <View style={css.accountHero}>
          <View style={css.accountHeroAvatar}>
            {user.avatar_url?<Image source={avatarSource(user.avatar_url,token)} style={css.accountHeroImage}/>:
              <Text style={css.accountHeroInitial}>
                {(user.display_name||user.username||'M').slice(0,1).toUpperCase()}</Text>}
          </View>
          <View style={css.accountHeroCopy}>
            <Text style={css.accountHeroEyebrow}>TÀI KHOẢN MTUNZ</Text>
            <Text style={css.accountHeroName} numberOfLines={1}>{user.display_name||user.username}</Text>
            <Text style={css.accountHeroSecondary} numberOfLines={1}>@{user.username}</Text>
          </View>
          <Pressable accessibilityRole="button" accessibilityLabel="Chỉnh sửa hồ sơ"
            onPress={()=>{setDialog('settings');loadSettings();}} style={css.accountHeroEdit}>
            <Text style={css.accountHeroEditText}>Sửa</Text>
          </Pressable>
        </View>
        <AccountGroup title="Tài khoản và riêng tư">
          <AccountRow symbol="◉" title="Hồ sơ và quyền riêng tư"
            subtitle="Tên, giới thiệu và trạng thái hoạt động"
            onPress={()=>{setDialog('settings');loadSettings();}}/>
          <AccountRow symbol="♢" title="Bảo mật và thiết bị"
            subtitle="Phiên đăng nhập và quyền truy cập"
            onPress={()=>{setDialog('security');loadDevices();}}/>
        </AccountGroup>
        <AccountGroup title="Thông báo">
          <AccountRow symbol="▣" title="Thông báo trong ứng dụng"
            subtitle={noticesUnread?'Có '+noticesUnread+' thông báo chưa đọc':'Tin nhắn, lời mời và cập nhật'}
            detail={noticesUnread?String(noticesUnread>99?'99+':noticesUnread):null}
            onPress={()=>{setDialog('notifications');refreshLists();}}/>
          <DevicePushSettings token={token} compact/>
        </AccountGroup>
        <AccountGroup title="Ứng dụng"><AndroidUpdate/></AccountGroup>
        <AccountGroup title="Hỗ trợ">
          <AccountRow symbol="?" title="Trung tâm hỗ trợ"
            subtitle="Liên hệ quản trị viên hoặc gửi báo cáo"
            onPress={()=>{setDialog('support');loadSupport().catch(alertError);}}/>
          <AccountRow symbol="↪" title="Đăng xuất"
            subtitle="Thoát khỏi tài khoản trên thiết bị này" danger
            onPress={()=>Alert.alert('Đăng xuất','Đăng xuất khỏi ứng dụng này?',[
              {text:'Hủy',style:'cancel'},{text:'Đăng xuất',onPress:onLogout,style:'destructive'}])}/>
        </AccountGroup>
        <Text style={css.accountFooter}>mtunz · Cùng tài khoản, cùng dữ liệu trên web và ứng dụng</Text>
      </ScrollView>}
      <View style={css.tabs}>{tabs.map(([id,title,glyph])=><Pressable key={id}
        accessibilityRole="tab" accessibilityLabel={title} accessibilityState={{selected:tab===id}}
        onPress={()=>{setTab(id);setError('');if(id==='settings')loadSettings();if(id==='world')refreshSocial();}}
        style={({pressed})=>[css.tab,tab===id&&css.tabActive,pressed&&{opacity:.8}]}>
        <Ionicons name={tab===id?glyph:glyph+'-outline'} size={22}
          color={tab===id?P.accent:P.soft}/>
        <Text numberOfLines={1} style={[css.tabText,tab===id&&css.tabTextActive]}>{title}</Text>
      </Pressable>)}</View>
    </>}
    <ModalSheet visible={!!selection&&dialog!=='forward'} onClose={()=>setSelection(null)} title="Tùy chọn tin nhắn">
      {selection&&<><Text style={css.muted} numberOfLines={3}>{selection.body||'Tệp đính kèm'}</Text>
        <View style={css.hrow}>{['👍','❤️','😂','😮','😢','🙏'].map(emoji=>
          <Pressable key={emoji} onPress={()=>action(selection,'react:'+emoji)}>
            <Text style={{fontSize:25}}>{emoji}</Text></Pressable>)}</View>
        <Btn quiet onPress={()=>action(selection,'reply')}>↪ Trả lời</Btn>
        <Btn quiet onPress={()=>action(selection,'copy')}>Sao chép nội dung</Btn>
        <Btn quiet onPress={()=>action(selection,'pin')}>Ghim / bỏ ghim</Btn>
        <Btn quiet onPress={()=>action(selection,'forward')}>Chuyển tiếp</Btn>
        {!!selection.attachment&&<Btn quiet onPress={()=>action(selection,'save')}>Xem hoặc lưu tệp</Btn>}
        {selection.sender_id===user.id&&<><Btn quiet onPress={()=>action(selection,'edit')}>Sửa tin nhắn</Btn>
          <Btn danger onPress={()=>action(selection,'delete')}>Thu hồi trên mọi thiết bị</Btn></>}
      </>}
    </ModalSheet>
    <ModalSheet visible={dialog==='forward'} onClose={()=>{setDialog('');setSelection(null);}} title="Chuyển tiếp đến">
      {[...friends.filter(f=>f.state==='accepted').map(f=>({scope:'dm',id:f.other_id,name:label(f)})),
        ...groups.map(g=>({scope:'group',id:g.id,name:g.title}))].map(t=>
        <Btn quiet key={t.scope+t.id} onPress={()=>perform('/api/chat/forward','POST',{
          source_scope:room.scope,source_chat_id:room.id,message_id:selection.id,
          target_scope:t.scope,target_id:t.id,
        },async()=>{setDialog('');setSelection(null);await refreshLists();})}>{t.name}</Btn>)}
    </ModalSheet>
    {dialog==='info'&&<ConversationInfoSheet title={roomTitle}
      avatar={room?.scope==='dm'?avatarSource(peer?.avatar_url,token):null}
      onClose={()=>setDialog('')}>
      {room?.scope==='dm'&&<>
        <View style={css.detailsCard}>
          <Text style={css.detailsSectionTitle}>Biệt danh</Text>
          <Text style={css.detailsHelp}>Tên riêng chỉ bạn nhìn thấy trong cuộc trò chuyện này.</Text>
          <Field value={nickname} onChangeText={setNickname} placeholder="Đặt biệt danh"/>
          <Btn onPress={()=>perform('/api/chats/'+room.id+'/nickname','PUT',{nickname},
            async()=>{await refreshLists();})}>Lưu biệt danh</Btn>
        </View>
        <View style={css.detailActions}><View style={css.detailAction}>
          <Btn small quiet onPress={()=>perform('/api/chats/'+room.id+'/preferences','POST',{
            muted:!peer?.muted,archived:!!peer?.archived,pinned:!!peer?.pinned})}>
            {peer?.muted?'Bật thông báo':'Tắt thông báo'}</Btn></View>
          <View style={css.detailAction}><Btn small quiet onPress={()=>perform('/api/chats/'+room.id+'/preferences','POST',{
            muted:!!peer?.muted,archived:!!peer?.archived,pinned:!peer?.pinned})}>
            {peer?.pinned?'Bỏ ghim chat':'Ghim chat'}</Btn></View>
          <View style={css.detailAction}><Btn small quiet onPress={()=>perform('/api/chats/'+room.id+'/preferences','POST',{
            muted:!!peer?.muted,archived:!peer?.archived,pinned:!!peer?.pinned},jumpBack)}>
            {peer?.archived?'Khôi phục':'Lưu trữ'}</Btn></View>
          <View style={css.detailAction}><Btn small quiet onPress={()=>openProfile(room.id)}>Xem hồ sơ</Btn></View>
        </View>
      </>}
      {room?.scope==='group'&&<>
        <Text style={css.muted}>{groupDetail?.members?.length||group?.member_count||0} thành viên</Text>
        {(groupDetail?.members||[]).map(m=><View key={m.user_id} style={css.hrow}>
          <Text style={css.muted}>{m.username} · {m.role==='owner'?'Trưởng nhóm':'Thành viên'}</Text>
          {group?.role==='owner'&&m.user_id!==user.id&&<Btn danger small onPress={()=>Alert.alert('Xóa thành viên','Xóa người này khỏi nhóm?',[
            {text:'Hủy'},{text:'Xóa',style:'destructive',onPress:()=>perform(
              '/api/groups/'+room.id+'/members/'+m.user_id,'DELETE',undefined,
              async()=>{setGroupDetail(await invoke('/api/groups/'+room.id));await refreshLists();})}])}>Xóa</Btn>}
        </View>)}
        {group?.role==='owner'&&<>
          <Text style={css.h2}>Quản lý nhóm</Text>
          <Field value={groupEditTitle} onChangeText={setGroupEditTitle} placeholder="Tên nhóm"/>
          <Field value={groupEditDescription} onChangeText={setGroupEditDescription} placeholder="Mô tả nhóm"/>
          <Btn onPress={()=>perform('/api/groups/'+room.id,'PATCH',{
            title:groupEditTitle,description:groupEditDescription},
            async()=>{setGroupDetail(await invoke('/api/groups/'+room.id));await refreshLists();})}>Lưu thông tin nhóm</Btn>
          <Text style={css.h2}>Thêm bạn bè vào nhóm</Text>
          {friends.filter(f=>f.state==='accepted'&&!(groupDetail?.members||[]).some(m=>m.user_id===f.other_id))
            .map(f=><Pressable key={f.other_id} style={css.rowCard} onPress={()=>setAddGroupMembers(old=>
              old.includes(f.other_id)?old.filter(x=>x!==f.other_id):[...old,f.other_id])}>
              <Text style={css.strong}>{addGroupMembers.includes(f.other_id)?'☑':'□'} {label(f)}</Text></Pressable>)}
          <Btn disabled={!addGroupMembers.length} onPress={()=>perform('/api/groups/'+room.id+'/members',
            'POST',{member_ids:addGroupMembers},async()=>{setAddGroupMembers([]);
              setGroupDetail(await invoke('/api/groups/'+room.id));await refreshLists();})}>Thêm {addGroupMembers.length} thành viên</Btn>
        </>}
        <Btn danger onPress={()=>Alert.alert('Rời nhóm','Bạn muốn rời nhóm này?',[
          {text:'Hủy'},{text:'Rời nhóm',style:'destructive',onPress:()=>perform(
            '/api/groups/'+room.id+'/members/'+user.id,'DELETE',undefined,jumpBack)}])}>Rời nhóm</Btn>
      </>}
      <SharedConversationGallery room={room} token={token} onError={alertError}/>
      <Btn quiet onPress={openMessageSearch}>⌕ Tìm tin nhắn trong hội thoại</Btn>
    </ConversationInfoSheet>}
    <ModalSheet visible={dialog==='search'} onClose={closeMessageSearch} title="Tìm kiếm tin nhắn">
      <Field value={searchText} onChangeText={value=>{searchSeqRef.current++;setSearchText(value);setSearchResults([]);setSearchBusy(false);setSearchDone(false);setSearchError('');}} placeholder="Nhập nội dung cần tìm"/>
      <Btn disabled={searchBusy||!searchText.trim()} onPress={searchMessages}>{searchBusy?'Đang tìm…':'Tìm kiếm'}</Btn>
      {!!searchError&&<Text style={css.muted}>{searchError}</Text>}
      {searchDone&&<Text style={css.muted}>{searchResults.length?searchResults.length+' kết quả':'Không tìm thấy tin nhắn phù hợp.'}</Text>}
      {historyBusy&&<View style={css.sendStatus}><ActivityIndicator color={P.accent}/><Text style={css.muted}>Đang tìm vị trí tin nhắn…</Text></View>}
      {searchResults.map(m=><View key={m.id} style={css.rowCard}>
        <Pressable accessibilityRole="button" accessibilityLabel="Đi tới tin nhắn" disabled={historyBusy} onPress={()=>jumpToSearchResult(m)} style={{flex:1,gap:5}}><Text style={css.strong}>{m.body||'Tin nhắn đính kèm'}</Text>
          <Text style={css.muted}>{m.created_at?new Date(m.created_at*1000).toLocaleString('vi-VN'):'Tin #'+m.id} · Nhấn để đi tới</Text></Pressable>
        {!!m.body&&<Pressable accessibilityRole="button" accessibilityLabel="Sao chép kết quả" onPress={()=>copyChatText(m.body).catch(alertError)}><Ionicons name="copy-outline" size={22} color={P.accent}/></Pressable>}
      </View>)}
    </ModalSheet>
    <ModalSheet visible={dialog==='createGroup'} onClose={()=>setDialog('')} title="Tạo nhóm mới">
      <Field value={groupTitle} onChangeText={setGroupTitle} placeholder="Tên nhóm (2-70 ký tự)"/>
      {friends.filter(f=>f.state==='accepted').map(f=><Pressable key={f.other_id}
        onPress={()=>setGroupCandidates(old=>old.includes(f.other_id)?old.filter(x=>x!==f.other_id):[...old,f.other_id])}
        style={css.rowCard}><Text style={css.strong}>{groupCandidates.includes(f.other_id)?'☑':'□'} {label(f)}</Text></Pressable>)}
      <Btn disabled={groupTitle.trim().length<2||!groupCandidates.length}
        onPress={()=>perform('/api/groups','POST',{title:groupTitle.trim(),member_ids:groupCandidates},
          async result=>{setDialog('');setGroupTitle('');setGroupCandidates([]);await refreshLists();
            openRoom({scope:'group',id:result.id});})}>Tạo nhóm ({groupCandidates.length} người)</Btn>
    </ModalSheet>
    <ModalSheet visible={dialog==='profile'} onClose={()=>setDialog('')} title="Hồ sơ thành viên">
      {profile&&<><Text style={css.h2}>{profile.display_name}</Text>
        <Text style={css.muted}>ID {profile.public_id}</Text>
        <Text style={css.muted}>{profile.private?'Tài khoản riêng tư':profile.headline}</Text>
        <Text style={css.muted}>{profile.bio}</Text>
        {!profile.private&&<Btn quiet onPress={()=>{setDialog('');openRoom({scope:'dm',id:profile.id});}}>Nhắn tin</Btn>}
        {profile.id!==user.id&&<>
          {friends.some(f=>f.other_id===profile.id&&f.state==='accepted')&&
            <Btn danger onPress={()=>Alert.alert('Hủy kết bạn','Bạn có muốn hủy kết bạn?',[
              {text:'Hủy'},{text:'Hủy kết bạn',style:'destructive',onPress:()=>perform(
                '/api/friends/remove/'+profile.id,'POST',undefined,async()=>{setDialog('');await refreshLists();})}
              ])}>Hủy kết bạn</Btn>}
          <Btn danger onPress={()=>Alert.alert('Chặn tài khoản','Người này sẽ không thể nhắn tin với bạn.',[
            {text:'Hủy'},{text:'Chặn',style:'destructive',onPress:()=>perform(
              '/api/blocks/'+profile.id,'POST',undefined,async()=>{setDialog('');await loadInbox();await refreshLists();})}
          ])}>Chặn người dùng</Btn>
          <Btn quiet onPress={()=>{setReportTarget(profile.id);setDialog('report');}}>Báo cáo tài khoản</Btn>
        </>}
      </>}
    </ModalSheet>
    <ModalSheet visible={dialog==='report'} onClose={()=>setDialog('')} title="Báo cáo vi phạm">
      <Text style={css.muted}>Thông tin báo cáo chỉ gửi cho quản trị viên có quyền xử lý.</Text>
      <View style={css.hrow}>{[['fraud','Lừa đảo'],['harassment','Quấy rối'],['spam','Spam'],['other','Khác']].map(([id,t])=>
        <Btn key={id} small quiet={reportReason!==id} onPress={()=>setReportReason(id)}>{t}</Btn>)}</View>
      <Field value={reportDescription} onChangeText={setReportDescription}
        placeholder="Mô tả sự việc (tối thiểu 10 ký tự)" multiline/>
      <Btn disabled={reportDescription.trim().length<10} onPress={()=>perform('/api/reports','POST',{
        target_id:reportTarget,reason:reportReason,description:reportDescription.trim(),scope:'profile',
      },()=>{setDialog('');setReportDescription('');Alert.alert('Đã gửi','Báo cáo đã được gửi đến quản trị viên.');})}>
        Gửi báo cáo</Btn>
    </ModalSheet>
    <ModalSheet visible={dialog==='settings'} onClose={()=>setDialog('')} title="Cài đặt hồ sơ">
      <Text style={css.h2}>Tiểu sử và giới thiệu</Text>
      <Field value={bio} onChangeText={setBio} placeholder="Giới thiệu" multiline/>
      <Field value={headline} onChangeText={setHeadline} placeholder="Dòng giới thiệu ngắn"/>
      <Btn onPress={()=>perform('/api/me/profile','PATCH',{bio},
        async()=>perform('/api/me/social','PATCH',{headline},refreshSocial))}>Lưu hồ sơ</Btn>
      <Text style={css.h2}>Quyền riêng tư</Text>
      {['everyone','friends','only_me'].map(x=><Btn key={x} quiet={social.profile_visibility!==x}
        onPress={()=>perform('/api/me/social','PATCH',{profile_visibility:x},refreshSocial)}>
        {social.profile_visibility===x?'✓ ':''}{x==='everyone'?'Công khai':x==='friends'?'Chỉ bạn bè':'Riêng tư'}
      </Btn>)}
      <View style={css.privacyStatusPanel}>
        <View style={css.statusRow}><View style={[css.statusDot,!user.show_online&&css.statusIdle]}/>
          <Text style={css.privacyHeadline}>Trạng thái hoạt động: {user.show_online?'Đang hiển thị':'Đang ẩn'}</Text></View>
        <Text style={css.muted}>Cài đặt này đồng bộ với website. Khi ẩn, người khác không xem được trạng thái online hoặc lần hoạt động gần nhất của bạn.</Text>
        <Btn quiet onPress={()=>perform('/api/me/profile','PATCH',
          {show_online:!user.show_online},async()=>{await onProfile?.();await refreshLists();})}>
          {user.show_online?'Ẩn trạng thái hoạt động':'Hiện trạng thái hoạt động'}</Btn>
      </View>
      <Btn quiet onPress={()=>perform('/api/me/profile','PATCH',
        {show_receipts:!user.show_receipts},async()=>{await onProfile?.();await refreshLists();})}>
        {user.show_receipts?'Tắt':'Bật'} xác nhận đã đọc</Btn>
      <Text style={css.h2}>Đổi tên có xác minh</Text>
      <Text style={css.muted}>Tên đăng nhập: 1 lần / 60 ngày · tên hiển thị: 2 lần / 30 ngày</Text>
      <View style={css.hrow}>{['display_name','username'].map(x=><Btn key={x} small
        quiet={identityKind!==x} onPress={()=>setIdentityKind(x)}>
        {x==='display_name'?'Tên hiển thị':'Tên đăng nhập'}</Btn>)}</View>
      <Text style={css.muted}>Còn {identityQuota?.[identityKind]?.remaining??'?'} lượt đổi</Text>
      <Field value={displayName} onChangeText={setDisplayName} placeholder="Tên mới"/>
      <Field value={secret} onChangeText={setSecret} secureTextEntry revealPassword placeholder="Mật khẩu xác nhận"/>
      <Field value={pin} onChangeText={setPin} secureTextEntry placeholder="Mã PIN xác nhận"/>
      <Btn onPress={()=>perform('/api/me/identity/'+identityKind,'POST',{
        new_value:displayName,password:secret,pin},async()=>{setSecret('');setPin('');await loadSettings();})}>
        Đổi tên (mật khẩu + PIN)</Btn>
    </ModalSheet>
    <ModalSheet visible={dialog==='notifications'} onClose={()=>setDialog('')} title="Thông báo">
      <View style={css.notificationHeader}>
        <Text style={css.muted}>{noticesUnread?noticesUnread+' chưa đọc':'Bạn đã xem hết thông báo'}</Text>
        {noticesUnread>0&&<Btn small quiet onPress={()=>perform('/api/notifications/read','POST',{},refreshLists)}>
          Đánh dấu đã đọc</Btn>}
      </View>
      {notices.length===0&&<Text style={css.accountSubtitle}>Chưa có thông báo nào.</Text>}
      {notices.map((n,i)=><View key={n.id||i} style={[css.notificationItem,!n.read_at&&css.notificationUnread]}>
        {!n.read_at&&<View style={css.notificationDot}/>}
        <View style={{flex:1,minWidth:0,gap:5}}>
          <Text style={css.notificationBody}>{n.body||'Thông báo mới'}</Text>
          {!!n.created_at&&<Text style={css.accountSubtitle}>
            {new Date(n.created_at*1000).toLocaleString('vi-VN')}</Text>}
        </View>
      </View>)}
    </ModalSheet>
    <ModalSheet visible={dialog==='security'} onClose={()=>setDialog('')} title="Bảo mật & thiết bị">
      <Text style={css.muted}>Xem và thu hồi thiết bị ngay tại đây. Phiên bị thu hồi sẽ ngắt kết nối trên web và app.</Text>
      <View style={css.notificationHeader}>
        <Text style={css.accountGroupTitle}>Phiên đăng nhập · {deviceSessions.length}</Text>
        <Btn quiet small disabled={sessionsLoading} onPress={loadDevices}>
          {sessionsLoading?'Đang tải…':'Làm mới'}</Btn>
      </View>
      {!!sessionMessage&&<Text style={css.accountSubtitle}>{sessionMessage}</Text>}
      {!sessionsLoading&&deviceSessions.length===0&&
        <Text style={css.accountSubtitle}>Chưa có phiên đăng nhập nào được ghi nhận.</Text>}
      {deviceSessions.map(item=><View key={'s'+item.id} style={css.deviceCard}>
        <View style={css.deviceTitleRow}>
          <Text style={css.accountTitle} numberOfLines={1}>{item.label||item.device_name||'Thiết bị'}</Text>
          {item.current&&<Text style={css.deviceCurrent}>Thiết bị này</Text>}
        </View>
        <Text style={css.accountSubtitle}>{[item.os_name,item.browser].filter(Boolean).join(' · ')}</Text>
        {!!item.last_seen&&<Text style={css.accountSubtitle}>
          Hoạt động: {new Date(item.last_seen*1000).toLocaleString('vi-VN')}</Text>}
        {!item.current&&<Btn small quiet onPress={()=>revokeDevice('session',item)}>Thu hồi phiên</Btn>}
      </View>)}
      {!!rememberedDevices.length&&<Text style={css.accountGroupTitle}>Thiết bị đã ghi nhớ · {rememberedDevices.length}</Text>}
      {rememberedDevices.map(item=><View key={'r'+item.id} style={css.deviceCard}>
        <Text style={css.accountTitle}>{item.label||item.device_name||'Thiết bị ghi nhớ'}</Text>
        <Text style={css.accountSubtitle}>{[item.os_name,item.browser].filter(Boolean).join(' · ')}</Text>
        <Btn small quiet onPress={()=>revokeDevice('remembered',item)}>Thu hồi quyền ghi nhớ</Btn>
      </View>)}
      <Btn danger onPress={()=>Alert.alert('Thu hồi thiết bị','Đăng xuất tất cả thiết bị khác?',[
        {text:'Hủy',style:'cancel'},
        {text:'Thu hồi',style:'destructive',
          onPress:()=>perform('/api/me/sessions/revoke-others','POST',{},loadDevices)}])}>
        Đăng xuất khỏi các thiết bị khác</Btn>
    </ModalSheet>
    <ModalSheet visible={dialog==='support'} onClose={()=>setDialog('')} title="Trung tâm hỗ trợ">
      {supportTicket?<View style={css.section}>
        <Btn quiet small onPress={()=>{setSupportTicket(null);setSupportMessages([]);loadSupport().catch(alertError);}}>‹ Danh sách phiếu</Btn>
        <Text style={css.h2}>Phiếu #{supportTicket.id}</Text>
        <Text style={css.muted}>{supportTicket.claim||'Yêu cầu hỗ trợ'} · {supportTicket.status}</Text>
        {supportMessages.map((message,index)=><View key={message.id||index} style={css.rowCard}>
          <View style={{flex:1,gap:5}}>
            <Text style={css.strong}>{message.from_admin?'Quản trị viên':'Bạn'}</Text>
            <Text style={css.muted}>{message.body}</Text>
          </View>
        </View>)}
        {supportTicket.status==='open'?<>
          <Field value={supportDraft} onChangeText={setSupportDraft}
            placeholder="Nhập lời nhắn tới quản trị viên..." multiline/>
          <Btn disabled={supportBusy||!supportDraft.trim()} onPress={sendSupportMessage}>
            {supportBusy?'Đang gửi…':'Gửi hỗ trợ'}</Btn>
        </>:<Text style={css.muted}>Phiếu đã đóng. Bạn vẫn có thể xem lịch sử hỗ trợ.</Text>}
        <Btn quiet small onPress={()=>openSupportTicket(supportTicket).catch(alertError)}>Làm mới tin nhắn</Btn>
      </View>:<>
        <Text style={css.muted}>Yêu cầu hỗ trợ đồng bộ giữa ứng dụng và website khi đăng nhập cùng tài khoản.</Text>
        <Btn quiet small onPress={()=>loadSupport().catch(alertError)}>Làm mới phiếu hỗ trợ</Btn>
        <Text style={css.h2}>Các yêu cầu của bạn</Text>
        {supportTickets.map(ticket=><Pressable key={ticket.id} style={css.rowCard}
          onPress={()=>openSupportTicket(ticket).catch(alertError)}>
          <View style={{flex:1,gap:4}}>
            <Text style={css.strong}>#{ticket.id} · {ticket.claim||'Yêu cầu hỗ trợ'}</Text>
            <Text style={css.muted}>{ticket.status} · Nhấn để xem hội thoại</Text>
          </View>
        </Pressable>)}
        {!supportTickets.length&&<Text style={css.muted}>Bạn chưa có yêu cầu hỗ trợ nào.</Text>}
        <Text style={css.h2}>Tạo yêu cầu mới</Text>
        <Text style={css.muted}>{supportPaused?'Trung tâm hỗ trợ đang tạm ngừng nhận yêu cầu mới.':'Mô tả vấn đề để quản trị viên tiếp nhận và phản hồi.'}</Text>
        <Field value={supportClaim} onChangeText={value=>setSupportClaim(value.slice(0,160))}
          placeholder="Bạn đang cần hỗ trợ vấn đề gì?" multiline/>
        <Btn disabled={supportPaused||supportBusy||!supportClaim.trim()} onPress={createSupportTicket}>
          {supportBusy?'Đang gửi…':'Gửi yêu cầu hỗ trợ'}</Btn>
      </>}
    </ModalSheet>
    <Modal visible={!!viewer} transparent animationType="fade" onRequestClose={()=>setViewer(null)}>
      <View style={{flex:1,backgroundColor:'#03070ef5',justifyContent:'center',gap:16,padding:8}}>
        <View style={css.hrow}>
          <Pressable accessibilityRole="button" accessibilityLabel="Đóng ảnh"
            onPress={()=>setViewer(null)} style={css.viewerAction}>
            <Ionicons name="close" size={23} color={P.text}/></Pressable>
          <Pressable accessibilityRole="button" accessibilityLabel="Lưu hoặc chia sẻ ảnh"
            onPress={()=>saveSharedFile(viewer,token).catch(alertError)} style={css.viewerAction}>
            <Ionicons name="download-outline" size={23} color={P.text}/></Pressable>
        </View>
        {!!viewer&&<Image source={attachmentSource(viewer,token)}
          style={{flex:1,width:'100%'}} resizeMode="contain"/>}
      </View>
    </Modal>
  </View>;
}

const css=StyleSheet.create({
  btn:{backgroundColor:P.accent,paddingVertical:12,paddingHorizontal:15,alignItems:'center',
    justifyContent:'center',borderRadius:12,minHeight:45},
  ghost:{backgroundColor:'#213751',borderWidth:1,borderColor:P.border},
  danger:{backgroundColor:'#63324a'},smallBtn:{paddingHorizontal:12,paddingVertical:8,minHeight:39},
  btnTxt:{color:P.bg,fontWeight:'800',fontSize:13},disabled:{opacity:.45},
  input:{backgroundColor:'#0c1b2e',borderRadius:13,borderWidth:1,borderColor:'#35506d',
    color:P.text,minHeight:49,paddingHorizontal:14,marginVertical:2,fontSize:14},
  title:{fontSize:20,lineHeight:24,color:P.text,fontWeight:'900',letterSpacing:-.3},
  logo:{fontSize:25,fontWeight:'900',color:P.accent},
  h2:{fontSize:21,fontWeight:'900',color:P.text,letterSpacing:-.5},
  strong:{fontSize:14,fontWeight:'700',color:P.text},
  muted:{fontSize:12,lineHeight:18,color:P.soft},
  link:{color:P.accent,fontSize:14,fontWeight:'800'},
  top:{minHeight:74,borderBottomWidth:1,borderColor:'#253e58',flexDirection:'row',
    alignItems:'center',gap:10,paddingHorizontal:13,paddingVertical:9,backgroundColor:'#0d2236'},
  headerMark:{height:44,width:44,borderRadius:14,backgroundColor:'#233f5f',borderWidth:1,
    borderColor:'#3b5d7f',alignItems:'center',justifyContent:'center'},
  backGlyph:{fontSize:34,color:P.text,fontWeight:'500',lineHeight:40},
  webIcon:{width:43,height:43},
  headerAction:{minWidth:47,minHeight:42,alignItems:'center',justifyContent:'center',
    paddingHorizontal:8,borderRadius:12,backgroundColor:'#1b3451'},
  headerActionText:{color:P.accent,fontWeight:'800',fontSize:12},
  refreshGlyph:{color:P.accent,fontWeight:'600',fontSize:24},
  eyebrow:{fontSize:10,fontWeight:'900',letterSpacing:1.3,color:'#86bef2'},
  statusRow:{flexDirection:'row',alignItems:'center',gap:6},
  statusDot:{height:7,width:7,borderRadius:4,backgroundColor:P.green},
  statusOffline:{backgroundColor:'#f0c583'},
  statusText:{fontSize:11,color:P.soft,flexShrink:1,lineHeight:16},
  statusIdle:{backgroundColor:'#8ea6bf'},
  headerPeerAvatar:{height:43,width:43,borderRadius:15,backgroundColor:'#2c5175',
    justifyContent:'center',alignItems:'center',position:'relative'},
  headerPeerImage:{height:43,width:43,borderRadius:15},
  headerPeerInitial:{color:P.text,fontWeight:'900',fontSize:20},
  headerPeerOnline:{width:11,height:11,borderRadius:6,backgroundColor:P.green,
    borderWidth:2,borderColor:'#0d2236',position:'absolute',bottom:-1,right:-1},
  errorBar:{backgroundColor:'#40243a',borderBottomWidth:1,borderColor:'#704157',padding:11},
  hrow:{flexDirection:'row',alignItems:'center',justifyContent:'space-between',gap:9,flexWrap:'wrap'},
  detailsScreen:{flex:1,backgroundColor:P.bg},
  detailsHeader:{paddingHorizontal:19,paddingTop:17,paddingBottom:15,
    flexDirection:'row',alignItems:'center',gap:12,backgroundColor:'#102139',
    borderBottomWidth:1,borderBottomColor:'#31506f'},
  detailsAvatar:{width:48,height:48,borderRadius:17,backgroundColor:'#29486a',
    alignItems:'center',justifyContent:'center',overflow:'hidden'},
  detailsAvatarImage:{width:48,height:48},
  detailsAvatarLetter:{fontSize:24,fontWeight:'900',color:P.text},
  detailsEyebrow:{color:'#7abaff',letterSpacing:1.8,fontSize:10,fontWeight:'900'},
  detailsTitle:{color:P.text,fontSize:24,fontWeight:'900',letterSpacing:-.5,flexShrink:1},
  detailsSubtitle:{fontSize:12,color:P.soft},
  detailsClose:{height:43,width:43,borderRadius:15,backgroundColor:'#233b59',
    alignItems:'center',justifyContent:'center',borderColor:'#3b5776',borderWidth:1},
  detailsCloseText:{color:P.accent,fontSize:20,fontWeight:'800'},
  detailsContent:{padding:16,paddingBottom:40,gap:15},
  privacyStatusPanel:{padding:14,borderRadius:16,backgroundColor:'#153149',
    borderWidth:1,borderColor:'#315879',gap:10},
  privacyHeadline:{color:'#dff3ff',fontSize:13,fontWeight:'900',flexShrink:1},
  detailsCard:{padding:16,borderWidth:1,borderColor:'#355472',borderRadius:20,
    backgroundColor:'#16283f',gap:11},
  detailsSectionTitle:{fontSize:18,color:P.text,fontWeight:'900'},
  detailsHelp:{color:P.soft,fontSize:12,lineHeight:19},
  detailActions:{flexDirection:'row',flexWrap:'wrap',justifyContent:'space-between',gap:10},
  detailAction:{width:'48%',minWidth:0},
  section:{padding:15,backgroundColor:P.card,borderWidth:1,borderColor:P.border,
    borderRadius:16,gap:11},
  rowCard:{flexDirection:'row',alignItems:'center',gap:12,padding:14,
    backgroundColor:P.card,borderRadius:15,marginVertical:4,
    borderWidth:1,borderColor:P.border},
  inboxContent:{paddingHorizontal:14,paddingBottom:30,flexGrow:1},
  listHeader:{gap:13,paddingTop:20,paddingBottom:15},
  headerTitleRow:{flexDirection:'row',alignItems:'center',justifyContent:'space-between',gap:8},
  countPill:{color:'#a8d7ff',fontSize:11,fontWeight:'800',paddingVertical:7,
    paddingHorizontal:11,borderRadius:16,backgroundColor:'#203c59',overflow:'hidden'},
  searchWrap:{flexDirection:'row',alignItems:'center',borderWidth:1,borderColor:'#304866',
    backgroundColor:'#15283e',borderRadius:14,paddingHorizontal:13,minHeight:49,gap:10},
  searchGlyph:{fontSize:24,color:P.soft,fontWeight:'600'},
  searchInput:{flex:1,color:P.text,fontSize:14,minHeight:46,padding:0},
  filterRow:{flexDirection:'row',flexWrap:'wrap',gap:7},
  filterChip:{paddingHorizontal:12,paddingVertical:9,borderRadius:24,
    borderWidth:1,borderColor:'#304d6b',backgroundColor:'#162a40'},
  filterChipActive:{backgroundColor:'#24527b',borderColor:'#76bbf3'},
  filterText:{color:'#a7c2de',fontSize:12,fontWeight:'800'},
  filterTextActive:{color:'#fff'},
  activeFriendsSection:{backgroundColor:'#10283e',borderWidth:1,borderColor:'#294a68',
    borderRadius:19,padding:12,gap:12},
  activeHeading:{flexDirection:'row',justifyContent:'space-between',alignItems:'center'},
  activeLabel:{fontSize:10,letterSpacing:1.4,fontWeight:'900',color:'#a7d7ff'},
  activeCount:{fontSize:11,color:'#a1bcd5'},
  activeList:{gap:13,paddingBottom:2},
  activePerson:{width:66,alignItems:'center',gap:5},
  activeAvatarWrap:{width:52,height:52,position:'relative'},
  activeAvatar:{width:52,height:52,borderRadius:19,backgroundColor:'#285076',
    alignItems:'center',justifyContent:'center',overflow:'hidden'},
  activeAvatarImage:{width:52,height:52},
  activeInitial:{fontSize:21,fontWeight:'900',color:P.text},
  activeDot:{position:'absolute',width:13,height:13,borderRadius:7,
    backgroundColor:P.green,borderColor:'#10283e',borderWidth:2,right:-1,bottom:-1},
  activeName:{fontSize:11,color:'#d9eaf8',fontWeight:'700',textAlign:'center'},
  chatRow:{flexDirection:'row',alignItems:'center',gap:12,minHeight:86,
    paddingHorizontal:12,paddingVertical:13,marginBottom:9,backgroundColor:'#11263d',
    borderWidth:1,borderColor:'#284660',borderRadius:19},
  avatarWrap:{width:52,height:52,position:'relative'},
  avatar:{width:52,height:52,borderRadius:18,backgroundColor:'#31567c',
    alignItems:'center',justifyContent:'center',overflow:'hidden'},
  avatarImage:{width:52,height:52},avatarText:{color:P.text,fontWeight:'900',fontSize:21},
  onlineBadge:{position:'absolute',right:-1,bottom:-1,width:13,height:13,borderRadius:7,
    backgroundColor:P.green,borderWidth:2,borderColor:P.bg},
  chatCopy:{flex:1,minWidth:0,gap:6},
  chatTopLine:{flexDirection:'row',alignItems:'center',gap:8},
  chatName:{flex:1,color:P.text,fontSize:15,fontWeight:'800',letterSpacing:-.2},
  chatTime:{color:P.soft,fontSize:10},
  chatFlag:{color:'#8abde9',fontSize:16,fontWeight:'800'},
  chatPresenceRow:{flexDirection:'row',gap:6,alignItems:'center'},
  chatPresenceDot:{height:6,width:6,borderRadius:3},
  chatPresenceOnline:{backgroundColor:P.green},
  chatPresenceAway:{backgroundColor:'#879db6'},
  chatPresenceText:{fontSize:11,color:'#9db6ce',flexShrink:1},
  chatBottomLine:{flexDirection:'row',alignItems:'center',gap:8},
  previewText:{flex:1,color:P.soft,fontSize:12,lineHeight:17},
  previewUnread:{fontWeight:'800',color:'#dfecff'},
  badge:{backgroundColor:P.accent,color:P.bg,fontWeight:'900',fontSize:11,borderRadius:13,
    overflow:'hidden',paddingHorizontal:8,paddingVertical:4,minWidth:24,textAlign:'center'},
  empty:{textAlign:'center',padding:40,color:P.soft},
  emptyPanel:{alignItems:'center',paddingVertical:48,paddingHorizontal:20,gap:11},
  emptySymbol:{width:76,height:76,borderRadius:25,backgroundColor:'#1d3552',
    alignItems:'center',justifyContent:'center',borderWidth:1,borderColor:'#37577a'},
  emptySymbolText:{fontSize:35,color:P.accent},
  emptyTitle:{fontSize:17,color:P.text,fontWeight:'800'},
  emptySubtitle:{fontSize:13,color:P.soft,lineHeight:20,textAlign:'center',maxWidth:260},
  tabs:{flexDirection:'row',borderTopWidth:1,borderTopColor:P.border,
    paddingHorizontal:7,paddingTop:7,paddingBottom:7,backgroundColor:'#0d2235'},
  tab:{flex:1,alignItems:'center',justifyContent:'center',gap:4,minHeight:55,
    borderRadius:16,paddingHorizontal:1},
  tabActive:{backgroundColor:'#1c3d5d'},tabIcon:{fontSize:20,color:P.soft,fontWeight:'700'},
  tabIconActive:{color:P.accent},tabText:{fontSize:10,color:P.soft,fontWeight:'800'},
  tabTextActive:{color:'#b8dfff'},
  messageList:{paddingHorizontal:12,paddingVertical:17,flexGrow:1},
  bubble:{paddingVertical:11,paddingHorizontal:14,borderRadius:21,maxWidth:'84%',
    minWidth:86,marginVertical:4,gap:7,borderWidth:.5,borderColor:'#365675'},
  bubbleMine:{backgroundColor:P.mine,alignSelf:'flex-end',borderBottomRightRadius:7},
  foundBubble:{borderWidth:2,borderColor:'#e9b95c'},
  sendStatus:{flexDirection:'row',alignItems:'center',gap:8,paddingHorizontal:13,paddingVertical:5,backgroundColor:P.bg},
  batchPanel:{paddingHorizontal:13,paddingVertical:8,gap:7,backgroundColor:P.bg},
  batchTile:{width:58,height:58,borderRadius:10,backgroundColor:P.card,alignItems:'center',justifyContent:'center',overflow:'hidden'},
  batchPhoto:{width:58,height:58},batchRemove:{position:'absolute',right:1,top:1,backgroundColor:'#071320',borderRadius:12},
  bubbleOther:{backgroundColor:'#1c334d',alignSelf:'flex-start',borderBottomLeftRadius:7},
  sender:{color:P.accent,fontSize:11,fontWeight:'800'},
  reply:{color:P.soft,fontSize:11},
  msg:{color:P.text,fontSize:15,lineHeight:22},
  time:{fontSize:10,color:'#c9d9ed'},
  photoBubble:{padding:5,gap:4},
  photoAttachment:{borderRadius:17,overflow:'hidden',backgroundColor:'#13243b'},
  photoThumb:{width:248,height:228,maxWidth:'100%',borderRadius:15},
  attachmentDetail:{fontSize:11,color:P.soft},
  pendingPhoto:{width:46,height:46,borderRadius:10,backgroundColor:'#112438'},
  jumpLatest:{alignSelf:'center',flexDirection:'row',alignItems:'center',gap:7,
    paddingVertical:9,paddingHorizontal:14,borderRadius:22,backgroundColor:'#25629b',
    borderWidth:1,borderColor:'#72b7ed',marginBottom:6},
  jumpLatestText:{fontSize:12,color:'#f7fbff',fontWeight:'900'},
  sendIconButton:{width:44,height:44,borderRadius:16,alignItems:'center',
    justifyContent:'center',backgroundColor:P.accent},
  viewerAction:{width:44,height:44,borderRadius:14,backgroundColor:'#1c3656',
    alignItems:'center',justifyContent:'center'},
  attachment:{padding:12,borderWidth:1,borderColor:'#3d5a79',borderRadius:14,
    gap:10,flexDirection:'row',alignItems:'center',minWidth:180},
  thumb:{width:220,height:164,maxWidth:'100%',backgroundColor:P.bg,borderRadius:9},
  attachmentText:{color:P.text,fontSize:12,fontWeight:'700'},
  reactionText:{color:P.text,fontSize:13},
  chatKeyboardArea:{flex:1,minHeight:0},
  chatListViewport:{flex:1,minHeight:0},
  stickyComposer:{flexShrink:0,zIndex:2,backgroundColor:P.bg},
  compose:{flexDirection:'row',gap:6,paddingHorizontal:10,paddingTop:11,paddingBottom:10,
    width:'100%',minWidth:0,alignItems:'flex-end',borderTopColor:'#2d4a64',
    borderTopWidth:1,backgroundColor:'#10253a'},
  toolButton:{width:36,height:44,borderRadius:14,alignItems:'center',
    justifyContent:'center',backgroundColor:'#23405d'},
  toolGlyph:{color:P.accent,fontSize:20,fontWeight:'800'},
  composeInput:{flex:1,minWidth:40,minHeight:44,maxHeight:118,borderRadius:20,
    borderWidth:1,borderColor:'#406182',backgroundColor:'#1b334f',
    color:P.text,paddingHorizontal:14,paddingVertical:10,textAlignVertical:'top',fontSize:15},
  replyBar:{paddingVertical:10,paddingHorizontal:13,borderTopColor:P.border,borderTopWidth:1,
    flexDirection:'row',justifyContent:'space-between',gap:8,backgroundColor:'#11243b'},
  overlay:{flex:1,justifyContent:'flex-end',backgroundColor:'#020914b3'},
  sheet:{maxHeight:'85%',backgroundColor:P.bg,borderTopLeftRadius:25,
    borderTopRightRadius:25,padding:18,gap:14,borderWidth:1,borderColor:P.border},
  sectionContent:{paddingHorizontal:14,paddingTop:20,paddingBottom:55,gap:15},
  screenIntro:{gap:7,paddingHorizontal:5,paddingBottom:3},
  worldHero:{backgroundColor:'#193957',borderRadius:21,borderWidth:1,
    borderColor:'#37648a',padding:21,gap:12},
  worldDesc:{color:'#c4d8ed',fontSize:14,lineHeight:22},
  worldStatus:{flexDirection:'row',alignItems:'center',gap:9,alignSelf:'flex-start',
    paddingHorizontal:12,paddingVertical:8,borderRadius:20,backgroundColor:'#153047'},
  worldStatusText:{fontSize:12,color:'#d9eaff',fontWeight:'700'},
  worldRoomIcon:{height:42,width:42,borderRadius:13,backgroundColor:'#263f5b',
    alignItems:'center',justifyContent:'center'},
  worldRoomGlyph:{fontSize:25,color:P.accent},
  accountPage:{paddingHorizontal:15,paddingTop:16,paddingBottom:35,gap:19},
  accountHero:{flexDirection:'row',alignItems:'center',gap:12,padding:14,
    borderRadius:20,backgroundColor:'#153048',borderWidth:1,borderColor:'#315672'},
  accountHeroAvatar:{width:56,height:56,borderRadius:18,backgroundColor:'#335d83',
    alignItems:'center',justifyContent:'center',overflow:'hidden'},
  accountHeroImage:{width:56,height:56},
  accountHeroInitial:{fontSize:23,fontWeight:'900',color:P.text},
  accountHeroCopy:{flex:1,minWidth:0,gap:3},
  accountHeroEyebrow:{fontSize:10,letterSpacing:1.2,fontWeight:'900',color:'#8cc9f7'},
  accountHeroName:{fontSize:18,fontWeight:'900',color:P.text},
  accountHeroSecondary:{fontSize:12,color:P.soft},
  accountHeroEdit:{borderRadius:12,borderWidth:1,borderColor:'#3b6587',
    backgroundColor:'#244763',paddingHorizontal:13,paddingVertical:9},
  accountHeroEditText:{color:'#c1e2fc',fontSize:12,fontWeight:'800'},
  accountGroup:{gap:9},
  accountGroupTitle:{fontSize:13,fontWeight:'900',color:'#a8cce9',paddingLeft:5},
  accountGroupBody:{backgroundColor:'#12263c',borderRadius:18,overflow:'hidden',
    borderWidth:1,borderColor:'#2a4966'},
  accountRow:{flexDirection:'row',alignItems:'center',minHeight:70,paddingHorizontal:12,
    paddingVertical:12,gap:12,borderBottomWidth:1,borderColor:'#29415a'},
  accountSymbol:{width:40,height:40,borderRadius:13,alignItems:'center',
    justifyContent:'center',backgroundColor:'#244765'},
  accountSymbolText:{fontSize:20,fontWeight:'800',color:'#8fcfff'},
  accountSymbolDanger:{backgroundColor:'#442c3b'},
  accountDangerText:{color:'#ffb3ba'},
  accountText:{flex:1,minWidth:0,gap:4},
  accountTitle:{fontSize:14,fontWeight:'800',color:P.text},
  accountSubtitle:{fontSize:11,lineHeight:16,color:P.soft,flexShrink:1},
  accountChevron:{color:'#829eb9',fontSize:23,marginLeft:1},
  accountCount:{borderRadius:13,backgroundColor:'#285b87',minWidth:25,
    paddingHorizontal:7,paddingVertical:4,alignItems:'center'},
  accountCountText:{color:'#fff',fontSize:11,fontWeight:'900'},
  accountFooter:{fontSize:11,textAlign:'center',color:'#819eb7',paddingTop:2},
  deviceCard:{backgroundColor:'#19314a',borderRadius:13,borderWidth:1,
    borderColor:'#355571',padding:12,gap:8},
  deviceTitleRow:{flexDirection:'row',alignItems:'center',gap:8,justifyContent:'space-between'},
  deviceCurrent:{fontSize:10,color:'#76e3bf',fontWeight:'900',flexShrink:1},
  notificationHeader:{flexDirection:'row',justifyContent:'space-between',
    alignItems:'center',gap:10,flexWrap:'wrap'},
  notificationItem:{flexDirection:'row',gap:10,padding:12,borderRadius:13,
    borderWidth:1,borderColor:'#2c4968',backgroundColor:'#10243a'},
  notificationUnread:{backgroundColor:'#19344f',borderColor:'#41678a'},
  notificationDot:{width:8,height:8,borderRadius:4,backgroundColor:P.accent,marginTop:5},
  notificationBody:{color:P.text,fontSize:13,lineHeight:19},
  profileHero:{flexDirection:'row',alignItems:'center',gap:16,padding:21,
    borderRadius:22,backgroundColor:'#17324e',borderWidth:1,borderColor:'#35597c'},
  profileAvatar:{height:66,width:66,borderRadius:20,backgroundColor:'#38658b',
    justifyContent:'center',alignItems:'center'},
  profileInitial:{fontSize:30,color:P.text,fontWeight:'900'},
  profileName:{fontSize:20,fontWeight:'900',color:P.text,letterSpacing:-.4},

});
