import React,{useCallback,useEffect,useRef,useState} from 'react';
import {AppState,Linking,Platform,Pressable,StyleSheet,Text,View} from 'react-native';
import * as Notifications from 'expo-notifications';
import Constants from 'expo-constants';
import {api} from './client';
import {MESSAGE_CATEGORY,QUICK_REPLY,OPEN_CHAT} from './notificationActions';
import {MESSAGE_CHANNEL,summarizeNotificationChannel} from './notificationPreferences';
import {useAppTheme} from './AppTheme';
import {LIGHT_PALETTE,makeScreenLightStyles} from './messengerTheme';

Notifications.setNotificationHandler({
  handleNotification:async()=>({
    shouldShowBanner:true,shouldShowList:true,shouldPlaySound:true,shouldSetBadge:false,
  }),
});

export function reportPushVisibility(socket,visible){
  if(socket?.readyState===WebSocket.OPEN){
    socket.send(JSON.stringify({type:'alert-visibility',visible}));
  }
}

function pushProjectId(){
  return Constants.easConfig?.projectId||Constants.expoConfig?.extra?.eas?.projectId||'';
}

function isPushConfigured(){
  return /^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i.test(pushProjectId());
}

async function registerMessageActions(){
  if(Platform.OS!=='android')return;
  await Notifications.setNotificationCategoryAsync(MESSAGE_CATEGORY,[
    {identifier:OPEN_CHAT,buttonTitle:'Mở hội thoại',options:{opensAppToForeground:true}},
    {identifier:QUICK_REPLY,buttonTitle:'Soạn trả lời',textInput:{placeholder:'Nhập nội dung',submitButtonTitle:'Mở để gửi'},
      options:{opensAppToForeground:true,isAuthenticationRequired:true}},
  ]);
}
async function enablePush(session,{prompt=true}={}){
  const projectId=pushProjectId();
  if(!isPushConfigured())throw Error('APK chưa được liên kết Firebase/Expo. Hãy cập nhật bản có thông báo nền.');
  if(Platform.OS==='android'){
    await registerMessageActions().catch(()=>{});
    // Android owns sound/vibration after creation. Never delete or reset an existing channel.
    if(!await Notifications.getNotificationChannelAsync(MESSAGE_CHANNEL)){
      await Notifications.setNotificationChannelAsync(MESSAGE_CHANNEL,{
        name:'Thông báo mtunz',importance:Notifications.AndroidImportance.HIGH,sound:'default',enableVibrate:true,
      });
    }
  }
  const permission=await Notifications.getPermissionsAsync();
  const result=permission.granted||!prompt?permission:await Notifications.requestPermissionsAsync();
  if(!result.granted)throw Error('Hãy cho phép mtunz gửi thông báo trong cài đặt của điện thoại.');
  const {data}=await Notifications.getExpoPushTokenAsync({projectId});
  return api('/api/mobile/push',{token:session,method:'POST',data:{token:data}});
}

