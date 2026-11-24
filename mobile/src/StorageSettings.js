import React,{useCallback,useEffect,useRef,useState} from 'react';
import {Alert,AppState,Pressable,StyleSheet,Text,View} from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import {inspectMediaCache,clearMediaCache} from './mediaCache';
import {formatCacheBytes} from './cacheRules';

export default function StorageSettings({token}){
  const [stats,setStats]=useState(null),[busy,setBusy]=useState(false),[message,setMessage]=useState('');
  const active=useRef(false),running=useRef(false);
  const refresh=useCallback(async()=>{
    try{const info=await inspectMediaCache(token);if(active.current)setStats(info);}
    catch{if(active.current)setMessage('Không đọc được dung lượng tạm.');}
  },[token]);
  useEffect(()=>{
    active.current=true;void refresh();
    const sub=AppState.addEventListener('change',state=>{if(state==='active')void refresh();});
    return()=>{active.current=false;sub.remove();};
  },[refresh]);
  async function clear(){
    if(running.current||!active.current)return;
    running.current=true;setBusy(true);setMessage('');
    try{
      const result=await clearMediaCache(token);
      if(active.current)setMessage('Đã xóa '+result.removed+' bản sao tạm.'+(result.failed?' '+result.failed+' tệp chưa thể xóa.':''));
      await refresh();
    }catch{if(active.current)setMessage('Không thể dọn bộ nhớ tạm.');}
    finally{running.current=false;if(active.current)setBusy(false);}
  }
  return <View style={s.panel}>
    <View style={s.row}><Ionicons name="folder-open-outline" size={22} color="#6dbaff"/><Text style={s.title}>Dung lượng & riêng tư</Text></View>
    <Text style={s.value}>{stats?formatCacheBytes(stats.bytes):'Đang kiểm tra…'}</Text>
    <Text style={s.muted}>{stats?stats.count+' bản sao tệp tạm có thể dọn':'Tệp đã mở, tải hoặc chia sẻ từ hội thoại'}</Text>
    <Text style={s.muted}>Chỉ dọn bản sao tạm do mtunz tạo. Không xóa tin nhắn, bản nháp, tệp đang tải hoặc ảnh gốc của bạn.</Text>
    <View style={s.row}>
      <Pressable accessibilityRole="button" disabled={busy} style={s.button} onPress={()=>void refresh()}><Text style={s.label}>Kiểm tra lại</Text></Pressable>
      <Pressable accessibilityRole="button" disabled={busy||!stats?.count} style={[s.button,(!stats?.count||busy)&&{opacity:.5}]} onPress={()=>Alert.alert('Dọn bản sao tạm?','Đóng các trình xem tệp trước khi dọn. Bạn có thể tải lại tệp nếu còn quyền truy cập.',[{text:'Hủy',style:'cancel'},{text:'Dọn dẹp',onPress:()=>void clear()}])}><Text style={s.label}>{busy?'Đang dọn…':'Dọn bộ nhớ'}</Text></Pressable>
    </View>
    {!!message&&<Text accessibilityLiveRegion="polite" style={s.muted}>{message}</Text>}
    <Text style={s.muted}>Bản sao tạm của phiên hiện tại cũng được dọn khi đăng xuất. Tệp đã xuất sang ứng dụng khác không bị xóa.</Text>
  </View>;
}
const s=StyleSheet.create({panel:{backgroundColor:'#142b43',borderRadius:16,padding:14,gap:9},row:{flexDirection:'row',alignItems:'center',gap:8,flexWrap:'wrap'},title:{color:'#f4f8ff',fontWeight:'800',fontSize:15},value:{color:'#f4f8ff',fontWeight:'800',fontSize:25},muted:{color:'#a8bfd6',fontSize:12,lineHeight:18},button:{borderWidth:1,borderColor:'#42658d',borderRadius:11,minHeight:42,paddingHorizontal:12,justifyContent:'center'},label:{color:'#9fd2ff',fontSize:13,fontWeight:'700'}});
