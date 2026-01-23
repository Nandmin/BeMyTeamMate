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

    if (!ALLOWED_METHODS.includes(request.method)) {
      return jsonResponse({ error: 'Method not allowed' }, 405);
    }

    if (url.pathname === '/send-notification') {
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
      accessToken = await getAccessToken(
        clientEmail,
        privateKey,
        'https://www.googleapis.com/auth/firebase.messaging'
      );
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
    }

    if (url.pathname === '/contact-message') {
      return handleContactMessage(request, env);
    }

    return jsonResponse({ error: 'Endpoint not found' }, 404);
  },
  async scheduled(event, env, ctx) {
    console.log('MVP cron triggered', { scheduledTime: event.scheduledTime });
    ctx.waitUntil(handleMvpCron(env));
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

async function handleContactMessage(request, env) {
  let body;
  try {
    body = await request.json();
  } catch {
    return jsonResponse({ error: 'Invalid JSON body' }, 400);
  }

  const honeypot = typeof body.honeypot === 'string' ? body.honeypot.trim() : '';
  if (honeypot) {
    return jsonResponse({ ok: true }, 200);
  }

  const message = typeof body.message === 'string' ? body.message.trim() : '';
  if (!message || message.length < 10 || message.length > 2000) {
    return jsonResponse({ error: 'Invalid message length' }, 400);
  }

  const contactEmail = typeof body.contactEmail === 'string' ? body.contactEmail.trim() : '';
  if (contactEmail && !isValidEmail(contactEmail)) {
    return jsonResponse({ error: 'Invalid email' }, 400);
  }

  const token = typeof body.turnstileToken === 'string' ? body.turnstileToken.trim() : '';
  if (!token) {
    return jsonResponse({ error: 'Missing captcha token' }, 400);
  }

  if (!env.TURNSTILE_SECRET_KEY) {
    return jsonResponse({ error: 'Turnstile secret missing' }, 500);
  }

  const turnstileOk = await verifyTurnstileToken(token, request, env.TURNSTILE_SECRET_KEY);
  if (!turnstileOk) {
    return jsonResponse({ error: 'Captcha verification failed' }, 403);
  }

  const rateLimited = await applyContactRateLimit(request, env);
  if (rateLimited) {
    return jsonResponse({ error: 'Rate limited' }, 429);
  }

  const projectId = env.FCM_PROJECT_ID;
  const clientEmail = env.FCM_CLIENT_EMAIL;
  const privateKey = normalizePrivateKey(env.FCM_PRIVATE_KEY);

  if (!projectId || !clientEmail || !privateKey) {
    console.error('Missing Firestore configuration in secrets');
    return jsonResponse({ error: 'Server configuration error' }, 500);
  }

  let accessToken;
  try {
    accessToken = await getAccessToken(
      clientEmail,
      privateKey,
      'https://www.googleapis.com/auth/datastore'
    );
  } catch (error) {
    console.error('Firestore token generation failed:', error);
    return jsonResponse({ error: 'Failed to obtain Firestore access token' }, 500);
  }

  const user = body.user && typeof body.user === 'object' ? body.user : null;
  const userId = typeof user?.uid === 'string' ? user.uid : '';
  const userEmail = typeof user?.email === 'string' ? user.email : '';
  const userName = typeof user?.displayName === 'string' ? user.displayName : '';

  const nowIso = new Date().toISOString();
  const fields = {
    message: { stringValue: message },
    createdAt: { timestampValue: nowIso },
    source: { stringValue: 'contact-page' },
  };

  if (contactEmail) fields.contactEmail = { stringValue: contactEmail };
  if (userId) fields.userId = { stringValue: userId };
  if (userEmail) fields.userEmail = { stringValue: userEmail };
  if (userName) fields.userName = { stringValue: userName };

  const userAgent = request.headers.get('User-Agent');
  if (userAgent) fields.userAgent = { stringValue: userAgent };

  try {
    await createFirestoreDocument(projectId, accessToken, 'contactMessages', fields);
  } catch (error) {
    console.error('Failed to write contact message:', error);
    return jsonResponse({ error: 'Failed to store message' }, 500);
  }

  try {
    // Contact push disabled for now. Uncomment to re-enable.
    /*
    const adminTokens = await fetchSiteAdminTokens(projectId, accessToken);
    console.log('Contact admin tokens found:', adminTokens.length);
    if (adminTokens.length > 0) {
      const messagingToken = await getAccessToken(
        clientEmail,
        privateKey,
        'https://www.googleapis.com/auth/firebase.messaging'
      );
      const title = 'Uj kapcsolat uzenet';
      const body = contactEmail ? `${contactEmail}: ${message}` : message;
      const pushResult = await sendToFcm(
        adminTokens,
        { title, body },
        { type: 'contact_message' },
        messagingToken,
        projectId
      );
      console.log('Contact push result:', pushResult);
    } else {
      console.log('No siteadmin tokens found for contact push');
    }
    */
  } catch (error) {
    console.error('Failed to notify site admins:', error);
  }

  return jsonResponse({ ok: true }, 200);
}

async function verifyTurnstileToken(token, request, secret) {
  const ip = getClientIp(request);
  const form = new URLSearchParams();
  form.set('secret', secret);
  form.set('response', token);
  if (ip) {
    form.set('remoteip', ip);
  }

  try {
    const response = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: form.toString(),
    });

    if (!response.ok) {
      console.error('Turnstile verify failed:', response.status);
      return false;
    }

    const data = await response.json();
    return Boolean(data.success);
  } catch (error) {
    console.error('Turnstile verify error:', error);
    return false;
  }
}

