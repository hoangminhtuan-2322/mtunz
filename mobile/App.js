import React,{useCallback,useEffect,useState} from 'react';
import {ActivityIndicator,KeyboardAvoidingView,Platform,Pressable,SafeAreaView,
  ScrollView,StatusBar,StyleSheet,Text,TextInput,View} from 'react-native';
import {api,API_ORIGIN,clearSession,readSession,saveSession} from './src/client';
import Messenger from './src/Messenger';

const C={bg:'#071222',card:'#15253b',text:'#f5f7ff',muted:'#a1b2cd',accent:'#69b4ff',border:'#293c58'};
function Input({value,onChangeText,placeholder,secret=false,number=false}) {
  return <TextInput value={value} onChangeText={onChangeText} placeholder={placeholder}
    placeholderTextColor={C.muted} secureTextEntry={secret} autoCapitalize="none"
    autoCorrect={false} keyboardType={number?'number-pad':'default'} style={styles.input}/>;
}
function Button({children,onPress,disabled=false,quiet=false}) {
  return <Pressable onPress={onPress} disabled={disabled} style={[styles.button,quiet&&styles.quiet,disabled&&{opacity:.45}]}>
    <Text style={[styles.buttonText,quiet&&{color:C.text}]}>{children}</Text></Pressable>;
}
export default function App() {
  const [ready,setReady]=useState(false),[token,setToken]=useState(null),[user,setUser]=useState(null);
  const [username,setUsername]=useState(''),[password,setPassword]=useState(''),[pin,setPin]=useState('');
  const [challenge,setChallenge]=useState(null),[newName,setNewName]=useState('');
  const [error,setError]=useState(''),[busy,setBusy]=useState(false);

  const clear=useCallback(async()=>{
    await clearSession().catch(()=>{});
    setToken(null);setUser(null);setChallenge(null);setPassword('');setPin('');
  },[]);

  const expired=useCallback(async()=>{
    await clear();setError('Phiên đã hết hạn hoặc đã bị thu hồi. Vui lòng đăng nhập lại.');
  },[clear]);

  useEffect(()=>{
    let mounted=true;
    (async()=>{
      try{
        const restored=await readSession();
        if(!restored||!mounted)return;
        const data=await api('/api/me',{token:restored});
        if(!mounted)return;
        if(data.user&&data.user.deletion_purge_at){
          await clear();setError('Tài khoản đang chờ xóa. Hãy vào website để xử lý.');return;
        }
        if(!data.user){await clear();return;}
        setToken(restored);setUser(data.user);
      }catch(e){
        if(mounted){
          if(e.status===401)await clear();
          else setError(e.message||'Không thể kiểm tra phiên. Hãy thử lại khi có mạng.');
        }
      }finally{if(mounted)setReady(true);}
    })();
    return()=>{mounted=false;};
  },[clear]);

  async function signIn(){
    if(!username.trim()||!password){setError('Hãy nhập tài khoản và mật khẩu.');return;}
    setBusy(true);setError('');
    try{
      const result=await api('/api/mobile/auth/password',{method:'POST',data:{
        username:username.trim(),password}});
      setChallenge(result.challenge);setPassword('');
    }catch(e){setError(e.message);}
    finally{setBusy(false);}
  }
  async function verifyPin(){
    if(!challenge||!pin){setError('Nhập mã PIN của tài khoản.');return;}
    setBusy(true);setError('');
    try{
      const result=await api('/api/mobile/auth/pin',{method:'POST',data:{challenge,pin}});
      const session=result.access_token;
      const check=await api('/api/me',{token:session});
      if(!check.user||check.user.deletion_purge_at)throw Error('Tài khoản không sẵn sàng cho ứng dụng.');
      await saveSession(session);
      setToken(session);setUser(check.user);setChallenge(null);setPin('');
    }catch(e){setError(e.message);}
    finally{setBusy(false);}
  }
  async function finishOnboarding(){
    setBusy(true);setError('');
    try{
      await api('/api/me/display-name',{token,method:'POST',data:{display_name:newName.trim()}});
      const response=await api('/api/me',{token});setUser(response.user);
    }catch(e){setError(e.message);}
    finally{setBusy(false);}
  }
  const logout=useCallback(async()=>{
    try{if(token)await api('/api/auth/logout',{token,method:'POST'});}catch{}
    await clear();setError('');
  },[token,clear]);
  const refreshProfile=useCallback(async()=>{
    try{const data=await api('/api/me',{token});if(data.user)setUser(data.user);}
    catch(e){if(e.status===401)await expired();}
  },[token,expired]);

  if(!ready)return <SafeAreaView style={styles.root}><StatusBar barStyle="light-content"/>
    <View style={styles.center}><ActivityIndicator color={C.accent}/>
      <Text style={styles.muted}>Đang xác minh phiên đăng nhập…</Text></View>
  </SafeAreaView>;
  if(user&&!user.onboarding_required&&!user.is_admin)return <SafeAreaView style={styles.root}>
    <StatusBar barStyle="light-content" backgroundColor={C.bg}/>
    <Messenger token={token} user={user} onLogout={logout} onExpired={expired}
      onProfile={refreshProfile}/>
  </SafeAreaView>;
  return <SafeAreaView style={styles.root}><StatusBar barStyle="light-content"/>
    <KeyboardAvoidingView style={styles.center} behavior={Platform.OS==='ios'?'padding':undefined}>
      <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={styles.centerInner}>
        <View style={styles.card}>
          <Text style={styles.brand}>mtunz<Text style={{color:C.accent}}>.</Text></Text>
          <Text style={styles.title}>{user?.onboarding_required?'Hoàn tất hồ sơ':challenge?'Xác minh PIN':'Đăng nhập'}</Text>
          <Text style={styles.muted}>Một tài khoản cho cả website, Android và iOS.</Text>
          {user?.onboarding_required?<>
            <Input value={newName} onChangeText={setNewName} placeholder="Tên hiển thị"/>
            <Button onPress={finishOnboarding} disabled={busy||newName.trim().length<2}>Hoàn tất</Button>
            <Button onPress={logout} quiet>Đăng xuất</Button>
          </>:challenge?<>
            <Input value={pin} onChangeText={setPin} placeholder="Mã PIN" secret number/>
            <Button onPress={verifyPin} disabled={busy||!pin}>{busy?'Đang xác minh…':'Mở khóa'}</Button>
            <Button quiet onPress={()=>{setChallenge(null);setPin('');setError('');}}>Đăng nhập lại</Button>
          </>:<>
            <Input value={username} onChangeText={setUsername} placeholder="Tên đăng nhập / số điện thoại"/>
            <Input value={password} onChangeText={setPassword} placeholder="Mật khẩu" secret/>
            <Button onPress={signIn} disabled={busy}>{busy?'Đang kiểm tra…':'Đăng nhập'}</Button>
          </>}
          {!!error&&<Text style={styles.error}>{error}</Text>}
          <Text style={styles.muted}>Đăng ký và quản trị qua website mtunz.</Text>
          <Text style={styles.server}>{API_ORIGIN||'Chưa có EXPO_PUBLIC_API_URL'}</Text>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  </SafeAreaView>;
}
const styles=StyleSheet.create({
  root:{flex:1,backgroundColor:C.bg},center:{flex:1,justifyContent:'center',alignItems:'center'},
  centerInner:{flexGrow:1,justifyContent:'center',padding:18,minWidth:'100%'},
  card:{backgroundColor:C.card,borderRadius:23,padding:22,gap:14,maxWidth:460,width:'100%',alignSelf:'center'},
  brand:{fontSize:36,fontWeight:'900',color:C.text},title:{fontSize:23,fontWeight:'800',color:C.text},
  muted:{fontSize:12,color:C.muted},error:{color:'#ff9e9e',padding:8},
  server:{color:C.muted,fontSize:10},input:{borderColor:C.border,borderWidth:1,borderRadius:12,
    paddingHorizontal:14,minHeight:49,color:C.text,backgroundColor:C.bg},
  button:{backgroundColor:C.accent,borderRadius:12,alignItems:'center',
    justifyContent:'center',padding:12,minHeight:45},quiet:{backgroundColor:C.border},
  buttonText:{color:C.bg,fontWeight:'800'},
});
