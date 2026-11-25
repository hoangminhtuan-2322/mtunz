import React,{useCallback,useEffect,useState} from 'react';
import {AppState,Linking,Platform,Pressable,StyleSheet,Text,View} from 'react-native';
import Constants from 'expo-constants';
import Ionicons from '@expo/vector-icons/Ionicons';
import {api} from './client';

const installedVersion=Constants.expoConfig?.version||'';
const installedCode=Number(Constants.expoConfig?.android?.versionCode||0);
const BASE='https://github.com/hoangminhtuan-2322/mtunz/releases/download/';
function validRelease(r){
  return r?.available===true&&r.platform==='android'&&r.package==='com.mtunz.web'&&
    /^\d+\.\d+\.\d+$/.test(r.version)&&Number.isSafeInteger(r.version_code)&&r.version_code>0&&r.version_code<=2100000000&&
    r.download_url===BASE+'android-v'+r.version+'-code'+r.version_code+'/mtunz-android-v'+r.version+'-code'+r.version_code+'.apk';
}
export default function AndroidUpdate(){
  const [release,setRelease]=useState(null),[loading,setLoading]=useState(false),[error,setError]=useState('');
  const check=useCallback(async(signal)=>{
    setLoading(true);setError('');
    try{const value=await api('/api/mobile/release',{signal,timeoutMs:10000});
      if(signal?.aborted)return;
      setRelease(validRelease(value)?value:null);
      if(value.unavailable_reason)setError('Chưa kiểm tra được phiên bản. Thử lại sau.');
    }catch{if(!signal?.aborted)setError('Không thể kiểm tra cập nhật.');}
    finally{if(!signal?.aborted)setLoading(false);}
  },[]);
  useEffect(()=>{
    if(Platform.OS!=='android')return;
    const controller=new AbortController();
    let active=true;
    const run=()=>{if(active)void check(controller.signal);};
    run();
    const sub=AppState.addEventListener('change',state=>{if(state==='active')run();});
    const interval=setInterval(()=>{if(AppState.currentState==='active')run();},120000);
    return()=>{active=false;controller.abort();sub.remove();clearInterval(interval);};
  },[check]);
  if(Platform.OS!=='android')return null;
  const newer=!!release&&release.version_code>installedCode;
  return <View style={s.card}>
    <View style={s.row}><Ionicons name="cloud-download-outline" color="#6dbaff" size={23}/>
      <Text style={s.title}>Phiên bản Android</Text></View>
    <Text style={s.muted}>Đang dùng: {installedVersion||'Không xác định'}{installedCode?' · Build '+installedCode:''}</Text>
    <Text style={s.muted}>{release?'Bản chính thức: '+release.version+' · Build '+release.version_code:'Chưa có bản chính thức để tải.'}</Text>
    {release?.stale&&<Text style={s.muted}>Thông tin đã xác nhận gần nhất.</Text>}
    {newer&&<Text style={s.highlight}>Có bản cập nhật mới</Text>}
    {!!release&&!newer&&<Text style={s.muted}>Không có mã phiên bản mới hơn.</Text>}
    {!!error&&<Text style={s.muted}>{error}</Text>}
    {!!release&&<Pressable accessibilityRole="button" style={s.button} onPress={()=>Linking.openURL(release.download_url).catch(()=>setError('Không thể mở liên kết tải APK.'))}>
      <Text style={s.buttonText}>{newer?'Tải bản cập nhật':'Tải APK chính thức'}</Text></Pressable>}
    <Pressable accessibilityRole="button" disabled={loading} style={s.check} onPress={()=>void check()}>
      <Text style={s.highlight}>{loading?'Đang kiểm tra…':'Kiểm tra cập nhật'}</Text></Pressable>
    <Text style={s.muted}>Android sẽ yêu cầu bạn xác nhận cài đặt; không tự cài APK trong nền.</Text>
  </View>;
}
const s=StyleSheet.create({card:{padding:14,gap:8,borderRadius:16,backgroundColor:'#142b43'},
 row:{flexDirection:'row',alignItems:'center',gap:9},title:{fontSize:15,fontWeight:'800',color:'#f4f8ff'},
 muted:{fontSize:12,lineHeight:18,color:'#a8bfd6'},highlight:{fontSize:13,color:'#6dbaff',fontWeight:'700'},
 button:{minHeight:44,alignItems:'center',justifyContent:'center',backgroundColor:'#6dbaff',borderRadius:12},
 buttonText:{color:'#071320',fontWeight:'800'},check:{minHeight:42,justifyContent:'center',alignItems:'center'}});
