import React,{useEffect,useState} from 'react';
import {Platform,Pressable,StyleSheet,Text,View} from 'react-native';
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

async function enablePush(session){
  const projectId=Constants.easConfig?.projectId||Constants.expoConfig?.extra?.eas?.projectId;
  if(!projectId)throw Error('Bản cài đặt này chưa có cấu hình thông báo đẩy.');
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
  const [enabled,setEnabled]=useState(null);
  const [busy,setBusy]=useState(false);
  const [message,setMessage]=useState('');
  useEffect(()=>{
    let active=true;
    api('/api/mobile/push',{token}).then(result=>{
      if(active)setEnabled(result.enabled);
    }).catch(error=>{if(active)setMessage(error.message);});
    return()=>{active=false;};
  },[token]);
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
  const actions=enabled?[['test','Gửi thử thông báo'],['disable','Tắt thông báo nền']]:
    [['enable','Bật thông báo khi đóng app']];
  return <View style={styles.root}>
    <Text style={styles.status}>{enabled?'Thông báo nền đang bật.':
      enabled===false?'Thông báo nền chưa bật.':'Kiểm tra trạng thái thông báo…'}</Text>
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
  status:{color:'#a5b6cf',lineHeight:19},
});
