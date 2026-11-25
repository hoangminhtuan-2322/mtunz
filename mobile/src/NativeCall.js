import React,{useCallback,useEffect,useRef,useState} from 'react';
import {Alert,AppState,Modal,Pressable,StyleSheet,Text,View} from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import {finishCall,formatCallDuration,callStatusLabel,appendCallHistory} from './callHistory';
import {readCallVault,appendCallVault,clearCallVault} from './callVault';
import {mediaDevices,MediaStream,RTCPeerConnection,RTCIceCandidate,RTCSessionDescription,RTCView} from 'react-native-webrtc';

const ICE={iceServers:[{urls:['stun:stun.l.google.com:19302','stun:stun1.l.google.com:19302']}]};
const MAX_ICE=50;
const COLORS={bg:'#081626',panel:'#142c46',primary:'#74c4ff',text:'#f7fbff',muted:'#b4c7d9',danger:'#ee5b70'};

// Uses the same authenticated WebSocket signaling protocol as static/extras.js.
// Calls are intentionally foreground-only. STUN works on many networks, but
// production reliability behind restrictive NAT requires a separately managed TURN service.
export function useNativeCall(wsRef,friends,token){
  const contactsRef=useRef(friends);contactsRef.current=friends;
  const callRef=useRef(null),incomingRef=useRef(null),pendingIce=useRef(new Map()),startingRef=useRef(false);
  const generationRef=useRef(0),inviteTimerRef=useRef(null);
  const [view,setView]=useState(null),[incoming,setIncoming]=useState(null),[history,setHistory]=useState([]);
  const [historyLoading,setHistoryLoading]=useState(true),[historyError,setHistoryError]=useState('');
  const aliveRef=useRef(false);
  useEffect(()=>{
    aliveRef.current=true;
    let current=true;
    readCallVault(token).then(rows=>{if(current)setHistory(rows);}).catch(()=>{if(current)setHistoryError('Không đọc được lịch sử đã lưu.');})
      .finally(()=>{if(current)setHistoryLoading(false);});
    return()=>{current=false;aliveRef.current=false;};
  },[token]);
  const recordCall=useCallback(record=>{
    // Serialized storage operations survive unmount when the app lock engages.
    appendCallVault(token,record).then(rows=>{if(aliveRef.current){setHistory(rows);setHistoryError('');}})
      .catch(()=>{if(aliveRef.current){setHistory(old=>appendCallHistory(old,record));setHistoryError('Một cuộc gọi chưa lưu được; lịch sử có thể thiếu sau khi mở lại app.');}});
  },[token]);
  const clearHistory=useCallback(async()=>{
    try{await clearCallVault(token);if(aliveRef.current){setHistory([]);setHistoryError('');}}
    catch{if(aliveRef.current)setHistoryError('Không xóa được lịch sử trên thiết bị. Hãy thử lại.');}
  },[token]);
  const transmit=useCallback((type,to,signal=null,video=false)=>{
    const socket=wsRef.current;
    if(!socket||socket.readyState!==WebSocket.OPEN)return false;
    try{socket.send(JSON.stringify({type,to,signal,video}));return true;}catch{return false;}
  },[wsRef]);
  const update=useCallback(()=>{
    const c=callRef.current;
    setView(c?{peerId:c.peerId,title:c.title,video:c.video,local:c.local,
      remote:c.remote,status:c.status,muted:c.muted,cameraDisabled:c.cameraDisabled,connectedAt:c.connectedAt}:null);
  },[]);
  const endCall=useCallback((signal=true,reason='ended')=>{
    ++generationRef.current;
    if(inviteTimerRef.current){clearTimeout(inviteTimerRef.current);inviteTimerRef.current=null;}
    const c=callRef.current,invite=incomingRef.current;callRef.current=null;startingRef.current=false;
    const record=finishCall(c||invite,reason,Date.now());
    if(record)recordCall(record);
    if(c){
      if(signal)transmit('call-hangup',c.peerId);
      if(c.timer)clearTimeout(c.timer);
      if(c.disconnectTimer)clearTimeout(c.disconnectTimer);
      try{c.local?.getTracks().forEach(track=>track.stop());}catch{}
      try{c.remote?.getTracks().forEach(track=>track.stop());}catch{}
      try{c.pc?.close();}catch{}
      pendingIce.current.delete(c.peerId);
    }
    if(invite){if(signal&&!c)transmit('call-decline',invite.peerId);pendingIce.current.delete(invite.peerId);}
    incomingRef.current=null;setIncoming(null);setView(null);
  },[transmit,recordCall]);
  const setup=useCallback(async(peerId,title,video,generation,invite=null)=>{
    const local=await mediaDevices.getUserMedia({audio:true,video:!!video});
    if(generationRef.current!==generation||AppState.currentState==='background'){
      local.getTracks().forEach(track=>track.stop());return null;
    }
    let pc;
    try{pc=new RTCPeerConnection(ICE);}catch(error){local.getTracks().forEach(track=>track.stop());throw error;}
    const remote=new MediaStream();
    const c={peerId,title,video,local,remote,pc,status:'Đang kết nối…',
      muted:false,cameraDisabled:false,timer:null,disconnectTimer:null,ice:[],
      direction:invite?'incoming':'outgoing',startedAt:invite?.startedAt||Date.now(),connectedAt:null};
    callRef.current=c;
    local.getTracks().forEach(track=>pc.addTrack(track,local));
    pc.onicecandidate=event=>{
      if(callRef.current!==c||!event.candidate)return;
      const item=event.candidate.toJSON?.()||event.candidate;
      transmit('call-ice',peerId,item);
    };
    pc.ontrack=event=>{
      if(callRef.current!==c)return;
      for(const stream of event.streams||[]){
        for(const track of stream.getTracks()){
          if(!c.remote.getTracks().some(t=>t.id===track.id))c.remote.addTrack(track);
        }
      }
      update();
    };
    pc.onconnectionstatechange=()=>{
      if(callRef.current!==c)return;
      const state=pc.connectionState;
      c.status=state==='connected'?'Đã kết nối':
        state==='connecting'?'Đang kết nối…':
        state==='disconnected'?'Đang nối lại…':state==='failed'?'Kết nối thất bại':c.status;
      if(state==='connected'){
        if(!c.connectedAt)c.connectedAt=Date.now();
        if(c.timer){clearTimeout(c.timer);c.timer=null;}
        if(c.disconnectTimer){clearTimeout(c.disconnectTimer);c.disconnectTimer=null;}
      }
      if(state==='disconnected'&&!c.disconnectTimer){
        c.disconnectTimer=setTimeout(()=>{if(callRef.current===c&&pc.connectionState!=='connected')endCall(true,'network');},15000);
      }
      if(state==='failed'||state==='closed'){endCall(false,'network');return;}
      update();
    };
    c.timer=setTimeout(()=>{
      if(callRef.current===c&&pc.connectionState!=='connected'){
        endCall(true,'timeout');
        Alert.alert('Không thể kết nối','Cuộc gọi không kết nối sau 45 giây. Mạng có thể cần máy chủ TURN.');
      }
    },45000);
    update();
    return c;
  },[endCall,transmit,update]);
  const startCall=useCallback(async(peerId,title,video=false)=>{
    if(startingRef.current||callRef.current||incomingRef.current)return;
    if(!Number.isSafeInteger(Number(peerId))||Number(peerId)<=0)return;
    const friend=contactsRef.current.find(f=>Number(f.other_id)===Number(peerId)&&f.state==='accepted'&&!f.archived&&!f.restricted);
    if(!friend){Alert.alert('Không thể gọi','Chỉ gọi được cho bạn bè đã kết nối.');return;}
    if(wsRef.current?.readyState!==WebSocket.OPEN){Alert.alert('Mất kết nối','Hãy kết nối lại trước khi gọi.');return;}
    startingRef.current=true;
    const generation=++generationRef.current;
    try{
      const c=await setup(Number(peerId),title||friend.display_name||friend.username||'Bạn bè',video,generation);
      if(!c||callRef.current!==c)return;
      c.status='Đang gọi…';update();
      const offer=await c.pc.createOffer();if(callRef.current!==c)return;
      await c.pc.setLocalDescription(offer);if(callRef.current!==c)return;
      const signal=c.pc.localDescription?.toJSON?.()||offer;
      if(!transmit('call-offer',c.peerId,signal,video))throw Error('Mất kết nối với máy chủ.');
    }catch(error){
      if(generationRef.current===generation){endCall(false,'failed');
        Alert.alert('Không thể gọi',error?.message||'Không thể bật micro hoặc camera.');}
    }finally{if(generationRef.current===generation)startingRef.current=false;}
  },[endCall,setup,transmit,update,wsRef]);
  const decline=useCallback(()=>{
    const invite=incomingRef.current;
    if(invite){transmit('call-decline',invite.peerId);pendingIce.current.delete(invite.peerId);}
    endCall(false,'declined');
  },[transmit,endCall]);
  const accept=useCallback(async()=>{
    const invite=incomingRef.current;
    if(!invite||callRef.current||startingRef.current)return;
    startingRef.current=true;
    const generation=++generationRef.current;
    try{
      const c=await setup(invite.peerId,invite.title,invite.video,generation,invite);
      if(!c||callRef.current!==c)return;
      if(inviteTimerRef.current){clearTimeout(inviteTimerRef.current);inviteTimerRef.current=null;}
      incomingRef.current=null;setIncoming(null);
      await c.pc.setRemoteDescription(new RTCSessionDescription(invite.signal));
      const queued=pendingIce.current.get(invite.peerId)||[];
      pendingIce.current.delete(invite.peerId);
      for(const ice of queued)await c.pc.addIceCandidate(new RTCIceCandidate(ice));
      if(callRef.current!==c)return;
      const answer=await c.pc.createAnswer();if(callRef.current!==c)return;
      await c.pc.setLocalDescription(answer);if(callRef.current!==c)return;
      if(!transmit('call-answer',invite.peerId,c.pc.localDescription?.toJSON?.()||answer))
        throw Error('Mất kết nối với máy chủ.');
    }catch(error){
      if(generationRef.current===generation){endCall(false,'failed');transmit('call-decline',invite.peerId);
        Alert.alert('Không thể nghe máy',error?.message||'Kiểm tra quyền micro/camera.');}
    }finally{if(generationRef.current===generation)startingRef.current=false;}
  },[endCall,setup,transmit]);
  const onSignal=useCallback(async(data)=>{
    if(!data||!['call-offer','call-answer','call-ice','call-hangup','call-decline'].includes(data.type))return;
    const from=Number(data.from_id);
    if(!Number.isSafeInteger(from)||from<=0)return;
    if(data.type==='call-offer'){
      const friend=contactsRef.current.find(f=>Number(f.other_id)===from&&f.state==='accepted'&&!f.archived&&!f.restricted);
      if(!friend||callRef.current||incomingRef.current||startingRef.current||
         !data.signal||data.signal.type!=='offer'){transmit('call-decline',from);return;}
      const invite={peerId:from,title:friend.display_name||friend.username||'Bạn bè',
        video:!!data.video,signal:data.signal,direction:'incoming',startedAt:Date.now(),connectedAt:null};
      incomingRef.current=invite;setIncoming(invite);
      inviteTimerRef.current=setTimeout(()=>{
        if(incomingRef.current===invite){transmit('call-decline',from);endCall(false,'timeout');}
      },45000);
      return;
    }
    const c=callRef.current;
    if(data.type==='call-ice'&&data.signal){
      if(!c||c.peerId!==from||!c.pc.remoteDescription){
        if(!contactsRef.current.some(f=>Number(f.other_id)===from&&f.state==='accepted'))return;
        if(pendingIce.current.size>=16&&!pendingIce.current.has(from))return;
        const queue=pendingIce.current.get(from)||[];
        if(queue.length<MAX_ICE)queue.push(data.signal);
        pendingIce.current.set(from,queue);return;
      }
      try{await c.pc.addIceCandidate(new RTCIceCandidate(data.signal));}catch{}
      return;
    }
    if(data.type==='call-hangup'||data.type==='call-decline'){
      if(c?.peerId===from)endCall(false,data.type==='call-decline'?'declined':'remote');
      else if(incomingRef.current?.peerId===from)endCall(false,'remote');
      return;
    }
    if(data.type==='call-answer'&&c?.peerId===from&&data.signal?.type==='answer'){
      try{
        await c.pc.setRemoteDescription(new RTCSessionDescription(data.signal));
        if(callRef.current!==c)return;
        const queued=pendingIce.current.get(from)||[];
        pendingIce.current.delete(from);
        for(const ice of queued)await c.pc.addIceCandidate(new RTCIceCandidate(ice));
      }catch{if(callRef.current===c){endCall(false,'failed');Alert.alert('Lỗi cuộc gọi','Không thể thiết lập kết nối thoại/video.');}}
    }
  },[endCall,transmit]);
  const toggleMic=useCallback(()=>{
    const c=callRef.current;if(!c)return;
    c.muted=!c.muted;c.local?.getAudioTracks().forEach(t=>{t.enabled=!c.muted;});update();
  },[update]);
  const toggleCamera=useCallback(()=>{
    const c=callRef.current;if(!c||!c.video)return;
    c.cameraDisabled=!c.cameraDisabled;c.local?.getVideoTracks().forEach(t=>{t.enabled=!c.cameraDisabled;});update();
  },[update]);
  useEffect(()=>{
    const sub=AppState.addEventListener('change',state=>{if(state==='background')endCall(true,'background');});
    return()=>{sub.remove();endCall(false);};
  },[endCall]);
  return {incoming,view,startCall,onSignal,decline,accept,endCall,toggleMic,toggleCamera,history,clearHistory,historyLoading,historyError};
}

