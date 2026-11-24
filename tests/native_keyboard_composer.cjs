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
assert.match(cfg.version,/^\d+\.\d+\.\d+$/);
assert(Number.isInteger(cfg.android.versionCode)&&cfg.android.versionCode>=11);
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
assert(chat.includes("import {KeyboardChatScrollView,KeyboardStickyView} from 'react-native-keyboard-controller'"),
  'Use native chat scroll and a sticky composer instead of layout-driven avoidance');
assert(!chat.includes('<KeyboardAvoidingView')&&!chat.includes('Keyboard.addListener('),
  'Chat must not wait for JS keyboard events or resize twice');
assert(chat.includes('offset={bottom} keyboardLiftBehavior="always"')&&
  chat.includes('automaticallyAdjustContentInsets={false} contentInsetAdjustmentBehavior="never"'),
  'Native list insets must match the existing bottom safe area');
assert(chat.includes('const renderChatScroll=useCallback')&&chat.includes('renderScrollComponent={renderChatScroll}')&&
  chat.includes('ref={ref} inverted={inverted}'),
  'Keep a stable custom scroll component and inverted list ref');
assert(chat.includes('offset={{closed:0,opened:keyboardBottomInset}}')&&
  chat.includes('stickyComposer:{flexShrink:0,zIndex:2'),
  'Composer must move with native IME frames and remain above the list');
assert(chat.includes('chatKeyboardArea:{flex:1,minHeight:0}'),
  'Chat column must be shrinkable');
assert(chat.includes('scrollEventThrottle={16}')&&
  chat.includes('onScroll={event=>'),'Read whether user is near the bottom of the inverted list');
assert(chat.includes("onFocus={()=>scrollToLatest(false)}"),
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
const room=chat.slice(chat.indexOf('{room?<View style={css.chatKeyboardArea}>'),
  chat.indexOf('</KeyboardStickyView>')+'</KeyboardStickyView>'.length);
const sticky=room.slice(room.indexOf('<KeyboardStickyView'));
assert(room.includes('<FlatList')&&room.indexOf('<FlatList')<room.indexOf('<KeyboardStickyView')&&
  sticky.includes('<View style={css.compose}>')&&sticky.includes('css.replyBar')&&sticky.includes('worldAlias'),
  'All composer controls, reply/attachment previews and world alias must travel together');
assert(room.includes('accessibilityLabel="Gửi tin nhắn"')||
  room.includes("accessibilityLabel={sending?'Đang gửi tin nhắn':'Gửi tin nhắn'}"),
  'Send action must remain accessible above keyboard');
console.log('Native keyboard controller, latest-message scroll and IME-safe composer contracts: PASS');