export default function DevicePushSettings({token,compact=false}){
  const readyForPush=isPushConfigured();
  const {mode}=useAppTheme();const styles=mode==='light'?lightStyles:darkStyles;
  const androidChannels=Platform.OS==='android'&&Number(Platform.Version)>=26;
  const [diagnostics,setDiagnostics]=useState(null),[diagnosticError,setDiagnosticError]=useState(false);
  const diagnosticSeq=useRef(0);
  const refreshDiagnostics=useCallback(async()=>{
    if(!androidChannels)return;
    const seq=++diagnosticSeq.current;
    try{
      const [permission,channel]=await Promise.all([Notifications.getPermissionsAsync(),Notifications.getNotificationChannelAsync(MESSAGE_CHANNEL)]);
      if(seq===diagnosticSeq.current){setDiagnostics(summarizeNotificationChannel(permission.granted,channel));setDiagnosticError(false);}
    }catch{if(seq===diagnosticSeq.current)setDiagnosticError(true);}
  },[androidChannels]);
  useEffect(()=>{
    if(!androidChannels)return;
    void refreshDiagnostics();
    const sub=AppState.addEventListener('change',state=>{if(state==='active')void refreshDiagnostics();});
    return()=>{diagnosticSeq.current++;sub.remove();};
  },[androidChannels,refreshDiagnostics]);
  const operationBusy=useRef(false);
  const [enabled,setEnabled]=useState(null);
  const [busy,setBusy]=useState(false);
  const [message,setMessage]=useState('');
  const [expanded,setExpanded]=useState(false);
  useEffect(()=>{
    if(!readyForPush)return;
    let active=true,lastAttempt=0;
    void registerMessageActions().catch(()=>{});
    const sync=async()=>{
      lastAttempt=Date.now();
      try{
        const result=await api('/api/mobile/push',{token});
        if(!active)return;
        setEnabled(result.enabled);
        if(result.enabled&&readyForPush){
          // Do not show an OS prompt on resume. Refresh the token only when
          // permission is already granted and this user opted in previously.
          const permission=await Notifications.getPermissionsAsync();
          if(!active)return;
          if(!permission.granted){
            setMessage('Android đã tắt quyền thông báo. Hãy bật lại trong cài đặt ứng dụng.');
          }else{
            await enablePush(token,{prompt:false});
            if(active){setMessage('');void refreshDiagnostics();}
          }
        }
      }catch(error){if(active)setMessage(error.message);}
    };
    sync();
    const sub=AppState.addEventListener('change',state=>{
      if(state==='active'&&Date.now()-lastAttempt>10*60*1000)sync();
    });
    return()=>{active=false;sub.remove();};
  },[token,readyForPush,refreshDiagnostics]);
  async function run(action){
    if(operationBusy.current)return;
    operationBusy.current=true;setBusy(true);setMessage('');
    try{
      if(action==='enable'){
        const result=await enablePush(token);
        setEnabled(result.enabled);
      }else if(action==='disable'){
        const result=await api('/api/mobile/push',{token,method:'DELETE'});
        setEnabled(result.enabled);
      }else{
        await api('/api/mobile/push/test',{token,method:'POST'});
        setMessage('Đã gửi yêu cầu. Kiểm tra thông báo trên thiết bị.');
      }
    }catch(error){setMessage(error.message);}
    finally{operationBusy.current=false;setBusy(false);void refreshDiagnostics();}
  }
  const actions=!readyForPush?[]:enabled?[['test','Gửi thử thông báo'],['disable','Tắt thông báo nền']]:
    [['enable','Bật thông báo khi đóng app']];
  return <View style={[styles.root,compact&&styles.compactRoot]}>
    {compact&&<Pressable accessibilityRole="button"
      accessibilityState={{expanded}} accessibilityLabel="Trạng thái thông báo nền"
      onPress={()=>setExpanded(value=>!value)} style={({pressed})=>[styles.compactRow,pressed&&{opacity:.76}]}>
      <View style={styles.symbol}><Text style={styles.symbolText}>♧</Text></View>
      <View style={styles.compactCopy}>
        <Text style={styles.compactTitle}>Thông báo khi đóng ứng dụng</Text>
        <Text numberOfLines={2} style={readyForPush?styles.status:styles.compactWarning}>
          {!readyForPush?'Chưa khả dụng trên APK này':enabled?'Đã đăng ký thiết bị · Có thể gửi thử':
            enabled===false?'Chưa bật trên thiết bị':'Đang kiểm tra trạng thái'}
        </Text>
      </View>
      <Text style={styles.arrow}>{expanded?'⌃':'›'}</Text>
    </Pressable>}
    {(!compact||expanded)&&<View style={styles.expanded}>
    {!readyForPush?<Text accessibilityLiveRegion="polite" style={styles.warning}>
      APK này chưa kết nối Firebase/Expo Push nên không thể nhận thông báo khi đóng ứng dụng. Thông báo trong ứng dụng vẫn có thể xem ở mục phía trên.
    </Text>:<Text style={styles.status}>{enabled?'Đã lưu thiết bị trên máy chủ; hãy gửi thử để kiểm tra thông báo thực tế.':
      enabled===false?'Thông báo nền chưa bật trên thiết bị này.':'Kiểm tra trạng thái thông báo…'}</Text>}
    <View style={styles.actions}>
      {actions.map(([action,label])=><Pressable key={action} accessibilityRole="button"
        disabled={busy} onPress={()=>run(action)} style={[styles.button,busy&&styles.busy]}>
        <Text style={styles.label}>{label}</Text>
      </Pressable>)}
    </View>
    {androidChannels&&<View style={styles.diagnosticPanel}>
      <Text style={styles.compactTitle}>Âm thanh và rung</Text>
      {diagnosticError?<Text style={styles.warning}>Không đọc được cài đặt Android. Hãy kiểm tra trực tiếp trong cài đặt điện thoại.</Text>:diagnostics?<View style={styles.diagnosticRows}>
        <Text style={styles.status}>Quyền thông báo: {diagnostics.permission==='allowed'?'Đã cấp':diagnostics.permission==='denied'?'Chưa cấp':'Chưa xác định'}</Text>
        <Text style={styles.status}>Kênh mtunz: {diagnostics.channel==='blocked'?'Đang bị chặn':diagnostics.channel==='configured'?'Đã thiết lập':'Chưa tạo'}</Text>
        <Text style={styles.status}>Âm thanh: {diagnostics.sound==='default'?'Mặc định':diagnostics.sound==='custom'?'Tùy chỉnh':diagnostics.sound==='silent'?'Tắt':'Chưa xác định'}</Text>
        <Text style={styles.status}>Rung: {diagnostics.vibration==='on'?'Bật':diagnostics.vibration==='off'?'Tắt':'Chưa xác định'}</Text>
      </View>:<Text style={styles.status}>Đang đọc cài đặt Android…</Text>}
      <Text style={styles.status}>Chọn Thông báo → Thông báo mtunz trong cài đặt Android để đổi âm báo, rung hoặc chế độ im lặng. Áp dụng cho kênh thông báo chung; chế độ Không làm phiền có thể ảnh hưởng.</Text>
      <Pressable accessibilityRole="button" onPress={()=>Linking.openSettings().catch(()=>setMessage('Không mở được cài đặt Android.'))} style={styles.button}><Text style={styles.label}>Mở cài đặt âm thanh / rung</Text></Pressable>
      <Pressable accessibilityRole="button" onPress={()=>void refreshDiagnostics()} style={styles.button}><Text style={styles.label}>Kiểm tra lại cài đặt</Text></Pressable>
    </View>}
    {readyForPush&&Platform.OS==='android'&&!androidChannels&&<Pressable accessibilityRole="button" onPress={()=>Linking.openSettings().catch(()=>setMessage('Không mở được cài đặt Android.'))} style={styles.button}><Text style={styles.label}>Cài đặt thông báo Android</Text></Pressable>}
    {message?<Text accessibilityLiveRegion="polite" style={styles.status}>{message}</Text>:null}
    </View>}
  </View>;
}

