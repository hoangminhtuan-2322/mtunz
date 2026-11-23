import React,{useEffect,useState} from 'react';
import {AppState,Platform,Pressable,StyleSheet,Text,View} from 'react-native';
import * as Notifications from 'expo-notifications';
import Constants from 'expo-constants';
import {api} from './client';

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

async function enablePush(session){
  const projectId=pushProjectId();
  if(!isPushConfigured())throw Error('APK chưa được liên kết Firebase/Expo. Hãy cập nhật bản có thông báo nền.');
  if(Platform.OS==='android'){
    await Notifications.setNotificationChannelAsync('messages',{
      name:'Thông báo mtunz',importance:Notifications.AndroidImportance.HIGH,sound:'default',
    });
  }
  const permission=await Notifications.getPermissionsAsync();
  const result=permission.granted?permission:await Notifications.requestPermissionsAsync();
  if(!result.granted)throw Error('Hãy cho phép mtunz gửi thông báo trong cài đặt của điện thoại.');
  const {data}=await Notifications.getExpoPushTokenAsync({projectId});
  return api('/api/mobile/push',{token:session,method:'POST',data:{token:data}});
}

export default function DevicePushSettings({token,compact=false}){
  const readyForPush=isPushConfigured();
  const [enabled,setEnabled]=useState(null);
  const [busy,setBusy]=useState(false);
  const [message,setMessage]=useState('');
  const [expanded,setExpanded]=useState(false);
  useEffect(()=>{
    if(!readyForPush)return;
    let active=true,lastAttempt=0;
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
            await enablePush(token);
            if(active)setMessage('');
          }
        }
      }catch(error){if(active)setMessage(error.message);}
    };
    sync();
    const sub=AppState.addEventListener('change',state=>{
      if(state==='active'&&Date.now()-lastAttempt>10*60*1000)sync();
    });
    return()=>{active=false;sub.remove();};
  },[token,readyForPush]);
  async function run(action){
    setBusy(true);setMessage('');
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
    finally{setBusy(false);}
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
    {message?<Text accessibilityLiveRegion="polite" style={styles.status}>{message}</Text>:null}
    </View>}
  </View>;
}

const styles=StyleSheet.create({
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
});
