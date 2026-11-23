import React,{useCallback,useEffect,useState} from 'react';
import {ActivityIndicator,AppState,Image,Linking,Pressable,ScrollView,StyleSheet,Text,TextInput,View} from 'react-native';
import {api,API_ORIGIN,wsUrl} from './client';
import * as Notifications from 'expo-notifications';
import DevicePushSettings,{reportPushVisibility} from './DevicePushSettings';

const P={bg:'#08111f',surface:'#14243a',line:'#2c4160',ink:'#f4f8ff',muted:'#a5b6cf',accent:'#67bcff',danger:'#ff9393'};

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
 const [tab,setTab]=useState('home'),[stats,setStats]=useState({}),[registration,setRegistration]=useState([]),
  [tickets,setTickets]=useState([]),[users,setUsers]=useState([]),[approvals,setApprovals]=useState([]),
  [query,setQuery]=useState(''),[pin,setPin]=useState(''),[draft,setDraft]=useState(''),
  [ticket,setTicket]=useState(null),[thread,setThread]=useState([]),
  [busy,setBusy]=useState(false),[loading,setLoading]=useState(false),[error,setError]=useState(''),
  [notice,setNotice]=useState(''),[lastRefresh,setLastRefresh]=useState(null);
 const call=useCallback(async(path,method='GET',data)=>{
   try{return await api(path,{token,method,data});}
   catch(e){if(e.status===401)onExpired();throw e;}
 },[token,onExpired]);
 const refresh=useCallback(async()=>{
  const paths=['/api/admin/stats','/api/admin/registrations','/api/admin/tickets','/api/admin/login-approvals'];
  const tasks=await Promise.allSettled(paths.map(path=>call(path)));
  if(tasks[0].status==='fulfilled')setStats(tasks[0].value);
  if(tasks[1].status==='fulfilled')setRegistration(tasks[1].value.registrations||[]);
  if(tasks[2].status==='fulfilled')setTickets(tasks[2].value.tickets||[]);
  if(tasks[3].status==='fulfilled')setApprovals(tasks[3].value.pending||[]);
  if(tasks.every(x=>x.status==='rejected'))throw tasks[0].reason;
  setLastRefresh(Date.now());
 },[call]);
 useEffect(()=>{
  let alive=true,ws=null;
  const fetchNow=()=>refresh().catch(e=>{if(alive)setError(e.message);});
  const stop=()=>{
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
    socket.onopen=()=>{if(ws===socket)reportPushVisibility(socket,AppState.currentState==='active');};
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
   }catch{}
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
  if(!pin.trim()){setError('Nhập PIN Admin để xác nhận thao tác.');return;}
  setBusy(true);setError('');setNotice('');
  try{await call(path,method,{...body,admin_pin:pin});setPin('');setNotice(success||'Đã cập nhật.');await refresh();}
  catch(e){setError(e.message);}
  finally{setBusy(false);}
 }
 async function loadUsers(){
  setLoading(true);setError('');
  try{const r=await call('/api/admin/users?q='+encodeURIComponent(query.trim())+'&limit=50');setUsers(r.users||[]);}
  catch(e){setError(e.message);}finally{setLoading(false);}
 }
 async function viewTicket(item){
  setTicket(item);setThread([]);setDraft('');setError('');
  try{const r=await call('/api/admin/tickets/'+item.id+'/messages');setThread(r.messages||[]);}
  catch(e){setError(e.message);}
 }
 const pending=registration.filter(x=>x.status==='pending');
 const liveTickets=tickets.filter(x=>x.status==='open');
 const tabs=[['home','Tổng quan'],['registrations','Duyệt'],['support','Hỗ trợ'],['approvals','Thiết bị'],['users','Thành viên']];
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
    <Text style={s.heroTitle}>{tab==='home'?'Tổng quan hệ thống':tab==='registrations'?'Duyệt thành viên':tab==='support'?'Hỗ trợ khách hàng':tab==='approvals'?'Quản lý thiết bị':'Quản lý thành viên'}</Text>
    <Text style={s.heroSub}>Theo dõi hoạt động và xử lý công việc trực tiếp trên điện thoại.</Text>
   </View>
   <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{gap:9,paddingBottom:12}}>
    {tabs.map(([id,label])=><Pressable key={id} onPress={()=>{setTab(id);setError('');setNotice('');}}
     style={[s.tab,tab===id&&s.active]}><Text style={{color:P.ink,fontWeight:tab===id?'800':'500'}}>{label}</Text></Pressable>)}
   </ScrollView>
   {error?<Text style={s.error}>{error}</Text>:null}
   {notice?<Text style={s.success}>{notice}</Text>:null}
   <View style={{flexDirection:'row',alignItems:'center',justifyContent:'space-between',gap:8}}>
    <Text style={s.muted}>{lastRefresh?'Đồng bộ với máy chủ mtunz':'Đang kết nối…'}</Text>
    <Action label={loading?'Đang tải…':'Làm mới'} subtle disabled={loading} onPress={()=>{setLoading(true);refresh().catch(e=>setError(e.message)).finally(()=>setLoading(false));}}/>
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
     <Tile title="Đang trực tuyến" value={stats.online}/>
     <Tile title="Chờ duyệt" value={stats.pending}/>
     <Tile title="Yêu cầu hỗ trợ" value={stats.tickets}/>
     <Tile title="Tin nhắn" value={stats.messages}/>
     <Tile title="Nhóm" value={stats.groups}/>
    </View>
    <Text style={s.muted}>Dữ liệu đọc trực tiếp từ cùng backend và cơ sở dữ liệu với website.</Text>
    <Action label="Mở quản trị nâng cao trên website" subtle onPress={()=>Linking.openURL(API_ORIGIN)}/>
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
    {ticket?<><Text style={s.label}>Yêu cầu #{ticket.id}</Text>
      <Text style={s.muted}>{ticket.kind} • {ticket.status}</Text>
      {thread.map((msg,i)=><View key={msg.id||i} style={s.item}>
       <Text style={s.muted}>{msg.from_admin?'Admin':'Khách hàng'}</Text><Text style={s.label}>{msg.body}</Text>
      </View>)}
      <Field placeholder="Trả lời hỗ trợ" value={draft} onChangeText={setDraft}/>
      <Action label="Gửi phản hồi" disabled={busy||!draft.trim()} onPress={async()=>{
       if(!draft.trim())return;await act('/api/admin/tickets/'+ticket.id+'/messages','POST',{body:draft.trim()},'Đã gửi phản hồi.');
       try{const x=await call('/api/admin/tickets/'+ticket.id+'/messages');setThread(x.messages||[]);setDraft('');}catch(e){setError(e.message);}
      }}/>
      <Action label="Đóng yêu cầu" subtle disabled={busy} onPress={()=>act('/api/admin/tickets/'+ticket.id+'/status','POST',{status:'closed'},'Đã đóng yêu cầu.')}/>
      <Action label="Quay lại danh sách" subtle onPress={()=>{setTicket(null);setThread([]);}}/>
     </>:tickets.slice(0,60).map(item=><Pressable key={item.id} style={s.item} onPress={()=>viewTicket(item)}>
       <Text style={s.label}>#{item.id} • {item.kind||'Hỗ trợ'}</Text>
       <Text numberOfLines={2} style={s.muted}>{item.claim||'Không có nội dung'}</Text>
       <Text style={s.muted}>Trạng thái: {item.status}</Text>
     </Pressable>)}
   </Box>}
   {tab==='users'&&<Box><Text style={s.head}>Tìm thành viên</Text>
    <Field placeholder="Tên đăng nhập, ID hoặc tên hiển thị" value={query} onChangeText={setQuery}/>
    <Action label="Tìm kiếm" disabled={loading} onPress={loadUsers}/>
    {users.map(item=><View key={item.id} style={s.item}>
      <Text style={s.label}>{item.display_name||item.username} (@{item.username})</Text>
      <Text style={s.muted}>ID {item.id} • {item.sanction_kind||'Đang hoạt động'}</Text>
    </View>)}
    <Text style={s.muted}>Các thao tác kiểm tra bảo mật và xử lý tài khoản chuyên sâu dùng bảng quản trị web.</Text>
    </Box>}
   {(tab==='registrations'||tab==='approvals'||tab==='support')&&<Box>
     <Text style={s.head}>Xác nhận bảo mật</Text>
     <Text style={s.muted}>Mọi thao tác thay đổi đều cần PIN Admin; không lưu PIN trong ứng dụng.</Text>
     <Field value={pin} onChangeText={setPin} placeholder="Mã PIN Admin" secret/>
   </Box>}
  </ScrollView>
 </View>;
}
const s=StyleSheet.create({
  top:{paddingHorizontal:17,paddingVertical:15,flexDirection:'row',justifyContent:'space-between',
    alignItems:'center',backgroundColor:P.bg,borderBottomWidth:1,borderColor:P.line},
  brand:{fontSize:23,fontWeight:'900',letterSpacing:-.5,color:P.ink},
  adminBrandRow:{flexDirection:'row',alignItems:'center',gap:7,flexShrink:1},
  adminLogo:{width:39,height:39},
  adminBadge:{fontSize:10,letterSpacing:1,color:'#9ecfff',fontWeight:'900'},
  topMeta:{fontSize:11,color:P.muted,marginTop:3},
  page:{padding:16,gap:16,paddingBottom:60},
  hero:{backgroundColor:'#17304d',borderWidth:1,borderColor:'#365876',borderRadius:22,
    paddingHorizontal:19,paddingVertical:23,gap:7},
  heroEyebrow:{fontSize:10,letterSpacing:1.5,color:'#86caff',fontWeight:'900'},
  heroTitle:{fontSize:25,lineHeight:30,letterSpacing:-.6,color:P.ink,fontWeight:'900'},
  heroSub:{fontSize:12,lineHeight:19,color:'#bdd0e9'},
  tab:{paddingHorizontal:17,paddingVertical:12,borderRadius:24,backgroundColor:P.surface,
    borderWidth:1,borderColor:P.line},
  active:{backgroundColor:'#28517a',borderColor:P.accent},
  panel:{backgroundColor:P.surface,borderWidth:1,borderColor:P.line,
    borderRadius:20,padding:17,gap:14},
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
  item:{backgroundColor:'#102138',borderRadius:14,padding:14,gap:8,
    borderWidth:1,borderColor:'#2c425e'},
  tiles:{flexDirection:'row',flexWrap:'wrap',gap:10},
  tile:{width:'47%',padding:15,backgroundColor:'#10263e',borderRadius:16,gap:7,
    borderWidth:1,borderColor:'#2b4966'},
  value:{color:P.ink,fontSize:28,fontWeight:'900',letterSpacing:-.7},
});
