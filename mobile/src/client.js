import * as SecureStore from 'expo-secure-store';

export const API_ORIGIN = (process.env.EXPO_PUBLIC_API_URL || '').trim().replace(/\/+$/, '');
const STORE_KEY = 'mtunz-native-session-v1';

export class ApiError extends Error {
  constructor(message, status) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
  }
}

export async function api(path, { token = null, method = 'GET', data, signal } = {}) {
  if (!/^https:\/\/[^/]+$/.test(API_ORIGIN) && !(__DEV__ && /^http:\/\/[^/]+$/.test(API_ORIGIN))) {
    throw new ApiError('Chưa cấu hình EXPO_PUBLIC_API_URL hợp lệ (HTTPS).', 0);
  }
  const headers = { Accept: 'application/json' };
  if (data !== undefined) headers['Content-Type'] = 'application/json';
  if (token) headers.Authorization = 'Bearer ' + token;
  let res;
  try {
    res = await fetch(API_ORIGIN + path, {
      method, headers, body: data === undefined ? undefined : JSON.stringify(data), signal,
    });
  } catch {
    throw new ApiError('Không thể kết nối máy chủ. Hãy kiểm tra mạng và thử lại.', 0);
  }
  const payload = await res.json().catch(() => ({}));
  if (!res.ok) {
    const detail = payload.detail;
    const message = typeof detail === 'string' ? detail
      : (detail && typeof detail.message === 'string' ? detail.message : 'Yêu cầu thất bại.');
    throw new ApiError(message, res.status);
  }
  return payload;
}

export async function saveSession(token) {
  await SecureStore.setItemAsync(STORE_KEY, JSON.stringify({ origin: API_ORIGIN, token }), {
    keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
  });
}

export async function readSession() {
  const raw = await SecureStore.getItemAsync(STORE_KEY);
  if (!raw) return null;
  try {
    const saved = JSON.parse(raw);
    return saved.origin === API_ORIGIN && /^[A-Za-z0-9_-]{30,128}$/.test(saved.token)
      ? saved.token : null;
  } catch {
    return null;
  }
}

export async function clearSession() {
  await SecureStore.deleteItemAsync(STORE_KEY);
}

export function wsUrl() {
  return API_ORIGIN.replace(/^http/, 'ws') + '/ws';
}

const SIGNUP_KEY = 'mtunz-native-registration-v1';

export async function savePendingRegistration(registration) {
  await SecureStore.setItemAsync(SIGNUP_KEY,JSON.stringify({
    origin:API_ORIGIN,username:registration.username,token:registration.token,
  }),{keychainAccessible:SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY});
}
export async function readPendingRegistration() {
  const raw=await SecureStore.getItemAsync(SIGNUP_KEY);
  if(!raw)return null;
  try{
    const saved=JSON.parse(raw);
    return saved.origin===API_ORIGIN&&/^[A-Za-z0-9_-]{30,128}$/.test(saved.token)?saved:null;
  }catch{return null;}
}
export async function clearPendingRegistration() {
  await SecureStore.deleteItemAsync(SIGNUP_KEY);
}
