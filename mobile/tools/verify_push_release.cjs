'use strict';
/*
 * Android release fail-closed gate: never sign a "push ready" mtunz build
 * without Expo project ownership and the matching Firebase client config.
 * The private FCM v1 service account key remains stored in Expo Services.
 */
const fs=require('node:fs');
const {expo}=require('../app.json');
const projectId=(process.env.EXPO_PROJECT_ID||'').trim();
const file=(process.env.GOOGLE_SERVICES_FILE||'').trim();
const confirmed=(process.env.EXPO_FCM_V1_READY||'').trim();
if(!/^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i.test(projectId))
  throw Error('Missing or invalid EXPO_PROJECT_ID (Expo EAS project UUID).');
if(!file||!fs.existsSync(file))
  throw Error('Missing GOOGLE_SERVICES_FILE for the release Firebase Android app.');
if(confirmed!=='true')
  throw Error('FCM v1 sending credential is not verified in Expo Services. Set EXPO_FCM_V1_READY=true only after uploading and checking the FCM v1 service account.');
let json;
try{json=JSON.parse(fs.readFileSync(file,'utf8'));}catch{
  throw Error('Firebase Android google-services.json is malformed.');
}
const number=String(json.project_info?.project_number||'');
const firebaseProject=String(json.project_info?.project_id||'');
const clients=Array.isArray(json.client)?json.client:[];
const client=clients.find(c=>c.client_info?.android_client_info?.package_name===expo.android.package);
if(!/^\d{6,20}$/.test(number)||!firebaseProject||!client)
  throw Error('Firebase project number, project ID, or Android package does not match com.mtunz.web.');
if(!client.client_info?.mobilesdk_app_id||!client.api_key?.some(k=>k.current_key))
  throw Error('Firebase Android client app ID/API key is incomplete.');
if(expo.android.package!=='com.mtunz.web')
  throw Error('Release package identity has changed; refusing to sign.');
console.log('mtunz Android release push configuration checked; FCM delivery still requires device test.');
