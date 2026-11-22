import React,{useCallback,useEffect,useRef,useState} from 'react';
import * as Crypto from 'expo-crypto';
import {ActivityIndicator,Alert,AppState,FlatList,Image,KeyboardAvoidingView,
  Linking,Modal,Platform,Pressable,ScrollView,StyleSheet,Text,TextInput,View} from 'react-native';
import {api,wsUrl} from './client';
import {attachmentSource,avatarSource,chooseFile,chooseMedia,copyChatText,
  registerMobileNotifications,saveSharedFile,unregisterMobileNotifications,uploadAttachment} from './media';

const P={bg:'#071222',card:'#15253b',border:'#293c58',text:'#f5f7ff',soft:'#a1b2cd',accent:'#69b4ff',mine:'#24539b',bad:'#f39393'};
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
    style={[css.btn,quiet&&css.ghost,danger&&css.danger,small&&css.smallBtn,disabled&&css.disabled]}>
    <Text style={[css.btnTxt,(quiet||danger)&&{color:P.text}]}>{children}</Text>
  </Pressable>;
}
function Field({value,onChangeText,placeholder,secureTextEntry=false,multiline=false,keyboardType}){
  return <TextInput value={value} onChangeText={onChangeText} placeholder={placeholder}
    placeholderTextColor={P.soft} secureTextEntry={secureTextEntry} multiline={multiline}
    keyboardType={keyboardType} style={[css.input,multiline&&{minHeight:72,textAlignVertical:'top'}]}/>;
}
function Section({title,children}){return <View style={css.section}><Text style={css.h2}>{title}</Text>{children}</View>;}
function ModalSheet({visible,onClose,title,children}){
  return <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
    <View style={css.overlay}><View style={css.sheet}>
      <View style={css.hrow}><Text style={css.h2}>{title}</Text>
        <Pressable onPress={onClose}><Text style={css.link}>Đóng</Text></Pressable></View>
      <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{gap:10,paddingBottom:20}}>{children}</ScrollView>
    </View></View>
  </Modal>;
}
function Attachment({file,token,onOpen}){
  if(!file)return null;
  const image=file.mime?.startsWith('image/');
  return <Pressable onPress={()=>onOpen(file)} style={css.attachment}>
    {image&&<Image source={attachmentSource(file,token)} style={css.thumb} resizeMode="contain"/>}
    <Text numberOfLines={2} style={css.attachmentText}>
      {image?'🖼️':file.mime?.startsWith('video/')?'🎬':file.mime?.startsWith('audio/')?'🎙️':'📎'} {file.name||'Đính kèm'} · {Math.ceil((file.size||0)/1024)} KB
    </Text>
    <Text style={css.muted}>Nhấn để mở / lưu vào máy</Text>
  </Pressable>;
}
function Message({item,own,token,onSelect,onOpen}){
  const deleted=!!(item.deleted_at||item.deleted);
  const reactions=item.reactions||[];
  const reactionCounts=new Map();
  for(const r of reactions)reactionCounts.set(r.emoji,(reactionCounts.get(r.emoji)||0)+1);
  return <Pressable onLongPress={()=>onSelect(item)} delayLongPress={330}
    style={[css.bubble,own?css.bubbleMine:css.bubbleOther]}>
    {!own&&item.username&&<Text style={css.sender}>{item.username}</Text>}
    {item.reply_to&&<Text style={css.reply}>↪ Trả lời tin #{item.reply_to}</Text>}
    {!!item.forwarded&&<Text style={css.reply}>↪ Đã chuyển tiếp</Text>}
    <Text style={[css.msg,deleted&&{color:P.soft,fontStyle:'italic'}]}>
      {deleted?'Tin nhắn đã thu hồi':item.body||''}
    </Text>
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
  </Pressable>;
}

export default function Messenger({token,user,onLogout,onExpired}){
  const [tab,setTab]=useState('dm'),[room,setRoom]=useState(null),[friends,setFriends]=useState([]),
    [groups,setGroups]=useState([]),[notices,setNotices]=useState([]),[requests,setRequests]=useState([]),
    [worldStatus,setWorldStatus]=useState({open:false}),[worldRooms,setWorldRooms]=useState([]),
    [connection,setConnection]=useState('connecting'),[error,setError]=useState(''),
    [loading,setLoading]=useState(false),[sending,setSending]=useState(false),
    [messages,setMessages]=useState([]),[more,setMore]=useState(false),
    [draft,setDraft]=useState(''),[picked,setPicked]=useState(null),
    [reply,setReply]=useState(null),[selection,setSelection]=useState(null),
    [dialog,setDialog]=useState(''),[friendQuery,setFriendQuery]=useState(''),
    [results,setResults]=useState([]),[nickname,setNickname]=useState(''),[groupTitle,setGroupTitle]=useState(''),
    [groupCandidates,setGroupCandidates]=useState([]),[groupDetail,setGroupDetail]=useState(null),
    [infoView,setInfoView]=useState('media'),[infoRows,setInfoRows]=useState([]),
    [searchText,setSearchText]=useState(''),[searchResults,setSearchResults]=useState([]),
    [social,setSocial]=useState({}),[profile,setProfile]=useState(null),
    [displayName,setDisplayName]=useState(user.display_name||''),[bio,setBio]=useState(user.bio||''),
    [headline,setHeadline]=useState(''),[identityKind,setIdentityKind]=useState('display_name'),
    [secret,setSecret]=useState(''),[pin,setPin]=useState(''),[identityQuota,setIdentityQuota]=useState(null),
    [pushState,setPushState]=useState('Chưa bật'),[typing,setTyping]=useState(false),
    [noticesUnread,setNoticesUnread]=useState(0),[blocked,setBlocked]=useState([]),
    [requestInbox,setRequestInbox]=useState([]);
  const roomRef=useRef(null),wsRef=useRef(null),activeRef=useRef(true),timers=useRef({}),
    keyRef=useRef(null),nonceRef=useRef(null),uploadRef=useRef(null),olderRef=useRef(false),
    listRef=useRef(null),loadSeq=useRef(0),liveRef=useRef({}),
    sendRef=useRef(false);
  roomRef.current=room;

  const alertError=useCallback(e=>{
    if(e?.status===401){onExpired();return;}
    setError(e?.message||'Không thể hoàn tất thao tác.');
  },[onExpired]);
  const invoke=useCallback(async(path,method='GET',data)=>{
    try{return await api(path,{token,method,data});}
    catch(e){if(e.status===401)onExpired();throw e;}
  },[token,onExpired]);
  const refreshLists=useCallback(async()=>{
    const tasks=await Promise.allSettled([
      invoke('/api/friends'),invoke('/api/groups'),invoke('/api/notifications')]);
    if(tasks[0].status==='fulfilled')setFriends(tasks[0].value.friends||[]);
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
        if(keyRef.current!==key)return order(next);
        // Replace the overlapping latest window from the server, preserving older pages.
        const first=next.length?Number(next[0].id):Infinity;
        return dedupe([...current.filter(x=>Number(x.id)<first),...next]);
      });
      keyRef.current=key;
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

  const loadInbox=useCallback(async()=>{
    const results=await Promise.allSettled([invoke('/api/message-requests'),invoke('/api/blocks')]);
    if(results[0].status==='fulfilled')setRequestInbox(results[0].value.requests||[]);
    if(results[1].status==='fulfilled')setBlocked(results[1].value.users||[]);
  },[invoke]);
  const openRoom=useCallback(target=>{
    roomRef.current=target;keyRef.current=null;setMessages([]);setRoom(target);
    setDraft('');setPicked(null);setReply(null);setError('');setMore(false);setTyping(false);
    nonceRef.current=null;uploadRef.current=null;
    void loadWindow(target);
  },[loadWindow]);

  // One WebSocket for the entire authenticated mobile session. Reconcile on resume.
  useEffect(()=>{
    let closed=false,socket=null,retryDelay=1200,refreshTimer=null,retryTimer=null;
    const schedule=(kinds)=>{
      if(closed)return;
      clearTimeout(refreshTimer);
      refreshTimer=setTimeout(()=>{
        if(!activeRef.current||closed)return;
        if(!kinds||kinds.includes('lists'))refreshLists().catch(alertError);
        const target=roomRef.current;
        if(target&&(!kinds||kinds.includes('chat')))loadWindow(target);
      },300);
    };
    const onEvent=event=>{
      let data;try{data=JSON.parse(event.data);}catch{return;}
      const target=roomRef.current;
      if(data.type==='session-ended'||data.type==='account-sanction'){
        onExpired();return;
      }
      if(data.type==='typing'&&target?.scope==='dm'&&data.from_id===target.id){
        setTyping(!!data.on);return;
      }
      if(data.type==='group-typing'&&target?.scope==='group'&&data.group_id===target.id){
        setTyping(!!data.on);return;
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
      if(['message','group-message','groups-updated','friends-updated','read','delivered',
          'message-updated','group-message-updated','message-reaction','group-message-reaction',
          'identity-updated','profile-updated','message-requests-updated','chat-alert-settings',
          'world-message','world-message-removed','world-status','world-rooms-updated','session-security-updated'].includes(data.type)){
        schedule(['lists']);
      }
      if(data.type==='groups-updated'&&target?.scope==='group')schedule();
      if(data.type==='friends-updated'&&target?.scope==='dm')schedule();
      if(data.type==='profile-updated'&&data.user_id===user.id)refreshSocial();
      if(data.type==='message-requests-updated')loadInbox().catch(()=>{});
    };
    function connect(){
      if(closed||!activeRef.current)return;
      try{socket=new WebSocket(wsUrl(),[],{headers:{Authorization:'Bearer '+token}});}
      catch{retryTimer=setTimeout(connect,retryDelay);return;}
      wsRef.current=socket;setConnection('connecting');
      socket.onopen=()=>{if(closed)return;retryDelay=1200;setConnection('online');schedule();};
      socket.onmessage=onEvent;
      socket.onerror=()=>setConnection('offline');
      socket.onclose=()=>{if(closed)return;setConnection('offline');
        if(activeRef.current){retryTimer=setTimeout(connect,retryDelay);retryDelay=Math.min(30000,retryDelay*2);}};
    }
    connect();
    const sub=AppState.addEventListener('change',state=>{
      activeRef.current=state==='active';
      if(!activeRef.current){socket?.close();return;}
      if(socket?.readyState!==WebSocket.OPEN&&socket?.readyState!==WebSocket.CONNECTING)connect();
      schedule();
    });
    const check=setInterval(()=>{if(activeRef.current&&socket?.readyState!==WebSocket.OPEN)schedule();},15000);
    return()=>{closed=true;clearTimeout(refreshTimer);clearTimeout(retryTimer);clearInterval(check);
      sub.remove();socket?.close();wsRef.current=null;};
  },[token,user.id,invoke,refreshLists,loadWindow,loadInbox,refreshSocial,alertError,onExpired]);

  useEffect(()=>{refreshLists().catch(alertError);loadInbox().catch(()=>{});},[refreshLists,loadInbox,alertError]);
  const jumpBack=()=>{roomRef.current=null;setRoom(null);setSelection(null);setDialog('');setTyping(false);refreshLists().catch(()=>{});};
  const peer=friends.find(f=>f.other_id===room?.id),group=groups.find(g=>g.id===room?.id);
  const roomTitle=room?.scope==='dm'?label(peer):room?.scope==='group'?(group?.title||'Nhóm'):worldRooms.find(r=>r.id===room?.id)?.title||'Chat thế giới';

  async function doSend(){
    if(!room||sending||(!draft.trim()&&!picked))return;
    if(room.scope==='world'&&draft.length>1200){setError('Tin nhắn thế giới tối đa 1200 ký tự.');return;}
    setSending(true);sendRef.current=true;setError('');
    const scope=room.scope,originalRoom=room.scope+':'+room.id,text=draft.trim();
    const key=originalRoom+':'+text+':'+(picked?.uri||'');
    const nonce=nonceRef.current?.key===key?nonceRef.current.id:Crypto.randomUUID();
    nonceRef.current={key,id:nonce};
    try{
      let attachmentId=uploadRef.current?.key===key?uploadRef.current.id:null;
      if(picked&&!attachmentId){
        const file=await uploadAttachment(token,picked);
        attachmentId=file.id;uploadRef.current={key,id:attachmentId};
      }
      const data={body:text,attachment_id:attachmentId||null};
      let endpoint='';
      if(scope==='dm'){endpoint='/api/messages';Object.assign(data,{recipient_id:room.id,reply_to:reply?.id||null,client_message_id:nonce});}
      if(scope==='group'){endpoint='/api/groups/'+room.id+'/messages';Object.assign(data,{reply_to:reply?.id||null,client_message_id:nonce});}
      if(scope==='world'){endpoint='/api/world/messages';Object.assign(data,{room_id:room.id});}
      const result=await invoke(endpoint,'POST',data);
      if(roomRef.current?.scope===scope&&roomRef.current?.id===room.id){
        if(result.message)setMessages(old=>dedupe([...old,sanitize(result.message)]));
        if(scope==='world'&&!result.message)loadWindow(room);
        setDraft('');setPicked(null);setReply(null);nonceRef.current=null;uploadRef.current=null;
        listRef.current?.scrollToOffset({offset:0,animated:true});
      }
      refreshLists().catch(()=>{});
    }catch(e){
      alertError(e);setError((e.message||'Gửi thất bại')+' · Nhấn Gửi để thử lại, hệ thống giữ mã chống trùng.');
    }finally{sendRef.current=false;setSending(false);}
  }
  async function pick(kind){
    try{const asset=kind==='media'?await chooseMedia():await chooseFile();
      if(asset){setPicked(asset);nonceRef.current=null;uploadRef.current=null;}}
    catch(e){alertError(e);}
  }
  async function action(message,what){
    const scope=room.scope,id=room.id;
    try{
      if(what==='reply'){setReply(message);setSelection(null);return;}
      if(what==='copy'){await copyChatText(message.body);setSelection(null);return;}
      if(what==='edit'){setDraft(message.body);setReply({edit_id:message.id});setSelection(null);return;}
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
    const mid=reply?.edit_id;if(!mid||!draft.trim()||!room)return;
    setSending(true);
    try{
      await invoke(room.scope==='dm'?'/api/messages/'+mid:
        '/api/groups/'+room.id+'/messages/'+mid,'PATCH',{body:draft.trim()});
      setDraft('');setReply(null);
    }catch(e){alertError(e);}
    finally{setSending(false);}
  }
  function loadOlder(){
    if(!more||olderRef.current||loading||!messages.length||!room)return;
    const oldest=Math.min(...messages.map(m=>Number(m.id)));
    if(!oldest||oldest<1)return;
    olderRef.current=true;loadWindow(room,oldest);
  }

  async function openInfo(){
    if(!room||room.scope==='world')return;
    setDialog('info');setInfoView('media');
    try{
      const data=await invoke('/api/chats/'+room.scope+'/'+room.id+'/shared?kind=media');
      setInfoRows(data.items||[]);
      if(room.scope==='dm')setNickname(peer?.nickname||'');
      if(room.scope==='group'){
        const detail=await invoke('/api/groups/'+room.id);setGroupDetail(detail);
      }
    }catch(e){alertError(e);}
  }
  async function shared(kind){
    setInfoView(kind);
    try{
      const data=await invoke('/api/chats/'+room.scope+'/'+room.id+'/shared?kind='+kind);
      setInfoRows(data.items||[]);
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
  async function loadSettings(){
    await refreshSocial();
    try{setIdentityQuota((await invoke('/api/me/identity/status')).quota);}
    catch(e){alertError(e);}
  }
  const tabs=[['dm','Tin nhắn'],['groups','Nhóm'],['people','Bạn bè'],['world','Thế giới'],['settings','Cá nhân']];

  return <View style={{flex:1,backgroundColor:P.bg}}>
    <View style={css.top}>
      <Pressable onPress={room?jumpBack:()=>{setTab('dm');refreshLists().catch(()=>{});}}>
        <Text style={css.logo}>{room?'‹  ':'mtunz.'}</Text>
      </Pressable>
      <View style={{flex:1}}><Text style={css.title} numberOfLines={1}>{room?roomTitle:'mtunz Mobile'}</Text>
        <Text style={css.muted}>{typing?'Đang nhập tin nhắn…':connection==='online'?'● Đồng bộ thời gian thực':'○ Đang kết nối lại…'}</Text>
      </View>
      {!!room&&room.scope!=='world'&&<Pressable onPress={openInfo}><Text style={css.link}>Chi tiết</Text></Pressable>}
      {!room&&<Pressable onPress={()=>{refreshLists().catch(alertError);}}><Text style={css.link}>↻</Text></Pressable>}
    </View>
    {!!error&&<Pressable onPress={()=>setError('')} style={css.errorBar}>
      <Text style={{color:P.bad}}>{error}  ×</Text>
    </Pressable>}
    {room?<KeyboardAvoidingView style={{flex:1}} behavior={Platform.OS==='ios'?'padding':undefined}>
      {loading&&<ActivityIndicator color={P.accent}/>}
      <FlatList ref={listRef} inverted data={[...messages].reverse()} keyExtractor={m=>String(m.id)}
        renderItem={({item})=><Message item={item} own={item.sender_id===user.id||item.is_mine}
          token={token} onSelect={room.scope==='world'?()=>{}:setSelection}
          onOpen={file=>saveSharedFile(file,token).catch(alertError)}/>}
        initialNumToRender={15} maxToRenderPerBatch={10} windowSize={7}
        removeClippedSubviews={Platform.OS==='android'}
        contentContainerStyle={{padding:12}}
        onEndReached={loadOlder} onEndReachedThreshold={0.25}
        maintainVisibleContentPosition={{minIndexForVisible:0}}/>
      {!!reply&&<View style={css.replyBar}>
        <Text style={css.muted}>{reply.edit_id?'Chỉnh sửa tin nhắn':'↪ Trả lời #'+reply.id}</Text>
        <Pressable onPress={()=>{setReply(null);setDraft('');}}><Text style={css.link}>Hủy</Text></Pressable></View>}
      {!!picked&&<View style={css.replyBar}><Text style={css.muted} numberOfLines={1}>📎 {picked.name}</Text>
        <Pressable onPress={()=>{setPicked(null);uploadRef.current=null;}}><Text style={css.link}>Bỏ</Text></Pressable></View>}
      <View style={css.compose}>
        <Pressable onPress={()=>pick('media')}><Text style={css.link}>▧</Text></Pressable>
        <Pressable onPress={()=>pick('file')}><Text style={css.link}>＋</Text></Pressable>
        <TextInput style={css.composeInput} multiline maxLength={room.scope==='world'?1200:2000}
          value={draft} placeholder="Nhập tin nhắn…" placeholderTextColor={P.soft}
          onChangeText={value=>{
            if(value!==draft){nonceRef.current=null;if(value.trim()!==draft.trim())uploadRef.current=null;}
            setDraft(value);
          }}/>
        <Btn small disabled={sending||(!draft.trim()&&!picked)}
          onPress={reply?.edit_id?sendEdit:doSend}>{sending?'…':'Gửi'}</Btn>
      </View>
    </KeyboardAvoidingView>:<>
      {tab==='dm'&&<FlatList data={friends.filter(f=>f.state==='accepted'&&!f.archived&&!f.restricted)}
        keyExtractor={f=>String(f.other_id)} contentContainerStyle={{padding:12}}
        ListHeaderComponent={<Text style={css.h2}>Cuộc trò chuyện</Text>}
        ListEmptyComponent={<Text style={css.empty}>Bạn chưa có cuộc trò chuyện nào.</Text>}
        renderItem={({item})=><Pressable style={css.rowCard} onPress={()=>openRoom({scope:'dm',id:item.other_id})}>
          <View style={css.avatar}>{item.avatar_url?<Image source={avatarSource(item.avatar_url,token)} style={css.avatarImage}/>:
            <Text style={css.avatarText}>{label(item).slice(0,1)}</Text>}</View>
          <View style={{flex:1}}><Text style={css.strong}>{label(item)}</Text>
            <Text numberOfLines={1} style={css.muted}>{item.last_message?.body||'Bắt đầu trò chuyện'}</Text></View>
          {item.unread>0&&<Text style={css.badge}>{item.unread}</Text>}
        </Pressable>}/>}
      {tab==='groups'&&<FlatList data={groups} keyExtractor={g=>String(g.id)}
        contentContainerStyle={{padding:12}}
        ListHeaderComponent={<View style={css.hrow}><Text style={css.h2}>Nhóm của tôi</Text>
          <Btn small onPress={()=>setDialog('createGroup')}>＋ Tạo nhóm</Btn></View>}
        ListEmptyComponent={<Text style={css.empty}>Chưa tham gia nhóm nào.</Text>}
        renderItem={({item})=><Pressable style={css.rowCard} onPress={()=>openRoom({scope:'group',id:item.id})}>
          <View style={css.avatar}><Text style={css.avatarText}>👥</Text></View>
          <View style={{flex:1}}><Text style={css.strong}>{item.title}</Text>
            <Text numberOfLines={1} style={css.muted}>{item.member_count} thành viên · {item.last_message?.body||'Chưa có tin'}</Text></View>
          {item.unread>0&&<Text style={css.badge}>{item.unread}</Text>}
        </Pressable>}/>}
      {tab==='people'&&<ScrollView contentContainerStyle={{padding:12,gap:12}}>
        <Text style={css.h2}>Tìm kiếm & kết bạn</Text>
        <Field value={friendQuery} onChangeText={setFriendQuery} placeholder="Tên hiển thị hoặc ID"/>
        <Btn onPress={browsePeople}>Tìm thành viên</Btn>
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
      {tab==='world'&&<ScrollView contentContainerStyle={{padding:12,gap:12}}>
        <Text style={css.h2}>Chat thế giới</Text>
        <Text style={css.muted}>Tôn trọng các giới hạn và quy định do quản trị viên đặt ra.</Text>
        <Btn onPress={initWorld}>Kiểm tra trạng thái & vào phòng</Btn>
        <Text style={css.muted}>Trạng thái: {worldStatus.open?'Đang mở':'Chưa mở hoặc bị tạm dừng'}</Text>
        {worldRooms.map(w=><Btn key={w.id} quiet onPress={()=>openRoom({scope:'world',id:w.id})}>{w.title||'Phòng '+w.id}</Btn>)}
      </ScrollView>}
      {tab==='settings'&&<ScrollView contentContainerStyle={{padding:12,gap:12}}>
        <Text style={css.h2}>Tài khoản và quyền riêng tư</Text>
        <Text style={css.strong}>{user.display_name||user.username}</Text>
        <Text style={css.muted}>ID {user.public_id} · @{user.username}</Text>
        <Btn onPress={()=>{setDialog('settings');loadSettings();}}>Chỉnh sửa hồ sơ / quyền riêng tư</Btn>
        <Btn quiet onPress={()=>{setDialog('notifications');refreshLists();}}>Thông báo ({noticesUnread})</Btn>
        <Btn quiet onPress={async()=>{try{await registerMobileNotifications(token);setPushState('Đã bật');}
            catch(e){alertError(e);}}}>Bật thông báo đẩy khi app đóng</Btn>
        <Btn quiet onPress={async()=>{try{await unregisterMobileNotifications(token);setPushState('Đã tắt');}
            catch(e){alertError(e);}}}>Tắt thông báo đẩy</Btn>
        <Text style={css.muted}>Thông báo đẩy: {pushState}</Text>
        <Btn quiet onPress={()=>setDialog('security')}>Quản lý các thiết bị đăng nhập</Btn>
        <Btn quiet onPress={()=>{setDialog('support');}}>Hỗ trợ và báo cáo</Btn>
        <Btn danger onPress={()=>Alert.alert('Đăng xuất','Đăng xuất khỏi ứng dụng này?',[
          {text:'Hủy',style:'cancel'},{text:'Đăng xuất',onPress:onLogout,style:'destructive'}])}>Đăng xuất</Btn>
      </ScrollView>}
      <View style={css.tabs}>{tabs.map(([id,title])=><Pressable key={id}
        onPress={()=>{setTab(id);setError('');if(id==='settings')loadSettings();}}
        style={[css.tab,tab===id&&css.tabActive]}>
        <Text style={[css.tabText,tab===id&&{color:P.accent}]}>{title}</Text>
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
    <ModalSheet visible={dialog==='info'} onClose={()=>setDialog('')} title={roomTitle+' · Nội dung & cài đặt'}>
      {room?.scope==='dm'&&<>
        <Text style={css.h2}>Biệt danh chỉ bạn nhìn thấy</Text>
        <Field value={nickname} onChangeText={setNickname} placeholder="Đặt biệt danh"/>
        <Btn onPress={()=>perform('/api/chats/'+room.id+'/nickname','PUT',{nickname},
          async()=>{await refreshLists();setDialog('');})}>Lưu biệt danh</Btn>
        <View style={css.hrow}>
          <Btn small quiet onPress={()=>perform('/api/chats/'+room.id+'/preferences','POST',{
            muted:!peer?.muted,archived:!!peer?.archived,pinned:!!peer?.pinned})}>
            {peer?.muted?'Bật thông báo':'Tắt thông báo'}</Btn>
          <Btn small quiet onPress={()=>perform('/api/chats/'+room.id+'/preferences','POST',{
            muted:!!peer?.muted,archived:!!peer?.archived,pinned:!peer?.pinned})}>
            {peer?.pinned?'Bỏ ghim chat':'Ghim chat'}</Btn>
        </View>
        <View style={css.hrow}>
          <Btn small quiet onPress={()=>perform('/api/chats/'+room.id+'/preferences','POST',{
            muted:!!peer?.muted,archived:!peer?.archived,pinned:!!peer?.pinned},jumpBack)}>
            {peer?.archived?'Khôi phục':'Lưu trữ'}</Btn>
          <Btn small quiet onPress={()=>openProfile(room.id)}>Xem hồ sơ</Btn>
        </View>
      </>}
      {room?.scope==='group'&&<>
        <Text style={css.muted}>{groupDetail?.members?.length||group?.member_count||0} thành viên</Text>
        {(groupDetail?.members||[]).map(m=><Text key={m.user_id} style={css.muted}>
          {m.username} · {m.role==='owner'?'Trưởng nhóm':'Thành viên'}</Text>)}
        <Btn danger onPress={()=>Alert.alert('Rời nhóm','Bạn muốn rời nhóm này?',[
          {text:'Hủy'},{text:'Rời nhóm',style:'destructive',onPress:()=>perform(
            '/api/groups/'+room.id+'/members/'+user.id,'DELETE',undefined,jumpBack)}])}>Rời nhóm</Btn>
      </>}
      <Text style={css.h2}>Nội dung đã chia sẻ</Text>
      <View style={css.hrow}>{[['media','Ảnh / video'],['files','Tệp'],['links','Link']].map(([kind,t])=>
        <Btn key={kind} small quiet={infoView!==kind} onPress={()=>shared(kind)}>{t}</Btn>)}</View>
      {infoRows.length===0&&<Text style={css.muted}>Chưa có nội dung.</Text>}
      {infoRows.map(m=><Pressable key={m.id} style={css.rowCard}
        onPress={async()=>{
          if(infoView==='links'){const url=m.links?.[0]?.url;if(url&&/^https?:\/\//.test(url))await Linking.openURL(url);return;}
          await saveSharedFile({id:m.attachment_id,name:m.name,mime:m.mime,size:m.size},token).catch(alertError);
        }}>
        <Text style={css.strong}>{infoView==='links'?m.links?.map(x=>x.host).join(', '):m.name||'Tệp đính kèm'}</Text>
        <Text style={css.muted}>{readableTime(m.created_at)}</Text>
      </Pressable>)}
      <Btn quiet onPress={()=>{setDialog('search');setSearchResults([]);}}>Tìm tin nhắn trong hội thoại</Btn>
    </ModalSheet>
    <ModalSheet visible={dialog==='search'} onClose={()=>setDialog('')} title="Tìm kiếm tin nhắn">
      <Field value={searchText} onChangeText={setSearchText} placeholder="Nhập nội dung cần tìm"/>
      <Btn onPress={async()=>{
        try{const q=room.scope==='dm'?{q:searchText,other_id:String(room.id)}:{q:searchText,group_id:String(room.id)};
          const data=await invoke('/api/search/messages?'+new URLSearchParams(q));
          setSearchResults(data.results||[]);
        }catch(e){alertError(e);}}}>Tìm kiếm</Btn>
      {searchResults.map(m=><Text key={m.id} style={css.muted}>#{m.id} · {m.body}</Text>)}
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
      </>}
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
      <Btn quiet onPress={()=>perform('/api/me/profile','PATCH',{show_online:!user.show_online})}>
        {user.show_online?'Ẩn':'Hiện'} trạng thái online</Btn>
      <Btn quiet onPress={()=>perform('/api/me/profile','PATCH',{show_receipts:!user.show_receipts})}>
        {user.show_receipts?'Tắt':'Bật'} xác nhận đã đọc</Btn>
      <Text style={css.h2}>Đổi tên có xác minh</Text>
      <Text style={css.muted}>Tên đăng nhập: 1 lần / 60 ngày · tên hiển thị: 2 lần / 30 ngày</Text>
      <View style={css.hrow}>{['display_name','username'].map(x=><Btn key={x} small
        quiet={identityKind!==x} onPress={()=>setIdentityKind(x)}>
        {x==='display_name'?'Tên hiển thị':'Tên đăng nhập'}</Btn>)}</View>
      <Text style={css.muted}>Còn {identityQuota?.[identityKind]?.remaining??'?'} lượt đổi</Text>
      <Field value={displayName} onChangeText={setDisplayName} placeholder="Tên mới"/>
      <Field value={secret} onChangeText={setSecret} secureTextEntry placeholder="Mật khẩu xác nhận"/>
      <Field value={pin} onChangeText={setPin} secureTextEntry placeholder="Mã PIN xác nhận"/>
      <Btn onPress={()=>perform('/api/me/identity/'+identityKind,'POST',{
        new_value:displayName,password:secret,pin},async()=>{setSecret('');setPin('');await loadSettings();})}>
        Đổi tên (mật khẩu + PIN)</Btn>
    </ModalSheet>
    <ModalSheet visible={dialog==='notifications'} onClose={()=>setDialog('')} title="Thông báo">
      <Btn small onPress={()=>perform('/api/notifications/read','POST',{},refreshLists)}>Đánh dấu đã đọc</Btn>
      {notices.map((n,i)=><View key={n.id||i} style={css.section}>
        <Text style={css.muted}>{n.body}</Text></View>)}
    </ModalSheet>
    <ModalSheet visible={dialog==='security'} onClose={()=>setDialog('')} title="Bảo mật & thiết bị">
      <Text style={css.muted}>Phiên đăng nhập điện thoại được quản lý cùng tài khoản web. Thu hồi sẽ ngắt WebSocket ngay.</Text>
      <Btn danger onPress={()=>Alert.alert('Thu hồi thiết bị','Đăng xuất tất cả thiết bị khác?',[
        {text:'Hủy'},{text:'Thu hồi',style:'destructive',onPress:()=>perform('/api/me/sessions/revoke-others','POST') }])}>
        Thu hồi các phiên khác</Btn>
      <Btn quiet onPress={()=>perform('/api/me/sessions','GET',undefined,r=>
        Alert.alert('Thiết bị',JSON.stringify(r.sessions?.map(x=>x.device_name||x.os_name)||[]).slice(0,700)))}>
        Xem thiết bị đăng nhập</Btn>
    </ModalSheet>
    <ModalSheet visible={dialog==='support'} onClose={()=>setDialog('')} title="Hỗ trợ">
      <Text style={css.muted}>Báo cáo lừa đảo, hành vi xấu hoặc đề nghị hỗ trợ qua website; đăng nhập bằng cùng tài khoản.</Text>
      <Btn quiet onPress={()=>Linking.openURL('https://mtunz.onrender.com')}>Mở website mtunz</Btn>
    </ModalSheet>
  </View>;
}

const css=StyleSheet.create({
  btn:{backgroundColor:P.accent,padding:11,paddingHorizontal:15,alignItems:'center',justifyContent:'center',
    borderRadius:11,minHeight:40},ghost:{backgroundColor:P.card,borderWidth:1,borderColor:P.border},
  danger:{backgroundColor:'#63324a'},smallBtn:{paddingHorizontal:10,paddingVertical:7,minHeight:34},
  btnTxt:{color:P.bg,fontWeight:'800',fontSize:13},disabled:{opacity:.45},
  input:{backgroundColor:P.card,borderRadius:12,borderWidth:1,borderColor:P.border,color:P.text,
    minHeight:45,paddingHorizontal:13,marginVertical:2},title:{fontSize:15,color:P.text,fontWeight:'800'},
  logo:{fontSize:26,fontWeight:'900',color:P.accent},h2:{fontSize:16,fontWeight:'800',color:P.text},
  strong:{fontSize:14,fontWeight:'700',color:P.text},muted:{fontSize:12,color:P.soft},
  link:{color:P.accent,fontSize:14,fontWeight:'800'},top:{minHeight:67,borderBottomWidth:1,
    borderColor:P.border,flexDirection:'row',alignItems:'center',gap:12,paddingHorizontal:14},
  errorBar:{backgroundColor:'#432333',padding:8},hrow:{flexDirection:'row',alignItems:'center',
    justifyContent:'space-between',gap:9,flexWrap:'wrap'},
  section:{padding:13,backgroundColor:P.card,borderRadius:12,gap:10},
  rowCard:{flexDirection:'row',alignItems:'center',gap:12,padding:13,
    backgroundColor:P.card,borderRadius:14,marginVertical:3},
  avatar:{width:43,height:43,borderRadius:22,backgroundColor:'#30547f',alignItems:'center',justifyContent:'center',
    overflow:'hidden'},avatarImage:{width:43,height:43},avatarText:{color:P.text,fontWeight:'800',fontSize:20},
  badge:{backgroundColor:P.accent,color:P.bg,fontWeight:'800',borderRadius:12,overflow:'hidden',paddingHorizontal:8,paddingVertical:4},
  empty:{textAlign:'center',padding:40,color:P.soft},
  tabs:{flexDirection:'row',borderTopWidth:1,borderTopColor:P.border,padding:4},
  tab:{flex:1,alignItems:'center',justifyContent:'center',minHeight:47,borderRadius:11},
  tabActive:{backgroundColor:P.card},tabText:{fontSize:10,color:P.soft,fontWeight:'800'},
  bubble:{padding:11,borderRadius:16,maxWidth:'86%',minWidth:94,marginVertical:4,gap:6},
  bubbleMine:{backgroundColor:P.mine,alignSelf:'flex-end',borderBottomRightRadius:4},
  bubbleOther:{backgroundColor:P.card,alignSelf:'flex-start',borderBottomLeftRadius:4},
  sender:{color:P.accent,fontSize:11,fontWeight:'800'},reply:{color:P.soft,fontSize:11},
  msg:{color:P.text,fontSize:15,lineHeight:21},time:{fontSize:10,color:'#d4e4fa'},
  attachment:{padding:8,borderWidth:1,borderColor:P.border,borderRadius:12,gap:5},
  thumb:{width:210,height:156,maxWidth:'100%',backgroundColor:P.bg,borderRadius:8},
  attachmentText:{color:P.text,fontSize:12,fontWeight:'700'},reactionText:{color:P.text,fontSize:13},
  compose:{flexDirection:'row',gap:11,padding:9,alignItems:'flex-end',borderTopColor:P.border,borderTopWidth:1},
  composeInput:{flex:1,minHeight:43,maxHeight:110,borderRadius:12,backgroundColor:P.card,
    color:P.text,padding:10,textAlignVertical:'top'},
  replyBar:{padding:8,borderTopColor:P.border,borderTopWidth:1,flexDirection:'row',
    justifyContent:'space-between',gap:8},
  overlay:{flex:1,justifyContent:'flex-end',backgroundColor:'#0009'},
  sheet:{maxHeight:'82%',backgroundColor:P.bg,borderTopLeftRadius:24,borderTopRightRadius:24,padding:16,gap:13},
});
