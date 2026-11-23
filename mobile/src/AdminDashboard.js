import React,{useCallback,useEffect,useState} from 'react';
import {ActivityIndicator,Alert,AppState,Image,Linking,Pressable,ScrollView,StyleSheet,Text,TextInput,View} from 'react-native';
import {api,API_ORIGIN,wsUrl} from './client';
import * as Notifications from 'expo-notifications';
import DevicePushSettings,{reportPushVisibility} from './DevicePushSettings';
import {adminPresence} from './presence';
import Ionicons from '@expo/vector-icons/Ionicons';

const P={bg:'#071320',surface:'#11253a',line:'#294661',ink:'#f4f8ff',muted:'#a8bfd6',accent:'#6dbaff',danger:'#ff9393',green:'#73e0bd'};

function Action({label,onPress,disabled=false,subtle=false}){
 return <Pressable accessibilityRole="button" onPress={onPress} disabled={disabled}
  style={[s.action,subtle&&s.subtle,disabled&&{opacity:.5}]}>
  <Text style={[s.actionText,subtle&&{color:P.ink}]}>{label}</Text></Pressable>;
}
function Field({placeholder,value,onChangeText,secret=false}){
 return <TextInput value={value} onChangeText={onChangeText} placeholder={placeholder}
   placeholderTextColor={P.muted} secureTextEntry={secret} autoCapitalize="none"
   style={s.input}/>;
}
function Box({children}){return <View style={s.panel}>{children}</View>;}
function Tile({title,value}){return <View style={s.tile}><Text style={s.value}>{value??'—'}</Text><Text style={s.muted}>{title}</Text></View>;}