export function NativeCallOverlay({call}){
  const {incoming,view,decline,accept,endCall,toggleMic,toggleCamera}=call;
  const active=view||incoming;
  const [clock,setClock]=useState(Date.now());
  useEffect(()=>{
    if(!view?.connectedAt)return;
    setClock(Date.now());const timer=setInterval(()=>setClock(Date.now()),1000);
    return()=>clearInterval(timer);
  },[view?.connectedAt]);
  return <Modal visible={!!active} animationType="slide" presentationStyle="fullScreen"
    onRequestClose={()=>incoming?decline():endCall(true)}>
    <View style={styles.root}>
      <View style={styles.avatar}><Ionicons name={incoming?.video||view?.video?'videocam':'call'} size={40} color={COLORS.primary}/></View>
      <Text style={styles.title}>{active?.title||'Cuộc gọi mtunz'}</Text>
      <Text style={styles.subtitle}>{incoming?(incoming.video?'Cuộc gọi video đến':'Cuộc gọi thoại đến'):
        view?.status||'Đang kết nối…'}</Text>
      {!!view?.connectedAt&&<Text style={styles.duration}>{formatCallDuration(Math.max(0,Math.floor((clock-view.connectedAt)/1000)))}</Text>}
      {view?.video&&<View style={styles.videoArea}>
        {view.remote?.toURL&&<RTCView style={styles.remoteVideo} streamURL={view.remote.toURL()} objectFit="cover"/>}
        {view.local?.toURL&&<RTCView style={styles.localVideo} streamURL={view.local.toURL()} objectFit="cover" mirror/>}
      </View>}
      {!view?.video&&<View style={styles.flex}/>}
      <Text style={styles.network}>Cuộc gọi được truyền trực tiếp. Một số mạng cần cấu hình TURN để kết nối ổn định.</Text>
      {incoming?<View style={styles.actions}>
        <Pressable onPress={decline} accessibilityRole="button" accessibilityLabel="Từ chối cuộc gọi" style={[styles.action,{backgroundColor:COLORS.danger}]}>
          <Ionicons name="close" size={26} color="white"/><Text style={styles.actionText}>Từ chối</Text></Pressable>
        <Pressable onPress={accept} accessibilityRole="button" accessibilityLabel="Nghe máy" style={[styles.action,{backgroundColor:'#217c68'}]}>
          <Ionicons name="call" size={26} color="white"/><Text style={styles.actionText}>Nghe máy</Text></Pressable>
      </View>:<View style={styles.actions}>
        <Pressable onPress={toggleMic} accessibilityRole="button" accessibilityLabel={view?.muted?'Bật micro':'Tắt micro'} style={styles.action}>
          <Ionicons name={view?.muted?'mic-off':'mic'} size={26} color="white"/><Text style={styles.actionText}>{view?.muted?'Bật mic':'Tắt mic'}</Text></Pressable>
        {view?.video&&<Pressable onPress={toggleCamera} accessibilityRole="button" accessibilityLabel={view?.cameraDisabled?'Bật camera':'Tắt camera'} style={styles.action}>
          <Ionicons name={view?.cameraDisabled?'videocam-off':'videocam'} size={26} color="white"/><Text style={styles.actionText}>Camera</Text></Pressable>}
        <Pressable onPress={()=>endCall(true)} accessibilityRole="button" accessibilityLabel="Kết thúc cuộc gọi" style={[styles.action,{backgroundColor:COLORS.danger}]}>
          <Ionicons name="call" size={26} color="white"/><Text style={styles.actionText}>Kết thúc</Text></Pressable>
      </View>}
    </View>
  </Modal>;
}
export {formatCallDuration,callStatusLabel};
const styles=StyleSheet.create({
  root:{flex:1,backgroundColor:COLORS.bg,alignItems:'center',padding:20,paddingTop:80,paddingBottom:48,gap:16},
  avatar:{width:94,height:94,borderRadius:47,backgroundColor:COLORS.panel,alignItems:'center',justifyContent:'center'},
  title:{color:COLORS.text,fontSize:25,fontWeight:'800',textAlign:'center'},
  subtitle:{color:COLORS.primary,fontSize:15,textAlign:'center'},
  duration:{color:COLORS.text,fontSize:22,fontWeight:'700',fontVariant:['tabular-nums']},
  flex:{flex:1},
  videoArea:{flex:1,width:'100%',position:'relative',borderRadius:19,overflow:'hidden',backgroundColor:'#0c2135'},
  remoteVideo:{height:'100%',width:'100%'},
  localVideo:{position:'absolute',width:115,height:165,right:12,top:12,borderRadius:16},
  network:{fontSize:12,color:COLORS.muted,lineHeight:18,textAlign:'center'},
  actions:{width:'100%',flexDirection:'row',justifyContent:'center',gap:14},
  action:{flex:1,maxWidth:134,minHeight:80,borderRadius:18,backgroundColor:COLORS.panel,
    alignItems:'center',justifyContent:'center',gap:7,paddingHorizontal:10},
  actionText:{color:COLORS.text,fontSize:12,fontWeight:'700'},
});
