import AndroidUpdate from './AndroidUpdate';
import StorageSettings from './StorageSettings';
import {AppLockSettings} from './AppLockGate';
import React,{useCallback,useEffect,useMemo,useRef,useState} from 'react';
import {createSerialRefresh,createForegroundTicker,reuseEqualPayload} from './realtime';
import {createSelectionGuard,createActionGate} from './adminRequestGuard';
import {ActivityIndicator,Alert,AppState,Image,Linking,Pressable,ScrollView,StyleSheet,Text,TextInput,View} from 'react-native';
import {api,API_ORIGIN,wsUrl} from './client';
import * as Notifications from 'expo-notifications';
import * as Crypto from 'expo-crypto';
import {parseAdminPushResponse} from './notificationActions';
import {maintenanceLabel,canCancelDeletion,formatVietnamDateTime,validateSchedule} from './adminSystemPolicy';
import DevicePushSettings,{reportPushVisibility} from './DevicePushSettings';
import {adminPresence} from './presence';
import Ionicons from '@expo/vector-icons/Ionicons';
import {useAppTheme} from './AppTheme';
import {LIGHT_PALETTE,makeScreenLightStyles} from './messengerTheme';

const DARK_ADMIN={bg:'#071320',surface:'#11253a',line:'#294661',ink:'#f4f8ff',muted:'#a8bfd6',accent:'#6dbaff',danger:'#ff9393',green:'#73e0bd'};

const LIGHT_ADMIN={bg:LIGHT_PALETTE.bg,surface:LIGHT_PALETTE.card,line:LIGHT_PALETTE.border,ink:LIGHT_PALETTE.text,muted:LIGHT_PALETTE.soft,accent:LIGHT_PALETTE.accent,danger:LIGHT_PALETTE.bad,green:LIGHT_PALETTE.green};
function useAdminTheme(){const theme=useAppTheme();return {...theme,P:theme.mode==='light'?LIGHT_ADMIN:DARK_ADMIN,s:theme.mode==='light'?lightStyles:darkStyles};}
function Action({label,onPress,disabled=false,subtle=false}){
 const {P,s}=useAdminTheme();
 return <Pressable accessibilityRole="button" onPress={onPress} disabled={disabled}
  style={[s.action,subtle&&s.subtle,disabled&&{opacity:.5}]}>
  <Text style={[s.actionText,subtle&&{color:P.ink}]}>{label}</Text></Pressable>;
}
function Field({placeholder,value,onChangeText,secret=false}){
 const {P,s}=useAdminTheme();
 return <TextInput value={value} onChangeText={onChangeText} placeholder={placeholder}
   placeholderTextColor={P.muted} secureTextEntry={secret} autoCapitalize="none"
   style={s.input}/>;
}
function Box({children}){
 const {P,s}=useAdminTheme();return <View style={s.panel}>{children}</View>;}
function Tile({title,value}){
 const {P,s}=useAdminTheme();return <View style={s.tile}><Text style={s.value}>{value??'—'}</Text><Text style={s.muted}>{title}</Text></View>;}

