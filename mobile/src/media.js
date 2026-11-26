import * as ImagePicker from 'expo-image-picker';
import * as DocumentPicker from 'expo-document-picker';
import * as Sharing from 'expo-sharing';
import { File } from 'expo-file-system';
import {fetch as expoFetch} from 'expo/fetch';
import * as Crypto from 'expo-crypto';
import {withTemporaryMedia} from './mediaCache';
import * as Clipboard from 'expo-clipboard';
import { API_ORIGIN, ApiError, api } from './client';

const ALLOWED = new Set([
  'image/jpeg','image/png','image/gif','image/webp',
  'video/mp4','video/webm','audio/mpeg','audio/webm','audio/mp4','audio/ogg','audio/wav','audio/x-wav',
  'application/pdf','text/plain','application/zip',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
]);
const EXTENSIONS = {
  '.pdf':'application/pdf','.txt':'text/plain','.zip':'application/zip',
  '.docx':'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  '.xlsx':'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  '.jpg':'image/jpeg','.jpeg':'image/jpeg','.png':'image/png','.gif':'image/gif','.webp':'image/webp',
  '.mp4':'video/mp4','.webm':'video/webm','.mp3':'audio/mpeg','.m4a':'audio/mp4','.wav':'audio/wav',
  '.ogg':'audio/ogg',
};
const MAX_FILE_BYTES = 2 * 1024 * 1024;
const MAX_VIDEO_BYTES = 16 * 1024 * 1024;
const MAX_LARGE_VIDEO_BYTES = 500 * 1024 * 1024;
const attachmentLimit = mime => mime.startsWith('video/') ? MAX_LARGE_VIDEO_BYTES : MAX_FILE_BYTES;
const cleanFileName = value => String(value || 'attachment').replace(/[\/\\:\x00-\x1f]/g, '_').slice(0, 95);

function selected(asset) {
  if (!asset?.uri) throw new Error('Không thể đọc tệp đã chọn.');
  const filename = cleanFileName(asset.name || asset.fileName || 'anh.jpg');
  const ext = '.' + filename.split('.').pop().toLowerCase();
  const mime = asset.mimeType || EXTENSIONS[ext] || '';
  if (!ALLOWED.has(mime)) throw new Error('Định dạng tệp không được mtunz hỗ trợ.');
  const bytes=Number(asset.size ?? asset.fileSize ?? new File(asset.uri).size ?? 0);
  if (bytes > attachmentLimit(mime)) {
    throw new Error('Tệp vượt quá '+(attachmentLimit(mime)/1024/1024)+' MB. Video MP4/WebM được giữ nguyên tệp tải lên.');
  }
  return { uri:asset.uri, name:filename, type:mime, size:bytes };
}

export async function chooseMedia() {
  const result = await ImagePicker.launchImageLibraryAsync({
    mediaTypes:['images','videos'], quality:0.75, allowsMultipleSelection:false,
  });
  return result.canceled ? null : selected(result.assets[0]);
}

export async function chooseMediaBatch() {
  const result=await ImagePicker.launchImageLibraryAsync({
    mediaTypes:['images','videos'],quality:0.75,allowsMultipleSelection:true,selectionLimit:8,
  });
  if(result.canceled)return null;
  if(result.assets.length>8)throw Error('Chỉ chọn tối đa 8 ảnh/video mỗi lần.');
  return result.assets.map(selected);
}

export async function chooseFile() {
  const result = await DocumentPicker.getDocumentAsync({copyToCacheDirectory:true,multiple:false});
  return result.canceled ? null : selected(result.assets[0]);
}

