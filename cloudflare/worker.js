const ALLOWED_METHODS = ['POST', 'OPTIONS'];

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    // Handle CORS preflight
    if (request.method === 'OPTIONS') {
      return new Response(null, {
        status: 204,
        headers: corsHeaders(),
      });
    }

    // Only allow specific endpoint
    if (url.pathname !== '/send-notification') {
      return jsonResponse({ error: 'Endpoint not found. Use /send-notification' }, 404);
    }

    if (!ALLOWED_METHODS.includes(request.method)) {
      return jsonResponse({ error: 'Method not allowed' }, 405);
    }

    // 1. Authentication Check
    const authResult = await verifyAuth(request, env);
    if (!authResult.authorized) {
      return jsonResponse({ error: 'Unauthorized', detail: authResult.error }, 401);
    }

    // 2. Rate Limiting (Basic)
    // Authenticated users are less likely to spam.
    // Ideally, use Cloudflare Rate Limiting feature in Dashboard.

    let body;
    try {
      body = await request.json();
    } catch {
      return jsonResponse({ error: 'Invalid JSON body' }, 400);
    }

    const tokens = Array.isArray(body.tokens) ? body.tokens.filter(Boolean) : [];
    if (tokens.length === 0) {
      return jsonResponse({ error: 'Missing recipients (tokens)' }, 400);
    }

    const notification = body.notification || {};
    const data = body.data || {};

    const projectId = env.FCM_PROJECT_ID;
    const clientEmail = env.FCM_CLIENT_EMAIL;
    const privateKey = normalizePrivateKey(env.FCM_PRIVATE_KEY);

    if (!projectId || !clientEmail || !privateKey) {
      console.error('Missing FCM Configuration in Secrets');
      return jsonResponse({ error: 'Server configuration error' }, 500);
    }

    // 3. Get FCM Refresh Token / Access Token
    let accessToken;
    try {
      accessToken = await getAccessToken(clientEmail, privateKey);
    } catch (error) {
      console.error('Token generation failed:', error);
      return jsonResponse(
        { error: 'Failed to obtain FCM access token', detail: String(error) },
        500
      );
    }

    // 4. Send Notifications
    const result = await sendToFcm(
      tokens,
      { title: notification.title, body: notification.body },
      data,
      accessToken,
      projectId
    );

    // Log the result (Cloudflare logs)
    return jsonResponse(
      {
        success: result.success,
        failure: result.failure,
        errors: result.errors,
      },
      result.failure > 0 ? 207 : 200
    );
  },
};

function corsHeaders() {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Admin-Secret',
  };
}

function jsonResponse(payload, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: {
      'Content-Type': 'application/json',
      ...corsHeaders(),
    },
  });
}

function normalizePrivateKey(value) {
  if (!value) return value;
  // Handle escaped newlines from env vars (common issue)
  return value.replace(/\\n/g, '\n').replace(/"/g, '');
}

/**
 * Verifies the request using Admin Secret or Firebase ID Token
 */
async function verifyAuth(request, env) {
  const authHeader = request.headers.get('Authorization');
  const adminSecretHeader = request.headers.get('X-Admin-Secret');

  // 1. Check Admin Secret (server-to-server or admin bypass)
  if (env.ADMIN_SECRET && adminSecretHeader === env.ADMIN_SECRET) {
    return { authorized: true, user: 'internal-admin' };
  }

  // 2. Check Firebase ID Token
  if (authHeader && authHeader.startsWith('Bearer ')) {
    const token = authHeader.split('Bearer ')[1];
    try {
      if (!env.FIREBASE_API_KEY) {
        return { authorized: false, error: 'Missing FIREBASE_API_KEY' };
      }

      const lookupUrl = `https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=${env.FIREBASE_API_KEY}`;
      const resp = await fetch(lookupUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ idToken: token }),
      });

      if (!resp.ok) {
        const errorText = await resp.text();
        return { authorized: false, error: `Invalid ID Token: ${errorText}` };
      }

      const payload = await resp.json();
      const user = Array.isArray(payload.users) ? payload.users[0] : null;
      if (!user || !user.localId) {
        return { authorized: false, error: 'Invalid ID Token: user not found' };
      }

      return { authorized: true, user: user.localId, email: user.email };
    } catch (e) {
      console.error('Auth verification failed:', e);
      return { authorized: false, error: 'Token verification failed' };
    }
  }

  return { authorized: false, error: 'Missing or invalid authentication credentials' };
}

