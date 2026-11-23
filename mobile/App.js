import React,{useCallback,useEffect,useRef,useState} from 'react';
import {ActivityIndicator,AppState,KeyboardAvoidingView,Linking,Platform,Pressable,SafeAreaView,
  ScrollView,StatusBar,StyleSheet,Text,TextInput,View,Image,useWindowDimensions} from 'react-native';
import {api,API_ORIGIN,clearSession,readSession,saveSession,
  savePendingRegistration,readPendingRegistration,clearPendingRegistration} from './src/client';
import Messenger from './src/Messenger';
import AdminDashboard from './src/AdminDashboard';
import {shouldRetrySession} from './src/sessionRecovery';

const C={bg:'#08111f',card:'#14243a',text:'#f4f8ff',muted:'#a5b6cf',
  accent:'#67bcff',border:'#2c4160',subtle:'#1b304c',success:'#70dabb'};
function Input({value,onChangeText,placeholder,secret=false,number=false,label}) {
  return <View style={styles.field}>
    {!!label&&<Text style={styles.fieldLabel}>{label}</Text>}
    <TextInput value={value} onChangeText={onChangeText} placeholder={placeholder}
      placeholderTextColor={C.muted} secureTextEntry={secret} autoCapitalize="none"
      autoCorrect={false} autoComplete={secret?'off':'off'}
      keyboardType={number?'number-pad':'default'} style={styles.input}/>
  </View>;
}
function Button({children,onPress,disabled=false,quiet=false}) {
  return <Pressable accessibilityRole="button" onPress={onPress} disabled={disabled}
    style={({pressed})=>[styles.button,quiet&&styles.quiet,pressed&&!disabled&&styles.pressed,disabled&&{opacity:.45}]}>
    <Text style={[styles.buttonText,quiet&&{color:C.text}]}>{children}</Text></Pressable>;
}
export default function App() {
  const {width:screenWidth,height:screenHeight,fontScale}=useWindowDimensions();
  const compactAuth=screenWidth<390||fontScale>1.15;
  const shortAuth=screenHeight<720;
  const [ready,setReady]=useState(false),[token,setToken]=useState(null),[user,setUser]=useState(null);
  const [recoverToken,setRecoverToken]=useState(null),[recoverBusy,setRecoverBusy]=useState(false);
  const recoveryRunRef=useRef(0);
  const [username,setUsername]=useState(''),[password,setPassword]=useState(''),[pin,setPin]=useState('');
  const [challenge,setChallenge]=useState(null),[newName,setNewName]=useState('');
  const [adminApproval,setAdminApproval]=useState(null);
  const [error,setError]=useState(''),[busy,setBusy]=useState(false);
  const [mode,setMode]=useState('login'),[signupToken,setSignupToken]=useState(''),
    [signupUsername,setSignupUsername]=useState(''),[signupPhone,setSignupPhone]=useState(''),
    [signupEmail,setSignupEmail]=useState(''),[signupPhase,setSignupPhase]=useState('request'),
    [accepted,setAccepted]=useState(false);

  const clear=useCallback(async()=>{
    ++recoveryRunRef.current;
    setRecoverToken(null);setRecoverBusy(false);
    await clearSession().catch(()=>{});
    setToken(null);setUser(null);setChallenge(null);setAdminApproval(null);setPassword('');setPin('');
  },[]);

  const expired=useCallback(async()=>{
    await clear();setError('Phiên đã hết hạn hoặc đã bị thu hồi. Vui lòng đăng nhập lại.');
  },[clear]);

  useEffect(()=>{
    let mounted=true;
    (async()=>{
      let restored=null;
      try{
        const pending=await readPendingRegistration();
        if(pending&&mounted){
          setMode('register');setSignupToken(pending.token);
          setSignupUsername(pending.username);setSignupPhase('pending');
        }
        restored=await readSession();
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
          if(e.status===401||e.status===403||e.status===410)await clear();
          else if(restored&&shouldRetrySession(e))setRecoverToken(restored);
          setError(e.message||'Không thể kiểm tra phiên. Hãy thử lại khi có mạng.');
        }
      }finally{if(mounted)setReady(true);}
    })();
    return()=>{mounted=false;};
  },[clear]);

  const recoverSession=useCallback(async()=>{
    if(!recoverToken||recoverBusy)return;
    const run=++recoveryRunRef.current;
    setRecoverBusy(true);setError('');
    try{
      const result=await api('/api/me',{token:recoverToken});
      if(run!==recoveryRunRef.current)return;
      if(!result.user||result.user.deletion_purge_at){
        await clear();
        setError('Tài khoản chưa sẵn sàng hoặc đang chờ xóa. Hãy đăng nhập lại.');
        return;
      }
      setToken(recoverToken);setUser(result.user);setRecoverToken(null);
    }catch(e){
      if(run!==recoveryRunRef.current)return;
      if(e.status===401||e.status===403||e.status===410){
        await clear();
        setError('Phiên đăng nhập không còn hợp lệ. Vui lòng đăng nhập lại.');
      }else{
        setError(e.message||'Chưa thể kết nối máy chủ. Hãy thử lại khi có mạng.');
      }
    }finally{
      if(run===recoveryRunRef.current)setRecoverBusy(false);
    }
  },[recoverToken,recoverBusy,clear]);
  useEffect(()=>{
    if(!recoverToken)return;
    const subscription=AppState.addEventListener('change',state=>{
      if(state==='active'&&!recoverBusy)void recoverSession();
    });
    return()=>subscription.remove();
  },[recoverToken,recoverBusy,recoverSession]);

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
  if(recoverToken&&!user)return <SafeAreaView style={styles.root}>
    <StatusBar barStyle="light-content" backgroundColor={C.bg}/>
    <View style={styles.center}>
      <View style={[styles.card,{width:'90%',maxWidth:430}]}>
        <View style={styles.brandRow}>
          <Image source={require('./assets/brand-logo.png')} style={styles.brandMark} resizeMode="contain"/>
          <Text style={styles.brand}>mtunz<Text style={{color:C.accent}}>.</Text></Text>
        </View>
        <Text style={styles.title}>Đang tạm mất kết nối</Text>
        <Text style={styles.muted}>
          Phiên đăng nhập của bạn vẫn được giữ an toàn. Kiểm tra mạng hoặc thử kết nối lại với mtunz.
        </Text>
        {!!error&&<View style={styles.errorPanel}><Text style={styles.error}>{error}</Text></View>}
        <Button disabled={recoverBusy} onPress={recoverSession}>
          {recoverBusy?'Đang thử kết nối…':'Thử kết nối lại'}
        </Button>
        <Button quiet disabled={recoverBusy} onPress={async()=>{
          await clear();setError('');setMode('login');
        }}>Đăng nhập tài khoản khác</Button>
      </View>
    </View>
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
    <KeyboardAvoidingView style={styles.authShell} behavior={Platform.OS==='ios'?'padding':undefined}>
      <ScrollView style={styles.authScroll} keyboardShouldPersistTaps="handled" keyboardDismissMode="on-drag"
        contentContainerStyle={[styles.centerInner,compactAuth&&styles.centerInnerCompact,shortAuth&&styles.centerInnerShort]}
        showsVerticalScrollIndicator={false} contentInsetAdjustmentBehavior="never">
        <View style={[styles.intro,compactAuth&&styles.introCompact]}>
          <View style={styles.brandRow}>
            <Image source={require('./assets/brand-logo.png')} style={styles.brandMark} resizeMode="contain"/>
            <Text style={styles.brand}>mtunz<Text style={{color:C.accent}}>.</Text></Text>
          </View>
          <Text style={[styles.introTitle,compactAuth&&styles.introTitleCompact]}>Kết nối mọi khoảnh khắc.</Text>
          <Text style={styles.introSub}>Trò chuyện liền mạch giữa điện thoại và website.</Text>
          <View style={styles.connected}><View style={styles.onlineDot}/>
            <Text style={styles.connectedText}>Cùng tài khoản · Cùng trò chuyện</Text></View>
        </View>
        <View style={[styles.card,compactAuth&&styles.cardCompact]}>
          <Text style={styles.eyebrow}>CHÀO MỪNG BẠN QUAY LẠI</Text>
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
            <Input value={pin} onChangeText={setPin} placeholder="Mã PIN" label="Mã PIN bảo mật" secret number/>
            <Button onPress={verifyPin} disabled={busy||!pin}>{busy?'Đang xác minh…':'Mở khóa'}</Button>
            <Button quiet onPress={()=>{setChallenge(null);setAdminApproval(null);setPin('');setError('');}}>Đăng nhập lại</Button>
          </>:<>
            <Input value={username} onChangeText={setUsername} label="Tài khoản"
              placeholder="Tên đăng nhập hoặc số điện thoại"/>
            <Input value={password} onChangeText={setPassword} label="Mật khẩu"
              placeholder="Nhập mật khẩu của bạn" secret/>
            <Button onPress={signIn} disabled={busy}>{busy?'Đang kiểm tra…':'Đăng nhập'}</Button>
            <Button quiet onPress={()=>{setMode('register');setError('');}}>Đăng ký tài khoản mới</Button>
          </>}
          {!!error&&<View style={styles.errorPanel}><Text style={styles.error}>{error}</Text></View>}
          <View style={styles.infoRow}><Text style={styles.infoIcon} accessibilityLabel="Bảo mật">⌁</Text>
            <Text style={styles.infoText}>Tài khoản được bảo vệ bằng mật khẩu và PIN. Thiết bị Admin mới có thể cần phê duyệt.</Text></View>
        </View>
        <View style={styles.footer}>
          <Text style={styles.footerText}>mtunz • Một không gian, nhiều kết nối</Text>
          <Text style={styles.server}>{API_ORIGIN||'Chưa cấu hình địa chỉ máy chủ'}</Text>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  </SafeAreaView>;
}
const styles=StyleSheet.create({
  root:{flex:1,backgroundColor:C.bg},
  center:{flex:1,justifyContent:'center',alignItems:'center'},
  authShell:{flex:1,width:'100%',minWidth:0},
  authScroll:{flex:1,width:'100%',minWidth:0},
  centerInner:{flexGrow:1,justifyContent:'center',paddingTop:24,paddingBottom:28,
    paddingHorizontal:18,maxWidth:480,width:'100%',alignSelf:'center',gap:20},
  centerInnerCompact:{paddingHorizontal:14,paddingTop:16,paddingBottom:24,gap:16},
  centerInnerShort:{justifyContent:'flex-start'},
  intro:{gap:8,alignItems:'flex-start',paddingHorizontal:3,minWidth:0,width:'100%'},
  introCompact:{gap:6,paddingHorizontal:2},
  brandRow:{flexDirection:'row',alignItems:'center',gap:9,marginBottom:5,minWidth:0,maxWidth:'100%'},
  brandMark:{height:43,width:43},
  brand:{fontSize:30,fontWeight:'900',color:C.text,letterSpacing:-1,flexShrink:1},
  introTitle:{fontSize:24,lineHeight:31,fontWeight:'800',color:C.text,letterSpacing:-.5,
    flexShrink:1,maxWidth:'100%'},
  introTitleCompact:{fontSize:21,lineHeight:28},
  introSub:{fontSize:14,color:C.muted,lineHeight:21,flexShrink:1,maxWidth:'100%'},
  connected:{alignSelf:'flex-start',flexDirection:'row',alignItems:'center',gap:8,
    backgroundColor:'#123449',borderWidth:1,borderColor:'#275567',maxWidth:'100%',minWidth:0,
    paddingHorizontal:12,paddingVertical:8,borderRadius:40,marginTop:4},
  connectedText:{color:'#9ee2d4',fontSize:12,fontWeight:'700',flexShrink:1},
  onlineDot:{width:7,height:7,borderRadius:4,backgroundColor:C.success,flexShrink:0},
  card:{backgroundColor:C.card,borderRadius:22,padding:20,gap:13,
    borderWidth:1,borderColor:C.border,width:'100%',minWidth:0,maxWidth:'100%'},
  cardCompact:{padding:16,borderRadius:20,gap:12},
  eyebrow:{fontSize:10,color:C.accent,letterSpacing:1.3,fontWeight:'900',flexShrink:1},
  title:{fontSize:24,lineHeight:30,fontWeight:'900',color:C.text,letterSpacing:-.5,flexShrink:1},
  muted:{fontSize:13,color:C.muted,lineHeight:20,flexShrink:1},
  field:{gap:7,minWidth:0,width:'100%'},
  fieldLabel:{fontSize:13,fontWeight:'800',color:'#d9e6f8'},
  input:{borderColor:'#375172',borderWidth:1,borderRadius:13,
    paddingHorizontal:14,minHeight:51,fontSize:15,color:C.text,backgroundColor:'#0b1728',
    width:'100%',minWidth:0},
  button:{backgroundColor:C.accent,borderRadius:14,alignItems:'center',
    justifyContent:'center',paddingHorizontal:12,paddingVertical:12,minHeight:50,
    width:'100%',maxWidth:'100%',minWidth:0},
  quiet:{backgroundColor:C.subtle,borderWidth:1,borderColor:C.border},
  pressed:{opacity:.82,transform:[{scale:.995}]},
  buttonText:{color:'#091526',fontSize:15,fontWeight:'900',letterSpacing:.1,
    flexShrink:1,textAlign:'center'},
  errorPanel:{backgroundColor:'#3a2437',borderWidth:1,borderColor:'#7a4058',borderRadius:12,padding:12},
  error:{color:'#ffb5bc',fontSize:13,lineHeight:19},
  infoRow:{flexDirection:'row',alignItems:'flex-start',gap:10,
    borderTopWidth:1,borderColor:C.border,paddingTop:14,minWidth:0,width:'100%'},
  infoIcon:{fontSize:20,color:C.accent,flexShrink:0},
  infoText:{fontSize:12,color:C.muted,lineHeight:19,flex:1,minWidth:0,flexShrink:1},
  footer:{gap:6,alignItems:'center',paddingHorizontal:8,width:'100%',minWidth:0},
  footerText:{fontSize:12,color:C.muted,textAlign:'center'},
  server:{color:'#6c829f',fontSize:11,textAlign:'center',flexShrink:1},
  link:{color:C.accent,fontSize:13,fontWeight:'700'},
});
