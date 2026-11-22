import React,{useCallback,useEffect,useState} from 'react';
import {ActivityIndicator,KeyboardAvoidingView,Linking,Platform,Pressable,SafeAreaView,
  ScrollView,StatusBar,StyleSheet,Text,TextInput,View} from 'react-native';
import {api,API_ORIGIN,clearSession,readSession,saveSession,
  savePendingRegistration,readPendingRegistration,clearPendingRegistration} from './src/client';
import Messenger from './src/Messenger';
import AdminDashboard from './src/AdminDashboard';

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
  const [adminApproval,setAdminApproval]=useState(null);
  const [error,setError]=useState(''),[busy,setBusy]=useState(false);
  const [mode,setMode]=useState('login'),[signupToken,setSignupToken]=useState(''),
    [signupUsername,setSignupUsername]=useState(''),[signupPhone,setSignupPhone]=useState(''),
    [signupEmail,setSignupEmail]=useState(''),[signupPhase,setSignupPhase]=useState('request'),
    [accepted,setAccepted]=useState(false);

  const clear=useCallback(async()=>{
    await clearSession().catch(()=>{});
    setToken(null);setUser(null);setChallenge(null);setAdminApproval(null);setPassword('');setPin('');
  },[]);

  const expired=useCallback(async()=>{
    await clear();setError('Phiên đã hết hạn hoặc đã bị thu hồi. Vui lòng đăng nhập lại.');
  },[clear]);

  useEffect(()=>{
    let mounted=true;
    (async()=>{
      try{
        const pending=await readPendingRegistration();
        if(pending&&mounted){
          setMode('register');setSignupToken(pending.token);
          setSignupUsername(pending.username);setSignupPhase('pending');
        }
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
      if(result.next==='admin-approval'){
        setAdminApproval({challenge,approval_token:result.approval_token});
        setPin('');return;
      }
      const session=result.access_token;
      const check=await api('/api/me',{token:session});
      if(!check.user||check.user.deletion_purge_at)throw Error('Tài khoản không sẵn sàng cho ứng dụng.');
      await saveSession(session);
      setToken(session);setUser(check.user);setChallenge(null);setPin('');
    }catch(e){setError(e.message);}
    finally{setBusy(false);}
  }
  async function checkAdminApproval(){
    if(!adminApproval)return;
    setBusy(true);setError('');
    try{
      const result=await api('/api/mobile/auth/admin/approval/status',{
        method:'POST',data:adminApproval,
      });
      if(result.status==='active'&&result.access_token){
        const profile=await api('/api/me',{token:result.access_token});
        if(!profile.user?.is_admin)throw Error('Phiên đăng nhập Admin không hợp lệ.');
        await saveSession(result.access_token);
        setToken(result.access_token);setUser(profile.user);
        setChallenge(null);setAdminApproval(null);setPin('');
      }else if(result.status==='pending'){
        setError('Thiết bị đang chờ phiên Admin trên website phê duyệt.');
      }else{
        setError(result.status==='full'?'Đã đủ 2 phiên Admin. Thu hồi một phiên trên web.':
          result.status==='denied'?'Yêu cầu đã bị từ chối.':'Yêu cầu đã hết hạn. Hãy đăng nhập lại.');
      }
    }catch(e){setError(e.message);}finally{setBusy(false);}
  }
  async function requestSignup(){
    if(!signupUsername.trim()||!signupPhone.trim()){setError('Cần nhập tên tài khoản và số điện thoại.');return;}
    setBusy(true);setError('');
    try{
      const result=await api('/api/mobile/registration/request',{method:'POST',data:{
        username:signupUsername.trim(),phone:signupPhone.trim(),email:signupEmail.trim(),
      }});
      await savePendingRegistration({username:result.username,token:result.registration_token});
      setSignupToken(result.registration_token);setSignupUsername(result.username);setSignupPhase('pending');
    }catch(e){setError(e.message);}finally{setBusy(false);}
  }
  async function checkSignup(){
    if(!signupToken)return;
    setBusy(true);setError('');
    try{
      const result=await api('/api/mobile/registration/status',{method:'POST',data:{token:signupToken}});
      const state=result.registration?.status;
      if(state==='approved')setSignupPhase('approved');
      else if(state==='pending')setSignupPhase('pending');
      else if(state==='rejected'){setError('Đăng ký đã bị từ chối. Liên hệ quản trị viên.');}
      else setError('Không tìm thấy yêu cầu đăng ký. Bạn có thể thử lại.');
    }catch(e){setError(e.message);}finally{setBusy(false);}
  }
  async function finishSignup(){
    if(!accepted){setError('Hãy đọc và đồng ý điều khoản và chính sách riêng tư.');return;}
    if(!password||pin.length<4){setError('Hãy đặt mật khẩu mạnh và PIN 4–6 chữ số.');return;}
    setBusy(true);setError('');
    try{
      const result=await api('/api/mobile/registration/complete',{method:'POST',data:{
        token:signupToken,username:signupUsername,password,pin,pin_length:pin.length,accepted_terms:true,
      }});
      const session=result.access_token;
      const profile=await api('/api/me',{token:session});
      await saveSession(session);await clearPendingRegistration();
      setToken(session);setUser(profile.user);setSignupToken('');setPassword('');setPin('');
      setMode('login');setSignupPhase('request');
    }catch(e){setError(e.message);}finally{setBusy(false);}
  }
  async function cancelSignup(){
    await clearPendingRegistration();
    setSignupToken('');setSignupPhase('request');setMode('login');setError('');setPassword('');setPin('');
  }
  useEffect(()=>{
    if(mode!=='register'||signupPhase!=='pending'||!signupToken)return;
    const poll=setInterval(()=>{if(!busy)checkSignup();},60000);
    return()=>clearInterval(poll);
  },[mode,signupPhase,signupToken,busy]);

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
  if(user?.is_admin)return <SafeAreaView style={styles.root}>
    <StatusBar barStyle="light-content" backgroundColor={C.bg}/>
    <AdminDashboard token={token} onLogout={logout} onExpired={expired}/>
  </SafeAreaView>;
  if(user&&!user.onboarding_required)return <SafeAreaView style={styles.root}>
    <StatusBar barStyle="light-content" backgroundColor={C.bg}/>
    <Messenger token={token} user={user} onLogout={logout} onExpired={expired}
      onProfile={refreshProfile}/>
  </SafeAreaView>;
  return <SafeAreaView style={styles.root}><StatusBar barStyle="light-content"/>
    <KeyboardAvoidingView style={styles.center} behavior={Platform.OS==='ios'?'padding':undefined}>
      <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={styles.centerInner}>
        <View style={styles.card}>
          <Text style={styles.brand}>mtunz<Text style={{color:C.accent}}>.</Text></Text>
          <Text style={styles.title}>{user?.onboarding_required?'Hoàn tất hồ sơ':mode==='register'?'Tạo tài khoản mtunz':adminApproval?'Duyệt thiết bị Admin':challenge?'Xác minh PIN':'Đăng nhập'}</Text>
          <Text style={styles.muted}>Một tài khoản cho cả website, Android và iOS.</Text>
          {user?.onboarding_required?<>
            <Input value={newName} onChangeText={setNewName} placeholder="Tên hiển thị"/>
            <Button onPress={finishOnboarding} disabled={busy||newName.trim().length<2}>Hoàn tất</Button>
            <Button onPress={logout} quiet>Đăng xuất</Button>
          </>:mode==='register'?<>
            {signupPhase==='request'?<>
              <Input value={signupUsername} onChangeText={setSignupUsername} placeholder="Tên đăng nhập (chữ thường, 3–24 ký tự)"/>
              <Input value={signupPhone} onChangeText={setSignupPhone} placeholder="Số điện thoại"/>
              <Input value={signupEmail} onChangeText={setSignupEmail} placeholder="Email (không bắt buộc)"/>
              <Button onPress={requestSignup} disabled={busy}>Gửi yêu cầu đăng ký</Button>
            </>:signupPhase==='pending'?<>
              <Text style={styles.muted}>Đã gửi yêu cầu @{signupUsername}. Chờ Admin phê duyệt trên website.</Text>
              <Button onPress={checkSignup} disabled={busy}>Kiểm tra trạng thái duyệt</Button>
            </>:<>
              <Text style={styles.muted}>Yêu cầu đã duyệt. Tạo mật khẩu và PIN để hoàn tất.</Text>
              <Input value={password} onChangeText={setPassword} placeholder="Mật khẩu mạnh" secret/>
              <Input value={pin} onChangeText={setPin} placeholder="PIN 4–6 chữ số" secret number/>
              <Pressable onPress={()=>setAccepted(x=>!x)}>
                <Text style={styles.muted}>{accepted?'☑':'□'} Tôi đồng ý Điều khoản và Chính sách quyền riêng tư</Text>
              </Pressable>
              <View style={{flexDirection:'row',gap:14,flexWrap:'wrap'}}>
                <Pressable onPress={()=>Linking.openURL(API_ORIGIN+'/terms')}><Text style={styles.link}>Điều khoản</Text></Pressable>
                <Pressable onPress={()=>Linking.openURL(API_ORIGIN+'/privacy')}><Text style={styles.link}>Quyền riêng tư</Text></Pressable>
              </View>
              <Button onPress={finishSignup} disabled={busy||!accepted}>Tạo tài khoản</Button>
            </>}
            <Button quiet onPress={cancelSignup}>Về đăng nhập</Button>
          </>:adminApproval?<>
            <Text style={styles.muted}>Đăng nhập đã xác minh mật khẩu và PIN. Hãy mở phiên Admin đang hoạt động trên website mtunz và duyệt thiết bị mới trong mục Bảo mật.</Text>
            <Button onPress={checkAdminApproval} disabled={busy}>{busy?'Đang kiểm tra…':'Kiểm tra phê duyệt'}</Button>
            <Button quiet onPress={()=>{setAdminApproval(null);setChallenge(null);setPin('');setError('');}}>Hủy đăng nhập</Button>
          </>:challenge?<>
            <Input value={pin} onChangeText={setPin} placeholder="Mã PIN" secret number/>
            <Button onPress={verifyPin} disabled={busy||!pin}>{busy?'Đang xác minh…':'Mở khóa'}</Button>
            <Button quiet onPress={()=>{setChallenge(null);setAdminApproval(null);setPin('');setError('');}}>Đăng nhập lại</Button>
          </>:<>
            <Input value={username} onChangeText={setUsername} placeholder="Tên đăng nhập / số điện thoại"/>
            <Input value={password} onChangeText={setPassword} placeholder="Mật khẩu" secret/>
            <Button onPress={signIn} disabled={busy}>{busy?'Đang kiểm tra…':'Đăng nhập'}</Button>
            <Button quiet onPress={()=>{setMode('register');setError('');}}>Đăng ký tài khoản mới</Button>
          </>}
          {!!error&&<Text style={styles.error}>{error}</Text>}
          <Text style={styles.muted}>Thành viên và Admin sử dụng cùng hệ thống mtunz. Các thao tác quản trị chuyên sâu vẫn được bảo vệ trên website.</Text>
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
  server:{color:C.muted,fontSize:10},link:{color:C.accent,fontSize:13,fontWeight:'700'},input:{borderColor:C.border,borderWidth:1,borderRadius:12,
    paddingHorizontal:14,minHeight:49,color:C.text,backgroundColor:C.bg},
  button:{backgroundColor:C.accent,borderRadius:12,alignItems:'center',
    justifyContent:'center',padding:12,minHeight:45},quiet:{backgroundColor:C.border},
  buttonText:{color:C.bg,fontWeight:'800'},
});
