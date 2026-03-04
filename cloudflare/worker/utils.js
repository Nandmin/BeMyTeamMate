import {
  MAX_FCM_TOKEN_LENGTH,
  MAX_MATCH_PLAYER_STAT,
  MIN_FCM_TOKEN_LENGTH,
} from './constants.js';

export function createHttpError(status, message) {
  const error = new Error(message);
  error.status = status;
  return error;
}

export function getHttpStatusFromError(error, fallback = 500) {
  const status = Number(error?.status);
  if (Number.isInteger(status) && status >= 100 && status <= 599) return status;
  return fallback;
}

export function isValidFirestoreDocId(value) {
  return typeof value === 'string' && /^[A-Za-z0-9_-]{1,128}$/.test(value);
}

export function toBoundedInt(value, min = 0, max = MAX_MATCH_PLAYER_STAT) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return min;
  const truncated = Math.trunc(numeric);
  if (truncated < min) return min;
  if (truncated > max) return max;
  return truncated;
}

export function parseFirestoreNumberValue(field, fallback = null) {
  if (!field || typeof field !== 'object') return fallback;
  const raw = field.integerValue ?? field.doubleValue;
  const numeric = Number(raw);
  return Number.isFinite(numeric) ? numeric : fallback;
}

export function parseFirestoreStringArray(field) {
  const values = field?.arrayValue?.values || [];
  const seen = new Set();
  const result = [];
  for (const value of values) {
    const userId = typeof value?.stringValue === 'string' ? value.stringValue.trim() : '';
    if (!userId || seen.has(userId)) continue;
    seen.add(userId);
    result.push(userId);
  }
  return result;
}

export function parseRatingSnapshotField(field) {
  const result = new Map();
  const fields = field?.mapValue?.fields || {};
  for (const [userId, ratingField] of Object.entries(fields)) {
    const rating = parseFirestoreNumberValue(ratingField, null);
    if (Number.isFinite(rating)) {
      result.set(userId, Math.round(rating));
    }
  }
  return result;
}

export function chunkArray(array, size) {
  const chunks = [];
  for (let i = 0; i < array.length; i += size) {
    chunks.push(array.slice(i, i + size));
  }
  return chunks;
}

export function isRelativeAppLink(link) {
  if (typeof link !== 'string') return false;
  const value = link.trim();
  if (!value) return false;
  if (!value.startsWith('/')) return false;
  if (value.startsWith('//')) return false;
  return !/^[a-zA-Z][a-zA-Z\d+.-]*:/.test(value);
}

export function base64UrlDecode(value) {
  const padded = value.replace(/-/g, '+').replace(/_/g, '/');
  const padLength = (4 - (padded.length % 4)) % 4;
  const pad = '='.repeat(padLength);
  return atob(padded + pad);
}

export function base64UrlToBytes(value) {
  const binary = base64UrlDecode(value);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

export function normalizeData(data) {
  const result = {};
  for (const [key, value] of Object.entries(data || {})) {
    if (value === undefined || value === null) continue;
    result[key] = String(value);
  }
  return result;
}

export function calculateDataPayloadSize(data) {
  return utf8ByteLength(JSON.stringify(normalizeData(data)));
}

export function utf8ByteLength(value) {
  return new TextEncoder().encode(String(value)).length;
}

export function isLikelyFcmToken(token) {
  if (!token) return false;
  if (token.length < MIN_FCM_TOKEN_LENGTH) return false;
  if (token.length > MAX_FCM_TOKEN_LENGTH) return false;
  if (/\s/.test(token)) return false;
  return true;
}

export function validateRecipientTokens(tokens) {
  const validTokens = [];
  let invalidCount = 0;
  for (const rawToken of Array.isArray(tokens) ? tokens : []) {
    const token = typeof rawToken === 'string' ? rawToken.trim() : '';
    if (!isLikelyFcmToken(token)) {
      invalidCount += 1;
      continue;
    }
    validTokens.push(token);
  }
  return {
    tokens: Array.from(new Set(validTokens)),
    invalidCount,
  };
}
