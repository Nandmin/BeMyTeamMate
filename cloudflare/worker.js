const ALLOWED_METHODS = ['POST', 'OPTIONS'];

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (url.pathname !== '/send-notification') {
      return jsonResponse({ error: 'Not found' }, 404);
    }

    if (!ALLOWED_METHODS.includes(request.method)) {
      return jsonResponse({ error: 'Method not allowed' }, 405);
    }

    if (request.method === 'OPTIONS') {
      return new Response(null, {
        status: 204,
        headers: corsHeaders(),
      });
    }

    let body;
    try {
      body = await request.json();
    } catch {
      return jsonResponse({ error: 'Invalid JSON body' }, 400);
    }

    const tokens = Array.isArray(body.tokens) ? body.tokens.filter(Boolean) : [];
    if (tokens.length === 0) {
      return jsonResponse({ error: 'Missing tokens' }, 400);
    }

    const notification = body.notification || {};
    const data = body.data || {};

    const projectId = env.FCM_PROJECT_ID;
    const clientEmail = env.FCM_CLIENT_EMAIL;
    const privateKey = normalizePrivateKey(env.FCM_PRIVATE_KEY);

    if (!projectId || !clientEmail || !privateKey) {
      return jsonResponse({ error: 'Missing FCM credentials' }, 500);
    }

    let accessToken;
    try {
      accessToken = await getAccessToken(clientEmail, privateKey);
    } catch (error) {
      return jsonResponse(
        { error: 'Failed to obtain access token', detail: error?.message || String(error) },
        500
      );
    }

    const result = await sendToFcm(
      tokens,
      { title: notification.title, body: notification.body },
      data,
      accessToken,
      projectId
    );

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
    'Access-Control-Allow-Headers': 'Content-Type',
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
  return value.replace(/\\n/g, '\n');
}

async function sendToFcm(tokens, notification, data, accessToken, projectId) {
  let success = 0;
  let failure = 0;
  const errors = [];

  for (const token of tokens) {
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
      success += 1;
    } else {
      failure += 1;
      let detail = '';
      try {
        detail = await response.text();
      } catch {
        detail = 'Unknown error';
      }
      errors.push({ token, status: response.status, detail });
    }
  }

  return { success, failure, errors };
}

function normalizeData(data) {
  const result = {};
  for (const [key, value] of Object.entries(data || {})) {
    if (value === undefined || value === null) continue;
    result[key] = String(value);
  }
  return result;
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
    .replace('-----BEGIN PRIVATE KEY-----', '')
    .replace('-----END PRIVATE KEY-----', '')
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