const baseStyles={
  diagnosticPanel:{gap:8,padding:12,borderWidth:1,borderColor:'#42658d',borderRadius:14,backgroundColor:'#142b43'},
  diagnosticRows:{gap:4},
  root:{gap:8,paddingVertical:6},
  compactRoot:{gap:0,paddingVertical:0},
  compactRow:{flexDirection:'row',minHeight:70,alignItems:'center',gap:12,
    paddingHorizontal:12,paddingVertical:12},
  symbol:{width:40,height:40,borderRadius:13,backgroundColor:'#3c3d52',
    alignItems:'center',justifyContent:'center'},
  symbolText:{fontSize:20,color:'#ffd29b',fontWeight:'900'},
  compactCopy:{flex:1,minWidth:0,gap:4},
  compactTitle:{color:'#f4f8ff',fontSize:14,fontWeight:'800'},
  compactWarning:{color:'#e3bd92',fontSize:11,lineHeight:16,flexShrink:1},
  arrow:{color:'#829eb9',fontSize:23},
  expanded:{paddingHorizontal:14,paddingBottom:14,gap:10},

  actions:{flexDirection:'row',flexWrap:'wrap',gap:8},
  button:{borderColor:'#42658d',borderWidth:1,borderRadius:11,paddingHorizontal:12,minHeight:42,justifyContent:'center'},
  busy:{opacity:.5},
  label:{color:'#e4f2ff',fontWeight:'600'},
  status:{color:'#a5b6cf',lineHeight:19,flexShrink:1},
  warning:{color:'#ffd29b',lineHeight:20,flexShrink:1},
};
const darkStyles=StyleSheet.create(baseStyles);
const lightStyles=StyleSheet.create(makeScreenLightStyles(baseStyles,{
  symbol:{backgroundColor:'#e7eff8'},symbolText:{color:LIGHT_PALETTE.accent},compactWarning:{color:'#884000'},
  arrow:{color:LIGHT_PALETTE.soft},label:{color:LIGHT_PALETTE.accent},status:{color:LIGHT_PALETTE.soft},warning:{color:'#884000'},diagnosticPanel:{backgroundColor:'#f3f7fc'}
}));
