import React,{useEffect,useRef,useState} from 'react';
import {View,Text,Pressable,ScrollView,StyleSheet,AppState,useWindowDimensions} from 'react-native';
const rarity={common:'Thường',uncommon:'Ít gặp',rare:'Hiếm',epic:'Sử thi',legendary:'Huyền thoại'};
export const fishingPhase=(data,now)=>!data?.cast||now>data.cast.expires_at?'idle':now<data.cast.bite_at?'wait':'bite';
function Button({title,onPress,disabled=false,small=false}){return <Pressable accessibilityRole="button" accessibilityState={{disabled}} disabled={disabled} onPress={onPress} style={[s.button,small&&s.small,disabled&&s.disabled]}><Text style={s.buttonText}>{title}</Text></Pressable>;}
export default function FishingScreen({invoke,onBack}){
 const [data,setData]=useState(null),[busy,setBusy]=useState(false),[error,setError]=useState(''),[result,setResult]=useState(''),[section,setSection]=useState('bag'),[rank,setRank]=useState([]),[tick,setTick]=useState(Date.now());
 const offset=useRef(0),inFlight=useRef(false),mounted=useRef(false);
 const {width}=useWindowDimensions();
 async function request(action,body){
  if(inFlight.current||!mounted.current)return;
  inFlight.current=true;setBusy(true);setError('');
  try{
   const path='/api/fishing'+(action==='read'?'':'/'+action);
   const d=await invoke(path,action==='read'||action==='ranking'?'GET':'POST',body||{});
   if(!mounted.current)return;
   if(action==='ranking')setRank(d.ranking);
   else {offset.current=d.server_now-Date.now();setTick(Date.now());setData(d);
    if(action==='cast')setResult('');
    if(d.result){const f=d.fish.find(x=>x.id===d.result.fish_id);setResult(d.result.caught?'🎉 Bạn đã câu được '+f.name+'!':d.result.reason==='early'?'Giật cần quá sớm!':'Cá đã thoát mất!');}
    if(action==='sell')setResult('Đã bán cá!');if(action==='upgrade')setResult('Đã nâng cấp cần câu!');if(action==='daily')setResult('Đã nhận 100 xu!');
   }
  }catch(e){if(mounted.current)setError(e.message||'Không thể kết nối.');}
  finally{inFlight.current=false;if(mounted.current)setBusy(false);}
 }
 useEffect(()=>{mounted.current=true;void request('read');let timer=null;
  const start=()=>{if(!timer)timer=setInterval(()=>setTick(Date.now()),100);},stop=()=>{clearInterval(timer);timer=null;};
  if(AppState.currentState==='active')start();
  const sub=AppState.addEventListener('change',state=>{if(state==='active'){start();void request('read');}else stop();});
  return()=>{mounted.current=false;stop();sub.remove();};
 },[]);
 const phase=fishingPhase(data,tick+offset.current),rod=data?.rods[data.level-1],next=data?.rods[data.level];
 const play=()=>{if(phase==='idle')void request('cast');else if(phase==='bite')void request('reel',{token:data.cast.token});};
 return <ScrollView style={s.root} contentContainerStyle={s.content} keyboardShouldPersistTaps="handled">
  <View style={s.top}><Text style={s.eyebrow}>MTUNZ GAMING</Text><Button title="Quay lại" small onPress={onBack}/></View>
  <Text style={s.title}>Hồ Tĩnh Lặng</Text><Text style={s.muted}>Xu ảo · Không quy đổi tiền thật</Text>
  {!!error&&<Text accessibilityRole="alert" style={s.error}>{error}</Text>}
  {!data?<Button title={busy?'Đang kết nối…':'Thử lại'} disabled={busy} onPress={()=>request('read')}/>:<>
  <View style={s.top}><Text style={s.wallet}>🪙 {data.coins} xu</Text><Text style={s.muted}>Cần cấp {data.level}/10</Text></View>
  <View style={[s.scene,{height:width>600?290:220}]}><View style={s.moon}/><View style={s.hill}/><View style={s.water}/><View style={s.dock}/><View style={s.line}/><View style={[s.bobber,phase==='bite'&&s.bite]}/><Text style={s.sceneLabel}>HỒ TĨNH LẶNG</Text></View>
  <Text style={s.center}>{phase==='bite'?'Cá cắn câu rồi!':phase==='wait'?'Chờ phao phát sáng…':'Thả câu để bắt đầu'}</Text>
  <Button title={phase==='bite'?'⚡ GIẬT CẦN!':phase==='wait'?'Đang chờ…':'🎣 Thả câu'} disabled={busy||phase==='wait'} onPress={play}/>
  <Text style={s.center}>{result||'Mỗi lần câu là một bất ngờ.'}</Text>
  <View style={s.panel}><Text style={s.heading}>{rod.name} · Cấp {data.level}/10</Text><Text style={s.muted}>{data.caught} cá · {Object.keys(data.collection).length}/{data.fish.length} loài</Text>
    {next?<Button title={'Nâng cấp · '+next.price+' xu'} disabled={busy||data.coins<next.price||phase!=='idle'} onPress={()=>request('upgrade',{level:next.level})}/>:<Text style={s.muted}>Đã đạt cấp tối đa!</Text>}</View>
  <View style={s.panel}><Text style={s.heading}>Nhiệm vụ hôm nay</Text><Text style={s.muted}>Câu {Math.min(data.daily.caught,data.daily.target)}/{data.daily.target} cá</Text><View style={s.progress}><View style={[s.fill,{width:Math.min(100,data.daily.caught/data.daily.target*100)+'%'}]}/></View><Button title={data.daily.claimed?'Đã nhận':'Nhận 100 xu'} disabled={busy||data.daily.claimed||data.daily.caught<data.daily.target} onPress={()=>request('daily')}/></View>
  <View style={s.panel}><View style={s.tabs}>{[['bag','Giỏ cá'],['collection','Bộ sưu tập'],['rank','Xếp hạng']].map(([key,label])=><Pressable key={key} accessibilityRole="tab" accessibilityState={{selected:section===key}} style={[s.tab,section===key&&s.active]} onPress={()=>{setSection(key);if(key==='rank')void request('ranking');}}><Text style={s.tabText}>{label}</Text></Pressable>)}</View>
  {section==='rank'?<>{rank.map(r=><View key={r.rank} style={s.item}><Text style={s.label}>#{r.rank} {r.name}</Text><Text style={s.muted}>{r.caught} cá · Cấp {r.level}</Text></View>)}<Button title="Làm mới" small disabled={busy} onPress={()=>request('ranking')}/></>:<>
   {data.fish.filter(f=>section==='collection'||data.bag[f.id]>0).map(f=><View style={s.item} key={f.id}><Text style={s.emoji}>{section==='bag'||data.collection[f.id]?f.emoji:'?'}</Text><View style={{flex:1}}><Text style={s.label}>{f.name}</Text><Text style={s.muted}>{section==='bag'?data.bag[f.id]+' con · '+f.value+' xu/con':rarity[f.rarity]+' · Cần cấp '+f.unlock+' · '+(data.collection[f.id]||0)}</Text></View>{section==='bag'&&<Button title={'Bán '+Math.min(data.bag[f.id],1000)} small disabled={busy} onPress={()=>request('sell',{fish_id:f.id,quantity:Math.min(data.bag[f.id],1000)})}/>}</View>)}
   {section==='bag'&&!Object.keys(data.bag).length&&<Text style={s.muted}>Giỏ đang trống.</Text>}
  </>}</View></>}
 </ScrollView>;
}
const s=StyleSheet.create({root:{flex:1,backgroundColor:'#102c38'},content:{padding:16,gap:12,paddingBottom:32},top:{flexDirection:'row',alignItems:'center',justifyContent:'space-between',gap:8},eyebrow:{color:'#91b9af',fontWeight:'700',letterSpacing:2,fontSize:12},title:{fontSize:30,color:'#eff8e9',fontWeight:'800'},muted:{color:'#a5c4bd',fontSize:13},wallet:{color:'#ffe6a2',fontWeight:'800',fontSize:20},scene:{backgroundColor:'#47777c',borderRadius:20,overflow:'hidden',position:'relative'},moon:{position:'absolute',top:20,right:34,width:54,height:54,borderRadius:27,backgroundColor:'#fff4c7'},hill:{position:'absolute',left:-25,right:-20,top:72,height:135,backgroundColor:'#26505d',borderTopLeftRadius:100,borderTopRightRadius:70,transform:[{rotate:'-5deg'}]},water:{position:'absolute',left:0,right:0,bottom:0,height:'43%',backgroundColor:'#1c4f63',borderTopWidth:2,borderTopColor:'#70a6a5'},dock:{position:'absolute',bottom:0,left:0,width:'34%',height:40,backgroundColor:'#635440',borderTopColor:'#ad8a61',borderTopWidth:4},line:{position:'absolute',left:'26%',top:'43%',width:'43%',height:'30%',borderTopWidth:1,borderRightWidth:1,borderTopRightRadius:90,borderColor:'#dfd5a7'},bobber:{position:'absolute',left:'66%',top:'72%',width:15,height:15,borderRadius:8,backgroundColor:'#ee8060',borderWidth:3,borderColor:'#ffdf9f'},bite:{backgroundColor:'#fff7ae',borderColor:'#fff',borderWidth:4,transform:[{scale:1.55}]},sceneLabel:{position:'absolute',top:12,left:12,color:'#e9f7ef',fontSize:11,letterSpacing:1},center:{textAlign:'center',color:'#dbeedb',fontSize:14},panel:{borderWidth:1,borderColor:'#466966',backgroundColor:'#183944',borderRadius:18,padding:14,gap:10},heading:{fontSize:18,fontWeight:'800',color:'#e5f4eb'},button:{padding:14,borderRadius:12,backgroundColor:'#aee4c3',alignItems:'center',justifyContent:'center',minHeight:48},small:{minHeight:38,padding:9},buttonText:{color:'#12352d',fontWeight:'800',textAlign:'center'},disabled:{opacity:.45},error:{color:'#ffd5bc',backgroundColor:'#603d3c',padding:10,borderRadius:10},progress:{height:8,borderRadius:6,backgroundColor:'#2f5458',overflow:'hidden'},fill:{height:8,backgroundColor:'#b3e8a9'},tabs:{flexDirection:'row',gap:5},tab:{flex:1,backgroundColor:'#2b5157',padding:9,borderRadius:9},active:{backgroundColor:'#466f62'},tabText:{textAlign:'center',color:'#e7f5e8',fontSize:12,fontWeight:'700'},item:{flexDirection:'row',alignItems:'center',gap:9,justifyContent:'space-between',paddingVertical:9,borderBottomWidth:1,borderBottomColor:'#36535b'},emoji:{fontSize:24},label:{fontWeight:'700',color:'#e8f4e9'}});
