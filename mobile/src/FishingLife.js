import React,{useEffect,useRef,useState} from 'react';
import {View,Text,Pressable,ScrollView,StyleSheet,useWindowDimensions} from 'react-native';
import {api} from './client';
const COLORS=['#9ca3af','#84cc16','#22c55e','#06b6d4','#3b82f6','#a855f7','#f59e0b','#ef4444','#ec4899','#d946ef'];
const fmt=n=>Number(n).toLocaleString('vi-VN');
function Button({children,onPress,disabled=false,primary=false,selected=false}){return <Pressable accessibilityRole="button" accessibilityState={{disabled}} disabled={disabled} onPress={onPress} style={[s.btn,primary&&s.primary,selected&&s.selected,disabled&&{opacity:.4}]}><Text style={[s.btnText,(primary||selected)&&s.darkText]}>{children}</Text></Pressable>;}
export default function FishingLife({token,onExpired,onBack}){
 const {width,height,fontScale}=useWindowDimensions();const wide=width>=800&&fontScale<1.35,compact=width<380||height<640;
 const [data,setData]=useState(null),[busy,setBusy]=useState(false),[error,setError]=useState(''),[region,setRegion]=useState(0),[bait,setBait]=useState(0),[panel,setPanel]=useState('bag'),[now,setNow]=useState(Date.now());
 const pending=useRef(false),alive=useRef(true),offset=useRef(0),controller=useRef(null);
 async function load(action='state',body){
  if(pending.current||!alive.current)return;pending.current=true;setBusy(true);setError('');
  const abort=new AbortController();controller.current=abort;
  try{const d=await api('/api/fishing/'+action,{token,method:body===undefined?'GET':'POST',data:body,signal:abort.signal});
   if(!alive.current||abort.signal.aborted)return;offset.current=d.server_ms-Date.now();setNow(d.server_ms);setData(d);setRegion(r=>d.rod<d.catalog.maps[r].rod?0:r);}
  catch(e){if(alive.current&&!abort.signal.aborted){if(e.status===401)onExpired?.();else setError(e.message);}}
  finally{if(controller.current===abort){pending.current=false;if(alive.current)setBusy(false);}}
 }
 useEffect(()=>{alive.current=true;load();return()=>{alive.current=false;controller.current?.abort();pending.current=false;};},[token]);
 const cast=data?.cast;
 useEffect(()=>{if(!cast)return;const t=setInterval(()=>setNow(Date.now()+offset.current),100);return()=>clearInterval(t);},[cast?.id,cast?.step]);
 if(!data)return <View style={s.screen}><Text style={s.text}>{error||'Đang tải hồ câu…'}</Text><Button disabled={busy} onPress={()=>load()}>Thử lại</Button></View>;
 const c=data.catalog,ready=!!cast&&now>=cast.action_at&&now<=cast.deadline;
 const ratio=ready?Math.max(0,(cast.deadline-now)/(cast.deadline-cast.action_at)):0;
 const act=a=>load(a,{cast_id:cast.id,step:cast.step});
 return <View style={s.screen}><ScrollView contentContainerStyle={s.content} keyboardShouldPersistTaps="handled">
  <Button onPress={onBack}>‹ Quay lại</Button><View style={[s.columns,wide&&s.wide]}>
  <View style={[s.hero,wide&&s.lakeColumn]}><Text style={s.kicker}>MTUNZ · FISHING LIFE</Text><Text style={s.title}>Một góc bình yên</Text><Text style={s.text}>🪙 {fmt(data.gold)} vàng · Cấp {fmt(data.level)}</Text>
  <View style={[s.landscape,{height:cast?(compact?76:112):wide?220:compact?100:142}]}><Text style={s.sun}>☀</Text><View style={s.hill}/><View style={s.water}><Text style={s.wave}>～　～　～</Text><Text style={s.rod}>🎣</Text><Text style={s.wave}>～　～　～</Text></View></View>
  {!cast&&<><Text style={s.text}>Địa điểm</Text><View style={s.wrap}>{c.maps.map((m,i)=><Button key={i} selected={region===i} disabled={busy||data.rod<m.rod} onPress={()=>setRegion(i)}>{region===i?'✓ ':''}{m.name}{data.rod<m.rod?' 🔒':''}</Button>)}</View>
  <Text style={s.text}>Mồi mỗi lượt</Text><View style={s.wrap}>{c.baits.map((m,i)=><Button key={i} selected={bait===i} disabled={busy} onPress={()=>setBait(i)}>{bait===i?'✓ ':''}{m.name} · {m.price}</Button>)}</View></>}
  <Text accessibilityLiveRegion="polite" style={s.text}>{error||data.message||'Thả cần để bắt đầu.'}</Text>
  {cast?<><Text style={s.signal}>{now>cast.deadline?'Cá có thể đã thoát':ready?(cast.step===0?'CÁ CẮN!':'KÉO NGAY · '+cast.step+'/'+cast.pulls):'Chờ tín hiệu · '+Math.max(0,(cast.action_at-now)/1000).toFixed(1)+'s'}</Text><View style={s.meter}><View style={[s.fill,{width:(ratio*100)+'%'}]}/></View><Button primary disabled={busy||!ready} onPress={()=>act('tap')}>{cast.step===0?'Giật cần':'Kéo cá'}</Button><Button disabled={busy} onPress={()=>act('cancel')}>Thu cần</Button></>:<Button primary disabled={busy} onPress={()=>load('cast',{region,bait})}>Thả cần</Button>}
  </View>
  <View style={[s.side,wide&&s.bagColumn]}><View style={s.wrap}><Button selected={panel==='bag'} onPress={()=>setPanel('bag')}>Túi {data.bag.length}/{data.bag_limit}</Button><Button selected={panel==='shop'} onPress={()=>setPanel('shop')}>Cửa hàng</Button><Button selected={panel==='book'} onPress={()=>setPanel('book')}>Sổ cá {data.book.length}/30</Button><Button disabled={busy} onPress={()=>load()}>Làm mới</Button></View>
  {panel==='bag'&&(data.bag.length?data.bag.map(f=><View key={f.id} style={s.row}><View style={s.copy}><Text style={[s.name,{color:COLORS[f.tier]}]}>🐟 {f.name}</Text><Text style={s.text}>{c.tiers[f.tier].name} · {c.mutations[f.mutation].name} · {fmt(f.grams)} g</Text></View><Button disabled={busy} onPress={()=>load('sell',{fish_id:f.id})}>Bán {fmt(f.value)}</Button></View>):<Text style={s.text}>Túi cá còn trống.</Text>)}
  {panel==='shop'&&c.rods.map((r,i)=><View key={i} style={s.row}><View style={s.copy}><Text style={s.name}>{r.name}</Text><Text style={s.text}>May mắn ×{r.luck} · {fmt(r.price)} vàng</Text></View><Button disabled={busy||!!cast||i===data.rod||i>data.owned_rod+1||(i>data.owned_rod&&data.gold<r.price)} onPress={()=>load('rod',{rod:i})}>{i===data.rod?'Đang dùng':i<=data.owned_rod?'Trang bị':'Mua'}</Button></View>)}
  {panel==='book'&&c.maps.map((m,i)=><View key={i} style={s.group}><Text style={s.name}>{m.name}</Text>{m.fish.map((n,j)=>{const f=data.book.find(x=>x.species===i*10+j);return <View key={j} style={s.row}><Text style={[s.copy,s.text,{color:COLORS[j]}]}>{f?n:'???'} · {c.tiers[j].name}</Text><Text style={s.text}>{f?fmt(f.record_grams)+' g':'Chưa khám phá'}</Text></View>;})}</View>)}
 </View></View></ScrollView></View>;
}
const s=StyleSheet.create({screen:{flex:1,backgroundColor:'#102e35'},content:{padding:12,gap:12,maxWidth:1320,width:'100%',alignSelf:'center'},columns:{gap:12},wide:{flexDirection:'row',alignItems:'flex-start'},lakeColumn:{flex:1.2,minWidth:0},bagColumn:{flex:1,minWidth:0},side:{gap:10},hero:{padding:14,borderRadius:18,backgroundColor:'#183e4a',gap:10},kicker:{color:'#a9d3c7',letterSpacing:1.8,fontSize:11,fontWeight:'700'},title:{color:'#f4fbf6',fontSize:24,fontWeight:'700'},text:{color:'#d1e5df',fontSize:13},landscape:{height:132,backgroundColor:'#a2b6ae',borderRadius:14,overflow:'hidden',justifyContent:'flex-end'},sun:{position:'absolute',top:6,right:35,fontSize:32,color:'#f9dba5'},hill:{position:'absolute',width:250,height:110,borderRadius:110,backgroundColor:'#66948b',top:42,left:-10},water:{height:68,backgroundColor:'#367785',justifyContent:'space-around'},wave:{color:'#9bd4cf',textAlign:'center',fontSize:19},rod:{position:'absolute',left:32,top:-16,fontSize:48},wrap:{flexDirection:'row',flexWrap:'wrap',gap:7},btn:{backgroundColor:'#236c65',borderColor:'#4a9d8a',borderWidth:1,minHeight:44,minWidth:44,maxWidth:'100%',paddingHorizontal:12,paddingVertical:10,borderRadius:10,alignItems:'center',justifyContent:'center'},btnText:{color:'#f7fff7',fontWeight:'600',fontSize:13,textAlign:'center'},primary:{minHeight:56,backgroundColor:'#c5e9c8'},selected:{backgroundColor:'#c5e9c8'},darkText:{color:'#163f36'},signal:{color:'#c5e9c8',fontWeight:'700'},meter:{height:8,backgroundColor:'#345a60',borderRadius:8,overflow:'hidden'},fill:{height:8,backgroundColor:'#8de3b3'},row:{flexDirection:'row',flexWrap:'wrap',alignItems:'center',gap:10,padding:12,borderRadius:12,backgroundColor:'#193b41'},copy:{flexGrow:1,flexShrink:1,flexBasis:130,minWidth:0},name:{color:'#f4fbf6',fontWeight:'700',fontSize:15},group:{gap:6}});
