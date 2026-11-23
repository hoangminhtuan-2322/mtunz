import React,{useEffect,useRef,useState} from 'react';
import {ActivityIndicator,Image,Linking,Pressable,StyleSheet,Text,View} from 'react-native';
import {Image as ExpoImage} from 'expo-image';
import Ionicons from '@expo/vector-icons/Ionicons';
import {createVideoPlayer,VideoView,useVideoPlayer} from 'expo-video';
import {api} from './client';
import {attachmentSource,downloadSharedAttachment,saveSharedFile} from './media';

const C={bg:'#0d1c30',panel:'#162b45',border:'#304e6d',text:'#f4f8ff',
  secondary:'#a7bfd9',accent:'#71bdff'};
export const SHARED_TABS=[
  ['images','Ảnh','images-outline'],['videos','Video','videocam-outline'],
  ['files','Tệp','document-text-outline'],['links','Liên kết','link-outline'],
];
const formatTime=value=>value?new Date(Number(value)*1000).toLocaleString('vi-VN',{day:'2-digit',
  month:'2-digit',hour:'2-digit',minute:'2-digit'}):'';
const formatSize=size=>size>=1048576?(size/1048576).toFixed(1)+' MB':
  size>=1024?Math.ceil(size/1024)+' KB':Number(size||0)+' B';
const sharedFile=row=>({id:row.attachment_id,name:row.name,mime:row.mime,size:row.size});
const isSafeLink=url=>typeof url==='string'&&/^https?:\/\/[^\s]+$/i.test(url);
const fileSymbol=mime=>mime?.startsWith('audio/')?'♫':mime==='application/pdf'?'PDF':
  mime?.includes('wordprocessingml')?'DOC':mime?.includes('spreadsheetml')?'XLS':'▤';

function Tap({children,onPress,selected=false,disabled=false,style}){
  return <Pressable accessibilityRole="button" onPress={onPress} disabled={disabled}
    style={({pressed})=>[styles.tap,selected&&styles.selected,style,pressed&&{opacity:.78},
      disabled&&{opacity:.45}]}>{children}</Pressable>;
}

// Private video preview never exposes the bearer token in a public URL.
// A poster is generated from the actual shared video; errors fall back to a play icon.
function VideoPoster({row,token}){
  const [thumbnail,setThumbnail]=useState(null);
  useEffect(()=>{
    let cancelled=false,player=null,released=false;
    const release=()=>{if(player&&!released){released=true;player.release();}};
    (async()=>{
      try{
        const local=await downloadSharedAttachment(sharedFile(row),token);
        if(cancelled)return;
        player=createVideoPlayer({uri:local.uri});
        const images=await player.generateThumbnailsAsync([0.2],{maxWidth:320,maxHeight:240});
        if(!cancelled&&images?.[0])setThumbnail(images[0]);
      }catch{
        // The player will still open when the codec does not support thumbnails.
      }finally{release();}
    })();
    return()=>{cancelled=true;release();};
  },[row.attachment_id,token]);
  return <View style={styles.poster}>
    {thumbnail?<ExpoImage source={thumbnail} contentFit="cover" style={styles.posterImage}/>:
      <Text style={styles.posterFallback}>VIDEO</Text>}
    <View style={styles.play}><Text style={styles.playText}>▶</Text></View>
  </View>;
}
function NativeVideo({uri}){
  const player=useVideoPlayer(uri,p=>{p.loop=false;p.play();});
  return <VideoView player={player} style={styles.player} nativeControls allowsFullscreen
    contentFit="contain"/>;
}

