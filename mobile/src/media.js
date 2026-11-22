import * as ImagePicker from 'expo-image-picker';
import * as DocumentPicker from 'expo-document-picker';
import * as Sharing from 'expo-sharing';
import * as Notifications from 'expo-notifications';
import * as Device from 'expo-device';
import Constants from 'expo-constants';
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

export async function chooseFile() {
  const result = await DocumentPicker.getDocumentAsync({copyToCacheDirectory:true,multiple:false});
  return result.canceled ? null : selected(result.assets[0]);
}

export async function uploadAttachment(token,file) {
  if (!token || !file) throw new Error('Không có phiên đăng nhập hoặc tệp.');
  const data = new FormData();
  data.append('file',{uri:file.uri,name:file.name,type:file.type});
  let response;
  try {
    response = await fetch(API_ORIGIN+'/api/uploads',{
      method:'POST',headers:{Authorization:'Bearer '+token},body:data,
    });
  } catch { throw new ApiError('Không tải được tệp. Vui lòng kiểm tra kết nối.',0); }
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

export async function registerMobileNotifications(token) {
  if (!Device.isDevice) throw new Error('Thông báo đẩy cần thiết bị thật.');
  const projectId = Constants.easConfig?.projectId || Constants.expoConfig?.extra?.eas?.projectId;
  if (!projectId) throw new Error('Chưa cấu hình EAS projectId để nhận thông báo khi đóng ứng dụng.');
  const existing = await Notifications.getPermissionsAsync();
  let status=existing.status;
  if (status!=='granted') status=(await Notifications.requestPermissionsAsync()).status;
  if (status!=='granted') throw new Error('Bạn chưa cấp quyền thông báo.');
  await Notifications.setNotificationChannelAsync('messages',{
    name:'Tin nhắn mtunz',importance:Notifications.AndroidImportance.HIGH,
  });
  const expoToken=(await Notifications.getExpoPushTokenAsync({projectId})).data;
  await api('/api/mobile/push',{token,method:'POST',data:{token:expoToken}});
  return true;
}

export async function unregisterMobileNotifications(token) {
  await api('/api/mobile/push',{token,method:'DELETE'});
}
