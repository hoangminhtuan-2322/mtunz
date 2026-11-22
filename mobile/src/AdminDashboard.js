import React,{useCallback,useEffect,useState} from 'react';
import {ActivityIndicator,AppState,Linking,Pressable,ScrollView,StyleSheet,Text,TextInput,View} from 'react-native';
import {api,API_ORIGIN,wsUrl} from './client';

const P={bg:'#071222',surface:'#15253b',line:'#30425b',ink:'#f5f7ff',muted:'#adbeda',accent:'#69b4ff',danger:'#ff9393'};

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
  let alive=true,timer=null,ws=null,appSub;
  const fetchNow=()=>refresh().catch(e=>{if(alive)setError(e.message);});
  fetchNow();timer=setInterval(fetchNow,20000);
  appSub=AppState.addEventListener('change',state=>{if(state==='active')fetchNow();});
  try{
   ws=new WebSocket(wsUrl(),null,{headers:{Authorization:'Bearer '+token}});
   ws.onmessage=e=>{
    let data;try{data=JSON.parse(e.data);}catch{return;}
    if(data.type==='session-ended')onExpired();
    if(['registration-updated','support-updated','admin-approval-request','admin-security-updated'].includes(data.type))
     fetchNow();
   };
  }catch{}
  return()=>{alive=false;clearInterval(timer);appSub?.remove();try{ws?.close();}catch{}};
 },[refresh,token,onExpired]);
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
  <View style={s.top}><Text style={s.brand}>mtunz<Text style={{color:P.accent}}>.</Text> Admin</Text>
    <Action label="Đăng xuất" subtle onPress={onLogout}/></View>
  <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={s.page}>
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
 top:{padding:14,flexDirection:'row',justifyContent:'space-between',alignItems:'center',backgroundColor:P.surface},
 brand:{fontSize:21,fontWeight:'900',color:P.ink},
 page:{padding:14,gap:13,paddingBottom:55},
 tab:{paddingHorizontal:13,paddingVertical:12,borderRadius:12,backgroundColor:P.surface,borderWidth:1,borderColor:P.line},
 active:{backgroundColor:'#28517a',borderColor:P.accent},
 panel:{backgroundColor:P.surface,borderRadius:18,padding:16,gap:12},
 head:{fontSize:19,color:P.ink,fontWeight:'800'},
 label:{fontSize:14,color:P.ink,fontWeight:'700'},
 muted:{fontSize:12,color:P.muted},
 error:{color:P.danger,padding:12},
 success:{color:'#8de0c6',padding:12},
 actions:{flexDirection:'row',flexWrap:'wrap',gap:9},
 action:{borderRadius:11,paddingHorizontal:15,paddingVertical:11,backgroundColor:P.accent,justifyContent:'center',alignItems:'center'},
 subtle:{backgroundColor:P.line},
 actionText:{fontSize:13,fontWeight:'800',color:P.bg},
 input:{borderRadius:11,borderWidth:1,borderColor:P.line,backgroundColor:P.bg,color:P.ink,minHeight:48,paddingHorizontal:12},
 item:{borderTopWidth:1,borderColor:P.line,paddingTop:12,gap:7},
 tiles:{flexDirection:'row',flexWrap:'wrap',gap:9},
 tile:{width:'47%',padding:12,backgroundColor:P.bg,borderRadius:12,gap:2},
 value:{color:P.ink,fontSize:25,fontWeight:'900'},
});