export default function SharedConversationGallery({room,token,onError}){
  const [kind,setKind]=useState('images'),[rows,setRows]=useState([]),
    [cursor,setCursor]=useState(null),[busy,setBusy]=useState(false),[message,setMessage]=useState(''),
    [preview,setPreview]=useState(null),[videoUri,setVideoUri]=useState(null),
    [opening,setOpening]=useState(false);
  const requestRef=useRef(0);
  const roomId=room?.id,scope=room?.scope;
  async function load(before=null){
    if(!scope||!roomId)return;
    const ticket=++requestRef.current;
    setBusy(true);setMessage('');
    try{
      const path='/api/chats/'+scope+'/'+roomId+'/shared?kind='+kind+
        (before?'&before='+encodeURIComponent(before):'');
      const result=await api(path,{token});
      if(ticket!==requestRef.current)return;
      const list=Array.isArray(result.items)?result.items:[];
      setRows(old=>before?[...old,...list.filter(x=>!old.some(item=>item.id===x.id))]:list);
      setCursor(result.next_before||null);
    }catch(error){
      if(ticket===requestRef.current)setMessage(error.message||'Không tải được nội dung đã chia sẻ.');
    }finally{if(ticket===requestRef.current)setBusy(false);}
  }
  useEffect(()=>{
    requestRef.current++;
    setRows([]);setCursor(null);setPreview(null);setVideoUri(null);
    load();
    return()=>{requestRef.current++;};
  },[kind,scope,roomId,token]);
  async function open(row){
    if(kind==='links'){
      const first=row.links?.find(link=>isSafeLink(link.url));
      if(!first)return;
      try{await Linking.openURL(first.url);}catch(error){onError(error);}
      return;
    }
    const file=sharedFile(row);
    if(kind==='files'){
      try{await saveSharedFile(file,token);}catch(error){onError(error);}
      return;
    }
    setPreview(file);setVideoUri(null);
    if(kind==='videos'){
      setOpening(true);
      try{
        const local=await downloadSharedAttachment(file,token);
        setVideoUri(local.uri);
      }catch(error){onError(error);setPreview(null);}
      finally{setOpening(false);}
    }
  }
  return <View style={styles.section}>
    <View style={styles.heading}>
      <View style={{flex:1,minWidth:0}}>
        <Text style={styles.title}>Nội dung đã chia sẻ</Text>
        <Text style={styles.subtitle}>Xem trực tiếp nội dung trong cuộc trò chuyện</Text>
      </View>
    </View>
    <View style={styles.tabs}>{SHARED_TABS.map(([key,name,glyph])=><Tap key={key}
      selected={kind===key} onPress={()=>{setKind(key);setPreview(null);setVideoUri(null);}}
      style={styles.tab}><View style={{flexDirection:'row',alignItems:'center',gap:6}}>
          <Ionicons name={glyph} size={16} color={kind===key?'#071729':C.text}/>
          <Text style={[styles.tabText,kind===key&&styles.activeText]}>{name}</Text>
        </View></Tap>)}</View>
    {preview?<View style={styles.preview}>
      <View style={styles.previewBar}>
        <Text numberOfLines={1} style={[styles.fileName,{flex:1}]}>
          {preview.mime?.startsWith('image/')?'Ảnh đã chia sẻ':preview.name}
        </Text>
        <Tap onPress={()=>{setPreview(null);setVideoUri(null);}}>
          <Text style={styles.actionText}>✕ Đóng</Text>
        </Tap>
      </View>
      {preview.mime?.startsWith('image/')?
        <Image source={attachmentSource(preview,token)} resizeMode="contain"
          style={styles.fullImage}/>:
        opening?<View style={styles.loading}><ActivityIndicator color={C.accent}/>
          <Text style={styles.subtitle}>Đang mở video…</Text></View>:
          videoUri?<NativeVideo key={videoUri} uri={videoUri}/>:
          <Text style={styles.subtitle}>Không thể phát video này.</Text>}
      <Tap onPress={()=>saveSharedFile(preview,token).catch(onError)} style={styles.save}>
        <Ionicons name="download-outline" size={18} color={C.text}/>
        <Text style={styles.actionText}>{preview.mime?.startsWith('image/')?'Lưu / chia sẻ ảnh':'Lưu / chia sẻ tệp'}</Text>
      </Tap>
    </View>:null}
    {busy&&!rows.length?<View style={styles.loading}>
      <ActivityIndicator color={C.accent}/>
      <Text style={styles.subtitle}>Đang tải nội dung…</Text>
    </View>:null}
    {!!message?<View style={styles.notice}><Text style={styles.warning}>{message}</Text>
      <Tap onPress={()=>load(null)}><Text style={styles.actionText}>Thử lại</Text></Tap></View>:null}
    {!busy&&!message&&!rows.length?<View style={styles.empty}>
      <Ionicons name={SHARED_TABS.find(t=>t[0]===kind)?.[2]||'albums-outline'}
         size={33} color={C.accent}/>
      <Text style={styles.emptyText}>{kind==='images'?'Chưa có ảnh được chia sẻ':
        kind==='videos'?'Chưa có video được chia sẻ':
        kind==='files'?'Chưa có tệp được chia sẻ':'Chưa có liên kết nào'}</Text>
    </View>:null}
    {kind==='images'?<View style={styles.grid}>{rows.map(row=><Pressable key={row.id}
      accessibilityRole="button" accessibilityLabel="Xem ảnh đã chia sẻ"
      onPress={()=>open(row)} style={styles.tile}>
      <Image source={attachmentSource(sharedFile(row),token)} resizeMode="cover"
        style={styles.tileImage}/>
      <Text style={styles.tileMeta} numberOfLines={1}>{formatTime(row.created_at)}</Text>
    </Pressable>)}</View>:
    kind==='videos'?<View style={styles.videoGrid}>{rows.map(row=><Pressable key={row.id}
      accessibilityRole="button" onPress={()=>open(row)} style={styles.videoCard}>
      <VideoPoster row={row} token={token}/>
      <Text numberOfLines={1} style={styles.fileName}>{row.name||'Video'}</Text>
      <Text style={styles.subtitle}>{formatTime(row.created_at)} · {formatSize(row.size)}</Text>
    </Pressable>)}</View>:
    kind==='files'?<View style={styles.list}>{rows.map(row=><Pressable key={row.id}
      accessibilityRole="button" onPress={()=>open(row)} style={styles.fileCard}>
      <View style={styles.iconBox}><Text style={styles.fileGlyph}>{fileSymbol(row.mime)}</Text></View>
      <View style={{flex:1,minWidth:0,gap:4}}>
        <Text numberOfLines={2} style={styles.fileName}>{row.name||'Tệp đính kèm'}</Text>
        <Text style={styles.subtitle}>{formatSize(row.size)} · {formatTime(row.created_at)}</Text>
      </View><Text style={styles.download}>↓</Text>
    </Pressable>)}</View>:
    <View style={styles.list}>{rows.flatMap(row=>(row.links||[])
      .filter(link=>isSafeLink(link.url)).map((link,i)=><Pressable key={row.id+'-'+i}
        accessibilityRole="link" onPress={()=>Linking.openURL(link.url).catch(onError)}
        style={styles.fileCard}>
        <View style={styles.iconBox}><Text style={styles.fileGlyph}>↗</Text></View>
        <View style={{flex:1,minWidth:0,gap:3}}>
          <Text numberOfLines={1} style={styles.fileName}>{link.host||'Liên kết'}</Text>
          <Text numberOfLines={2} style={styles.link}>{link.url}</Text>
          <Text style={styles.subtitle}>{formatTime(row.created_at)}</Text>
        </View>
      </Pressable>))}</View>}
    {cursor?<Tap disabled={busy} onPress={()=>load(cursor)} style={styles.more}>
      <Text style={styles.actionText}>{busy?'Đang tải…':'Xem thêm nội dung cũ'}</Text>
    </Tap>:null}
  </View>;
}
const styles=StyleSheet.create({
  section:{backgroundColor:C.bg,borderRadius:20,padding:14,borderWidth:1,
    borderColor:C.border,gap:15,minWidth:0},
  heading:{flexDirection:'row',alignItems:'center',gap:12},
  title:{color:C.text,fontSize:19,fontWeight:'900'},
  subtitle:{color:C.secondary,fontSize:12,lineHeight:18,flexShrink:1},
  tabs:{flexDirection:'row',flexWrap:'wrap',gap:7},
  tap:{paddingHorizontal:11,paddingVertical:10,borderRadius:12,minHeight:40,
    backgroundColor:'#223954',justifyContent:'center',borderWidth:1,borderColor:'#34516f'},
  selected:{backgroundColor:C.accent,borderColor:C.accent},
  tab:{flexGrow:1,alignItems:'center'},
  tabText:{color:C.text,fontSize:12,fontWeight:'800'},
  activeText:{color:'#071729'},
  grid:{flexDirection:'row',flexWrap:'wrap',gap:'2%'},
  tile:{width:'32%',aspectRatio:1,borderRadius:13,backgroundColor:C.panel,
    overflow:'hidden',marginBottom:7},
  tileImage:{width:'100%',height:'100%'},
  tileMeta:{position:'absolute',bottom:0,left:0,right:0,color:'#fff',
    fontSize:10,paddingHorizontal:5,paddingVertical:5,backgroundColor:'#051124aa'},
  videoGrid:{flexDirection:'row',flexWrap:'wrap',justifyContent:'space-between',gap:10},
  videoCard:{width:'48%',backgroundColor:C.panel,borderRadius:15,padding:9,gap:6,
    borderColor:C.border,borderWidth:1,minWidth:0},
  poster:{width:'100%',aspectRatio:4/3,borderRadius:11,overflow:'hidden',
    backgroundColor:'#213a55',justifyContent:'center',alignItems:'center'},
  posterImage:{width:'100%',height:'100%'},
  posterFallback:{color:'#9bb8d8',fontWeight:'900',letterSpacing:2},
  play:{position:'absolute',width:45,height:45,backgroundColor:'#051629cc',
    borderRadius:24,justifyContent:'center',alignItems:'center'},
  playText:{color:'#fff',fontSize:18,marginLeft:3},
  list:{gap:9},fileCard:{borderRadius:14,borderWidth:1,borderColor:C.border,
    backgroundColor:C.panel,padding:12,flexDirection:'row',alignItems:'center',gap:12},
  fileName:{color:C.text,fontSize:13,fontWeight:'800',flexShrink:1},
  iconBox:{width:47,height:47,backgroundColor:'#254762',borderRadius:13,
    alignItems:'center',justifyContent:'center'},
  fileGlyph:{fontSize:17,color:C.accent,fontWeight:'900'},
  download:{color:C.accent,fontWeight:'900',fontSize:20},
  link:{fontSize:12,color:'#8fc5f5',lineHeight:18,flexShrink:1},
  more:{alignItems:'center',minHeight:45},
  actionText:{color:C.accent,fontSize:13,fontWeight:'800'},
  empty:{alignItems:'center',paddingVertical:31,gap:6},
  emptyGlyph:{fontSize:32,color:'#84b6e4'},emptyText:{color:C.secondary,fontSize:13},
  loading:{alignItems:'center',paddingVertical:30,gap:10},
  notice:{padding:12,backgroundColor:'#3b2832',borderRadius:12,gap:8},
  warning:{color:'#ffc0c0',fontSize:13},
  preview:{backgroundColor:'#071222',borderRadius:16,borderWidth:1,borderColor:C.border,
    padding:10,gap:12},previewBar:{flexDirection:'row',alignItems:'center',gap:8},
  fullImage:{width:'100%',height:320,backgroundColor:'#080e18',borderRadius:12},
  player:{width:'100%',aspectRatio:16/9,backgroundColor:'#000',borderRadius:12},
  save:{alignItems:'center'},
});
