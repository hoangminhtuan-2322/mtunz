'use strict';
// Guard the Android 15+/edge-to-edge IME bug: adjustResize alone is NOT enough.
// In a chat room the composer must remain inside a keyboard-avoiding column,
// while the inverted FlatList occupies the remaining flex space.
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const root=path.resolve(__dirname,'..');
const messenger=fs.readFileSync(path.join(root,'mobile/src/Messenger.js'),'utf8');
const cfg=require('../mobile/app.json').expo;
const app=fs.readFileSync(path.join(root,'mobile/App.js'),'utf8');
const pkg=require('../mobile/package.json');
assert.equal(cfg.android.softwareKeyboardLayoutMode,'resize',
  'Do not use Android adjustPan together with padding: that pushes composer up twice');
assert.equal(cfg.android.package,'com.mtunz.web');
assert(pkg.dependencies['react-native-safe-area-context']==='~5.11.1',
  'Expo SDK 58 needs safe area insets for Android edge-to-edge screens');
assert(app.includes('SafeAreaProvider initialMetrics={initialWindowMetrics}'),
  'Root SafeAreaProvider must cover Messenger, Admin and authentication');
assert(app.includes("import {SafeAreaProvider,SafeAreaView,initialWindowMetrics} from 'react-native-safe-area-context'"),
  'Use Android/iOS safe-area view instead of React Native iOS-only SafeAreaView');
assert(messenger.includes("import {SafeAreaView} from 'react-native-safe-area-context'"),
  'Conversation details modal must respect Android status/navigation bars');
assert.equal(cfg.version,'1.1.4');
assert.equal(cfg.android.versionCode,7);
assert(/\bImage,Keyboard,KeyboardAvoidingView\b/.test(messenger),'Need Keyboard lifecycle events');
assert(messenger.includes('behavior="padding" keyboardVerticalOffset={0}'),
  'Set keyboard avoidance behavior for Android and iOS, not undefined on Android');
assert(messenger.includes('style={css.chatKeyboardArea}'),
  'Chat keyboard avoidance should have its own flex-constrained container');
assert(messenger.includes('chatKeyboardArea:{flex:1,minHeight:0}'),
  'Room should shrink without clipping the input');
assert(messenger.includes("Keyboard.addListener(Platform.OS==='ios'?'keyboardWillShow':'keyboardDidShow'"),
  'Expose the latest messages after the keyboard appears');
assert(messenger.includes('return()=>shown.remove()'),
  'Remove keyboard listeners on room change');
assert(messenger.includes('onFocus={()=>requestAnimationFrame('),
  'Text input focus should expose newest messages');
assert(messenger.includes('keyboardShouldPersistTaps="handled"'),
  'Tapping a chat control with IME open must work on first tap');
assert(messenger.includes("keyboardDismissMode={Platform.OS==='ios'?'interactive':'on-drag'}"),
  'Dragging messages should dismiss keyboard');
assert(messenger.includes('const jumpBack=()=>{Keyboard.dismiss();'),
  'Leaving a conversation should close the keyboard');
const room=messenger.substring(messenger.indexOf('{room?<KeyboardAvoidingView'),
  messenger.indexOf('</KeyboardAvoidingView>:'));
assert(room.includes('<FlatList')&&room.includes('<View style={css.compose}>')&&
  room.indexOf('<FlatList')<room.indexOf('<View style={css.compose}>'),
  'Keep message list and composer in same keyboard-avoiding column');
assert(room.includes('<TextInput style={css.composeInput} multiline')&&
  room.includes('<Btn small disabled={sending'),
  'Keep multiline composer and send button inside IME-safe area');
assert(!/position:\s*'absolute'/.test(messenger.slice(
  messenger.indexOf('compose:{'),messenger.indexOf('composeInput:{'))),
  'Do not absolutely position composer underneath the keyboard');
console.log('Android IME-safe native composer, latest-message focus, scroll/dismiss and release checks passed.');
