'use strict';
// Regression for Expo 58 Android edge-to-edge + Gboard/IME.
// This static test guards the intended native solution; physical phone testing remains necessary.
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const root=path.resolve(__dirname,'..');
const chat=fs.readFileSync(path.join(root,'mobile/src/Messenger.js'),'utf8');
const app=fs.readFileSync(path.join(root,'mobile/App.js'),'utf8');
const pkg=require('../mobile/package.json');
const cfg=require('../mobile/app.json').expo;
assert.equal(cfg.android.softwareKeyboardLayoutMode,'resize');
assert.equal(cfg.android.package,'com.mtunz.web');
assert.equal(cfg.version,'1.1.0');
assert.equal(cfg.android.versionCode,11);
assert.equal(pkg.dependencies['react-native-keyboard-controller'],'1.22.7');
assert.equal(pkg.dependencies['react-native-reanimated'],'4.7.1');
assert.equal(pkg.dependencies['react-native-worklets'],'0.13.0');
assert(app.includes("import {KeyboardProvider,KeyboardAvoidingView} from 'react-native-keyboard-controller'"),
  'Root and login must use native keyboard controller');
assert(app.includes('<KeyboardProvider statusBarTranslucent navigationBarTranslucent>'),
  'Keyboard provider must handle edge-to-edge system insets');
assert(app.includes('SafeAreaProvider initialMetrics={initialWindowMetrics}'),
  'Keep exactly one safe-area provider under keyboard root');
assert(app.includes("behavior={Platform.OS==='android'?'height':'padding'} automaticOffset keyboardVerticalOffset={0}"),
  'Auth should remain visible above IME on Android');
assert(chat.includes("import {KeyboardAvoidingView} from 'react-native-keyboard-controller'"),
  'Do not use legacy React Native KeyboardAvoidingView for chat');
assert(chat.includes("behavior={Platform.OS==='android'?'height':'padding'}")&&
  chat.includes('automaticOffset keyboardVerticalOffset={0}'),
  'Native keyboard controller should shrink chat column on Android and pad iOS');
assert(chat.includes('chatKeyboardArea:{flex:1,minHeight:0}'),
  'Chat column must be shrinkable');
assert(chat.includes('scrollEventThrottle={16}')&&
  chat.includes('onScroll={event=>'),'Read whether user is near the bottom of the inverted list');
assert(chat.includes("onFocus={()=>scrollToLatest(true)}"),
  'Focus should always scroll to newest message');
assert(chat.includes('listRef.current?.scrollToOffset({offset:0,animated})'),
  'Inverted list latest message is offset zero');
assert(chat.includes('if(isAtLatestRef.current)scrollToLatest(true)'),
  'Follow live updates only when user is already reading latest');
assert(chat.includes('else setNewerMessages(true)'),
  'While reading history, show a new-message jump control instead of forcing a scroll');
assert(chat.includes("onPress={()=>scrollToLatest()}"),
  'Jump-to-latest action must work');
assert(chat.includes("const jumpBack=()=>{Keyboard.dismiss();"),
  'Leaving chat should hide keyboard');
assert(chat.includes('keyboardShouldPersistTaps="handled"'),
  'Send and attachment buttons should respond with keyboard up');
const room=chat.slice(chat.indexOf('{room?<KeyboardAvoidingView'),
  chat.indexOf('</KeyboardAvoidingView>:'));
assert(room.includes('<FlatList')&&room.includes('<View style={css.compose}>')&&
  room.indexOf('<FlatList')<room.indexOf('<View style={css.compose}>'),
  'List and composer belong to one IME-aware column');
assert(room.includes('accessibilityLabel="Gửi tin nhắn"')||
  room.includes("accessibilityLabel={sending?'Đang gửi tin nhắn':'Gửi tin nhắn'}"),
  'Send action must remain accessible above keyboard');
console.log('Native keyboard controller, latest-message scroll and IME-safe composer contracts: PASS');
