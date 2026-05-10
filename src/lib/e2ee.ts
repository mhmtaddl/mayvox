import { getAuthToken } from './authClient';
import { getOrCreateDeviceId } from './deviceId';

const API_BASE = import.meta.env.VITE_SERVER_API_URL || '';
const PRIVATE_KEY_STORAGE = 'mayvox:e2ee:p256:private';
const PUBLIC_KEY_STORAGE = 'mayvox:e2ee:p256:public';
const ENVELOPE_PREFIX = 'mayvox:e2ee:v1:';
const encoder = new TextEncoder();
const decoder = new TextDecoder();

export interface E2eeDeviceKey {
  userId: string;
  deviceId: string;
  publicKey: JsonWebKey;
  updatedAt: string;
  lastSeenAt: string;
}

async function authHeaders(): Promise<Record<string, string>> {
  const token = getAuthToken();
  return token
    ? { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }
    : { 'Content-Type': 'application/json' };
}

function canUseCrypto(): boolean {
  return typeof crypto !== 'undefined' && !!crypto.subtle;
}

async function ensureDeviceKeyPair(): Promise<{ privateKey: CryptoKey; publicKey: JsonWebKey }> {
  if (!canUseCrypto()) throw new Error('Bu cihaz E2EE desteklemiyor');

  const privateJwk = localStorage.getItem(PRIVATE_KEY_STORAGE);
  const publicJwk = localStorage.getItem(PUBLIC_KEY_STORAGE);
  if (privateJwk && publicJwk) {
    const privateKey = await crypto.subtle.importKey(
      'jwk',
      JSON.parse(privateJwk),
      { name: 'ECDH', namedCurve: 'P-256' },
      false,
      ['deriveBits'],
    );
    return { privateKey, publicKey: JSON.parse(publicJwk) };
  }

  const pair = await crypto.subtle.generateKey(
    { name: 'ECDH', namedCurve: 'P-256' },
    true,
    ['deriveBits'],
  );
  const exportedPrivate = await crypto.subtle.exportKey('jwk', pair.privateKey);
  const exportedPublic = await crypto.subtle.exportKey('jwk', pair.publicKey);
  localStorage.setItem(PRIVATE_KEY_STORAGE, JSON.stringify(exportedPrivate));
  localStorage.setItem(PUBLIC_KEY_STORAGE, JSON.stringify(exportedPublic));
  return { privateKey: pair.privateKey, publicKey: exportedPublic };
}

export async function registerE2eeDeviceKey(): Promise<void> {
  if (!API_BASE || !canUseCrypto()) return;
  const { publicKey } = await ensureDeviceKeyPair();
  const res = await fetch(`${API_BASE}/e2ee/device-key`, {
    method: 'PUT',
    headers: await authHeaders(),
    body: JSON.stringify({ deviceId: getOrCreateDeviceId(), publicKey }),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || 'E2EE cihaz anahtarı kaydedilemedi');
  }
}

export async function listE2eeDeviceKeys(userIds: string[]): Promise<E2eeDeviceKey[]> {
  if (!API_BASE || userIds.length === 0) return [];
  const ids = [...new Set(userIds.filter(Boolean))];
  const res = await fetch(`${API_BASE}/e2ee/device-keys?userIds=${encodeURIComponent(ids.join(','))}`, {
    headers: await authHeaders(),
  });
  if (!res.ok) return [];
  const body = await res.json().catch(() => ({}));
  return Array.isArray(body.devices) ? body.devices : [];
}

export function isE2eeSupported(): boolean {
  return canUseCrypto();
}

