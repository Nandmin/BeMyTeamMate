import { APP_CHECK_HEADER } from './constants.js';
import { base64UrlDecode, base64UrlToBytes } from './utils.js';

const FIREBASE_ID_JWKS_URL =
  'https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com';
const FIREBASE_APPCHECK_JWKS_URL = 'https://firebaseappcheck.googleapis.com/v1/jwks';
const JWKS_CACHE_TTL_MS = 60 * 60 * 1000;

class JwksCache {
  constructor(url, ttlMs = JWKS_CACHE_TTL_MS) {
    this.url = url;
    this.ttlMs = ttlMs;
    this.cache = { fetchedAt: 0, keys: null };
    this.inFlightRefresh = null;
  }

  async getKeys(options = {}) {
    const forceRefresh = options.forceRefresh === true;
    const now = Date.now();
    const hasFreshCache =
      this.cache.keys && !forceRefresh && now - this.cache.fetchedAt < this.ttlMs;

    if (hasFreshCache) {
      return this.cache.keys;
    }

    if (this.inFlightRefresh) {
      try {
        return await this.inFlightRefresh;
      } catch (error) {
        if (this.cache.keys) {
          console.warn('JWKS in-flight refresh failed, using stale cache:', error);
          return this.cache.keys;
        }
        throw error;
      }
    }

    this.inFlightRefresh = this.fetchAndStore(now);
    try {
      return await this.inFlightRefresh;
    } catch (error) {
      if (this.cache.keys) {
        console.warn('JWKS refresh failed, using stale cache:', error);
        return this.cache.keys;
      }
      throw error;
    } finally {
      this.inFlightRefresh = null;
    }
  }

  async getKeyByKid(kid) {
    const jwks = await this.getKeys();
    const found = jwks?.keys?.find((key) => key.kid === kid);
    if (found) {
      return found;
    }

    // Key rotation can happen while cache is still fresh, so retry once with forced refresh.
    const refreshed = await this.getKeys({ forceRefresh: true });
    return refreshed?.keys?.find((key) => key.kid === kid) || null;
  }

  async fetchAndStore(now) {
    const response = await fetch(this.url);
    if (!response.ok) {
      const detail = await response.text();
      throw new Error(`JWKS fetch failed: ${response.status} ${detail}`);
    }

    const jwks = await response.json();
    if (!jwks || !Array.isArray(jwks.keys)) {
      throw new Error('JWKS fetch returned invalid payload');
    }

    this.cache = { fetchedAt: now, keys: jwks };
    return jwks;
  }
}

const jwksCache = new JwksCache(FIREBASE_ID_JWKS_URL);
const appCheckJwksCache = new JwksCache(FIREBASE_APPCHECK_JWKS_URL);

export function verifyInternalAdminSecret(request, env) {
  const configuredSecret = typeof env.ADMIN_SECRET === 'string' ? env.ADMIN_SECRET.trim() : '';
  if (!configuredSecret) {
    return { authorized: false, error: 'Missing ADMIN_SECRET configuration' };
  }

  const headerSecret = request.headers.get('X-Admin-Secret');
  const receivedSecret = typeof headerSecret === 'string' ? headerSecret.trim() : '';
  if (!receivedSecret || receivedSecret !== configuredSecret) {
    return { authorized: false, error: 'Internal admin secret required' };
  }

  return { authorized: true };
}

/**
 * Verifies the request using Admin Secret or Firebase ID Token + App Check token
 */
export async function verifyAuth(request, env) {
  const authHeader = request.headers.get('Authorization');
  const adminSecretHeader = request.headers.get('X-Admin-Secret');

  // 1. Check Admin Secret (server-to-server or admin bypass)
  if (env.ADMIN_SECRET && adminSecretHeader === env.ADMIN_SECRET) {
    return { authorized: true, user: 'internal-admin', authType: 'admin-secret' };
  }

  // 2. Check Firebase ID Token + App Check token
  if (authHeader && authHeader.startsWith('Bearer ')) {
    const token = authHeader.split('Bearer ')[1];
    try {
      const projectId = env.FCM_PROJECT_ID || env.FIREBASE_PROJECT_ID;
      if (!projectId) {
        return { authorized: false, error: 'Missing project ID for token verification' };
      }

      const verified = await verifyFirebaseIdToken(token, projectId);
      if (!verified.ok) {
        return { authorized: false, error: verified.error };
      }

      const appCheckVerified = await verifyAppCheckHeader(request, env);
      if (!appCheckVerified.ok) {
        return { authorized: false, error: appCheckVerified.error };
      }

      const payload = verified.payload;
      return {
        authorized: true,
        user: payload.user_id || payload.sub,
        email: payload.email,
        name: typeof payload.name === 'string' ? payload.name : '',
        authType: 'firebase',
        appId: appCheckVerified.appId,
      };
    } catch (e) {
      console.error('Auth verification failed:', e);
      return { authorized: false, error: 'Token verification failed' };
    }
  }

  return { authorized: false, error: 'Missing or invalid authentication credentials' };
}

async function verifyAppCheckHeader(request, env) {
  const appCheckTokenHeader = request.headers.get(APP_CHECK_HEADER);
  const appCheckToken =
    typeof appCheckTokenHeader === 'string' ? appCheckTokenHeader.trim() : '';
  if (!appCheckToken) {
    return { ok: false, error: 'Missing App Check token' };
  }

  const projectNumberRaw = env.FIREBASE_PROJECT_NUMBER;
  const projectNumber =
    typeof projectNumberRaw === 'string' ? projectNumberRaw.trim() : String(projectNumberRaw || '');
  if (!projectNumber) {
    return { ok: false, error: 'Missing FIREBASE_PROJECT_NUMBER for App Check verification' };
  }

  const verified = await verifyAppCheckToken(appCheckToken, projectNumber);
  if (!verified.ok) {
    return { ok: false, error: verified.error };
  }

  return { ok: true, appId: verified.payload.sub };
}

