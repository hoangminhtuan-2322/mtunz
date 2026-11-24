import * as ImagePicker from 'expo-image-picker';
import * as DocumentPicker from 'expo-document-picker';
import * as Sharing from 'expo-sharing';
import { File, Paths } from 'expo-file-system';
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
const cleanFileName = value => String(value || 'attachment').replace(/[\/\\:\x00-\x1f]/g, '_').slice(0, 95);

function selected(asset) {
  if (!asset?.uri) throw new Error('Không thể đọc tệp đã chọn.');
  const filename = cleanFileName(asset.name || asset.fileName || 'anh.jpg');
  const ext = '.' + filename.split('.').pop().toLowerCase();
  const mime = asset.mimeType || EXTENSIONS[ext] || '';
  if (!ALLOWED.has(mime)) throw new Error('Định dạng tệp không được mtunz hỗ trợ.');
  if (Number(asset.size ?? asset.fileSize ?? 0) > MAX_FILE_BYTES) {
    throw new Error('Tệp vượt quá 2 MB của máy chủ hiện tại.');
  }
  return { uri:asset.uri, name:filename, type:mime, size:Number(asset.size || asset.fileSize || 0) };
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

export async function uploadAttachment(token,file,uploadKey) {
  if (!token || !file) throw new Error('Không có phiên đăng nhập hoặc tệp.');
  const data = new FormData();
  data.append('file',{uri:file.uri,name:file.name,type:file.type});
  // The same ID as the chat send retry. A lost HTTP response must not upload
  // duplicate media or consume the per-user attachment quota twice.
  if(uploadKey)data.append('upload_key',uploadKey);
  let response;
  const controller=new AbortController();
  const timer=setTimeout(()=>controller.abort(),60000);
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
  const destination=new File(Paths.cache,'mtunz-preview-'+id+'-'+safe);
  return File.downloadFileAsync(API_ORIGIN+'/api/attachments/'+id,
    destination,{headers:{Authorization:'Bearer '+token},idempotent:true});
}

export async function saveSharedFile(attachment,token) {
  if (!attachment?.id) throw new Error('Tệp không tồn tại.');
  const safe=cleanFileName(attachment.name || ('file-'+attachment.id));
  const destination = new File(Paths.cache,'mtunz-'+Number(attachment.id)+'-'+safe);
  const file = await File.downloadFileAsync(
    API_ORIGIN+'/api/attachments/'+Number(attachment.id)+'?download=1',
    destination,{headers:{Authorization:'Bearer '+token},idempotent:true},
  );
  if (await File.canPreview(file)) {
    await File.preview(file,{title:safe});
  } else if (await Sharing.isAvailableAsync()) {
    await Sharing.shareAsync(file.uri);
  } else {
    throw new Error('Thiết bị chưa có ứng dụng hỗ trợ mở tệp này.');
  }
}

export async function copyChatText(value) {
  await Clipboard.setStringAsync(value || '');
}