function bytesToBase64Url(bytes: Uint8Array): string {
  let binary = '';
  bytes.forEach(byte => { binary += String.fromCharCode(byte); });
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

function base64UrlToBytes(value: string): Uint8Array {
  const normalized = value.replace(/-/g, '+').replace(/_/g, '/');
  const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, '=');
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

async function deriveWrapKey(privateKey: CryptoKey, publicKeyJwk: JsonWebKey, info: string, usages: KeyUsage[]): Promise<CryptoKey> {
  const publicKey = await crypto.subtle.importKey(
    'jwk',
    publicKeyJwk,
    { name: 'ECDH', namedCurve: 'P-256' },
    false,
    [],
  );
  const bits = await crypto.subtle.deriveBits({ name: 'ECDH', public: publicKey }, privateKey, 256);
  const material = await crypto.subtle.importKey('raw', bits, 'HKDF', false, ['deriveKey']);
  return crypto.subtle.deriveKey(
    {
      name: 'HKDF',
      hash: 'SHA-256',
      salt: encoder.encode('mayvox-e2ee-v1'),
      info: encoder.encode(info),
    },
    material,
    { name: 'AES-GCM', length: 256 },
    false,
    usages,
  );
}

export function isE2eeEnvelope(text: string): boolean {
  return typeof text === 'string' && text.startsWith(ENVELOPE_PREFIX);
}

export async function encryptTextForUsers(plainText: string, userIds: string[]): Promise<string> {
  const cleanText = plainText.trim();
  if (!cleanText) return plainText;
  const { privateKey, publicKey } = await ensureDeviceKeyPair();
  const currentDeviceId = getOrCreateDeviceId();
  const devices = await listE2eeDeviceKeys(userIds);
  const allDevices = [...devices];
  if (!allDevices.some(device => device.deviceId === currentDeviceId)) {
    allDevices.push({
      userId: userIds[0] || 'self',
      deviceId: currentDeviceId,
      publicKey,
      updatedAt: new Date().toISOString(),
      lastSeenAt: new Date().toISOString(),
    });
  }

  const messageKeyBytes = crypto.getRandomValues(new Uint8Array(32));
  const messageKey = await crypto.subtle.importKey('raw', messageKeyBytes, 'AES-GCM', false, ['encrypt', 'decrypt']);
  const messageIv = crypto.getRandomValues(new Uint8Array(12));
  const cipher = await crypto.subtle.encrypt({ name: 'AES-GCM', iv: messageIv }, messageKey, encoder.encode(cleanText));

  const keys = await Promise.all(allDevices.map(async device => {
    const wrapIv = crypto.getRandomValues(new Uint8Array(12));
    const wrapKey = await deriveWrapKey(privateKey, device.publicKey, `wrap:${device.userId}:${device.deviceId}`, ['encrypt']);
    const wrapped = await crypto.subtle.encrypt({ name: 'AES-GCM', iv: wrapIv }, wrapKey, messageKeyBytes);
    return {
      userId: device.userId,
      deviceId: device.deviceId,
      iv: bytesToBase64Url(wrapIv),
      data: bytesToBase64Url(new Uint8Array(wrapped)),
    };
  }));

  return ENVELOPE_PREFIX + bytesToBase64Url(encoder.encode(JSON.stringify({
    v: 1,
    alg: 'ECDH-P256+HKDF-SHA256+AES-GCM',
    senderDeviceId: currentDeviceId,
    senderPublicKey: publicKey,
    iv: bytesToBase64Url(messageIv),
    data: bytesToBase64Url(new Uint8Array(cipher)),
    keys,
  })));
}

export async function decryptTextIfNeeded(text: string): Promise<{ text: string; encrypted: boolean; decryptable: boolean }> {
  if (!isE2eeEnvelope(text)) return { text, encrypted: false, decryptable: true };
  try {
    const envelope = JSON.parse(decoder.decode(base64UrlToBytes(text.slice(ENVELOPE_PREFIX.length)))) as {
      senderPublicKey?: JsonWebKey;
      iv?: string;
      data?: string;
      keys?: Array<{ deviceId?: string; userId?: string; iv?: string; data?: string }>;
    };
    const { privateKey } = await ensureDeviceKeyPair();
    const currentDeviceId = getOrCreateDeviceId();
    const keyEntry = envelope.keys?.find(key => key.deviceId === currentDeviceId);
    if (!keyEntry?.iv || !keyEntry.data || !keyEntry.userId || !envelope.senderPublicKey || !envelope.iv || !envelope.data) {
      return { text: 'Bu şifreli mesaj bu cihazda açılamıyor.', encrypted: true, decryptable: false };
    }
    const wrapKey = await deriveWrapKey(privateKey, envelope.senderPublicKey, `wrap:${keyEntry.userId}:${currentDeviceId}`, ['decrypt']);
    const rawMessageKey = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: base64UrlToBytes(keyEntry.iv) },
      wrapKey,
      base64UrlToBytes(keyEntry.data),
    );
    const messageKey = await crypto.subtle.importKey('raw', rawMessageKey, 'AES-GCM', false, ['decrypt']);
    const plain = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: base64UrlToBytes(envelope.iv) },
      messageKey,
      base64UrlToBytes(envelope.data),
    );
    return { text: decoder.decode(plain), encrypted: true, decryptable: true };
  } catch {
    return { text: 'Bu şifreli mesaj çözülemedi.', encrypted: true, decryptable: false };
  }
}