async function uploadLargeVideo(token,file,uploadKey,onProgress){
  const root='/api/video-uploads',source=new File(file.uri),size=source.size;
  if(!Number.isSafeInteger(size)||size<=0||size>MAX_LARGE_VIDEO_BYTES)throw Error('Dung lượng video không hợp lệ.');
  const config=await api(root+'/config',{token});
  if(!config.enabled)throw Error('Kho video lớn chưa kích hoạt. Hiện chỉ gửi video tối đa 16 MB.');
  const session=await api(root,{token,method:'POST',data:{client_key:uploadKey||Crypto.randomUUID(),name:file.name,mime:file.type,size}});
  if(session.attachment)return session.attachment;
  const done=new Set(session.completed_parts),step=session.part_bytes;
  if(step!==8*1024*1024||session.size!==size)throw Error('Phiên tải không hợp lệ.');
  for(let start=0,n=1;start<size;start+=step,n++){
    const end=Math.min(start+step,size);
    if(!done.has(n)){
      const signed=await api(root+'/'+session.upload_id+'/parts/'+n,{token,method:'POST'});
      if(signed.bytes!==end-start||!/^https:\/\/[a-f0-9]{32}\.r2\.cloudflarestorage\.com\//i.test(signed.url))throw Error('Liên kết tải không hợp lệ.');
      const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),180000);
      try{
        const response=await expoFetch(signed.url,{method:'PUT',body:source.slice(start,end),signal:controller.signal,redirect:'error'});
        if(!response.ok)throw Error('Không tải được phần video. Thử lại để tiếp tục.');
      }finally{clearTimeout(timer);}
    }
    onProgress?.(Math.min(99,Math.floor(end/size*100)));
  }
  const result=await api(root+'/'+session.upload_id+'/complete',{token,method:'POST',timeoutMs:120000});
  if(!result.attachment?.id)throw Error('Video chưa sẵn sàng.');
  return result.attachment;
}
export async function uploadAttachment(token,file,uploadKey,onProgress) {
  if (!token || !file) throw new Error('Không có phiên đăng nhập hoặc tệp.');
  if(!ALLOWED.has(file.type)||Number(file.size||0)>attachmentLimit(file.type))throw new ApiError('Tệp không hợp lệ hoặc vượt giới hạn dung lượng.',413);
  if(file.type.startsWith('video/')&&Math.max(Number(file.size||0),Number(new File(file.uri).size||0))>MAX_VIDEO_BYTES)return uploadLargeVideo(token,file,uploadKey,onProgress);
  const data = new FormData();
  data.append('file',{uri:file.uri,name:file.name,type:file.type});
  // The same ID as the chat send retry. A lost HTTP response must not upload
  // duplicate media or consume the per-user attachment quota twice.
  if(uploadKey)data.append('upload_key',uploadKey);
  let response;
  const controller=new AbortController();
  const timer=setTimeout(()=>controller.abort(),file.type.startsWith('video/')?180000:60000);
  try {
    response = await fetch(API_ORIGIN+'/api/uploads',{
      method:'POST',headers:{Authorization:'Bearer '+token},body:data,signal:controller.signal,
    });
  } catch {
    throw new ApiError('Không tải được tệp. Kiểm tra kết nối và thử lại, hệ thống sẽ chống tải trùng.',0);
  } finally{clearTimeout(timer);}
  const body = await response.json().catch(()=>({}));
  if (!response.ok) throw new ApiError(typeof body.detail==='string'?body.detail:'Không thể gửi tệp.',response.status);
  return body.attachment;
}

export function attachmentSource(attachment,token) {
  if (!attachment?.id || !token) return null;
  return {uri:API_ORIGIN+'/api/attachments/'+Number(attachment.id),
    headers:{Authorization:'Bearer '+token}};
}

export function avatarSource(path,token) {
  if (!path || !token || !/^\/api\/profile\/\d+\/(?:avatar|cover)$/.test(path)) return null;
  return {uri:API_ORIGIN+path,headers:{Authorization:'Bearer '+token}};
}


// Private files are fetched with the same revocable bearer token as chat.
// Media players receive only a local cache URI, never a public attachment URL.
export async function downloadSharedAttachment(attachment,token) {
  const id=Number(attachment?.id);
  if(!Number.isSafeInteger(id)||id<=0||!token)throw new Error('Tệp hoặc phiên đăng nhập không hợp lệ.');
  const safe=cleanFileName(attachment.name||('file-'+id));
  return withTemporaryMedia(token,id,safe,destination=>File.downloadFileAsync(API_ORIGIN+'/api/attachments/'+id,
    destination,{headers:{Authorization:'Bearer '+token},idempotent:false}));
}

export async function saveSharedFile(attachment,token) {
  const id=Number(attachment?.id);
  if(!Number.isSafeInteger(id)||id<=0||!token)throw Error('Tệp hoặc phiên đăng nhập không hợp lệ.');
  const safe=cleanFileName(attachment.name||('file-'+id));
  return withTemporaryMedia(token,id,safe,async (destination,assertCurrent)=>{
    const file=await File.downloadFileAsync(API_ORIGIN+'/api/attachments/'+id+'?download=1',
      destination,{headers:{Authorization:'Bearer '+token},idempotent:false});
    assertCurrent();
    if(await File.canPreview(file)){assertCurrent();await File.preview(file,{title:safe});}
    else if(await Sharing.isAvailableAsync()){assertCurrent();await Sharing.shareAsync(file.uri);}
    else throw Error('Thiết bị chưa có ứng dụng hỗ trợ mở tệp này.');
    return file;
  });
}

export async function copyChatText(value) {
  await Clipboard.setStringAsync(value || '');
}
