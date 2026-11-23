'use strict';
// Only preview builds use this suffix. The fixed-key release remains com.mtunz.web.
const fs=require('node:fs'),path=require('node:path');
const file=path.join(__dirname,'..','android','app','build.gradle');
const stringsFile=path.join(__dirname,'..','android','app','src','main','res','values','strings.xml');
let gradle=fs.readFileSync(file,'utf8');
const buildTypes=gradle.indexOf('buildTypes {');
const release=gradle.indexOf('release {',buildTypes);
if(buildTypes<0||release<0||!gradle.includes('applicationId "com.mtunz.web"'))
  throw Error('Unexpected Expo build.gradle. Refusing to alter package.');
const closing=gradle.indexOf('\n    }',release);
if(closing<0)throw Error('Unexpected Android buildType block.');
const contents=gradle.slice(release,closing);
if(!contents.includes('signingConfig signingConfigs.debug')||
    contents.includes('mtunzFixedRelease')||contents.includes('applicationIdSuffix'))
  throw Error('Preview must be debug signed without release identity modifications.');
const index=release+'release {'.length;
gradle=gradle.slice(0,index)+"\n            applicationIdSuffix '.preview'"+gradle.slice(index);
fs.writeFileSync(file,gradle);
let strings=fs.readFileSync(stringsFile,'utf8');
const match=/<string name="app_name">[^<]*<\/string>/g;
if((strings.match(match)||[]).length!==1)
  throw Error('Cannot set preview application label in Expo resources.');
strings=strings.replace(match,'<string name="app_name">mtunz Preview</string>');
fs.writeFileSync(stringsFile,strings);
console.log('Standalone debug preview uses com.mtunz.web.preview and installs alongside mtunz.');
