'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const root=path.resolve(__dirname,'..');
const read=p=>fs.readFileSync(path.join(root,p),'utf8');
const chat=read('mobile/src/Messenger.js');
const gallery=read('mobile/src/SharedConversationGallery.js');
const backend=read('chat_library.py');
const download=read('mobile/src/media.js');
const app=require('../mobile/app.json').expo;
const pkg=require('../mobile/package.json');
for(const needle of [
  "import SharedConversationGallery from './SharedConversationGallery'",
  'ConversationInfoSheet',
  'detailsScreen:{flex:1',
  '<SharedConversationGallery room={room} token={token}',
  'detailActions:{flexDirection',
])assert(chat.includes(needle),'Missing new full-screen conversation UI: '+needle);
assert(!chat.includes("infoRows.map(m=>"),'Old filename-only gallery must be removed');
assert(!chat.includes("infoView==='links'"),'Old link list must be removed');
for(const kind of ['images','videos','files','links']){
  assert(gallery.includes("'"+kind+"'"),'Missing real '+kind+' tab');
}
assert(gallery.includes("'/api/chats/'+scope+'/'+roomId+'/shared?kind='"),
  'Gallery must load the authenticated existing chat API');
assert(gallery.includes('result.next_before')&&gallery.includes('setRows(old=>before?'),
  'Gallery must paginate with server cursors');
assert(gallery.includes("attachmentSource(sharedFile(row),token)"),
  'Images must use authenticated attachment thumbnails');
assert(gallery.includes('downloadSharedAttachment(sharedFile(row),token)'),
  'Videos must use a token-protected local file, not a public URL');
assert(gallery.includes('generateThumbnailsAsync'),
  'Video cards must try to produce native preview frames');
assert(gallery.includes('<VideoView player={player}'),
  'Videos must play within the app');
assert(gallery.includes('saveSharedFile(file,token)'),
  'Files must open with the authenticated save/share helper');
assert(gallery.includes('Linking.openURL(first.url)')&&gallery.includes('isSafeLink'),
  'Links must be validated before opening');
assert(!/picsum\.photos|example\.com|console\.log\('open/.test(gallery),
  'No placeholder or mock data in production gallery');
assert(backend.includes("Literal['media', 'images', 'videos', 'files', 'links']"));
assert(backend.includes("filters = 'a.mime LIKE ?'"),'Filter video/image on backend, not only page UI');
assert(download.includes("headers:{Authorization:'Bearer '+token}"));
assert(pkg.dependencies['expo-video']&&pkg.dependencies['expo-image']);
assert(/^\d+\.\d+\.\d+$/.test(app.version)&&Number.isInteger(app.android.versionCode)&&app.android.versionCode>=11&&app.android.package==='com.mtunz.web');
console.log('Native full-screen chat media gallery, real authenticated previews, pagination and version tests passed.');

const {cacheFileOwner,cacheCandidates,summarizeCache}=require('../mobile/src/cacheRules');
const scope='a'.repeat(64),other='b'.repeat(64),uuid='12345678-1234-1234-1234-123456789abc';
const file=(name,size,isFile=true)=>({name,uri:'cache/'+name,size,isFile});
const own=file('mtunz-media-v2-'+scope+'-'+uuid+'-42-file.pdf',1024);
const rows=[own,file('mtunz-media-v2-'+other+'-'+uuid+'-42-file.pdf',2048),file('mtunz-preview-5-a.png',512),file('mtunz-6-a.pdf',256),file('mtunz-7-folder',900,false),file('document-picker-photo.jpg',300),file('mtunz-native-session-v1',100)];
assert.equal(cacheFileOwner(own.name),scope);
assert.equal(cacheFileOwner('mtunz-4-../escape'),null);
assert.deepEqual(cacheCandidates(rows,scope,new Set(),true).map(x=>x.name),[own.name,'mtunz-preview-5-a.png','mtunz-6-a.pdf']);
assert.deepEqual(summarizeCache(cacheCandidates(rows,scope,new Set([own.uri]),true)),{count:2,bytes:768});
assert.deepEqual(cacheCandidates(rows,scope,new Set(),false),[own]);
assert(read('mobile/src/mediaCache.js').includes('retired.has(scope)'));
assert(read('mobile/src/client.js').includes('retireMediaCache(token)'));
assert(read('mobile/src/Messenger.js').includes('<StorageSettings token={token}/>'));
assert(read('mobile/src/AdminDashboard.js').includes('<StorageSettings token={token}/>'));
console.log('Session-scoped temporary media, non-destructive cache inventory and logout cleanup: PASS');
