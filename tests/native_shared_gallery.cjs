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
assert(app.version==='1.1.2'&&app.android.versionCode===5&&app.android.package==='com.mtunz.web');
console.log('Native full-screen chat media gallery, real authenticated previews, pagination and version tests passed.');