export default function AdminDashboard({token,onLogout,onExpired}){
 const {P,s,mode,ready:themeReady,saving:themeSaving,changeMode}=useAdminTheme();
 const [maintenance,setMaintenance]=useState(null),[deletions,setDeletions]=useState([]),[systemLoading,setSystemLoading]=useState(false),[systemError,setSystemError]=useState('');
 const systemSeq=useRef(0),systemActionBusy=useRef(false);
 const [scheduleStart,setScheduleStart]=useState(''),[scheduleEnd,setScheduleEnd]=useState(''),[scheduleReason,setScheduleReason]=useState('');
 const pinRef=useRef('');
 const actionGate=useMemo(createActionGate,[]),ticketGuard=useMemo(createSelectionGuard,[]),userGuard=useMemo(createSelectionGuard,[]),auditGuard=useMemo(createSelectionGuard,[]);
 const draftRef=useRef('');
 const [threadLoading,setThreadLoading]=useState(false),[syncPartial,setSyncPartial]=useState(false);
 const [onlineUsers,setOnlineUsers]=useState([]),[onlineProfile,setOnlineProfile]=useState(null);
 const [audit,setAudit]=useState([]),[auditTotal,setAuditTotal]=useState(0),
  [auditOffset,setAuditOffset]=useState(0),[auditQuery,setAuditQuery]=useState(''),
  [auditDetail,setAuditDetail]=useState(null),[auditLoading,setAuditLoading]=useState(false);
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
 const refresh=useMemo(()=>createSerialRefresh(async()=>{
  const paths=['/api/admin/stats','/api/admin/registrations','/api/admin/tickets','/api/admin/login-approvals'];
  const tasks=await Promise.allSettled(paths.map(path=>call(path)));
  if(tasks[0].status==='fulfilled')setStats(old=>reuseEqualPayload(old,tasks[0].value));
  if(tasks[1].status==='fulfilled')setRegistration(old=>reuseEqualPayload(old,tasks[1].value.registrations||[]));
  if(tasks[2].status==='fulfilled'){const rows=tasks[2].value.tickets||[];setTickets(old=>reuseEqualPayload(old,rows));setSupportPaused(!!tasks[2].value.paused);setTicket(old=>old?(rows.find(row=>row.id===old.id)||old):null);}
  if(tasks[3].status==='fulfilled')setApprovals(old=>reuseEqualPayload(old,tasks[3].value.pending||[]));
   setSyncPartial(tasks.some(x=>x.status==='rejected'));
   if(tasks.every(x=>x.status==='rejected'))throw tasks[0].reason;
   if(tasks.every(x=>x.status==='fulfilled'))setLastRefresh(Date.now());
  }),[call]);
 const loadThread=useMemo(()=>createSerialRefresh(async()=>{
   const request=ticketGuard.request();if(!request)return;
   setThreadLoading(true);
   try{const r=await call('/api/admin/tickets/'+request.key+'/messages');if(ticketGuard.accepts(request))setThread(r.messages||[]);}
   catch(e){if(ticketGuard.accepts(request))setError(e.message);}
   finally{if(ticketGuard.accepts(request))setThreadLoading(false);}
  }),[call,ticketGuard]);
  useEffect(()=>{
   let alive=true,ws=null,heartbeatTimer=null,reconnectTimer=null,retryMs=1000;
  const stopHeartbeat=()=>{clearInterval(heartbeatTimer);heartbeatTimer=null;};
  const stopRetry=()=>{if(reconnectTimer){clearTimeout(reconnectTimer);reconnectTimer=null;}};
  const fetchNow=()=>refresh().catch(e=>{if(alive)setError(e.message);});
  const stop=()=>{
   stopHeartbeat();stopRetry();
   if(!ws)return;
   reportPushVisibility(ws,false);
   const previous=ws;ws=null;try{previous.close();}catch{}
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
      if(data.type==='support-message'&&ticketGuard.visit()?.key===data.ticket_id)void loadThread();
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
  const timer=createForegroundTicker(()=>{connect();fetchNow();},20000);
   const appSub=AppState.addEventListener('change',state=>{
    if(state==='active'){timer.start();connect();fetchNow();void loadThread();}
    else {timer.stop();pinRef.current='';setPin('');stop();}
   });
   if(AppState.currentState==='active'){timer.start();connect();fetchNow();}
   return()=>{alive=false;timer.stop();appSub.remove();stop();};
  },[refresh,token,onExpired,ticketGuard,loadThread]);
 useEffect(()=>{
  let active=true;
  const handled=new Set();
  const binding=Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256,token)
    .then(hash=>Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256,'mtunz-push-response:'+hash));
  const open=async response=>{
   const id=response?.notification?.request?.identifier;
   if(!id||handled.has(id))return;
   handled.add(id);if(handled.size>100)handled.delete(handled.values().next().value);
   try{
    const target=parseAdminPushResponse(response,await binding,Notifications.DEFAULT_ACTION_IDENTIFIER);
    if(!active||!target)return;
    const last=await Notifications.getLastNotificationResponseAsync();
    if(last?.notification?.request?.identifier===id)await Notifications.clearLastNotificationResponseAsync();
    if(active)setTab(target);
   }catch{}
  };
  const sub=Notifications.addNotificationResponseReceivedListener(response=>{void open(response);});
  Notifications.getLastNotificationResponseAsync().then(value=>{if(value&&active)void open(value);}).catch(()=>{});
  return()=>{active=false;sub.remove();};
 },[token]);
 async function sendSupportReply(ticketId,body){
  if(AppState.currentState!=='active'||!actionGate.enter())return false;
  setBusy(true);setError('');setNotice('');
  try{
   await call('/api/admin/tickets/'+ticketId+'/messages','POST',{body});
   setNotice('Đã gửi phản hồi.');return true;
  }catch(e){setError(e.message);return false;}
  finally{actionGate.leave();setBusy(false);}
 }
 async function act(path,method,body,success){
  const pin=pinRef.current;
  if(AppState.currentState!=='active')return false;
  if(!pin.trim()){setError('Nhập PIN Admin để xác nhận thao tác.');return false;}
  if(!actionGate.enter())return false;
   pinRef.current='';setPin('');setBusy(true);setError('');setNotice('');
   try{await call(path,method,{...body,admin_pin:pin});setNotice(success||'Đã cập nhật.');await refresh().catch(e=>setError(e.message));return true;}
   catch(e){setError(e.message);return false;}
   finally{actionGate.leave();setBusy(false);}
 }
 const loadSystem=useCallback(async()=>{
  const seq=++systemSeq.current;setSystemLoading(true);setSystemError('');
  const results=await Promise.allSettled([call('/api/system/maintenance'),call('/api/admin/deletions')]);
  if(seq!==systemSeq.current)return;
  setMaintenance(results[0].status==='fulfilled'?results[0].value:null);
  setDeletions(results[1].status==='fulfilled'?results[1].value.requests||[]:[]);
  if(results.some(r=>r.status==='rejected'))setSystemError('Một phần dữ liệu hệ thống chưa tải được. Hãy làm mới.');
  setSystemLoading(false);
 },[call]);
 useEffect(()=>{
  if(tab!=='system')return;
  void loadSystem();
  const poll=setInterval(()=>{if(AppState.currentState==='active'&&!systemActionBusy.current)void loadSystem();},20000);
  const sub=AppState.addEventListener('change',state=>{if(state==='active'&&!systemActionBusy.current)void loadSystem();});
  return()=>{++systemSeq.current;clearInterval(poll);sub.remove();};
 },[tab,loadSystem]);
 function changeMaintenance(enabled){
  if(!maintenance||systemLoading||busy||systemActionBusy.current)return;
  Alert.alert('Xác nhận bảo mật',enabled?'Bật bảo trì sẽ thu hồi phiên của thành viên và chặn đăng nhập. Admin vẫn có quyền truy cập.':'Tắt bảo trì thủ công. Nếu lịch bảo trì đang có hiệu lực, thành viên vẫn chưa thể đăng nhập.',[
    {text:'Hủy',style:'cancel'},{text:'Xác nhận',style:'destructive',onPress:async()=>{
      if(systemActionBusy.current||AppState.currentState!=='active')return;systemActionBusy.current=true;
      try{await act('/api/admin/security/maintenance','POST',{enabled},enabled?'Đã bật bảo trì.':'Đã tắt bảo trì thủ công.');await loadSystem();}finally{systemActionBusy.current=false;}
    }}]);
 }
 function editSchedule(){
  const schedule=maintenance?.schedule;
  setScheduleStart(schedule?formatVietnamDateTime(schedule.starts_at):'');
  setScheduleEnd(schedule?formatVietnamDateTime(schedule.ends_at):'');
  setScheduleReason(schedule?.reason||'');
 }
 function saveSchedule(cancel=false){
  if(!maintenance||systemLoading||busy||systemActionBusy.current)return;
  const result=cancel?{data:{starts_at:0,ends_at:0,reason:''}}:validateSchedule(scheduleStart,scheduleEnd,scheduleReason,maintenance.server_time);
  if(result.error){setSystemError(result.error);return;}
  if(cancel&&!maintenance.schedule)return;
  Alert.alert('Xác nhận bảo mật',cancel?'Hủy lịch bảo trì? Trạng thái bảo trì thủ công không thay đổi.':'Lưu lịch bảo trì '+formatVietnamDateTime(result.data.starts_at)+' đến '+formatVietnamDateTime(result.data.ends_at)+' (giờ Việt Nam)? Khi đến giờ, phiên thành viên sẽ bị thu hồi.',[
    {text:'Không',style:'cancel'},{text:'Xác nhận',style:'destructive',onPress:async()=>{
      if(systemActionBusy.current||AppState.currentState!=='active')return;systemActionBusy.current=true;
      try{
        const ok=await act('/api/admin/security/maintenance/schedule','POST',result.data,cancel?'Đã hủy lịch bảo trì.':'Đã lưu lịch bảo trì.');
        if(ok){setScheduleStart('');setScheduleEnd('');setScheduleReason('');}
        await loadSystem();
      }finally{systemActionBusy.current=false;}
    }}]);
 }
 function cancelDeletion(row){
  if(systemLoading||busy||systemActionBusy.current||!canCancelDeletion(row,maintenance?.server_time))return;
  Alert.alert('Xác nhận hủy yêu cầu xóa','Hủy yêu cầu xóa tài khoản @'+row.username+'? Máy chủ sẽ kiểm tra lại thời hạn và ghi nhật ký quản trị.',[
    {text:'Không',style:'cancel'},{text:'Hủy yêu cầu xóa',onPress:async()=>{
      if(systemActionBusy.current||AppState.currentState!=='active')return;systemActionBusy.current=true;
      try{await act('/api/admin/users/'+row.user_id+'/delete/cancel','POST',{},'Đã hủy yêu cầu xóa tài khoản.');await loadSystem();}finally{systemActionBusy.current=false;}
    }}]);
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
  userGuard.select(item.id);const request=userGuard.request();setSelectedUser(null);setSanctionReason('');setError('');
   try{const result=await call('/api/admin/users/'+item.id+'/details');if(userGuard.accepts(request))setSelectedUser(result.user);}
   catch(e){if(userGuard.accepts(request))setError(e.message);}
 }
 async function loadAudit(offset=0){
  setAuditLoading(true);setError('');
  try{
   const q=encodeURIComponent(auditQuery.trim().slice(0,90));
   const result=await call('/api/admin/audit?limit=30&offset='+offset+'&q='+q);
   setAudit(result.logs||[]);setAuditTotal(result.total||0);
   setAuditOffset(offset);setAuditDetail(null);
  }catch(e){setError(e.message);}finally{setAuditLoading(false);}
 }
 async function openAudit(item){
  auditGuard.select(item.id);const request=auditGuard.request();setAuditDetail(null);
   try{const result=await call('/api/admin/audit/'+item.id);if(auditGuard.accepts(request))setAuditDetail(result.event||null);}
   catch(e){if(auditGuard.accepts(request))setError(e.message);}
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
  ticketGuard.select(item.id);setTicket(item);setThread([]);draftRef.current='';setDraft('');setError('');setThreadLoading(true);await loadThread();
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
 function closeTicket(){ticketGuard.select(null);setTicket(null);setThread([]);setThreadLoading(false);draftRef.current='';setDraft('');}
 const pending=registration.filter(x=>x.status==='pending');
 const liveTickets=tickets.filter(x=>x.status==='open');
 const tabs=[['home','Tổng quan','grid-outline'],['registrations','Duyệt','checkmark-done-outline'],
  ['support','Hỗ trợ','headset-outline'],['approvals','Thiết bị','phone-portrait-outline'],
  ['users','Thành viên','people-outline'],['worldAdmin','Thế giới','earth-outline'],
  ['audit','Nhật ký','receipt-outline'],['system','Hệ thống','shield-checkmark-outline']];
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
    <Text style={s.heroTitle}>{tab==='home'?'Tổng quan hệ thống':tab==='registrations'?'Duyệt thành viên':tab==='support'?'Hỗ trợ khách hàng':tab==='approvals'?'Quản lý thiết bị':tab==='online'?'Người dùng đang online':tab==='worldAdmin'?'Điều hành chat thế giới':tab==='audit'?'Nhật ký quản trị':tab==='system'?'Điều hành hệ thống':'Quản lý thành viên'}</Text>
    <Text style={s.heroSub}>Theo dõi hoạt động và xử lý công việc trực tiếp trên điện thoại.</Text>
   </View>
   <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{gap:9,paddingBottom:12}}>
    {tabs.map(([id,label,iconName])=><Pressable key={id} accessibilityRole="tab"
      accessibilityState={{selected:tab===id}}
      onPress={()=>{setTab(id);setError('');setNotice('');if(id==='worldAdmin')void loadWorldAdmin();if(id==='audit')void loadAudit(0);}}
      style={[s.tab,tab===id&&s.active]}>
      <Ionicons name={iconName} size={17} color={tab===id?P.accent:P.muted}/>
      <Text style={{color:P.ink,fontWeight:tab===id?'800':'600',fontSize:12}}>{label}</Text>
    </Pressable>)}
   </ScrollView>
   {error?<Text style={s.error}>{error}</Text>:null}
   {notice?<Text style={s.success}>{notice}</Text>:null}
   <View style={{flexDirection:'row',alignItems:'center',justifyContent:'space-between',gap:8}}>
    <Text style={s.muted}>{syncPartial?'Một phần dữ liệu chưa đồng bộ':lastRefresh?'Đã đồng bộ · '+new Date(lastRefresh).toLocaleTimeString('vi-VN',{hour:'2-digit',minute:'2-digit'}):'Đang kết nối…'}</Text>
    <Action label={loading?'Đang tải…':'Làm mới'} subtle disabled={loading} onPress={()=>{if(tab==='online'){void loadOnline();return;}if(tab==='worldAdmin'){void loadWorldAdmin();return;}if(tab==='audit'){void loadAudit(auditOffset);return;}if(tab==='system'){void loadSystem();return;}setLoading(true);refresh().catch(e=>setError(e.message)).finally(()=>setLoading(false));}}/>
   </View>
   {tab==='home'&&<Box><Text style={s.head}>Giao diện</Text><Action label={mode==='light'?'Chuyển sang giao diện tối':'Chuyển sang giao diện sáng'} subtle disabled={!themeReady||themeSaving} onPress={()=>changeMode(mode==='light'?'dark':'light')}/></Box>}
   {tab==='home'&&<Box><AndroidUpdate/><StorageSettings token={token}/><AppLockSettings/></Box>}
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
   {tab==='system'&&<>
    <Box>
     <Text style={s.head}>Chế độ bảo trì</Text>
     <Text style={s.label}>{maintenanceLabel(maintenance)}</Text>
     {systemLoading&&<ActivityIndicator color={P.accent}/>}
     {!!systemError&&<Text style={s.error}>{systemError}</Text>}
     {!!maintenance?.schedule&&<View style={s.item}>
       <Text style={s.label}>Lịch bảo trì</Text>
       <Text style={s.muted}>Bắt đầu: {formatVietnamDateTime(maintenance.schedule.starts_at)+' (UTC+7)'}</Text>
       <Text style={s.muted}>Kết thúc: {formatVietnamDateTime(maintenance.schedule.ends_at)+' (UTC+7)'}</Text>
       <Text style={s.muted}>{maintenance.schedule.reason}</Text>
     </View>}
     <Text style={s.muted}>Thay đổi bảo trì áp dụng đồng thời cho website và Android.</Text>
     <Action label={maintenance?.manual?'Tắt bảo trì thủ công':'Bật bảo trì thủ công'} disabled={!maintenance||systemLoading||busy} onPress={()=>changeMaintenance(!maintenance.manual)}/>
    </Box>
    <Box>
     <Text style={s.head}>Thiết lập lịch bảo trì</Text>
     <Text style={s.muted}>Giờ Việt Nam (UTC+7), mẫu YYYY-MM-DD HH:mm. Lịch trong 30 ngày tới, kéo dài 1 phút đến 7 ngày. Bắt buộc nhập lý do và PIN.</Text>
     {!!maintenance?.schedule&&<Action label="Điền lịch hiện tại" subtle disabled={busy||systemLoading} onPress={editSchedule}/>}
     <Field value={scheduleStart} onChangeText={setScheduleStart} placeholder="Bắt đầu: YYYY-MM-DD HH:mm"/>
     <Field value={scheduleEnd} onChangeText={setScheduleEnd} placeholder="Kết thúc: YYYY-MM-DD HH:mm"/>
     <Field value={scheduleReason} onChangeText={setScheduleReason} placeholder="Lý do bảo trì (tối đa 240 ký tự)"/>
     <Action label="Lưu lịch bảo trì" disabled={!maintenance||systemLoading||busy} onPress={()=>saveSchedule(false)}/>
     {!!maintenance?.schedule&&<Action label="Hủy lịch bảo trì" subtle disabled={systemLoading||busy} onPress={()=>saveSchedule(true)}/>}
    </Box>
    <Box><Text style={s.head}>Tài khoản đang chờ xóa ({deletions.length})</Text>
     <Text style={s.muted}>Danh sách trực tiếp từ máy chủ (tối đa 500). Chỉ hủy được yêu cầu còn trong thời hạn. Không xóa vĩnh viễn tại màn hình này.</Text>
     {!systemLoading&&!systemError&&!deletions.length&&<Text style={s.muted}>Không có tài khoản đang chờ xóa.</Text>}
     {deletions.map(row=><View key={String(row.user_id)} style={s.item}>
       <Text style={s.label}>@{row.username}</Text>
       <Text style={s.muted}>Yêu cầu: {new Date(row.requested_at*1000).toLocaleString('vi-VN')}</Text>
       <Text style={s.muted}>Hạn xóa: {new Date(row.purge_at*1000).toLocaleString('vi-VN')}</Text>
       <Action label="Hủy yêu cầu xóa" subtle disabled={systemLoading||busy||!canCancelDeletion(row,maintenance?.server_time)} onPress={()=>cancelDeletion(row)}/>
     </View>)}
    </Box>
   </>}
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
      {threadLoading&&<ActivityIndicator color={P.accent}/>}
      {thread.map((msg,i)=><View key={msg.id||i} style={s.item}>
       <Text style={s.muted}>{msg.from_admin?'Admin':'Khách hàng'}</Text><Text style={s.label}>{msg.body}</Text>
      </View>)}
      <Field placeholder="Trả lời hỗ trợ" value={draft} onChangeText={value=>{draftRef.current=value;setDraft(value);}}/>
      <Action label="Gửi phản hồi" disabled={busy||!draft.trim()} onPress={async()=>{
       const visit=ticketGuard.visit(),sent=draftRef.current;
       if(!visit||visit.key!==ticket.id||!sent.trim())return;
       const ok=await sendSupportReply(ticket.id,sent.trim());
       if(!ok||!ticketGuard.current(visit))return; // Never erase a failed support reply.
       if(draftRef.current===sent){draftRef.current='';setDraft('');}
       await loadThread();
      }}/>
      <Action label="Đóng yêu cầu" subtle disabled={busy} onPress={()=>act('/api/admin/tickets/'+ticket.id+'/status','POST',{status:'closed'},'Đã đóng yêu cầu.')}/>
      {(ticket.status==='closed'||ticket.status==='spam')&&<Action
        label="Xóa cuộc trò chuyện hỗ trợ đã đóng" subtle disabled={busy}
        onPress={()=>Alert.alert('Xóa cuộc trò chuyện','Xóa vĩnh viễn tin nhắn của phiếu hỗ trợ này?',
          [{text:'Hủy',style:'cancel'},{text:'Xóa',style:'destructive',onPress:async()=>{
            const ok=await act('/api/admin/tickets/'+ticket.id,'DELETE',{},'Đã xóa cuộc trò chuyện.');
            if(ok&&ticketGuard.visit()?.key===ticket.id)closeTicket();
          }}])}/>}
      <Action label="Quay lại danh sách" subtle onPress={closeTicket}/>
     </>:tickets.slice(0,60).map(item=><Pressable key={item.id} style={s.item} onPress={()=>viewTicket(item)}>
       <Text style={s.label}>#{item.id} • {item.kind||'Hỗ trợ'}</Text>
       <Text numberOfLines={2} style={s.muted}>{item.claim||'Không có nội dung'}</Text>
       <Text style={s.muted}>Trạng thái: {item.status}</Text>
     </Pressable>)}
   </Box>}
   {tab==='audit'&&<Box>
     <Text style={s.head}>Lịch sử thao tác quản trị ({auditTotal})</Text>
     <Text style={s.muted}>Dữ liệu lấy trực tiếp từ nhật ký máy chủ, có phân trang và chi tiết sự kiện.</Text>
     <Field placeholder="Tìm thao tác hoặc quản trị viên" value={auditQuery}
       onChangeText={v=>setAuditQuery(v.slice(0,90))}/>
     <Action label={auditLoading?'Đang tìm…':'Tìm nhật ký'} disabled={auditLoading}
       onPress={()=>loadAudit(0)}/>
     {auditDetail&&<View style={s.item}>
       <Text style={s.label}>Sự kiện #{auditDetail.id} · {auditDetail.action}</Text>
       <Text style={s.muted}>@{auditDetail.admin_username} · {new Date(auditDetail.created_at*1000).toLocaleString('vi-VN')}</Text>
       <Text style={s.muted} selectable>{auditDetail.detail||'Không có thông tin bổ sung.'}</Text>
       <Action subtle label="Đóng chi tiết" onPress={()=>{auditGuard.select(null);setAuditDetail(null);}}/>
     </View>}
     {audit.length===0&&!auditLoading?<Text style={s.muted}>Không có thao tác phù hợp.</Text>:null}
     {audit.map(item=><Pressable key={item.id} accessibilityRole="button" style={s.item}
       onPress={()=>openAudit(item)}>
       <Text style={s.label}>{item.action||'Thao tác'} · #{item.id}</Text>
       <Text style={s.muted}>@{item.admin_username||'Admin'} · {new Date(item.created_at*1000).toLocaleString('vi-VN')}</Text>
       <Text numberOfLines={2} style={s.muted}>{item.detail||'Chạm để xem chi tiết'}</Text>
       <Text style={s.onlineLabel}>Xem chi tiết</Text>
     </Pressable>)}
     <View style={s.actions}>
       <Action subtle label="Trang trước" disabled={auditLoading||auditOffset===0}
         onPress={()=>loadAudit(Math.max(0,auditOffset-30))}/>
       <Action subtle label="Trang tiếp" disabled={auditLoading||auditOffset+30>=auditTotal}
         onPress={()=>loadAudit(auditOffset+30)}/>
     </View>
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
   {(tab==='registrations'||tab==='approvals'||tab==='support'||tab==='users'||tab==='worldAdmin'||tab==='system')&&<Box>
     <Text style={s.head}>Xác nhận bảo mật</Text>
     <Text style={s.muted}>Mọi thao tác thay đổi đều cần PIN Admin; không lưu PIN trong ứng dụng.</Text>
     <Field value={pin} onChangeText={value=>{pinRef.current=value;setPin(value);}} placeholder="Mã PIN Admin" secret/>
   </Box>}
  </ScrollView>
 </View>;
}
const P=DARK_ADMIN;
const baseStyles={
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
};
const darkStyles=StyleSheet.create(baseStyles);
const lightStyles=StyleSheet.create(makeScreenLightStyles(baseStyles,{
 top:{backgroundColor:'#ffffff'},panel:{backgroundColor:'#ffffff'},input:{backgroundColor:'#ffffff'},item:{backgroundColor:'#f3f7fc'},tile:{backgroundColor:'#e7eff8'},
 hero:{backgroundColor:'#e1ebf7'},heroEyebrow:{color:LIGHT_ADMIN.accent},heroSub:{color:LIGHT_ADMIN.muted},adminBadge:{color:LIGHT_ADMIN.accent},
 topMeta:{color:LIGHT_ADMIN.muted},muted:{color:LIGHT_ADMIN.muted},active:{backgroundColor:'#d3e9ff',borderColor:LIGHT_ADMIN.accent},
 error:{backgroundColor:'#fce1e7',color:LIGHT_ADMIN.danger},success:{backgroundColor:'#e0f2ec',color:LIGHT_ADMIN.green},
 action:{backgroundColor:LIGHT_ADMIN.accent},actionText:{color:'#ffffff'},subtle:{backgroundColor:'#e1ebf7'},
 onlineLabel:{color:LIGHT_ADMIN.green},onlinePulse:{backgroundColor:LIGHT_ADMIN.green},offlinePulse:{backgroundColor:'#718398'},offlineLabel:{color:LIGHT_ADMIN.muted},activityExact:{color:LIGHT_ADMIN.muted},
 sortActive:{backgroundColor:LIGHT_ADMIN.accent,borderColor:LIGHT_ADMIN.accent},sortTextActive:{color:'#ffffff'}
}));