async function verifyAppCheckToken(token, projectNumber) {
  const parts = token.split('.');
  if (parts.length !== 3) {
    return { ok: false, error: 'Invalid App Check token format' };
  }

  let header;
  let payload;
  try {
    header = JSON.parse(base64UrlDecode(parts[0]));
    payload = JSON.parse(base64UrlDecode(parts[1]));
  } catch {
    return { ok: false, error: 'Invalid App Check token encoding' };
  }

  if (header.alg !== 'RS256' || !header.kid) {
    return { ok: false, error: 'Unsupported App Check token header' };
  }

  const now = Math.floor(Date.now() / 1000);
  const clockSkew = 60;
  if (payload.exp && payload.exp < now - clockSkew) {
    return { ok: false, error: 'App Check token expired' };
  }
  if (payload.iat && payload.iat > now + clockSkew) {
    return { ok: false, error: 'App Check token issued in the future' };
  }
  if (payload.nbf && payload.nbf > now + clockSkew) {
    return { ok: false, error: 'App Check token not yet valid' };
  }

  const expectedIssuer = `https://firebaseappcheck.googleapis.com/${projectNumber}`;
  if (payload.iss !== expectedIssuer) {
    return { ok: false, error: 'App Check token issuer mismatch' };
  }

  const expectedAudience = `projects/${projectNumber}`;
  const audience = payload.aud;
  const hasExpectedAudience =
    (typeof audience === 'string' && audience === expectedAudience) ||
    (Array.isArray(audience) && audience.includes(expectedAudience));
  if (!hasExpectedAudience) {
    return { ok: false, error: 'App Check token audience mismatch' };
  }

  if (!payload.sub || typeof payload.sub !== 'string') {
    return { ok: false, error: 'App Check token subject missing' };
  }

  const jwk = await appCheckJwksCache.getKeyByKid(header.kid);
  if (!jwk) {
    return { ok: false, error: 'Unknown App Check key ID' };
  }

  try {
    const key = await crypto.subtle.importKey(
      'jwk',
      jwk,
      { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
      false,
      ['verify']
    );
    const data = new TextEncoder().encode(`${parts[0]}.${parts[1]}`);
    const signature = base64UrlToBytes(parts[2]);
    const ok = await crypto.subtle.verify('RSASSA-PKCS1-v1_5', key, signature, data);
    if (!ok) {
      return { ok: false, error: 'App Check token signature invalid' };
    }
  } catch (error) {
    console.error('App Check token verify error:', error);
    return { ok: false, error: 'App Check token verification failed' };
  }

  return { ok: true, payload };
}

async function verifyFirebaseIdToken(token, projectId) {
  const parts = token.split('.');
  if (parts.length !== 3) {
    return { ok: false, error: 'Invalid ID Token format' };
  }

  let header;
  let payload;
  try {
    header = JSON.parse(base64UrlDecode(parts[0]));
    payload = JSON.parse(base64UrlDecode(parts[1]));
  } catch {
    return { ok: false, error: 'Invalid ID Token encoding' };
  }

  if (header.alg !== 'RS256' || !header.kid) {
    return { ok: false, error: 'Unsupported ID Token header' };
  }

  const now = Math.floor(Date.now() / 1000);
  const clockSkew = 60;
  if (payload.exp && payload.exp < now - clockSkew) {
    return { ok: false, error: 'ID Token expired' };
  }
  if (payload.sub && typeof payload.sub !== 'string') {
    return { ok: false, error: 'ID Token subject invalid' };
  }
  if (payload.iat && payload.iat > now + clockSkew) {
    return { ok: false, error: 'ID Token issued in the future' };
  }
  if (payload.auth_time && payload.auth_time > now + clockSkew) {
    return { ok: false, error: 'ID Token auth_time in the future' };
  }
  if (payload.nbf && payload.nbf > now + clockSkew) {
    return { ok: false, error: 'ID Token not yet valid' };
  }

  const expectedIssuer = `https://securetoken.google.com/${projectId}`;
  if (payload.iss !== expectedIssuer) {
    return { ok: false, error: 'ID Token issuer mismatch' };
  }
  if (payload.aud !== projectId) {
    return { ok: false, error: 'ID Token audience mismatch' };
  }
  if (!payload.sub || typeof payload.sub !== 'string') {
    return { ok: false, error: 'ID Token subject missing' };
  }

  const jwk = await jwksCache.getKeyByKid(header.kid);
  if (!jwk) {
    return { ok: false, error: 'Unknown ID Token key ID' };
  }

  try {
    const key = await crypto.subtle.importKey(
      'jwk',
      jwk,
      { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
      false,
      ['verify']
    );
    const data = new TextEncoder().encode(`${parts[0]}.${parts[1]}`);
    const signature = base64UrlToBytes(parts[2]);
    const ok = await crypto.subtle.verify('RSASSA-PKCS1-v1_5', key, signature, data);
    if (!ok) {
      return { ok: false, error: 'ID Token signature invalid' };
    }
  } catch (error) {
    console.error('ID Token verify error:', error);
    return { ok: false, error: 'ID Token verification failed' };
  }

  return { ok: true, payload };
}