async function sendToFcm(tokens, notification, data, accessToken, projectId) {
  let success = 0;
  let failure = 0;
  const errors = [];

  // Batch tokens in chunks to avoid hitting concurrency limits too hard
  const chunks = chunkArray(tokens, 10);
  
  for (const chunk of chunks) {
    const promises = chunk.map(token => sendSingleMessage(token, notification, data, accessToken, projectId));
    const results = await Promise.all(promises);
    
    results.forEach(res => {
      if (res.ok) {
        success++;
      } else {
        failure++;
        errors.push(res.error);
      }
    });
  }

  return { success, failure, errors };
}

async function sendSingleMessage(token, notification, data, accessToken, projectId) {
  const message = {
    message: {
      token,
      notification: {
        title: notification.title || 'Notification',
        body: notification.body || '',
      },
      data: normalizeData(data),
    },
  };

  try {
    const response = await fetch(
      `https://fcm.googleapis.com/v1/projects/${projectId}/messages:send`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(message),
      }
    );

    if (response.ok) {
      return { ok: true };
    } else {
      let detail = '';
      try {
        detail = await response.text();
      } catch { detail = 'Unknown error'; }
      
      console.error(`FCM Error: ${response.status} - ${detail}`);
      return { ok: false, error: { token, status: response.status, detail } };
    }
  } catch (err) {
    console.error(`Fetch Error: ${err}`);
    return { ok: false, error: { token, status: 0, detail: String(err) } };
  }
}

function normalizeData(data) {
  const result = {};
  for (const [key, value] of Object.entries(data || {})) {
    if (value === undefined || value === null) continue;
    result[key] = String(value);
  }
  return result;
}

function chunkArray(array, size) {
  const chunks = [];
  for (let i = 0; i < array.length; i += size) {
    chunks.push(array.slice(i, i + size));
  }
  return chunks;
}

async function getAccessToken(clientEmail, privateKey) {
  const now = Math.floor(Date.now() / 1000);
  const payload = {
    iss: clientEmail,
    scope: 'https://www.googleapis.com/auth/firebase.messaging',
    aud: 'https://oauth2.googleapis.com/token',
    iat: now,
    exp: now + 3600,
  };

  const jwt = await signJwt(payload, privateKey);
  const form = new URLSearchParams({
    grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
    assertion: jwt,
  });

  const response = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: form.toString(),
  });

  if (!response.ok) {
    const detail = await response.text();
    throw new Error(`Token request failed: ${detail}`);
  }

  const data = await response.json();
  return data.access_token;
}

async function signJwt(payload, privateKey) {
  const header = { alg: 'RS256', typ: 'JWT' };
  const encoder = new TextEncoder();
  const headerEncoded = base64UrlEncode(JSON.stringify(header));
  const payloadEncoded = base64UrlEncode(JSON.stringify(payload));
  const data = `${headerEncoded}.${payloadEncoded}`;
  const signature = await crypto.subtle.sign(
    'RSASSA-PKCS1-v1_5',
    await importPrivateKey(privateKey),
    encoder.encode(data)
  );
  const signatureEncoded = base64UrlEncode(signature);
  return `${data}.${signatureEncoded}`;
}

async function importPrivateKey(pem) {
  const cleaned = pem
    .replace(/-----BEGIN PRIVATE KEY-----/g, '')
    .replace(/-----END PRIVATE KEY-----/g, '')
    .replace(/\s+/g, '');
  const binary = Uint8Array.from(atob(cleaned), (c) => c.charCodeAt(0));
  return crypto.subtle.importKey(
    'pkcs8',
    binary.buffer,
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
    false,
    ['sign']
  );
}

function base64UrlEncode(input) {
  const bytes =
    input instanceof ArrayBuffer
      ? new Uint8Array(input)
      : input instanceof Uint8Array
        ? input
        : new TextEncoder().encode(input);
  let binary = '';
  bytes.forEach((b) => {
    binary += String.fromCharCode(b);
  });
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
