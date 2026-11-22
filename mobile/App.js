import React, { useCallback, useEffect, useRef, useState } from 'react';
import * as Crypto from 'expo-crypto';
import {
  ActivityIndicator, AppState, FlatList, KeyboardAvoidingView, Platform,
  Pressable, SafeAreaView, StatusBar, StyleSheet, Text, TextInput, View,
} from 'react-native';
import { api, API_ORIGIN, clearSession, readSession, saveSession, wsUrl } from './src/client';

const C = { bg:'#081121', card:'#15233a', border:'#2d3e58', text:'#f5f7ff',
  muted:'#a0b2cf', accent:'#65b0ff', sent:'#2859a4' };
const sortRows = arr => [...arr].sort((a,b) => Number(a.id)-Number(b.id));
const mergeRows = arr => sortRows([...new Map(arr.map(x => [x.id,x])).values()]);
const nameOf = f => f?.nickname || f?.display_name || f?.username || 'Thành viên';
const stamp = value => {
  const d = new Date(Number(value)*1000);
  return Number.isNaN(d.getTime()) ? '' : d.toLocaleTimeString('vi-VN',{hour:'2-digit',minute:'2-digit'});
};
function Btn({ title, onPress, disabled, quiet }) {
  return <Pressable onPress={onPress} disabled={disabled} style={[s.btn,quiet&&s.quiet,disabled&&s.disabled]}>
    <Text style={[s.btnText,quiet&&{color:C.text}]}>{title}</Text></Pressable>;
}
function Bubble({ m, own }) {
  return <View style={[s.bubble,own?s.mine:s.theirs]}>
    <Text style={[s.bubbleText,m.deleted_at&&{fontStyle:'italic',color:C.muted}]}>
      {m.deleted_at?'Tin nhắn đã thu hồi':m.body||(m.attachment_id?'📎 Tệp đính kèm (xem trên web)':'')}
    </Text>
    <Text style={s.time}>{stamp(m.created_at)}{own ? (m.read_at?' · Đã xem':m.delivered_at?' · Đã nhận':' · Đã gửi'):''}</Text>
  </View>;
}
export default function App() {
  const [boot,setBoot]=useState(true),[token,setToken]=useState(null),[user,setUser]=useState(null);
  const [username,setUsername]=useState(''),[password,setPassword]=useState(''),[pin,setPin]=useState('');
  const [challenge,setChallenge]=useState(''),[newName,setNewName]=useState('');
  const [friends,setFriends]=useState([]),[peer,setPeer]=useState(null),[messages,setMessages]=useState([]);
  const [draft,setDraft]=useState(''),[more,setMore]=useState(false),[loading,setLoading]=useState(false);
  const [busy,setBusy]=useState(false),[error,setError]=useState(''),[online,setOnline]=useState(false);
  const [typing,setTyping]=useState(false);
  const peerRef=useRef(null), tokenRef=useRef(null), wsRef=useRef(null), aliveRef=useRef(true);
  const olderRef=useRef(false),chatKeyRef=useRef(null),nonceRef=useRef(null),listRef=useRef(null);
  const peerName=nameOf(friends.find(f=>f.other_id===peer));

  const reset=useCallback(async()=>{
    tokenRef.current=null; peerRef.current=null; wsRef.current?.close(); wsRef.current=null;
    await clearSession().catch(()=>{});
    setToken(null);setUser(null);setFriends([]);setMessages([]);setPeer(null);
    setChallenge('');setPassword('');setPin('');setOnline(false);
  },[]);

  const refreshFriends=useCallback(async t=>{
    const result=await api('/api/friends',{token:t});
    if(tokenRef.current===t)setFriends(result.friends||[]);
  },[]);

  const refreshChat=useCallback(async(id,t,before=0)=>{
    if(!id||!t)return;
    if(!before)setLoading(true);
    try{
      const response=await api('/api/messages/'+id+(before?'?before='+before:''),{token:t});
      if(peerRef.current!==id||tokenRef.current!==t)return;
      const rows=response.messages||[];
      setMessages(previous=>before?mergeRows([...previous,...rows]):
        chatKeyRef.current===id?mergeRows([...previous,...rows]):sortRows(rows));
      chatKeyRef.current=id;
      setMore(rows.length>=70);
      if(!before&&aliveRef.current){
        const last=rows.reduce((n,m)=>m.sender_id===id&&!m.deleted_at?Math.max(n,Number(m.id)):n,0);
        if(last)api('/api/messages/read/'+id+'?up_to='+last,{token:t,method:'POST'}).catch(()=>{});
      }
    }catch(e){
      if(peerRef.current===id)setError(e.message);
      if(e.status===401)void reset();
    }finally{
      if(!before)setLoading(false);
      olderRef.current=false;
    }
  },[reset]);

  useEffect(()=>{
    let mounted=true;
    (async()=>{
      try{
        const saved=await readSession(); if(!saved||!mounted)return;
        tokenRef.current=saved;setToken(saved);
        const result=await api('/api/me',{token:saved}); if(!mounted)return;
        if(!result.user){await reset();return;}
        setUser(result.user);
        if(!result.user.onboarding_required)await refreshFriends(saved);
      }catch(e){if(mounted){setError(e.message);if(e.status===401)await reset();}}
      finally{if(mounted)setBoot(false);}
    })();
    return()=>{mounted=false;};
  },[refreshFriends,reset]);

  useEffect(()=>{
    if(!token||!user||user.onboarding_required||user.is_admin)return;
    let closed=false,retry=null,update=null,backoff=1500;
    function schedule(){
      clearTimeout(update);
      update=setTimeout(()=>{
        if(closed||!aliveRef.current)return;
        void refreshFriends(token).catch(()=>{});
        if(peerRef.current)void refreshChat(peerRef.current,token);
      },350);
    }
    function connect(){
      if(closed||!aliveRef.current)return;
      let socket;
      try{
        // Native RN WebSocket supports custom handshake headers; browser WS does not.
        socket=new WebSocket(wsUrl(),[],{headers:{Authorization:'Bearer '+token}});
      }catch{retry=setTimeout(connect,backoff);return;}
      wsRef.current=socket;
      socket.onopen=()=>{if(!closed){setOnline(true);backoff=1500;schedule();}};
      socket.onmessage=event=>{
        if(closed)return;
        try{
          const data=JSON.parse(event.data);
          if(data.type==='session-ended'){void reset();return;}
          if(data.type==='typing'&&data.from_id===peerRef.current){setTyping(!!data.on);return;}
          if(['message','read','delivered','friends-updated','identity-updated',
              'profile-updated','message-changed','chat-preferences-updated'].includes(data.type))schedule();
        }catch{}
      };
      socket.onerror=()=>setOnline(false);
      socket.onclose=()=>{
        if(closed)return;
        setOnline(false);
        if(aliveRef.current){retry=setTimeout(connect,backoff);backoff=Math.min(backoff*2,30000);}
      };
    }
    connect();
    const poll=setInterval(()=>{if(!closed&&aliveRef.current&&wsRef.current?.readyState!==WebSocket.OPEN)schedule();},12000);
    const sub=AppState.addEventListener('change',next=>{
      aliveRef.current=next==='active';
      if(!aliveRef.current){wsRef.current?.close();return;}
      if(wsRef.current?.readyState!==WebSocket.OPEN&&wsRef.current?.readyState!==WebSocket.CONNECTING)connect();
      schedule();
    });
    return()=>{closed=true;clearTimeout(retry);clearTimeout(update);clearInterval(poll);sub.remove();
      wsRef.current?.close();wsRef.current=null;};
  },[token,user?.id,user?.onboarding_required,refreshChat,refreshFriends,reset]);

  async function enterPassword(){
    if(!username.trim()||!password){setError('Nhập tên đăng nhập và mật khẩu.');return;}
    setBusy(true);setError('');
    try{
      const r=await api('/api/mobile/auth/password',{method:'POST',
        data:{username:username.trim(),password}});
      setChallenge(r.challenge);setPassword('');
    }catch(e){setError(e.message);}
    finally{setBusy(false);}
  }
  async function enterPin(){
    setBusy(true);setError('');
    try{
      const r=await api('/api/mobile/auth/pin',{method:'POST',data:{challenge,pin}});
      await saveSession(r.access_token);tokenRef.current=r.access_token;setToken(r.access_token);
      const profile=await api('/api/me',{token:r.access_token});
      if(!profile.user)throw Error('Phiên đăng nhập không hợp lệ.');
      setUser(profile.user);setChallenge('');setPin('');
      if(!profile.user.onboarding_required)await refreshFriends(r.access_token);
    }catch(e){setError(e.message);}
    finally{setBusy(false);}
  }
  async function finishOnboarding(){
    setBusy(true);setError('');
    try{
      await api('/api/me/display-name',{token,method:'POST',data:{display_name:newName.trim()}});
      const profile=await api('/api/me',{token});setUser(profile.user);
      await refreshFriends(token);
    }catch(e){setError(e.message);}
    finally{setBusy(false);}
  }
  async function logout(){
    const current=tokenRef.current;
    await reset();
    if(current)api('/api/auth/logout',{token:current,method:'POST'}).catch(()=>{});
  }
  function openChat(id){
    peerRef.current=id;chatKeyRef.current=null;setPeer(id);setMessages([]);
    setDraft('');setMore(false);setTyping(false);setError('');nonceRef.current=null;
    void refreshChat(id,tokenRef.current);
  }
  function loadOlder(){
    if(!more||olderRef.current||loading||!messages.length||!peer)return;
    const oldest=Math.min(...messages.map(m=>Number(m.id)));
    if(!oldest)return;
    olderRef.current=true;void refreshChat(peer,tokenRef.current,oldest);
  }
  async function send(){
    const text=draft.trim();if(!text||!peer||busy)return;
    const key=peer+':'+text;
    const nonce=nonceRef.current?.key===key?nonceRef.current.id:Crypto.randomUUID();
    nonceRef.current={key,id:nonce};
    setBusy(true);setError('');
    try{
      const r=await api('/api/messages',{token,method:'POST',
        data:{recipient_id:peer,body:text,client_message_id:nonce}});
      setMessages(prev=>mergeRows([...prev,r.message]));
      setDraft('');nonceRef.current=null;
      try{wsRef.current?.send(JSON.stringify({type:'typing',to:peer,on:false}));}catch{}
      await refreshFriends(token);
      listRef.current?.scrollToOffset({offset:0,animated:true});
    }catch(e){setError(e.message+' Thử gửi lại để tránh tạo tin nhắn trùng.');if(e.status===401)await reset();}
    finally{setBusy(false);}
  }
  const showError=error?<Text style={s.error}>{error}</Text>:null;
  if(boot)return <SafeAreaView style={s.root}><StatusBar barStyle="light-content"/>
    <View style={s.center}><ActivityIndicator color={C.accent}/><Text style={s.muted}>Đang tải mtunz…</Text></View>
  </SafeAreaView>;

  if(!user)return <SafeAreaView style={s.root}><StatusBar barStyle="light-content"/>
    <KeyboardAvoidingView style={s.center} behavior={Platform.OS==='ios'?'padding':undefined}>
      <View style={s.auth}>
        <Text style={s.brand}>mtunz<Text style={{color:C.accent}}>.</Text></Text>
        <Text style={s.title}>{challenge?'Xác minh mã PIN':'Đăng nhập'}</Text>
        <Text style={s.muted}>Dùng cùng tài khoản với website mtunz.</Text>
        {challenge?<>
          <TextInput style={s.input} value={pin} onChangeText={setPin} secureTextEntry
            keyboardType="number-pad" maxLength={12} placeholder="Mã PIN"
            placeholderTextColor={C.muted} accessibilityLabel="Mã PIN"/>
          <Btn title={busy?'Đang xác minh…':'Xác minh'} onPress={enterPin} disabled={busy||!pin}/>
          <Btn title="Quay lại" onPress={()=>{setChallenge('');setPin('');setError('');}} quiet/>
        </>:<>
          <TextInput style={s.input} value={username} onChangeText={setUsername}
            placeholder="Tên tài khoản hoặc số điện thoại" placeholderTextColor={C.muted}
            autoCapitalize="none" autoCorrect={false} accessibilityLabel="Tên tài khoản"/>
          <TextInput style={s.input} value={password} onChangeText={setPassword} secureTextEntry
            placeholder="Mật khẩu" placeholderTextColor={C.muted} accessibilityLabel="Mật khẩu"/>
          <Btn title={busy?'Đang kiểm tra…':'Đăng nhập'} onPress={enterPassword} disabled={busy}/>
        </>}
        {showError}
        <Text style={s.muted}>Đăng ký tài khoản mới và quản trị qua website.</Text>
        <Text style={s.small}>{API_ORIGIN||'Chưa có EXPO_PUBLIC_API_URL'}</Text>
      </View>
    </KeyboardAvoidingView>
  </SafeAreaView>;

  if(user.onboarding_required)return <SafeAreaView style={s.root}>
    <View style={s.auth}><Text style={s.title}>Đặt tên hiển thị</Text>
      <TextInput style={s.input} value={newName} onChangeText={setNewName}
        maxLength={70} placeholder="Tên của bạn" placeholderTextColor={C.muted}/>
      <Btn title="Hoàn tất" onPress={finishOnboarding} disabled={busy||!newName.trim()}/>
      {showError}<Btn title="Đăng xuất" onPress={logout} quiet/>
    </View></SafeAreaView>;

  return <SafeAreaView style={s.root}><StatusBar barStyle="light-content" backgroundColor={C.bg}/>
    {!peer?<>
      <View style={s.header}>
        <View><Text style={s.brandSmall}>mtunz<Text style={{color:C.accent}}>.</Text></Text>
          <Text style={s.muted}>{user.display_name||user.username} · {online?'Trực tuyến':'Đang kết nối…'}</Text></View>
        <Pressable onPress={logout}><Text style={s.link}>Đăng xuất</Text></Pressable>
      </View>
      <View style={s.heading}><Text style={s.title}>Tin nhắn</Text>
        <Pressable onPress={()=>refreshFriends(token).catch(e=>setError(e.message))}>
          <Text style={s.link}>Làm mới</Text></Pressable></View>
      {showError}
      <FlatList data={friends.filter(f=>f.state==='accepted'&&!f.archived&&!f.restricted)}
        keyExtractor={item=>String(item.other_id)} initialNumToRender={12}
        contentContainerStyle={{paddingHorizontal:12,paddingBottom:30}}
        ListEmptyComponent={<Text style={s.empty}>Chưa có hội thoại. Hãy kết bạn trên website mtunz.</Text>}
        renderItem={({item})=><Pressable onPress={()=>openChat(item.other_id)} style={s.friend}>
          <View style={s.avatar}><Text style={s.avatarText}>{nameOf(item).slice(0,1).toUpperCase()}</Text></View>
          <View style={{flex:1,gap:5}}><Text style={s.friendTitle} numberOfLines={1}>{nameOf(item)}</Text>
            <Text style={s.muted} numberOfLines={1}>{item.last_message?.body||(item.online?'Đang hoạt động':'Bắt đầu trò chuyện')}</Text></View>
          {item.unread>0?<View style={s.unread}><Text style={s.unreadText}>{item.unread}</Text></View>:null}
        </Pressable>}/>
    </>:<KeyboardAvoidingView style={{flex:1}} behavior={Platform.OS==='ios'?'padding':undefined}>
      <View style={s.header}>
        <Pressable onPress={()=>{peerRef.current=null;setPeer(null);setTyping(false);setError('');}}>
          <Text style={s.link}>‹ Trở lại</Text></Pressable>
        <View style={{flex:1,alignItems:'flex-end'}}><Text style={s.friendTitle}>{peerName}</Text>
          <Text style={s.muted}>{typing?'Đang nhập…':online?'Đã kết nối':'Đang kết nối…'}</Text></View>
      </View>
      {showError}
      {loading&&<ActivityIndicator color={C.accent}/>}
      <FlatList ref={listRef} inverted data={[...messages].reverse()}
        keyExtractor={m=>String(m.id)} renderItem={({item})=><Bubble m={item} own={item.sender_id===user.id}/>}
        contentContainerStyle={{padding:12}} initialNumToRender={18} maxToRenderPerBatch={12}
        windowSize={7} maintainVisibleContentPosition={{minIndexForVisible:0}}
        onEndReached={loadOlder} onEndReachedThreshold={0.2}/>
      <View style={s.composerRow}>
        <TextInput multiline style={s.composer} value={draft} maxLength={2000}
          placeholder="Nhập tin nhắn…" placeholderTextColor={C.muted}
          onChangeText={value=>{
            if(nonceRef.current?.key!==peer+':'+value.trim())nonceRef.current=null;
            if((!draft.trim()&&value.trim())||(draft.trim()&&!value.trim())){
              try{wsRef.current?.send(JSON.stringify({type:'typing',to:peer,on:!!value.trim()}));}catch{}
            }
            setDraft(value);
          }}/>
        <Pressable onPress={send} disabled={!draft.trim()||busy}
          style={[s.send,(!draft.trim()||busy)&&s.disabled]}>
          <Text style={{color:C.bg,fontWeight:'800'}}>{busy?'…':'Gửi'}</Text></Pressable>
      </View>
    </KeyboardAvoidingView>}
  </SafeAreaView>;
}
const s=StyleSheet.create({
  root:{flex:1,backgroundColor:C.bg},center:{flex:1,justifyContent:'center',alignItems:'center',padding:20,gap:14},
  auth:{width:'100%',maxWidth:440,alignSelf:'center',padding:22,marginVertical:18,backgroundColor:C.card,borderRadius:22,gap:14},
  brand:{fontWeight:'800',fontSize:36,color:C.text},brandSmall:{fontWeight:'800',fontSize:25,color:C.text},
  title:{fontWeight:'700',fontSize:22,color:C.text},friendTitle:{fontSize:15,fontWeight:'700',color:C.text},
  muted:{color:C.muted,fontSize:12},small:{color:C.muted,fontSize:10},error:{color:'#ff9e9e',padding:10},
  input:{color:C.text,backgroundColor:C.bg,minHeight:50,paddingHorizontal:15,borderRadius:12,
    borderWidth:1,borderColor:C.border},btn:{backgroundColor:C.accent,borderRadius:12,
    minHeight:46,justifyContent:'center',alignItems:'center'},quiet:{backgroundColor:C.border},
  btnText:{color:C.bg,fontWeight:'800'},disabled:{opacity:.5},link:{color:C.accent,fontWeight:'700'},
  header:{paddingHorizontal:16,minHeight:70,borderBottomColor:C.border,borderBottomWidth:1,
    flexDirection:'row',alignItems:'center',justifyContent:'space-between',gap:12},
  heading:{padding:18,flexDirection:'row',justifyContent:'space-between',alignItems:'center'},
  empty:{padding:30,color:C.muted,textAlign:'center'},
  friend:{flexDirection:'row',gap:12,alignItems:'center',backgroundColor:C.card,
    padding:13,marginVertical:3,borderRadius:16},
  avatar:{backgroundColor:'#274d7c',height:45,width:45,borderRadius:23,
    justifyContent:'center',alignItems:'center'},
  avatarText:{color:C.text,fontWeight:'800',fontSize:20},
  unread:{backgroundColor:C.accent,minWidth:23,height:23,borderRadius:12,
    paddingHorizontal:6,alignItems:'center',justifyContent:'center'},
  unreadText:{color:C.bg,fontWeight:'800',fontSize:12},
  bubble:{padding:12,borderRadius:16,maxWidth:'84%',marginVertical:4,gap:7,minWidth:95},
  mine:{alignSelf:'flex-end',backgroundColor:C.sent,borderBottomRightRadius:4},
  theirs:{alignSelf:'flex-start',backgroundColor:C.card,borderBottomLeftRadius:4},
  bubbleText:{color:C.text,fontSize:15,lineHeight:21},time:{color:'#d0e2fa',fontSize:10,alignSelf:'flex-end'},
  composerRow:{flexDirection:'row',alignItems:'flex-end',gap:10,padding:12,borderTopColor:C.border,borderTopWidth:1},
  composer:{flex:1,maxHeight:120,minHeight:45,padding:12,backgroundColor:C.card,color:C.text,
    textAlignVertical:'top',borderRadius:14},
  send:{backgroundColor:C.accent,minHeight:45,minWidth:65,borderRadius:14,
    alignItems:'center',justifyContent:'center'},
});