export default function AdminDashboard({token,onLogout,onExpired}){
 const [onlineUsers,setOnlineUsers]=useState([]),[onlineProfile,setOnlineProfile]=useState(null);
 const [userSort,setUserSort]=useState('oldest'),[presenceClock,setPresenceClock]=useState(Date.now());
 const [tab,setTab]=useState('home'),[stats,setStats]=useState({}),[registration,setRegistration]=useState([]),
  [tickets,setTickets]=useState([]),[users,setUsers]=useState([]),[approvals,setApprovals]=useState([]),
  [query,setQuery]=useState(''),[pin,setPin]=useState(''),[draft,setDraft]=useState(''),
  [ticket,setTicket]=useState(null),[thread,setThread]=useState([]),
  [busy,setBusy]=useState(false),[loading,setLoading]=useState(false),[error,setError]=useState(''),
  [notice,setNotice]=useState(''),[lastRefresh,setLastRefresh]=useState(null),
  [supportPaused,setSupportPaused]=useState(false),
  [worldConfig,setWorldConfig]=useState(null),
  [selectedUser,setSelectedUser]=useState(null),
  [sanctionReason,setSanctionReason]=useState(''),[sanctionMinutes,setSanctionMinutes]=useState('60');
 const call=useCallback(async(path,method='GET',data)=>{
   try{return await api(path,{token,method,data});}
   catch(e){if(e.status===401)onExpired();throw e;}
 },[token,onExpired]);
 const refresh=useCallback(async()=>{
  const paths=['/api/admin/stats','/api/admin/registrations','/api/admin/tickets','/api/admin/login-approvals'];
  const tasks=await Promise.allSettled(paths.map(path=>call(path)));
  if(tasks[0].status==='fulfilled')setStats(tasks[0].value);
  if(tasks[1].status==='fulfilled')setRegistration(tasks[1].value.registrations||[]);
  if(tasks[2].status==='fulfilled'){setTickets(tasks[2].value.tickets||[]);setSupportPaused(!!tasks[2].value.paused);}
  if(tasks[3].status==='fulfilled')setApprovals(tasks[3].value.pending||[]);
  if(tasks.every(x=>x.status==='rejected'))throw tasks[0].reason;
  setLastRefresh(Date.now());
 },[call]);
 useEffect(()=>{
  let alive=true,ws=null,heartbeatTimer=null,reconnectTimer=null,retryMs=1000;
  const stopHeartbeat=()=>{clearInterval(heartbeatTimer);heartbeatTimer=null;};
  const stopRetry=()=>{if(reconnectTimer){clearTimeout(reconnectTimer);reconnectTimer=null;}};
  const fetchNow=()=>refresh().catch(e=>{if(alive)setError(e.message);});
  const stop=()=>{
   stopHeartbeat();stopRetry();
   if(!ws)return;
   reportPushVisibility(ws,false);
   ws.close();ws=null;
  };
  function connect(){
   if(!alive||AppState.currentState!=='active')return;
   if(ws?.readyState===WebSocket.OPEN||ws?.readyState===WebSocket.CONNECTING)return;
   try{
    const socket=new WebSocket(wsUrl(),[],{headers:{Authorization:'Bearer '+token}});
    ws=socket;
    socket.onopen=()=>{
     if(ws!==socket)return;
     if(AppState.currentState!=='active'){stop();return;}
     reportPushVisibility(socket,true);
     retryMs=1000;stopRetry();fetchNow();
     const beat=()=>{
      if(alive&&ws===socket&&AppState.currentState==='active'&&socket.readyState===WebSocket.OPEN)
       socket.send(JSON.stringify({type:'presence-heartbeat'}));
     };
     stopHeartbeat();beat();
     heartbeatTimer=setInterval(beat,6000);
    };
    socket.onclose=()=>{
     if(ws===socket){
       stopHeartbeat();ws=null;
       if(alive&&AppState.currentState==='active'&&!reconnectTimer){
         const delay=retryMs;retryMs=Math.min(retryMs*2,16000);
         reconnectTimer=setTimeout(()=>{reconnectTimer=null;connect();},delay);
       }
     }
    };
    socket.onmessage=e=>{
     if(ws!==socket)return;
     let data;try{data=JSON.parse(e.data);}catch{return;}
     if(data.type==='session-ended'){onExpired();return;}
     if(data.type==='registration-updated'&&data.new_request)setNotice('Có tài khoản mới chờ duyệt.');
     if(data.type==='support-updated'&&data.new_request)setNotice('Có phiếu hỗ trợ mới.');
     if(data.type==='support-message'&&!data.message?.from_admin)setNotice('Có tin nhắn hỗ trợ mới.');
     if(['registration-updated','support-updated','support-message','admin-approval-request','admin-security-updated'].includes(data.type))
      fetchNow();
    };
   }catch{
     if(alive&&AppState.currentState==='active'&&!reconnectTimer){
       reconnectTimer=setTimeout(()=>{reconnectTimer=null;connect();},retryMs);
       retryMs=Math.min(retryMs*2,16000);
     }
   }
  }
  const timer=setInterval(()=>{if(AppState.currentState==='active'){connect();fetchNow();}},20000);
  const appSub=AppState.addEventListener('change',state=>{
   if(state==='active'){connect();fetchNow();}
   else stop();
  });
  connect();fetchNow();
  return()=>{alive=false;clearInterval(timer);appSub.remove();stop();};
 },[refresh,token,onExpired]);
 useEffect(()=>{
  let active=true;
  const open=response=>{
   if(!active)return;
   const kind=response?.notification.request.content.data?.kind;
   if(kind==='registration')setTab('registrations');
   if(kind==='support')setTab('support');
  };
  const sub=Notifications.addNotificationResponseReceivedListener(open);
  Notifications.getLastNotificationResponseAsync().then(value=>{if(value)open(value);}).catch(()=>{});
  return()=>{active=false;sub.remove();};
 },[]);
 async function act(path,method,body,success){
  if(!pin.trim()){setError('Nhập PIN Admin để xác nhận thao tác.');return false;}
  setBusy(true);setError('');setNotice('');
  try{await call(path,method,{...body,admin_pin:pin});setPin('');setNotice(success||'Đã cập nhật.');await refresh().catch(e=>setError(e.message));return true;}
  catch(e){setError(e.message);return false;}
  finally{setBusy(false);}
 }
 async function loadUsers(sort=userSort){
  const order=typeof sort==='string'&&['oldest','newest','activity'].includes(sort)?sort:userSort;
  setLoading(true);setError('');
  try{
    const r=await call('/api/admin/users?q='+encodeURIComponent(query.trim())+
      '&sort='+encodeURIComponent(order)+'&limit=50');
    setUsers(r.users||[]);
  }catch(e){setError(e.message);}finally{setLoading(false);}
 }
 async function viewUser(item){
  setError('');
  try{setSelectedUser((await call('/api/admin/users/'+item.id+'/details')).user);}
  catch(e){setError(e.message);}
 }
 async function loadWorldAdmin(){
  try{setWorldConfig((await call('/api/admin/world')).config);}
  catch(e){setError(e.message);}
 }
 function changeWorldAvailability(){
  if(!worldConfig)return;
  const enabled=!worldConfig.enabled;
  Alert.alert('Chat thế giới',
    enabled?'Cho phép thành viên tiếp tục chat thế giới?':'Tạm dừng chat thế giới cho tất cả thành viên?',
    [{text:'Hủy',style:'cancel'},{text:enabled?'Mở':'Tạm dừng',onPress:async()=>{
      const ok=await act('/api/admin/world/config','POST',{
        enabled,schedule_enabled:!!worldConfig.schedule_enabled,
        open_minute:worldConfig.open_minute??0,close_minute:worldConfig.close_minute??0,
      },'Đã cập nhật trạng thái chat thế giới.');
      if(ok)await loadWorldAdmin();
    }}]);
 }
 function sanctionUser(kind){
  const user=selectedUser;
  if(!user)return;
  const reason=sanctionReason.trim();
  const minutes=Number(sanctionMinutes);
  if(kind!=='unban'&&reason.length<5){setError('Lý do cần ít nhất 5 ký tự.');return;}
  if(kind==='lock'&&(!Number.isInteger(minutes)||minutes<1||minutes>5256000)){
    setError('Thời hạn khóa phải là số phút hợp lệ (1–5.256.000).');return;
  }
  Alert.alert('Xác nhận bảo mật',
    (kind==='unban'?'Gỡ hạn chế':kind==='lock'?'Khóa tạm':'Cấm tài khoản')+
    ' của @'+user.username+'? Thao tác được ghi vào nhật ký quản trị.',
    [{text:'Hủy',style:'cancel'},{text:'Xác nhận',style:'destructive',onPress:async()=>{
      const ok=await act('/api/admin/users/'+user.id+'/sanction','POST',{
        kind,reason:kind==='unban'?'':reason,
        minutes:kind==='lock'?minutes:null,
      },'Đã cập nhật hạn chế tài khoản.');
      if(ok){await viewUser(user);await loadUsers();setSanctionReason('');}
    }}]);
 }
 async function viewTicket(item){
  setTicket(item);setThread([]);setDraft('');setError('');
  try{const r=await call('/api/admin/tickets/'+item.id+'/messages');setThread(r.messages||[]);}
  catch(e){setError(e.message);}
 }
 async function loadOnline(){
  setError('');setLoading(true);
  try{
   const result=await call('/api/admin/online-users');
   setOnlineUsers(result.users);
   setStats(previous=>({...previous,online:result.total}));
  }catch(error){setError(error.message);}
  finally{setLoading(false);}
 }
 async function showOnlineProfile(id){
  setError('');setLoading(true);
  try{setOnlineProfile((await call('/api/admin/users/'+id+'/details')).user);}
  catch(error){setError(error.message);}
  finally{setLoading(false);}
 }
 // Relative timestamps refresh without inventing online activity.
 useEffect(()=>{
  const tick=()=>{if(AppState.currentState==='active')setPresenceClock(Date.now());};
  const interval=setInterval(tick,30000);
  const subscription=AppState.addEventListener('change',tick);
  return()=>{clearInterval(interval);subscription.remove();};
 },[]);
 // While the online panel is visible, check actual live socket membership.
 useEffect(()=>{
  if(tab!=='online')return;
  let disposed=false;
  const poll=async()=>{
   if(AppState.currentState!=='active')return;
   try{
    const result=await call('/api/admin/online-users');
    if(!disposed){setOnlineUsers(result.users||[]);setStats(old=>({...old,online:result.total}));}
   }catch{}
  };
  poll();
  const timer=setInterval(poll,15000);
  return()=>{disposed=true;clearInterval(timer);};
 },[tab,call]);
 useEffect(()=>{
  if(tab!=='users'||!users.length)return;
  let cancelled=false;
  const poll=()=>{
   if(AppState.currentState!=='active')return;
   call('/api/admin/users?q='+encodeURIComponent(query.trim())+
     '&sort='+encodeURIComponent(userSort)+'&limit=50').then(result=>{
      if(!cancelled)setUsers(result.users||[]);
   }).catch(()=>{});
  };
  const timer=setInterval(poll,30000);
  return()=>{cancelled=true;clearInterval(timer);};
 },[tab,call,userSort,query,users.length]);
 const pending=registration.filter(x=>x.status==='pending');
 const liveTickets=tickets.filter(x=>x.status==='open');
 const tabs=[['home','Tổng quan','grid-outline'],['registrations','Duyệt','checkmark-done-outline'],
  ['support','Hỗ trợ','headset-outline'],['approvals','Thiết bị','phone-portrait-outline'],
  ['users','Thành viên','people-outline'],['worldAdmin','Thế giới','earth-outline']];
 return <View style={{flex:1,backgroundColor:P.bg}}>
  <View style={s.top}><View style={s.adminBrandRow}>
    <Image source={require('../assets/brand-logo.png')} style={s.adminLogo} resizeMode="contain"/>
    <View style={{gap:1,flexShrink:1}}>
      <Text style={s.brand}>mtunz<Text style={{color:P.accent}}>.</Text> <Text style={s.adminBadge}>ADMIN</Text></Text>
      <Text style={s.topMeta}>Trung tâm điều hành · Đồng bộ với web</Text>
    </View></View>
    <Action label="Thoát" subtle onPress={onLogout}/></View>
  <ScrollView keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}
    contentContainerStyle={s.page}>
   <View style={s.hero}>
    <Text style={s.heroEyebrow}>QUẢN TRỊ MTUNZ</Text>
    <Text style={s.heroTitle}>{tab==='home'?'Tổng quan hệ thống':tab==='registrations'?'Duyệt thành viên':tab==='support'?'Hỗ trợ khách hàng':tab==='approvals'?'Quản lý thiết bị':tab==='online'?'Người dùng đang online':tab==='worldAdmin'?'Điều hành chat thế giới':'Quản lý thành viên'}</Text>
    <Text style={s.heroSub}>Theo dõi hoạt động và xử lý công việc trực tiếp trên điện thoại.</Text>
   </View>
   <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{gap:9,paddingBottom:12}}>
    {tabs.map(([id,label,iconName])=><Pressable key={id} accessibilityRole="tab"
      accessibilityState={{selected:tab===id}}
      onPress={()=>{setTab(id);setError('');setNotice('');if(id==='worldAdmin')void loadWorldAdmin();}}
      style={[s.tab,tab===id&&s.active]}>
      <Ionicons name={iconName} size={17} color={tab===id?P.accent:P.muted}/>
      <Text style={{color:P.ink,fontWeight:tab===id?'800':'600',fontSize:12}}>{label}</Text>
    </Pressable>)}
   </ScrollView>
   {error?<Text style={s.error}>{error}</Text>:null}
   {notice?<Text style={s.success}>{notice}</Text>:null}
   <View style={{flexDirection:'row',alignItems:'center',justifyContent:'space-between',gap:8}}>
    <Text style={s.muted}>{lastRefresh?'Đã đồng bộ · '+new Date(lastRefresh).toLocaleTimeString('vi-VN',{hour:'2-digit',minute:'2-digit'}):'Đang kết nối…'}</Text>
    <Action label={loading?'Đang tải…':'Làm mới'} subtle disabled={loading} onPress={()=>{if(tab==='online'){void loadOnline();return;}if(tab==='worldAdmin'){void loadWorldAdmin();return;}setLoading(true);refresh().catch(e=>setError(e.message)).finally(()=>setLoading(false));}}/>
   </View>
   {tab==='home'&&<Box>
    <Text style={s.head}>Thông báo quản trị</Text>
    <Text style={s.muted}>Nhận cảnh báo đăng ký chờ duyệt và yêu cầu hỗ trợ khi đóng ứng dụng.</Text>
    <DevicePushSettings token={token}/>
   </Box>}
   {tab==='home'&&<Box>
    <Text style={s.head}>Trạng thái hệ thống</Text>
    <View style={s.tiles}>
     <Tile title="Thành viên" value={stats.total_users}/>
     <Pressable style={s.tile} accessibilityRole="button" accessibilityLabel="Xem người dùng đang online"
      onPress={()=>{setTab('online');setOnlineProfile(null);void loadOnline();}}>
       <Text style={s.value}>{stats.online??'—'}</Text>
       <Text style={s.muted}>Đang trực tuyến · Xem chi tiết</Text>
     </Pressable>
     <Tile title="Chờ duyệt" value={stats.pending}/>
     <Tile title="Yêu cầu hỗ trợ" value={stats.tickets}/>
     <Tile title="Tin nhắn" value={stats.messages}/>
     <Tile title="Nhóm" value={stats.groups}/>
    </View>
    <Text style={s.muted}>Dữ liệu đọc trực tiếp từ cùng backend và cơ sở dữ liệu với website.</Text>
    <Action label="Mở quản trị nâng cao trên website" subtle onPress={()=>Linking.openURL(API_ORIGIN)}/>
   </Box>}
   {tab==='online'&&<Box>
    <Action label={onlineProfile?'Về danh sách online':'Về tổng quan'} subtle
     onPress={()=>{if(onlineProfile)setOnlineProfile(null);else setTab('home');}}/>
    {onlineProfile?<View style={s.item}>
      <Text style={s.head}>{onlineProfile.display_name||onlineProfile.username}</Text>
      <Text style={s.label}>@{onlineProfile.username}</Text>
       <Text style={s.onlineLabel}>{onlineUsers.some(u=>u.id===onlineProfile.id)?'● Đang trực tuyến':'Đã ngoại tuyến'}</Text>
      <Text style={s.muted}>SĐT {onlineProfile.phone||'—'} · Email {onlineProfile.email||'—'}</Text>
      <Text style={s.muted}>{onlineProfile.friend_count} bạn bè · {onlineProfile.group_count} nhóm · {onlineProfile.session_count} phiên đăng nhập</Text>
    </View>:<>
     <Text style={s.head}>{onlineUsers.length} người đang kết nối realtime</Text>
     {!loading&&onlineUsers.length===0?<Text style={s.muted}>Hiện không có người dùng online.</Text>:null}
     {onlineUsers.map(user=><Pressable key={user.id} style={s.item} accessibilityRole="button"
      disabled={loading} onPress={()=>showOnlineProfile(user.id)}>
      <View style={s.adminOnlineRow}><View style={s.onlinePulse}/>
        <Text numberOfLines={1} style={[s.label,{flex:1}]}>{user.display_name||user.username}</Text>
        <Text style={s.onlineLabel}>Trực tuyến</Text>
      </View>
      <Text style={s.muted}>@{user.username} · {user.sessions} phiên · {user.connections} kết nối</Text>
      {user.last_seen>0?<Text style={s.activityExact}>
        Ghi nhận {new Date(user.last_seen*1000).toLocaleString('vi-VN')}</Text>:null}
    </Pressable>)}
    </>}
   </Box>}
   {tab==='registrations'&&<>
    <Box><Text style={s.head}>Yêu cầu đăng ký ({pending.length})</Text>
     {pending.length===0?<Text style={s.muted}>Không có yêu cầu chờ duyệt.</Text>:pending.map(item=><View key={item.id} style={s.item}>
       <Text style={s.label}>@{item.username}</Text>
       <Text style={s.muted}>SĐT: {item.phone||'—'} • Email: {item.email||'—'}</Text>
       <View style={s.actions}>
         <Action label="Duyệt" disabled={busy} onPress={()=>act('/api/admin/registrations/'+item.id+'/decision','POST',{approve:true},'Đã duyệt tài khoản.')}/>
         <Action label="Từ chối" subtle disabled={busy} onPress={()=>act('/api/admin/registrations/'+item.id+'/decision','POST',{approve:false},'Đã từ chối tài khoản.')}/>
       </View>
      </View>)}
    </Box></>}
   {tab==='approvals'&&<Box><Text style={s.head}>Phê duyệt thiết bị Admin ({approvals.length})</Text>
    {approvals.length===0?<Text style={s.muted}>Không có thiết bị đang chờ.</Text>:
    approvals.map(item=><View key={item.request_id} style={s.item}>
       <Text style={s.label}>{item.device_name||'Thiết bị mới'}</Text>
       <Text style={s.muted}>{item.device_type||'Thiết bị'} • {item.browser||'Ứng dụng'}</Text>
       <View style={s.actions}>
        <Action label="Cho phép" disabled={busy} onPress={()=>act('/api/admin/login-approvals/'+item.request_id+'/decision','POST',{approve:true},'Đã phê duyệt thiết bị.')}/>
        <Action label="Từ chối" subtle disabled={busy} onPress={()=>act('/api/admin/login-approvals/'+item.request_id+'/decision','POST',{approve:false},'Đã từ chối thiết bị.')}/>
       </View>
    </View>)}
   </Box>}
   {tab==='support'&&<Box><Text style={s.head}>Hỗ trợ ({liveTickets.length} đang mở)</Text>
     <Text style={s.muted}>{supportPaused?'Đã tạm ngừng nhận yêu cầu hỗ trợ mới.':'Đang nhận các yêu cầu hỗ trợ mới.'}</Text>
     <Action label={supportPaused?'Mở nhận hỗ trợ':'Tạm không nhận hỗ trợ'} subtle
       disabled={busy} onPress={()=>Alert.alert('Tiếp nhận hỗ trợ',
         supportPaused?'Tiếp tục nhận yêu cầu mới?':'Tạm dừng các yêu cầu hỗ trợ mới?',
         [{text:'Hủy',style:'cancel'},{text:'Xác nhận',onPress:async()=>{
           const paused=!supportPaused;
           const ok=await act('/api/admin/support/intake','PATCH',{paused},
             'Đã cập nhật tiếp nhận hỗ trợ.');
           if(ok)setSupportPaused(paused);
         }}])}/>
    {ticket?<><Text style={s.label}>Yêu cầu #{ticket.id}</Text>
      <Text style={s.muted}>{ticket.kind} • {ticket.status}</Text>
      {thread.map((msg,i)=><View key={msg.id||i} style={s.item}>
       <Text style={s.muted}>{msg.from_admin?'Admin':'Khách hàng'}</Text><Text style={s.label}>{msg.body}</Text>
      </View>)}
      <Field placeholder="Trả lời hỗ trợ" value={draft} onChangeText={setDraft}/>
      <Action label="Gửi phản hồi" disabled={busy||!draft.trim()} onPress={async()=>{
       if(!draft.trim())return;
       const ok=await act('/api/admin/tickets/'+ticket.id+'/messages','POST',{body:draft.trim()},'Đã gửi phản hồi.');
       if(!ok)return; // Never erase a failed support reply.
       try{const x=await call('/api/admin/tickets/'+ticket.id+'/messages');setThread(x.messages||[]);setDraft('');}catch(e){setError(e.message);}
      }}/>
      <Action label="Đóng yêu cầu" subtle disabled={busy} onPress={()=>act('/api/admin/tickets/'+ticket.id+'/status','POST',{status:'closed'},'Đã đóng yêu cầu.')}/>
      {(ticket.status==='closed'||ticket.status==='spam')&&<Action
        label="Xóa cuộc trò chuyện hỗ trợ đã đóng" subtle disabled={busy}
        onPress={()=>Alert.alert('Xóa cuộc trò chuyện','Xóa vĩnh viễn tin nhắn của phiếu hỗ trợ này?',
          [{text:'Hủy',style:'cancel'},{text:'Xóa',style:'destructive',onPress:async()=>{
            const ok=await act('/api/admin/tickets/'+ticket.id,'DELETE',{},'Đã xóa cuộc trò chuyện.');
            if(ok){setTicket(null);setThread([]);}
          }}])}/>}
      <Action label="Quay lại danh sách" subtle onPress={()=>{setTicket(null);setThread([]);}}/>
     </>:tickets.slice(0,60).map(item=><Pressable key={item.id} style={s.item} onPress={()=>viewTicket(item)}>
       <Text style={s.label}>#{item.id} • {item.kind||'Hỗ trợ'}</Text>
       <Text numberOfLines={2} style={s.muted}>{item.claim||'Không có nội dung'}</Text>
       <Text style={s.muted}>Trạng thái: {item.status}</Text>
     </Pressable>)}
   </Box>}
   {tab==='users'&&<Box><Text style={s.head}>Thành viên & hoạt động</Text>
    <Text style={s.muted}>Trực tuyến dựa vào kết nối máy chủ, không phải trạng thái tài khoản.</Text>
    <Field placeholder="Tên đăng nhập, ID hoặc tên hiển thị" value={query} onChangeText={setQuery}/>
    <View style={s.sortRow}>{[
      ['oldest','Cũ nhất'],['newest','Mới nhất'],['activity','Hoạt động gần đây']
    ].map(([order,title])=><Pressable key={order} accessibilityRole="button"
      accessibilityState={{selected:userSort===order}} onPress={()=>{setUserSort(order);loadUsers(order);}}
      style={[s.sortChip,userSort===order&&s.sortActive]}>
      <Text style={[s.sortText,userSort===order&&s.sortTextActive]}>{title}</Text>
    </Pressable>)}</View>
    <Action label="Tìm kiếm" disabled={loading} onPress={()=>loadUsers(userSort)}/>
    {users.map(item=><Pressable key={item.id} style={s.item} onPress={()=>viewUser(item)}>
      <View style={s.adminOnlineRow}>
        <View style={[s.onlinePulse,!item.online&&s.offlinePulse]}/>
        <Text style={[s.label,{flex:1,minWidth:0}]} numberOfLines={1}>{item.display_name||item.username}</Text>
        <Text style={item.online?s.onlineLabel:s.offlineLabel}>{adminPresence(item,presenceClock).short}</Text>
      </View>
      <Text style={s.muted}>@{item.username} · ID {item.id} · {item.sanction_kind?'Có hạn chế':'Tài khoản hợp lệ'}</Text>
      {!!adminPresence(item,presenceClock).exact&&
        <Text style={s.activityExact}>Ghi nhận: {adminPresence(item,presenceClock).exact}</Text>}
    </Pressable>)}
    {selectedUser&&<View style={s.item}>
      <Text style={s.head}>Hồ sơ @{selectedUser.username}</Text>
      <Text style={s.muted}>ID {selectedUser.id} • {selectedUser.sanction_kind||'Không hạn chế'}</Text>
       <Text style={s.activityExact}>Hoạt động gần nhất: {adminPresence(selectedUser,presenceClock).exact||'Chưa ghi nhận'}</Text>
      <Text style={s.muted}>{selectedUser.friend_count} bạn bè · {selectedUser.group_count} nhóm · {selectedUser.message_count} tin nhắn</Text>
      <Text style={s.muted}>{selectedUser.session_count} phiên còn hiệu lực · {selectedUser.file_count} tệp</Text>
      <Text style={s.muted}>Tạo: {new Date(selectedUser.created_at*1000).toLocaleString('vi-VN')}</Text>
      <Text style={s.muted}>Thao tác có thể thu hồi phiên đăng nhập của thành viên và bắt buộc PIN Admin.</Text>
      <Field placeholder="Lý do xử lý (ít nhất 5 ký tự)" value={sanctionReason} onChangeText={setSanctionReason}/>
      <Field placeholder="Khóa trong bao nhiêu phút?" value={sanctionMinutes} onChangeText={setSanctionMinutes}/>
      <View style={s.actions}>
        <Action label="Khóa tạm thời" disabled={busy} onPress={()=>sanctionUser('lock')}/>
        <Action label="Cấm tài khoản" subtle disabled={busy} onPress={()=>sanctionUser('ban')}/>
        <Action label="Gỡ hạn chế" subtle disabled={busy} onPress={()=>sanctionUser('unban')}/>
      </View>
    </View>}
    </Box>}
   {tab==='worldAdmin'&&<Box>
     <Text style={s.head}>Quản lý chat thế giới</Text>
     <Text style={s.muted}>Thay đổi trên điện thoại sẽ gửi sự kiện realtime đến thành viên trên web và app.</Text>
     {worldConfig?<><Text style={s.label}>Trạng thái: {worldConfig.open?'Đang hoạt động':'Đang đóng'}</Text>
       <Text style={s.muted}>Bật hệ thống: {worldConfig.enabled?'Có':'Không'} · Lịch: {worldConfig.schedule_enabled?'Đang bật':'Tắt'}</Text>
       <Action label={worldConfig.enabled?'Tạm dừng chat thế giới':'Mở chat thế giới'} disabled={busy}
         onPress={changeWorldAvailability}/>
     </>:<Action label="Tải trạng thái chat thế giới" onPress={loadWorldAdmin}/>}
   </Box>}
   {(tab==='registrations'||tab==='approvals'||tab==='support'||tab==='users'||tab==='worldAdmin')&&<Box>
     <Text style={s.head}>Xác nhận bảo mật</Text>
     <Text style={s.muted}>Mọi thao tác thay đổi đều cần PIN Admin; không lưu PIN trong ứng dụng.</Text>
     <Field value={pin} onChangeText={setPin} placeholder="Mã PIN Admin" secret/>
   </Box>}
  </ScrollView>
 </View>;
}
const s=StyleSheet.create({
  top:{paddingHorizontal:15,paddingVertical:13,flexDirection:'row',
  justifyContent:'space-between',alignItems:'center',backgroundColor:'#0e2337',
  borderBottomWidth:1,borderColor:'#2b4967'},
  brand:{fontSize:23,fontWeight:'900',letterSpacing:-.5,color:P.ink},
  adminBrandRow:{flexDirection:'row',alignItems:'center',gap:7,flexShrink:1},
  adminLogo:{width:39,height:39},
  adminBadge:{fontSize:10,letterSpacing:1,color:'#9ecfff',fontWeight:'900'},
  topMeta:{fontSize:11,color:P.muted,marginTop:3},
  page:{padding:15,gap:14,paddingBottom:60},
  hero:{backgroundColor:'#163451',borderWidth:1,borderColor:'#3a6384',
  borderRadius:24,paddingHorizontal:21,paddingVertical:25,gap:8},
  heroEyebrow:{fontSize:10,letterSpacing:1.5,color:'#86caff',fontWeight:'900'},
  heroTitle:{fontSize:24,lineHeight:30,letterSpacing:-.5,color:P.ink,fontWeight:'900'},
  heroSub:{fontSize:12,lineHeight:19,color:'#bdd0e9'},
  tab:{flexDirection:'row',alignItems:'center',gap:7,paddingHorizontal:12,paddingVertical:10,
  borderRadius:18,backgroundColor:'#152c44',borderWidth:1,borderColor:P.line},
  active:{backgroundColor:'#28517a',borderColor:P.accent},
  panel:{backgroundColor:P.surface,borderWidth:1,borderColor:'#294a68',
  borderRadius:21,padding:17,gap:13},
  head:{fontSize:18,color:P.ink,fontWeight:'800',letterSpacing:-.2},
  label:{fontSize:14,color:P.ink,fontWeight:'700',lineHeight:21},
  muted:{fontSize:12,color:P.muted,lineHeight:18},
  error:{color:P.danger,padding:12,backgroundColor:'#39283a',borderRadius:11},
  success:{color:'#91e5cc',padding:12,backgroundColor:'#133b3d',borderRadius:11},
  actions:{flexDirection:'row',flexWrap:'wrap',gap:9},
  action:{borderRadius:12,paddingHorizontal:15,paddingVertical:12,
    backgroundColor:P.accent,justifyContent:'center',alignItems:'center',minHeight:44},
  subtle:{backgroundColor:'#263b58',borderWidth:1,borderColor:P.line},
  actionText:{fontSize:13,fontWeight:'800',color:P.bg},
  input:{borderRadius:12,borderWidth:1,borderColor:'#385572',backgroundColor:'#091829',
    color:P.ink,minHeight:49,paddingHorizontal:13,fontSize:15},
  item:{backgroundColor:'#142b43',borderRadius:16,padding:14,gap:9,
  borderWidth:1,borderColor:'#315371'},
  tiles:{flexDirection:'row',flexWrap:'wrap',gap:10},
  tile:{width:'47%',padding:16,backgroundColor:'#15324c',
  borderRadius:18,gap:7,borderWidth:1,borderColor:'#335777'},
  onlineLabel:{color:'#79e4c6',fontSize:11,fontWeight:'900',flexShrink:1},
  offlineLabel:{color:'#a4b9cc',fontSize:11,fontWeight:'700',flexShrink:1},
  adminOnlineRow:{flexDirection:'row',alignItems:'center',gap:8,minWidth:0},
  onlinePulse:{width:9,height:9,borderRadius:5,backgroundColor:P.green},
  offlinePulse:{backgroundColor:'#8198b2'},
  activityExact:{fontSize:11,lineHeight:17,color:'#a8c5df'},
  sortRow:{flexDirection:'row',flexWrap:'wrap',gap:7},
  sortChip:{paddingHorizontal:11,paddingVertical:10,borderRadius:19,
    backgroundColor:'#18344f',borderWidth:1,borderColor:'#315571'},
  sortActive:{backgroundColor:'#285681',borderColor:P.accent},
  sortText:{color:'#aac6dd',fontSize:12,fontWeight:'800'},
  sortTextActive:{color:'#fff'},
  value:{color:P.ink,fontSize:28,fontWeight:'900',letterSpacing:-.7},
});