async function applyContactRateLimit(request, env) {
  const kv = env.CONTACT_RATE_LIMIT;
  if (!kv) return false;
  const ip = getClientIp(request);
  if (!ip) return false;
  const key = `contact:${ip}`;
  const existing = await kv.get(key);
  if (existing) return true;
  await kv.put(key, '1', { expirationTtl: 60 });
  return false;
}

function getClientIp(request) {
  const header = request.headers.get('CF-Connecting-IP');
  if (header) return header;
  const forwarded = request.headers.get('X-Forwarded-For');
  if (!forwarded) return '';
  return forwarded.split(',')[0].trim();
}

function isValidEmail(value) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

async function createFirestoreDocument(projectId, accessToken, collection, fields) {
  const url = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents/${collection}`;
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ fields }),
  });

  if (!response.ok) {
    const detail = await response.text();
    throw new Error(`Firestore write failed: ${response.status} ${detail}`);
  }
}

async function fetchSiteAdminTokens(projectId, accessToken) {
  const url = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents:runQuery`;
  const body = {
    structuredQuery: {
      from: [{ collectionId: 'users' }],
      where: {
        fieldFilter: {
          field: { fieldPath: 'role' },
          op: 'EQUAL',
          value: { stringValue: 'siteadmin' },
        },
      },
    },
  };

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const detail = await response.text();
    throw new Error(`Firestore query failed: ${response.status} ${detail}`);
  }

  const data = await response.json();
  const tokens = [];
  for (const row of data || []) {
    const doc = row?.document;
    if (!doc?.fields?.fcmTokens?.arrayValue?.values) continue;
    for (const value of doc.fields.fcmTokens.arrayValue.values) {
      if (value?.stringValue) tokens.push(value.stringValue);
    }
  }

  return Array.from(new Set(tokens));
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

