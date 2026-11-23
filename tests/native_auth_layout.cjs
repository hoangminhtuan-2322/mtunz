'use strict';
// Regression: login/registration must remain inside narrow Android viewports.
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const root=path.resolve(__dirname,'..');
const code=fs.readFileSync(path.join(root,'mobile/App.js'),'utf8');
const app=require('../mobile/app.json').expo;
const checks=[
  ['viewport-aware dimensions',/useWindowDimensions/.test(code)&&/screenWidth<390\|\|fontScale>1\.15/.test(code)],
  ['auth ScrollView has viewport width',/ScrollView style=\{styles\.authScroll\}/.test(code)],
  ['auth scroll flex does not grow beyond phone',/authScroll:\{flex:1,width:'100%',minWidth:0\}/.test(code)],
  ['card has width constraints',/card:\{[^}]*width:'100%',minWidth:0,maxWidth:'100%'/.test(code)],
  ['compact padding adapts to phone',/centerInnerCompact:\{paddingHorizontal:14/.test(code)],
  ['keyboard adjusts while scrolling',/keyboardDismissMode="on-drag"/.test(code)],
  ['security text wraps inside flex row',/infoText:\{[^}]*flex:1,minWidth:0,flexShrink:1/.test(code)],
  ['connection pill wraps instead of clipping',/connectedText:\{[^}]*flexShrink:1/.test(code)&&/connected:\{[^}]*maxWidth:'100%',minWidth:0/.test(code)],
  ['button label fits accessibility text sizes',/buttonText:\{[^}]*flexShrink:1,textAlign:'center'/.test(code)],
  ['Android version upgrade',app.version==='1.1.4'&&app.android.versionCode===7&&app.android.package==='com.mtunz.web'],
];
for(const [name,ok] of checks)assert(ok,'Android auth responsive regression: '+name);
console.log('Android auth viewport, text wrapping, keyboard and version regressions passed.');
