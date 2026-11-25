import React,{createContext,useContext,useEffect,useRef,useState} from 'react';
import {ActivityIndicator,Alert,AppState,Keyboard,Platform,Pressable,StyleSheet,Text,View} from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import {canUseAppLock,readAppLock,verifyAppLock,enableAppLock,disableAppLock} from './appLockStore';
import {lockOnResume} from './appLockPolicy';
import {useAppTheme} from './AppTheme';
import {LIGHT_PALETTE,makeScreenLightStyles} from './messengerTheme';

const Context=createContext(null);
function useLockTheme(){const {mode}=useAppTheme();return {s:mode==='light'?lightStyles:darkStyles,accent:mode==='light'?LIGHT_PALETTE.accent:'#6dbaff'};}
export default function AppLockGate({token,onRecovery,children}){
  const {s,accent}=useLockTheme();
  const [enabled,setEnabled]=useState(null),[locked,setLocked]=useState(true),[busy,setBusy]=useState(false),[error,setError]=useState('');
  const enabledRef=useRef(null),busyRef=useRef(false),activeRef=useRef(false),leftAt=useRef(null);
  const lock=()=>{Keyboard.dismiss();setLocked(true);};
  useEffect(()=>{
    activeRef.current=true;
    let alive=true;
    if(Platform.OS!=='android'){enabledRef.current=false;setEnabled(false);setLocked(false);}
    else readAppLock(token).then(value=>{
      if(!alive)return;enabledRef.current=value;setEnabled(value);setLocked(value);
    }).catch(()=>{
      if(!alive)return;enabledRef.current=true;setEnabled(true);setLocked(true);
      setError('Không đọc được trạng thái bảo mật. Hãy thử xác minh hoặc đăng nhập lại.');
    });
    const sub=AppState.addEventListener('change',state=>{
      if(state!=='active'){
        if(leftAt.current===null&&!busyRef.current)leftAt.current=Date.now();
        return;
      }
      const at=leftAt.current;leftAt.current=null;
      if(!busyRef.current&&lockOnResume(enabledRef.current,at,Date.now()))lock();
    });
    return()=>{alive=false;activeRef.current=false;sub.remove();};
  },[token]);
  async function run(action){
    if(busyRef.current||!activeRef.current)return;
    busyRef.current=true;setBusy(true);setError('');
    try{
      if(action==='enable'){
        await enableAppLock(token);
        if(activeRef.current){enabledRef.current=true;setEnabled(true);}
      }else if(action==='disable'){
        await disableAppLock(token);
        if(activeRef.current){enabledRef.current=false;setEnabled(false);setLocked(false);}
      }else{
        if(!await verifyAppLock(token))throw Error('Không tìm thấy khóa hợp lệ. Hãy đăng nhập lại nếu bạn đã thay đổi sinh trắc học.');
        if(activeRef.current)setLocked(false);
      }
    }catch(e){if(activeRef.current)setError(action==='unlock'?'Không xác minh được. Hãy thử lại hoặc đăng nhập lại.':(e.message||'Không thể thay đổi khóa ứng dụng.'));}
    finally{busyRef.current=false;leftAt.current=null;if(activeRef.current)setBusy(false);}
  }
  function recover(){
    if(busyRef.current)return;
    Alert.alert('Đăng nhập lại?','Phiên trên thiết bị này sẽ kết thúc. Bản nháp cục bộ và lịch sử cuộc gọi trong phiên có thể bị xóa. Tài khoản và tin nhắn trên máy chủ vẫn còn.',[
      {text:'Hủy',style:'cancel'},{text:'Đăng xuất',style:'destructive',onPress:()=>{if(!busyRef.current)void onRecovery();}}]);
  }
  if(enabled===null)return <View style={s.center}><ActivityIndicator color={accent}/><Text style={s.muted}>Đang kiểm tra khóa ứng dụng…</Text></View>;
  if(locked)return <View style={s.center}>
    <Ionicons name="lock-closed-outline" size={58} color={accent}/>
    <Text style={s.heading}>mtunz đang khóa</Text>
    <Text style={s.muted}>Xác minh vân tay hoặc sinh trắc học đã thiết lập trên Android.</Text>
    {!!error&&<Text accessibilityLiveRegion="polite" style={s.warning}>{error}</Text>}
    <Pressable disabled={busy} accessibilityRole="button" style={s.primary} onPress={()=>void run('unlock')}><Text style={s.primaryText}>{busy?'Đang xác minh…':'Mở khóa'}</Text></Pressable>
    <Pressable disabled={busy} accessibilityRole="button" style={s.secondary} onPress={recover}><Text style={s.link}>Đăng nhập lại</Text></Pressable>
  </View>;
  return <Context.Provider value={{enabled,busy,error,supported:Platform.OS==='android'&&canUseAppLock(),run,lock}}>{children}</Context.Provider>;
}
export function AppLockSettings(){
  const {s,accent}=useLockTheme();
  const gate=useContext(Context);
  if(!gate||Platform.OS!=='android')return null;
  return <View style={s.panel}>
    <View style={s.row}><Ionicons name="finger-print-outline" size={23} color={accent}/><Text style={s.title}>Khóa ứng dụng</Text></View>
    <Text style={s.muted}>{gate.enabled?'Đang bật · Yêu cầu xác minh khi mở lại sau 30 giây rời ứng dụng.':'Chưa bật · Dùng sinh trắc học của Android để bảo vệ khi mở ứng dụng.'}</Text>
    {!gate.supported&&!gate.enabled&&<Text style={s.warning}>Thiết bị chưa có sinh trắc học đủ mạnh. Hãy thiết lập trong Android.</Text>}
    <Text style={s.muted}>Khóa cục bộ theo phiên; không thay thế mật khẩu, PIN hay quyền Admin. Khi khóa, hội thoại đang mở sẽ đóng; tệp chưa gửi có thể mất. Lịch sử cuộc gọi đã lưu được giữ lại.</Text>
    <View style={s.row}>
      <Pressable accessibilityRole="button" disabled={gate.busy||(!gate.enabled&&!gate.supported)} style={[s.secondary,(gate.busy||(!gate.enabled&&!gate.supported))&&{opacity:.5}]} onPress={()=>void gate.run(gate.enabled?'disable':'enable')}><Text style={s.link}>{gate.busy?'Đang xác minh…':gate.enabled?'Tắt khóa':'Bật khóa'}</Text></Pressable>
      {gate.enabled&&<Pressable accessibilityRole="button" disabled={gate.busy} style={s.secondary} onPress={gate.lock}><Text style={s.link}>Khóa ngay</Text></Pressable>}
    </View>
    {!!gate.error&&<Text accessibilityLiveRegion="polite" style={s.warning}>{gate.error}</Text>}
  </View>;
}
const baseStyles={center:{flex:1,backgroundColor:'#081626',alignItems:'center',justifyContent:'center',padding:26,gap:18},heading:{color:'#f4f8ff',fontSize:26,fontWeight:'800',textAlign:'center'},panel:{backgroundColor:'#142b43',borderRadius:16,padding:14,gap:10},row:{flexDirection:'row',alignItems:'center',gap:8,flexWrap:'wrap'},title:{color:'#f4f8ff',fontWeight:'800',fontSize:15},muted:{color:'#a8bfd6',fontSize:13,lineHeight:20},warning:{color:'#ffd09c',fontSize:13,lineHeight:19},primary:{backgroundColor:'#6dbaff',borderRadius:13,minHeight:48,paddingHorizontal:28,justifyContent:'center'},primaryText:{fontWeight:'800',color:'#071320'},secondary:{borderWidth:1,borderColor:'#42658d',borderRadius:11,minHeight:42,paddingHorizontal:14,justifyContent:'center'},link:{color:'#9fd2ff',fontWeight:'700'}};
const darkStyles=StyleSheet.create(baseStyles);
const lightStyles=StyleSheet.create(makeScreenLightStyles(baseStyles,{
 center:{backgroundColor:LIGHT_PALETTE.bg},panel:{backgroundColor:'#e7eff8'},muted:{color:LIGHT_PALETTE.soft},
 warning:{color:'#884000'},primary:{backgroundColor:LIGHT_PALETTE.accent},primaryText:{color:'#ffffff'},link:{color:LIGHT_PALETTE.accent}
}));