async function getAccessToken(clientEmail, privateKey, scope) {
  const now = Math.floor(Date.now() / 1000);
  const payload = {
    iss: clientEmail,
    scope,
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

async function handleMvpCron(env) {
  console.log('MVP cron start');
  const startedAt = Date.now();
  if (!shouldRunBudapestCron(new Date())) {
    console.log('MVP cron skipped: not 00:30 in Europe/Budapest');
    return;
  }

  const projectId = env.FCM_PROJECT_ID;
  const clientEmail = env.FCM_CLIENT_EMAIL;
  const privateKey = normalizePrivateKey(env.FCM_PRIVATE_KEY);

  if (!projectId || !clientEmail || !privateKey) {
    console.error('Missing Firestore configuration in secrets');
    return;
  }

  let accessToken;
  try {
    accessToken = await getAccessToken(
      clientEmail,
      privateKey,
      'https://www.googleapis.com/auth/datastore'
    );
  } catch (error) {
    console.error('Firestore token generation failed:', error);
    return;
  }

  const cutoff = getBudapestStartOfTodayUtc();
  const cutoffIso = cutoff.toISOString();
  console.log('MVP cron cutoff', { cutoffIso });

  const groupIds = await fetchAllGroupIds(projectId, accessToken);
  console.log('MVP cron groups found', { count: groupIds.length });
  let totalEvents = 0;
  let totalFinalized = 0;
  for (const groupId of groupIds) {
    try {
      const events = await fetchEligibleMvpEvents(projectId, accessToken, groupId, cutoffIso);
      if (events.length > 0) {
        console.log('MVP cron events found', { groupId, count: events.length });
      }
      totalEvents += events.length;
      for (const eventDoc of events) {
        await finalizeMvpEvent(projectId, accessToken, groupId, eventDoc);
        totalFinalized += 1;
      }
    } catch (error) {
      console.error(`MVP cron failed for group ${groupId}:`, error);
    }
  }

  const durationMs = Date.now() - startedAt;
  if (totalEvents === 0) {
    console.log('MVP cron finished with no operations', { durationMs });
  } else {
    console.log('MVP cron finished', { totalEvents, totalFinalized, durationMs });
  }

  console.log('MVP cron done');
}

function shouldRunBudapestCron(now) {
  const parts = getZonedParts(now, 'Europe/Budapest');
  return parts.hour === 0 && parts.minute === 30;
}

function getBudapestStartOfTodayUtc() {
  const now = new Date();
  const parts = getZonedParts(now, 'Europe/Budapest');
  return getUtcDateForZonedDate(parts.year, parts.month, parts.day, 0, 0, 0, 'Europe/Budapest');
}

function getZonedParts(date, timeZone) {
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hour12: false,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
  const parts = formatter.formatToParts(date);
  const lookup = (type) => Number(parts.find((p) => p.type === type)?.value || 0);
  return {
    year: lookup('year'),
    month: lookup('month'),
    day: lookup('day'),
    hour: lookup('hour'),
    minute: lookup('minute'),
    second: lookup('second'),
  };
}

function getUtcDateForZonedDate(year, month, day, hour, minute, second, timeZone) {
  const utcGuess = new Date(Date.UTC(year, month - 1, day, hour, minute, second, 0));
  const offsetMs = getTimeZoneOffsetMs(utcGuess, timeZone);
  return new Date(utcGuess.getTime() - offsetMs);
}

function getTimeZoneOffsetMs(date, timeZone) {
  const parts = getZonedParts(date, timeZone);
  const asIfUtc = Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute, parts.second);
  return asIfUtc - date.getTime();
}

async function fetchAllGroupIds(projectId, accessToken) {
  const ids = [];
  let pageToken = '';
  do {
    const url = new URL(
      `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents/groups`
    );
    url.searchParams.set('pageSize', '200');
    if (pageToken) url.searchParams.set('pageToken', pageToken);

    const response = await fetch(url.toString(), {
      headers: { Authorization: `Bearer ${accessToken}` },
    });

    if (!response.ok) {
      const detail = await response.text();
      throw new Error(`Groups fetch failed: ${response.status} ${detail}`);
    }

    const data = await response.json();
    const docs = data.documents || [];
    for (const doc of docs) {
      const id = doc.name?.split('/').pop();
      if (id) ids.push(id);
    }

    pageToken = data.nextPageToken || '';
  } while (pageToken);

  return ids;
}

async function fetchEligibleMvpEvents(projectId, accessToken, groupId, cutoffIso) {
  const url = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents:runQuery`;
  const body = {
    structuredQuery: {
      from: [{ collectionId: 'events' }],
      where: {
        compositeFilter: {
          op: 'AND',
          filters: [
            {
              fieldFilter: {
                field: { fieldPath: 'mvpVotingEnabled' },
                op: 'EQUAL',
                value: { booleanValue: true },
              },
            },
            {
              fieldFilter: {
                field: { fieldPath: 'status' },
                op: 'EQUAL',
                value: { stringValue: 'finished' },
              },
            },
            {
              fieldFilter: {
                field: { fieldPath: 'date' },
                op: 'LESS_THAN',
                value: { timestampValue: cutoffIso },
              },
            },
          ],
        },
      },
      orderBy: [{ field: { fieldPath: 'date' }, direction: 'DESCENDING' }],
    },
    parent: `projects/${projectId}/databases/(default)/documents/groups/${groupId}`,
  };

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const detail = await response.text();
    throw new Error(`Events query failed: ${response.status} ${detail}`);
  }

  const data = await response.json();
  const events = [];
  for (const row of data || []) {
    const doc = row?.document;
    if (!doc) continue;
    const fields = doc.fields || {};
    if (fields.mvpEloAwarded?.booleanValue) continue;
    events.push(doc);
  }
  return events;
}

async function finalizeMvpEvent(projectId, accessToken, groupId, eventDoc) {
  const eventId = eventDoc.name?.split('/').pop() || 'unknown';
  const fields = eventDoc.fields || {};
  const votes = fields.mvpVotes?.mapValue?.fields || {};

  const tally = new Map();
  for (const value of Object.values(votes)) {
    const votedFor = value?.stringValue;
    if (!votedFor) continue;
    tally.set(votedFor, (tally.get(votedFor) || 0) + 1);
  }

  let winnerId = null;
  let topVotes = 0;
  let tie = false;
  for (const [playerId, count] of tally.entries()) {
    if (count > topVotes) {
      topVotes = count;
      winnerId = playerId;
      tie = false;
    } else if (count === topVotes && count > 0) {
      tie = true;
    }
  }
  if (tie) winnerId = null;
  console.log('MVP cron winner computed', { groupId, eventId, winnerId, topVotes, tie });

  const writes = [
    {
      update: {
        name: eventDoc.name,
        fields: {
          mvpWinnerId: winnerId ? { stringValue: winnerId } : { nullValue: null },
          mvpEloAwarded: { booleanValue: true },
        },
      },
      updateMask: { fieldPaths: ['mvpWinnerId', 'mvpEloAwarded'] },
    },
  ];

  if (winnerId) {
    const userDocName = `projects/${projectId}/databases/(default)/documents/users/${winnerId}`;
    writes.push({
      update: { name: userDocName, fields: {} },
      updateTransforms: [{ fieldPath: 'elo', increment: { integerValue: '5' } }],
    });

    const memberDoc = await findGroupMemberDoc(projectId, accessToken, groupId, winnerId);
    if (memberDoc) {
      writes.push({
        update: { name: memberDoc, fields: {} },
        updateTransforms: [{ fieldPath: 'elo', increment: { integerValue: '5' } }],
      });
    }
  }

  await commitWrites(projectId, accessToken, writes);
}

async function findGroupMemberDoc(projectId, accessToken, groupId, userId) {
  const url = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents:runQuery`;
  const body = {
    structuredQuery: {
      from: [{ collectionId: 'members' }],
      where: {
        fieldFilter: {
          field: { fieldPath: 'userId' },
          op: 'EQUAL',
          value: { stringValue: userId },
        },
      },
      limit: 1,
    },
    parent: `projects/${projectId}/databases/(default)/documents/groups/${groupId}`,
  };

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const detail = await response.text();
    throw new Error(`Member query failed: ${response.status} ${detail}`);
  }

  const data = await response.json();
  for (const row of data || []) {
    if (row?.document?.name) return row.document.name;
  }
  return null;
}

async function commitWrites(projectId, accessToken, writes) {
  const url = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents:commit`;
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ writes }),
  });

  if (!response.ok) {
    const detail = await response.text();
    throw new Error(`Commit failed: ${response.status} ${detail}`);
  }
}
