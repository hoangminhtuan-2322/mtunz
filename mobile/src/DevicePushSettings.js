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

export default function DevicePushSettings({token}){
  const readyForPush=isPushConfigured();
  const [enabled,setEnabled]=useState(null);
  const [busy,setBusy]=useState(false);
  const [message,setMessage]=useState('');
  useEffect(()=>{
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
  return <View style={styles.root}>
    {!readyForPush?<Text accessibilityLiveRegion="polite" style={styles.warning}>
      Phiên bản này chưa kết nối Firebase/Expo Push. Thông báo khi đóng ứng dụng chưa hoạt động. Hãy cập nhật APK chính thức có FCM.
    </Text>:<Text style={styles.status}>{enabled?'Đã lưu thiết bị trên máy chủ; hãy gửi thử để kiểm tra thông báo thực tế.':
      enabled===false?'Thông báo nền chưa bật trên thiết bị này.':'Kiểm tra trạng thái thông báo…'}</Text>}
    <View style={styles.actions}>
      {actions.map(([action,label])=><Pressable key={action} accessibilityRole="button"
        disabled={busy} onPress={()=>run(action)} style={[styles.button,busy&&styles.busy]}>
        <Text style={styles.label}>{label}</Text>
      </Pressable>)}
    </View>
    {message?<Text accessibilityLiveRegion="polite" style={styles.status}>{message}</Text>:null}
  </View>;
}

const styles=StyleSheet.create({
  root:{gap:8,paddingVertical:6},
  actions:{flexDirection:'row',flexWrap:'wrap',gap:8},
  button:{borderColor:'#42658d',borderWidth:1,borderRadius:11,paddingHorizontal:12,minHeight:42,justifyContent:'center'},
  busy:{opacity:.5},
  label:{color:'#e4f2ff',fontWeight:'600'},
  status:{color:'#a5b6cf',lineHeight:19,flexShrink:1},
  warning:{color:'#ffd29b',lineHeight:20,flexShrink:1},
});
