import { RateLimiter, RateLimitExceededError } from './rate-limiter.js';

const ALLOWED_METHODS = ['POST', 'OPTIONS'];
const MAX_TARGET_USER_IDS = 200;
const MAX_RECIPIENT_TOKENS = 500;
const MAX_TITLE_LENGTH = 100;
const MAX_BODY_LENGTH = 500;
const MAX_LINK_LENGTH = 500;
const MAX_DATA_SIZE_BYTES = 4096;
const MIN_FCM_TOKEN_LENGTH = 100;
const MAX_FCM_TOKEN_LENGTH = 4096;
const APP_CHECK_HEADER = 'X-Firebase-AppCheck';
const rateLimiter = new RateLimiter();

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    // Handle CORS preflight
    if (request.method === 'OPTIONS') {
      return new Response(null, {
        status: 204,
        headers: corsHeaders(request, env),
      });
    }

    if (!ALLOWED_METHODS.includes(request.method)) {
      return jsonResponse(request, env, { error: 'Method not allowed' }, 405);
    }

    if (url.pathname === '/send-notification') {
      // 1. Authentication Check
      const authResult = await verifyAuth(request, env);
      if (!authResult.authorized) {
        return jsonResponse(request, env, { error: 'Unauthorized', detail: authResult.error }, 401);
      }
      if (authResult.authType !== 'firebase' || !authResult.user) {
        return jsonResponse(
          request,
          env,
          { error: 'Firebase ID token required for this endpoint' },
          401
        );
      }

      // 2. Rate limiting by client IP and authenticated user.
      try {
        await rateLimiter.checkGlobal(env, 'send-notification');
        await rateLimiter.check(request, env, authResult.user);
      } catch (error) {
        if (error instanceof RateLimitExceededError) {
          return jsonResponse(request, env,
            {
              error: 'Rate limit exceeded',
              message: error.message,
              retryAfter: error.retryAfter,
            },
            429
          );
        }
        console.error('Rate limiter failed:', error);
      }

      const parsedBody = await readJsonBody(request);
      if (!parsedBody.ok) {
        return jsonResponse(request, env, { error: parsedBody.error }, 400);
      }
      const body = parsedBody.data || {};
      if (
        Object.prototype.hasOwnProperty.call(body, 'tokens') ||
        Object.prototype.hasOwnProperty.call(body, 'userIds') ||
        Object.prototype.hasOwnProperty.call(body, 'notification') ||
        Object.prototype.hasOwnProperty.call(body, 'data')
      ) {
        return jsonResponse(
          request,
          env,
          { error: 'Legacy payload is not supported. Use groupId/eventId/type/title/body/link.' },
          400
        );
      }
      const groupId = typeof body.groupId === 'string' ? body.groupId.trim() : '';
      const eventId = typeof body.eventId === 'string' ? body.eventId.trim() : '';
      const type = typeof body.type === 'string' ? body.type.trim() : '';
      const title = typeof body.title === 'string' ? body.title.trim() : '';
      const messageBody = typeof body.body === 'string' ? body.body.trim() : '';
      const link = typeof body.link === 'string' ? body.link.trim() : '';
      const writeInApp = body.writeInApp !== false;
      const targetUserIds = Array.isArray(body.targetUserIds)
        ? body.targetUserIds.map((value) => String(value || '').trim()).filter(Boolean)
        : [];

      if (!groupId || !type || !title || !messageBody) {
        return jsonResponse(
          request,
          env,
          { error: 'Missing required fields: groupId, type, title, body' },
          400
        );
      }
      if (title.length > MAX_TITLE_LENGTH) {
        return jsonResponse(request, env, { error: `title too long (max ${MAX_TITLE_LENGTH})` }, 400);
      }
      if (messageBody.length > MAX_BODY_LENGTH) {
        return jsonResponse(request, env, { error: `body too long (max ${MAX_BODY_LENGTH})` }, 400);
      }
      if (link.length > MAX_LINK_LENGTH) {
        return jsonResponse(request, env, { error: `link too long (max ${MAX_LINK_LENGTH})` }, 400);
      }
      const pushData = {
        groupId,
        eventId,
        type,
        ...(link ? { link } : {}),
      };
      if (calculateDataPayloadSize(pushData) > MAX_DATA_SIZE_BYTES) {
        return jsonResponse(request, env, { error: `data payload too large (max ${MAX_DATA_SIZE_BYTES} bytes)` }, 400);
      }

      if (link && !isRelativeAppLink(link)) {
        return jsonResponse(request, env, { error: 'link must be a relative path' }, 400);
      }
      if (targetUserIds.length > MAX_TARGET_USER_IDS) {
        return jsonResponse(request, env, { error: `Too many targetUserIds (max ${MAX_TARGET_USER_IDS})` }, 400);
      }

      const projectId = env.FCM_PROJECT_ID;
      const clientEmail = env.FCM_CLIENT_EMAIL;
      const privateKey = normalizePrivateKey(env.FCM_PRIVATE_KEY);

      if (!projectId || !clientEmail || !privateKey) {
        console.error('Missing FCM Configuration in Secrets');
        return jsonResponse(request, env, { error: 'Server configuration error' }, 500);
      }

      const firestoreAuth = await getFirestoreAuth(env);
      if (!firestoreAuth.ok) {
        return jsonResponse(request, env, { error: firestoreAuth.error }, 500);
      }

      try {
        const canSend = await canSendGroupNotification(
          firestoreAuth.projectId,
          firestoreAuth.accessToken,
          groupId,
          authResult.user,
          type
        );
        if (!canSend) {
          return jsonResponse(request, env, { error: 'Forbidden' }, 403);
        }
      } catch (error) {
        console.error('Push authorization check failed:', error);
        return jsonResponse(request, env, { error: 'Failed to verify sender permissions' }, 500);
      }

      let memberUserIds = [];
      try {
        memberUserIds = await fetchGroupMemberUserIds(
          firestoreAuth.projectId,
          firestoreAuth.accessToken,
          groupId
        );
      } catch (error) {
        console.error('Failed to resolve group members:', error);
        return jsonResponse(request, env, { error: 'Failed to resolve group members' }, 500);
      }

      if (memberUserIds.length === 0) {
        return jsonResponse(request, env, { error: 'No group members found' }, 404);
      }

      let recipientUserIds = memberUserIds;
      if (targetUserIds.length > 0) {
        try {
          recipientUserIds = await filterEligibleTargetUserIds(
            firestoreAuth.projectId,
            firestoreAuth.accessToken,
            groupId,
            targetUserIds,
            memberUserIds
          );
        } catch (error) {
          console.error('Failed to resolve target recipients:', error);
          return jsonResponse(request, env, { error: 'Failed to resolve target recipients' }, 500);
        }
      }

      if (recipientUserIds.length === 0) {
        return jsonResponse(request, env, { error: 'No eligible recipient users found' }, 400);
      }

      let inAppWritten = 0;
      if (writeInApp) {
        try {
          inAppWritten = await writeInAppNotificationsForGroupMembers(
            firestoreAuth.projectId,
            firestoreAuth.accessToken,
            recipientUserIds,
            {
              type,
              groupId,
              eventId,
              title,
              body: messageBody,
              link,
            }
          );
        } catch (error) {
          console.error('Failed to write in-app notifications:', error);
          return jsonResponse(request, env, { error: 'Failed to write in-app notifications' }, 500);
        }
      }

      let tokens = [];
      try {
        tokens = await fetchPushTokensForUserIds(
          firestoreAuth.projectId,
          firestoreAuth.accessToken,
          recipientUserIds
        );
      } catch (error) {
        console.error('Failed to resolve group member push tokens:', error);
        return jsonResponse(request, env, { error: 'Failed to resolve recipient push tokens' }, 500);
      }

      const tokenValidation = validateRecipientTokens(tokens);
      if (tokenValidation.invalidCount > 0) {
        console.warn(`Filtered ${tokenValidation.invalidCount} invalid push token(s)`);
      }
      tokens = tokenValidation.tokens;
      if (tokens.length === 0) {
        return jsonResponse(request, env, { error: 'No valid recipient tokens found' }, 400);
      }
      if (tokens.length > MAX_RECIPIENT_TOKENS) {
        return jsonResponse(request, env, { error: `Too many recipient tokens (max ${MAX_RECIPIENT_TOKENS})` }, 400);
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
        return jsonResponse(request, env,
          { error: 'Failed to obtain FCM access token', detail: String(error) },
          500
        );
      }

      // 4. Send Notifications
      const result = await sendToFcm(
        tokens,
        { title, body: messageBody },
        pushData,
        accessToken,
        projectId
      );

      // 5. Cleanup Dead Tokens (Async)
      const deadTokens = result.errors
        .filter((err) => err.isUnregistered)
        .map((err) => err.token);
      const publicErrors = await buildPublicNotificationErrors(result.errors);

      if (deadTokens.length > 0 && ctx?.waitUntil) {
        ctx.waitUntil(cleanupDeadTokens(env, deadTokens));
      }

      // Log the result (Cloudflare logs)
      return jsonResponse(
        request,
        env,
        {
          success: result.success,
          failure: result.failure,
          errors: publicErrors,
          cleanedUp: deadTokens.length,
          inAppWritten,
        },
        result.failure > 0 ? 207 : 200
      );
    }

    if (url.pathname === '/mvp-cron-run-now') {
      const authResult = await verifyAuth(request, env);
      if (!authResult.authorized) {
        return jsonResponse(request, env, { error: 'Unauthorized', detail: authResult.error }, 401);
      }

      if (ctx?.waitUntil) {
        ctx.waitUntil(handleMvpCron(env, { force: true, trigger: 'manual' }));
        return jsonResponse(request, env, { ok: true, queued: true }, 202);
      }

      await handleMvpCron(env, { force: true, trigger: 'manual' });
      return jsonResponse(request, env, { ok: true, queued: false }, 200);
    }

    if (url.pathname === '/mvp-cron-list-group') {
      const authResult = await verifyAuth(request, env);
      if (!authResult.authorized) {
        return jsonResponse(request, env, { error: 'Unauthorized', detail: authResult.error }, 401);
      }

      const body = await readJsonBody(request);
      if (!body.ok) return jsonResponse(request, env, { error: body.error }, 400);
      const groupId = typeof body.data?.groupId === 'string' ? body.data.groupId.trim() : '';
      if (!groupId) return jsonResponse(request, env, { error: 'Missing groupId' }, 400);

      const config = await getFirestoreAuth(env);
      if (!config.ok) return jsonResponse(request, env, { error: config.error }, 500);

      const now = new Date();
      const cutoffIso = now.toISOString();
      const events = await fetchEligibleMvpEvents(
        config.projectId,
        config.accessToken,
        groupId,
        cutoffIso
      );
      const legacyEvents = await fetchLegacyMvpEvents(
        config.projectId,
        config.accessToken,
        groupId
      );
      const mergedEvents = mergeEventDocs(events, legacyEvents);
      const items = mergedEvents.map((doc) =>
        summarizeMvpEventDoc(doc, now)
      );
      const eligible = items.filter((item) => item.eligible);
      return jsonResponse(request, env,
        { ok: true, groupId, total: items.length, eligible: eligible.length, items },
        200
      );
    }

    if (url.pathname === '/mvp-cron-run-group') {
      const authResult = await verifyAuth(request, env);
      if (!authResult.authorized) {
        return jsonResponse(request, env, { error: 'Unauthorized', detail: authResult.error }, 401);
      }

      const body = await readJsonBody(request);
      if (!body.ok) return jsonResponse(request, env, { error: body.error }, 400);
      const groupId = typeof body.data?.groupId === 'string' ? body.data.groupId.trim() : '';
      const dryRun = Boolean(body.data?.dryRun);
      if (!groupId) return jsonResponse(request, env, { error: 'Missing groupId' }, 400);

      const config = await getFirestoreAuth(env);
      if (!config.ok) return jsonResponse(request, env, { error: config.error }, 500);

      const now = new Date();
      const cutoffIso = now.toISOString();
      const events = await fetchEligibleMvpEvents(
        config.projectId,
        config.accessToken,
        groupId,
        cutoffIso
      );
      const legacyEvents = await fetchLegacyMvpEvents(
        config.projectId,
        config.accessToken,
        groupId
      );
      const mergedEvents = mergeEventDocs(events, legacyEvents);
      const mergedCount = mergedEvents.length;
      let total = mergedCount;
      let eligible = mergedEvents.filter((doc) => summarizeMvpEventDoc(doc, now).eligible);
      if (eligible.length === 0 && mergedEvents.length === 0) {
        const allEvents = await listGroupEvents(config.projectId, config.accessToken, groupId);
        const fallbackEvents = allEvents.filter(
          (doc) => doc?.fields?.mvpVotingEnabled?.booleanValue
        );
        total = fallbackEvents.length;
        eligible = fallbackEvents.filter((doc) => summarizeMvpEventDoc(doc, now).eligible);
      }
      if (!dryRun) {
        for (const eventDoc of eligible) {
          await finalizeMvpEvent(config.projectId, config.accessToken, groupId, eventDoc);
        }
      }

      return jsonResponse(request, env,
        {
          ok: true,
          groupId,
          dryRun,
          total,
          eligible: eligible.length,
        },
        200
      );
    }

    if (url.pathname === '/mvp-cron-get-event') {
      const authResult = await verifyAuth(request, env);
      if (!authResult.authorized) {
        return jsonResponse(request, env, { error: 'Unauthorized', detail: authResult.error }, 401);
      }

      const body = await readJsonBody(request);
      if (!body.ok) return jsonResponse(request, env, { error: body.error }, 400);
      const groupId = typeof body.data?.groupId === 'string' ? body.data.groupId.trim() : '';
      const eventId = typeof body.data?.eventId === 'string' ? body.data.eventId.trim() : '';
      if (!groupId || !eventId) {
        return jsonResponse(request, env, { error: 'Missing groupId or eventId' }, 400);
      }

      const config = await getFirestoreAuth(env);
      if (!config.ok) return jsonResponse(request, env, { error: config.error }, 500);

      const docName = `projects/${config.projectId}/databases/(default)/documents/groups/${groupId}/events/${eventId}`;
      const url = `https://firestore.googleapis.com/v1/${docName}`;
      const response = await fetch(url, {
        headers: { Authorization: `Bearer ${config.accessToken}` },
      });
      if (!response.ok) {
        const detail = await response.text();
        return jsonResponse(request, env, { error: `Event fetch failed: ${response.status} ${detail}` }, 500);
      }

      const doc = await response.json();
      const summary = summarizeMvpEventDoc(doc, new Date());
      return jsonResponse(request, env, { ok: true, groupId, eventId, summary, raw: doc }, 200);
    }

    if (url.pathname === '/mvp-cron-list-events') {
      const authResult = await verifyAuth(request, env);
      if (!authResult.authorized) {
        return jsonResponse(request, env, { error: 'Unauthorized', detail: authResult.error }, 401);
      }

      const body = await readJsonBody(request);
      if (!body.ok) return jsonResponse(request, env, { error: body.error }, 400);
      const groupId = typeof body.data?.groupId === 'string' ? body.data.groupId.trim() : '';
      const pageSizeRaw = Number(body.data?.pageSize ?? 50);
      const pageSize = Number.isFinite(pageSizeRaw) ? Math.min(Math.max(pageSizeRaw, 1), 200) : 50;
      const pageToken = typeof body.data?.pageToken === 'string' ? body.data.pageToken.trim() : '';
      if (!groupId) return jsonResponse(request, env, { error: 'Missing groupId' }, 400);

      const config = await getFirestoreAuth(env);
      if (!config.ok) return jsonResponse(request, env, { error: config.error }, 500);

      const listUrl = new URL(
        `https://firestore.googleapis.com/v1/projects/${config.projectId}/databases/(default)/documents/groups/${groupId}/events`
      );
      listUrl.searchParams.set('pageSize', String(pageSize));
      if (pageToken) listUrl.searchParams.set('pageToken', pageToken);

      const response = await fetch(listUrl.toString(), {
        headers: { Authorization: `Bearer ${config.accessToken}` },
      });
      if (!response.ok) {
        const detail = await response.text();
        return jsonResponse(request, env, { error: `Events list failed: ${response.status} ${detail}` }, 500);
      }

      const data = await response.json();
      const docs = data.documents || [];
      const now = new Date();
      const items = docs.map((doc) => summarizeMvpEventDoc(doc, now));
      return jsonResponse(request, env,
        {
          ok: true,
          groupId,
          total: items.length,
          items,
          nextPageToken: data.nextPageToken || null,
        },
        200
      );
    }

    if (url.pathname === '/mvp-cron-normalize-group') {
      const authResult = await verifyAuth(request, env);
      if (!authResult.authorized) {
        return jsonResponse(request, env, { error: 'Unauthorized', detail: authResult.error }, 401);
      }

      const body = await readJsonBody(request);
      if (!body.ok) return jsonResponse(request, env, { error: body.error }, 400);
      const groupId = typeof body.data?.groupId === 'string' ? body.data.groupId.trim() : '';
      if (!groupId) return jsonResponse(request, env, { error: 'Missing groupId' }, 400);

      const config = await getFirestoreAuth(env);
      if (!config.ok) return jsonResponse(request, env, { error: config.error }, 500);

      const now = new Date();
      const result = await normalizeMvpEventsForGroup(
        config.projectId,
        config.accessToken,
        groupId,
        now
      );
      return jsonResponse(request, env, { ok: true, groupId, ...result }, 200);
    }

    if (url.pathname === '/mvp-cron-report-group') {
      const authResult = await verifyAuth(request, env);
      if (!authResult.authorized) {
        return jsonResponse(request, env, { error: 'Unauthorized', detail: authResult.error }, 401);
      }

      const body = await readJsonBody(request);
      if (!body.ok) return jsonResponse(request, env, { error: body.error }, 400);
      const groupId = typeof body.data?.groupId === 'string' ? body.data.groupId.trim() : '';
      if (!groupId) return jsonResponse(request, env, { error: 'Missing groupId' }, 400);

      const config = await getFirestoreAuth(env);
      if (!config.ok) return jsonResponse(request, env, { error: config.error }, 500);

      const docs = await listGroupEvents(config.projectId, config.accessToken, groupId);
      const items = docs
        .filter((doc) => doc?.fields?.mvpVotingEnabled?.booleanValue)
        .map((doc) => {
          const fields = doc.fields || {};
          return {
            id: doc.name?.split('/').pop() || 'unknown',
            status: fields.status?.stringValue || null,
            mvpEloAwarded: Boolean(fields.mvpEloAwarded?.booleanValue),
            mvpWinnerId: fields.mvpWinnerId?.stringValue || null,
            endedAt: fields.endedAt?.timestampValue || null,
            updateTime: doc.updateTime || null,
          };
        });

      return jsonResponse(request, env, { ok: true, groupId, total: items.length, items }, 200);
    }

    if (url.pathname === '/contact-message') {
      return handleContactMessage(request, env);
    }

    if (url.pathname === '/issue-push-challenge') {
      return handleIssuePushChallenge(request, env);
    }

    if (url.pathname === '/register-push-token') {
      return handleRegisterPushToken(request, env);
    }

    if (url.pathname === '/csp-report') {
      return handleCspReport(request, env);
    }

    return jsonResponse(request, env, { error: 'Endpoint not found' }, 404);
  },
  async scheduled(event, env, ctx) {
    console.log('MVP cron triggered', { scheduledTime: event.scheduledTime });
    ctx.waitUntil(handleMvpCron(env));
  },
};

/**
 * CSP violation report handler.
 * Accepts POST from browsers sending Content-Security-Policy-Report-Only violations.
 * Logs to Cloudflare Workers Observability and returns 204. No auth required –
 * reports come from end-user browsers. Oversized or non-JSON bodies are silently dropped.
 */
async function handleCspReport(request, env) {
  if (request.method !== 'POST') {
    return new Response(null, { status: 405 });
  }

  const contentLength = Number(request.headers.get('Content-Length') || '0');
  if (contentLength > 8192) {
    // Drop oversized payloads silently to avoid abuse
    return new Response(null, { status: 204 });
  }

  try {
    const text = await request.text();
    if (!text || text.length > 8192) {
      return new Response(null, { status: 204 });
    }
    const report = JSON.parse(text);
    const violation = report?.['csp-report'] || report;
    console.warn('[CSP Violation]', JSON.stringify({
      blockedUri: violation?.['blocked-uri'] || violation?.['blockedURL'] || null,
      violatedDirective: violation?.['violated-directive'] || violation?.['effectiveDirective'] || null,
      documentUri: violation?.['document-uri'] || violation?.['documentURL'] || null,
      disposition: violation?.['disposition'] || null,
    }));
  } catch {
    // Malformed body – ignore silently
  }

  return new Response(null, { status: 204 });
}

function corsHeaders(request, env) {
  const origin = request?.headers?.get('Origin') || '';
  const extraOrigins = (env?.ALLOWED_ORIGINS || '')
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean);
  const allowedOrigins = [
    'https://bemyteammate.eu',
    'https://bemyteammate.pages.dev',
    'http://localhost:4200',
    'http://127.0.0.1:4200',
    'http://localhost:8100',
    'http://127.0.0.1:8100',
    ...extraOrigins,
  ];
  const hasOrigin = Boolean(origin);
  const allowOrigin = !hasOrigin
    ? allowedOrigins[0]
    : allowedOrigins.includes(origin)
      ? origin
      : 'null';

  return {
    'Access-Control-Allow-Origin': allowOrigin,
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers':
      'Content-Type, Authorization, X-Admin-Secret, X-Firebase-AppCheck',
    'Access-Control-Allow-Credentials': 'true',
  };
}

function jsonResponse(request, env, payload, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: {
      'Content-Type': 'application/json',
      ...corsHeaders(request, env),
    },
  });
}

async function readJsonBody(request) {
  try {
    const data = await request.json();
    return { ok: true, data };
  } catch {
    return { ok: false, error: 'Invalid JSON body' };
  }
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
    return jsonResponse(request, env, { error: 'Invalid JSON body' }, 400);
  }

  const honeypot = typeof body.honeypot === 'string' ? body.honeypot.trim() : '';
  if (honeypot) {
    return jsonResponse(request, env, { ok: true }, 200);
  }

  const message = typeof body.message === 'string' ? body.message.trim() : '';
  if (!message || message.length < 10 || message.length > 2000) {
    return jsonResponse(request, env, { error: 'Invalid message length' }, 400);
  }

  const contactEmail = typeof body.contactEmail === 'string' ? body.contactEmail.trim() : '';
  if (contactEmail && !isValidEmail(contactEmail)) {
    return jsonResponse(request, env, { error: 'Invalid email' }, 400);
  }

  const token = typeof body.turnstileToken === 'string' ? body.turnstileToken.trim() : '';
  if (!token) {
    return jsonResponse(request, env, { error: 'Missing captcha token' }, 400);
  }

  if (!env.TURNSTILE_SECRET_KEY) {
    return jsonResponse(request, env, { error: 'Turnstile secret missing' }, 500);
  }

  const turnstileOk = await verifyTurnstileToken(token, request, env.TURNSTILE_SECRET_KEY);
  if (!turnstileOk) {
    return jsonResponse(request, env, { error: 'Captcha verification failed' }, 403);
  }

  try {
    await rateLimiter.checkGlobal(env, 'contact-message');
    await rateLimiter.checkContact(request, env);
  } catch (error) {
    if (error instanceof RateLimitExceededError) {
      return jsonResponse(
        request,
        env,
        {
          error: 'Rate limit exceeded',
          message: error.message,
          retryAfter: error.retryAfter,
        },
        429
      );
    }
    console.error('Contact rate limiter failed:', error);
  }

  const projectId = env.FCM_PROJECT_ID;
  const clientEmail = env.FCM_CLIENT_EMAIL;
  const privateKey = normalizePrivateKey(env.FCM_PRIVATE_KEY);

  if (!projectId || !clientEmail || !privateKey) {
    console.error('Missing Firestore configuration in secrets');
    return jsonResponse(request, env, { error: 'Server configuration error' }, 500);
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
    return jsonResponse(request, env, { error: 'Failed to obtain Firestore access token' }, 500);
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
    return jsonResponse(request, env, { error: 'Failed to store message' }, 500);
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

  return jsonResponse(request, env, { ok: true }, 200);
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
  const userIds = [];
  for (const row of data || []) {
    const doc = row?.document;
    const userId = doc?.name?.split('/').pop();
    if (userId) userIds.push(userId);
  }

  return fetchPushTokensForUserIds(projectId, accessToken, userIds);
}

function getPushTokensDocUrl(projectId, userId) {
  return `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents/users/${userId}/private/pushTokens`;
}

function extractTokensFromPushTokenDoc(doc) {
  const values = doc?.fields?.tokens?.arrayValue?.values || [];
  const tokens = [];
  for (const value of values) {
    if (typeof value?.stringValue === 'string' && value.stringValue.trim()) {
      tokens.push(value.stringValue.trim());
    }
  }
  return tokens;
}

async function fetchPushTokensForUserIds(projectId, accessToken, userIds) {
  const uniqueUserIds = Array.from(
    new Set(
      (Array.isArray(userIds) ? userIds : [])
        .map((value) => String(value || '').trim())
        .filter(Boolean)
    )
  );
  if (uniqueUserIds.length === 0) return [];

  const tokens = [];
  const chunks = chunkArray(uniqueUserIds, 20);
  for (const chunk of chunks) {
    const results = await Promise.all(
      chunk.map(async (userId) => {
        const response = await fetch(getPushTokensDocUrl(projectId, userId), {
          headers: { Authorization: `Bearer ${accessToken}` },
        });

        if (response.status === 404) return [];
        if (!response.ok) {
          const detail = await response.text();
          throw new Error(`Push token doc fetch failed (${userId}): ${response.status} ${detail}`);
        }

        const doc = await response.json();
        return extractTokensFromPushTokenDoc(doc);
      })
    );
    for (const row of results) {
      tokens.push(...row);
    }
  }

  return Array.from(new Set(tokens));
}

function getUserDocUrl(projectId, userId) {
  return `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents/users/${userId}`;
}

function getGroupMemberDocUrl(projectId, groupId, userId) {
  return `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents/groups/${groupId}/members/${userId}`;
}

function getGroupInviteDocUrl(projectId, groupId, userId) {
  return `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents/groups/${groupId}/invites/${userId}`;
}

function getGroupJoinRequestDocUrl(projectId, groupId, userId) {
  return `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents/groups/${groupId}/joinRequests/${userId}`;
}

async function documentExists(docUrl, accessToken) {
  const response = await fetch(docUrl, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (response.status === 404) return false;
  if (!response.ok) {
    const detail = await response.text();
    throw new Error(`Document lookup failed: ${response.status} ${detail}`);
  }
  return true;
}

async function isUserSiteAdmin(projectId, accessToken, userId) {
  const response = await fetch(getUserDocUrl(projectId, userId), {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (response.status === 404) return false;
  if (!response.ok) {
    const detail = await response.text();
    throw new Error(`User lookup failed (${userId}): ${response.status} ${detail}`);
  }
  const doc = await response.json();
  const role = doc?.fields?.role?.stringValue || '';
  return role === 'siteadmin';
}

async function isUserGroupMember(projectId, accessToken, groupId, userId) {
  const response = await fetch(getGroupMemberDocUrl(projectId, groupId, userId), {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (response.status === 404) return false;
  if (!response.ok) {
    const detail = await response.text();
    throw new Error(`Group member lookup failed (${groupId}/${userId}): ${response.status} ${detail}`);
  }
  return true;
}

async function canSendGroupNotification(projectId, accessToken, groupId, userId, type) {
  if (!groupId || !userId) return false;
  const [isMember, isSiteAdmin] = await Promise.all([
    isUserGroupMember(projectId, accessToken, groupId, userId),
    isUserSiteAdmin(projectId, accessToken, userId),
  ]);
  if (isMember || isSiteAdmin) return true;

  // Allow non-members to notify admins about their own pending join request.
  if (type === 'group_join') {
    return documentExists(getGroupJoinRequestDocUrl(projectId, groupId, userId), accessToken);
  }

  return false;
}

async function fetchGroupMemberUserIds(projectId, accessToken, groupId) {
  const userIds = [];
  let pageToken = '';

  do {
    const url = new URL(
      `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents/groups/${groupId}/members`
    );
    url.searchParams.set('pageSize', '200');
    if (pageToken) url.searchParams.set('pageToken', pageToken);

    const response = await fetch(url.toString(), {
      headers: { Authorization: `Bearer ${accessToken}` },
    });

    if (response.status === 404) return [];
    if (!response.ok) {
      const detail = await response.text();
      throw new Error(`Group members list failed (${groupId}): ${response.status} ${detail}`);
    }

    const data = await response.json();
    const docs = data.documents || [];
    for (const doc of docs) {
      const userId = doc?.fields?.userId?.stringValue || doc?.name?.split('/').pop() || '';
      if (userId) userIds.push(userId);
    }
    pageToken = data.nextPageToken || '';
  } while (pageToken);

  return Array.from(new Set(userIds));
}

async function isUserEligibleTarget(projectId, accessToken, groupId, userId, memberSet) {
  if (memberSet?.has(userId)) return true;

  const [hasInvite, hasJoinRequest] = await Promise.all([
    documentExists(getGroupInviteDocUrl(projectId, groupId, userId), accessToken),
    documentExists(getGroupJoinRequestDocUrl(projectId, groupId, userId), accessToken),
  ]);
  return hasInvite || hasJoinRequest;
}

async function filterEligibleTargetUserIds(
  projectId,
  accessToken,
  groupId,
  targetUserIds,
  memberUserIds
) {
  const uniqueTargetUserIds = Array.from(
    new Set(
      (Array.isArray(targetUserIds) ? targetUserIds : [])
        .map((value) => String(value || '').trim())
        .filter(Boolean)
    )
  );
  if (uniqueTargetUserIds.length === 0) return [];

  const memberSet = new Set(
    (Array.isArray(memberUserIds) ? memberUserIds : [])
      .map((value) => String(value || '').trim())
      .filter(Boolean)
  );

  const allowed = [];
  const chunks = chunkArray(uniqueTargetUserIds, 20);
  for (const chunk of chunks) {
    const results = await Promise.all(
      chunk.map(async (userId) => {
        const eligible = await isUserEligibleTarget(
          projectId,
          accessToken,
          groupId,
          userId,
          memberSet
        );
        return eligible ? userId : '';
      })
    );
    for (const userId of results) {
      if (userId) allowed.push(userId);
    }
  }
  return allowed;
}

function isRelativeAppLink(link) {
  if (typeof link !== 'string') return false;
  const value = link.trim();
  if (!value) return false;
  if (!value.startsWith('/')) return false;
  if (value.startsWith('//')) return false;
  return !/^[a-zA-Z][a-zA-Z\d+.-]*:/.test(value);
}

/**
 * Verifies the request using Admin Secret or Firebase ID Token + App Check token
 */
async function verifyAuth(request, env) {
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
        authType: 'firebase',
        appId: appCheckVerified.appId,
      };

      /*
      // PREVIOUS IMPLEMENTATION (BLOCKED BY APP CHECK)
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
      */
    } catch (e) {
      console.error('Auth verification failed:', e);
      return { authorized: false, error: 'Token verification failed' };
    }
  }

  return { authorized: false, error: 'Missing or invalid authentication credentials' };
}

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

function base64UrlDecode(value) {
  const padded = value.replace(/-/g, '+').replace(/_/g, '/');
  const padLength = (4 - (padded.length % 4)) % 4;
  const pad = '='.repeat(padLength);
  return atob(padded + pad);
}

function base64UrlToBytes(value) {
  const binary = base64UrlDecode(value);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
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

async function buildPublicNotificationErrors(errors) {
  if (!Array.isArray(errors) || errors.length === 0) {
    return [];
  }

  return Promise.all(errors.map(async (error) => {
    const item = {
      status: Number.isFinite(error?.status) ? error.status : 0,
      isUnregistered: Boolean(error?.isUnregistered),
    };
    const tokenHint = await buildTokenHashHint(error?.token);
    if (tokenHint) {
      item.tokenHint = tokenHint;
    }
    return item;
  }));
}

async function buildTokenHashHint(token) {
  if (typeof token !== 'string' || !token) {
    return null;
  }

  try {
    const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(token));
    const bytes = new Uint8Array(digest);
    return Array.from(bytes)
      .slice(0, 4)
      .map((value) => value.toString(16).padStart(2, '0'))
      .join('');
  } catch {
    return null;
  }
}

async function sendSingleMessage(token, notification, data, accessToken, projectId) {
  const androidChannelId = typeof data?.channelId === 'string' && data.channelId.trim()
    ? data.channelId.trim()
    : 'bmtm_alerts_v2';

  const message = {
    message: {
      token,
      notification: {
        title: notification.title || 'Notification',
        body: notification.body || '',
      },
      android: {
        priority: 'HIGH',
        notification: {
          sound: 'default',
          channel_id: androidChannelId,
          default_sound: true,
          default_vibrate_timings: true,
        },
      },
      apns: {
        payload: {
          aps: {
            sound: 'default',
          },
        },
      },
      webpush: {
        notification: {
          icon: '/favicon.ico',
          silent: false,
        },
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
      let isUnregistered = false;
      try {
        detail = await response.text();
        const parsed = JSON.parse(detail);
        if (
          parsed?.error?.details?.[0]?.errorCode === 'UNREGISTERED' ||
          parsed?.error?.message?.includes('Requested entity was not found')
        ) {
          isUnregistered = true;
        }
      } catch {
        detail = detail || 'Unknown error';
      }

      // Only log as error if it's NOT an expected UNREGISTERED status
      if (!isUnregistered || response.status !== 404) {
        console.error(`FCM Error: ${response.status} - ${detail}`);
      }
      return { ok: false, error: { token, status: response.status, detail, isUnregistered } };
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

function calculateDataPayloadSize(data) {
  return utf8ByteLength(JSON.stringify(normalizeData(data)));
}

function utf8ByteLength(value) {
  return new TextEncoder().encode(String(value)).length;
}

function validateRecipientTokens(tokens) {
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

function isLikelyFcmToken(token) {
  if (!token) return false;
  if (token.length < MIN_FCM_TOKEN_LENGTH) return false;
  if (token.length > MAX_FCM_TOKEN_LENGTH) return false;
  if (/\s/.test(token)) return false;
  return true;
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

async function handleMvpCron(env, options = {}) {
  console.log('MVP cron start');
  const startedAt = Date.now();
  const { force = false, trigger = 'scheduled' } = options || {};
  const now = new Date();
  if (!force && !shouldRunBudapestCron(now)) {
    console.log('MVP cron skipped: not 00:30 in Europe/Budapest');
    return;
  }
  if (force) {
    console.log('MVP cron forced run', { trigger });
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

  const cutoffIso = now.toISOString();
  console.log('MVP cron now', { nowIso: cutoffIso });

  const groupIds = await fetchAllGroupIds(projectId, accessToken);
  console.log('MVP cron groups found', { count: groupIds.length });
  let totalEvents = 0;
  let totalFinalized = 0;
  for (const groupId of groupIds) {
    try {
      const normalization = await normalizeMvpEventsForGroup(projectId, accessToken, groupId, now);
      if (normalization.updatedCount > 0) {
        console.log('MVP cron normalization', { groupId, ...normalization });
      }
      const events = await fetchEligibleMvpEvents(projectId, accessToken, groupId, cutoffIso);
      const legacyEvents = force
        ? await fetchLegacyMvpEvents(projectId, accessToken, groupId)
        : [];
      const mergedEvents = mergeEventDocs(events, legacyEvents);
      let eligibleEvents = mergedEvents.filter((eventDoc) => {
        const fields = eventDoc?.fields || {};
        const endAtUtc = fields.mvpVotingEndsAt?.timestampValue
          ? new Date(fields.mvpVotingEndsAt.timestampValue)
          : getEventVotingEndUtc(fields);
        if (!endAtUtc) return false;
        return now >= endAtUtc;
      });
      if (eligibleEvents.length === 0 && mergedEvents.length === 0) {
        const allEvents = await listGroupEvents(projectId, accessToken, groupId);
        const fallbackEvents = allEvents.filter(
          (doc) => doc?.fields?.mvpVotingEnabled?.booleanValue
        );
        eligibleEvents = fallbackEvents.filter((eventDoc) => {
          const fields = eventDoc?.fields || {};
          if (fields.status?.stringValue !== 'finished') return false;
          if (fields.mvpEloAwarded?.booleanValue) return false;
          const endAtUtc = fields.mvpVotingEndsAt?.timestampValue
            ? new Date(fields.mvpVotingEndsAt.timestampValue)
            : getEventVotingEndUtc(fields);
          if (!endAtUtc) return false;
          return now >= endAtUtc;
        });
        if (eligibleEvents.length > 0) {
          console.log('MVP cron fallback eligible events found', {
            groupId,
            count: eligibleEvents.length,
          });
        }
      }
      if (mergedEvents.length !== events.length) {
        const legacyCount = mergedEvents.length - events.length;
        if (legacyCount > 0) {
          console.log('MVP cron legacy events detected', { groupId, legacyCount });
        }
      }
      if (eligibleEvents.length > 0) {
        console.log('MVP cron events found', { groupId, count: eligibleEvents.length });
      }
      totalEvents += eligibleEvents.length;
      for (const eventDoc of eligibleEvents) {
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

async function getFirestoreAuth(env) {
  const projectId = env.FCM_PROJECT_ID;
  const clientEmail = env.FCM_CLIENT_EMAIL;
  const privateKey = normalizePrivateKey(env.FCM_PRIVATE_KEY);

  if (!projectId || !clientEmail || !privateKey) {
    console.error('Missing Firestore configuration in secrets');
    return { ok: false, error: 'Server configuration error' };
  }

  try {
    const accessToken = await getAccessToken(
      clientEmail,
      privateKey,
      'https://www.googleapis.com/auth/datastore'
    );
    return { ok: true, projectId, accessToken };
  } catch (error) {
    console.error('Firestore token generation failed:', error);
    return { ok: false, error: 'Failed to obtain Firestore access token' };
  }
}

function getEventVotingEndUtc(fields) {
  const dateField = fields.date;
  if (!dateField) return null;

  let baseDate = null;
  if (dateField.timestampValue) {
    baseDate = new Date(dateField.timestampValue);
  } else if (dateField.stringValue) {
    const raw = dateField.stringValue.trim();
    if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
      const [year, month, day] = raw.split('-').map(Number);
      baseDate = getUtcDateForZonedDate(year, month, day, 0, 0, 0, 'Europe/Budapest');
    } else {
      baseDate = new Date(raw);
    }
  }

  if (!baseDate || Number.isNaN(baseDate.getTime())) return null;
  const parts = getZonedParts(baseDate, 'Europe/Budapest');
  const endUtc = getUtcDateForZonedDate(parts.year, parts.month, parts.day, 23, 59, 59, 'Europe/Budapest');
  endUtc.setMilliseconds(999);
  return endUtc;
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
                field: { fieldPath: 'mvpVotingEndsAt' },
                op: 'LESS_THAN_OR_EQUAL',
                value: { timestampValue: cutoffIso },
              },
            },
          ],
        },
      },
      orderBy: [{ field: { fieldPath: 'mvpVotingEndsAt' }, direction: 'DESCENDING' }],
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

async function fetchLegacyMvpEvents(projectId, accessToken, groupId) {
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
                field: { fieldPath: 'mvpVotingEndsAt' },
                op: 'EQUAL',
                value: { nullValue: null },
              },
            },
          ],
        },
      },
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
    throw new Error(`Legacy events query failed: ${response.status} ${detail}`);
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

function mergeEventDocs(primary, secondary) {
  if (!secondary?.length) return primary;
  const seen = new Set(primary.map((doc) => doc?.name).filter(Boolean));
  const merged = [...primary];
  for (const doc of secondary) {
    if (!doc?.name || seen.has(doc.name)) continue;
    merged.push(doc);
    seen.add(doc.name);
  }
  return merged;
}

function summarizeMvpEventDoc(eventDoc, now) {
  const name = eventDoc?.name || '';
  const id = name.split('/').pop() || 'unknown';
  const fields = eventDoc?.fields || {};
  const status = fields.status?.stringValue || null;
  const mvpVotingEnabled = Boolean(fields.mvpVotingEnabled?.booleanValue);
  const mvpEloAwarded = Boolean(fields.mvpEloAwarded?.booleanValue);
  const mvpVotingEndsAt = fields.mvpVotingEndsAt?.timestampValue || null;
  const eventDateRaw = fields.date?.timestampValue || fields.date?.stringValue || null;
  const endAtUtc = mvpVotingEndsAt
    ? new Date(mvpVotingEndsAt)
    : getEventVotingEndUtc(fields);
  const endIso =
    endAtUtc && !Number.isNaN(endAtUtc.getTime()) ? endAtUtc.toISOString() : null;
  const eligible =
    mvpVotingEnabled &&
    status === 'finished' &&
    !mvpEloAwarded &&
    endAtUtc &&
    now >= endAtUtc;

  return {
    id,
    status,
    mvpVotingEnabled,
    mvpEloAwarded,
    mvpVotingEndsAt,
    computedEndIso: endIso,
    date: eventDateRaw,
    eligible,
  };
}

function hasEventResults(fields) {
  if (!fields) return false;
  if (fields.playerStats?.mapValue?.fields) return true;
  if (fields.goalsA || fields.goalsB) return true;
  if (fields.endedAt?.timestampValue) return true;
  return false;
}

function computeNormalizedStatus(fields, now) {
  if (fields.status?.stringValue) return null;
  const dateValue = fields.date?.timestampValue || fields.date?.stringValue;
  if (!dateValue) return null;
  const date = new Date(dateValue);
  if (Number.isNaN(date.getTime())) return null;
  if (date > now) return 'planned';
  if (hasEventResults(fields)) return 'finished';
  if (fields.startedAt?.timestampValue) return 'active';
  return 'planned';
}

async function normalizeMvpEventsForGroup(projectId, accessToken, groupId, now) {
  const docs = await fetchMvpEvents(projectId, accessToken, groupId);
  let updatedCount = 0;
  let statusUpdated = 0;
  let mvpEndsUpdated = 0;
  let finishedUpdated = 0;

  const writes = [];
  for (const doc of docs) {
    const fields = doc?.fields || {};
    const updateFields = {};
    const updateMask = [];

    const normalizedStatus = computeNormalizedStatus(fields, now);
    if (normalizedStatus && fields.status?.stringValue !== normalizedStatus) {
      updateFields.status = { stringValue: normalizedStatus };
      updateMask.push('status');
      if (normalizedStatus === 'finished' && !fields.endedAt?.timestampValue) {
        updateFields.endedAt = { timestampValue: now.toISOString() };
        updateMask.push('endedAt');
      }
      if (normalizedStatus === 'finished') finishedUpdated += 1;
      statusUpdated += 1;
    }

    if (
      fields.mvpVotingEnabled?.booleanValue &&
      !fields.mvpVotingEndsAt?.timestampValue
    ) {
      const endUtc = getEventVotingEndUtc(fields);
      if (endUtc && !Number.isNaN(endUtc.getTime())) {
        updateFields.mvpVotingEndsAt = { timestampValue: endUtc.toISOString() };
        updateMask.push('mvpVotingEndsAt');
        mvpEndsUpdated += 1;
      }
    }

    if (updateMask.length > 0) {
      writes.push({
        update: {
          name: doc.name,
          fields: updateFields,
        },
        updateMask: { fieldPaths: updateMask },
      });
    }

    if (writes.length >= 400) {
      const batch = writes.splice(0, writes.length);
      await commitWrites(projectId, accessToken, batch);
      updatedCount += batch.length;
    }
  }

  if (writes.length > 0) {
    await commitWrites(projectId, accessToken, writes);
    updatedCount += writes.length;
  }

  return {
    foundCount: docs.length,
    updatedCount,
    statusUpdated,
    mvpEndsUpdated,
    finishedUpdated,
  };
}

async function fetchMvpEvents(projectId, accessToken, groupId) {
  const url = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents:runQuery`;
  const body = {
    structuredQuery: {
      from: [{ collectionId: 'events' }],
      where: {
        fieldFilter: {
          field: { fieldPath: 'mvpVotingEnabled' },
          op: 'EQUAL',
          value: { booleanValue: true },
        },
      },
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
    throw new Error(`MVP events query failed: ${response.status} ${detail}`);
  }

  const data = await response.json();
  const events = [];
  for (const row of data || []) {
    const doc = row?.document;
    if (doc) events.push(doc);
  }
  if (events.length > 0) return events;

  // Fallback: list all group events and filter client-side if query returns empty.
  console.warn('MVP events query returned empty; falling back to list events', { groupId });
  const allEvents = await listGroupEvents(projectId, accessToken, groupId);
  return allEvents.filter((doc) => doc?.fields?.mvpVotingEnabled?.booleanValue);
}

async function listGroupEvents(projectId, accessToken, groupId) {
  const events = [];
  let pageToken = '';
  do {
    const listUrl = new URL(
      `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents/groups/${groupId}/events`
    );
    listUrl.searchParams.set('pageSize', '200');
    if (pageToken) listUrl.searchParams.set('pageToken', pageToken);

    const response = await fetch(listUrl.toString(), {
      headers: { Authorization: `Bearer ${accessToken}` },
    });

    if (!response.ok) {
      const detail = await response.text();
      throw new Error(`Events list failed: ${response.status} ${detail}`);
    }

    const data = await response.json();
    const docs = data.documents || [];
    events.push(...docs);
    pageToken = data.nextPageToken || '';
  } while (pageToken);

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
  let topCandidates = [];
  for (const [playerId, count] of tally.entries()) {
    if (count > topVotes) {
      topVotes = count;
      topCandidates = count > 0 ? [playerId] : [];
    } else if (count === topVotes && count > 0) {
      topCandidates.push(playerId);
    }
  }
  if (topCandidates.length === 1) {
    winnerId = topCandidates[0];
  } else if (topCandidates.length > 1) {
    const eloByUser = await fetchMemberElos(projectId, accessToken, groupId, topCandidates);
    const DEFAULT_ELO = 1200;
    let lowestElo = Number.POSITIVE_INFINITY;
    let lowestIds = [];
    for (const candidateId of topCandidates) {
      const elo = eloByUser.get(candidateId) ?? DEFAULT_ELO;
      if (elo < lowestElo) {
        lowestElo = elo;
        lowestIds = [candidateId];
      } else if (elo === lowestElo) {
        lowestIds.push(candidateId);
      }
    }
    winnerId = lowestIds.length > 0 ? lowestIds.sort()[0] : null;
  }
  console.log('MVP cron winner computed', {
    groupId,
    eventId,
    winnerId,
    topVotes,
    tie: topCandidates.length > 1,
  });

  const computedEndUtc = !fields.mvpVotingEndsAt?.timestampValue
    ? getEventVotingEndUtc(fields)
    : null;
  const computedEndIso =
    computedEndUtc && !Number.isNaN(computedEndUtc.getTime()) ? computedEndUtc.toISOString() : null;

  const updateFields = {
    mvpWinnerId: winnerId ? { stringValue: winnerId } : { nullValue: null },
    mvpEloAwarded: { booleanValue: true },
    ...(computedEndIso ? { mvpVotingEndsAt: { timestampValue: computedEndIso } } : {}),
  };
  const updateMask = ['mvpWinnerId', 'mvpEloAwarded'];
  if (computedEndIso) updateMask.push('mvpVotingEndsAt');

  const writes = [
    {
      update: {
        name: eventDoc.name,
        fields: updateFields,
      },
      updateMask: { fieldPaths: updateMask },
    },
  ];

  if (winnerId) {
    const userDocName = `projects/${projectId}/databases/(default)/documents/users/${winnerId}`;
    writes.push({
      transform: {
        document: userDocName,
        fieldTransforms: [
          { fieldPath: 'elo', increment: { integerValue: '5' } },
          { fieldPath: 'profileUpdatedAt', setToServerValue: 'REQUEST_TIME' },
          {
            fieldPath: 'lastModifiedFields',
            appendMissingElements: { values: [{ stringValue: 'elo' }] },
          },
        ],
      },
    });

    const memberDoc = await findGroupMemberDoc(projectId, accessToken, groupId, winnerId);
    if (memberDoc) {
      writes.push({
        transform: {
          document: memberDoc,
          fieldTransforms: [{ fieldPath: 'elo', increment: { integerValue: '5' } }],
        },
      });
    }
  }

  await commitWrites(projectId, accessToken, writes);
}

async function fetchMemberElos(projectId, accessToken, groupId, userIds) {
  const eloByUser = new Map();
  if (!Array.isArray(userIds) || userIds.length === 0) return eloByUser;
  const url = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents:runQuery`;
  for (let i = 0; i < userIds.length; i += 10) {
    const chunk = userIds.slice(i, i + 10);
    const body = {
      structuredQuery: {
        from: [{ collectionId: 'members' }],
        where: {
          fieldFilter: {
            field: { fieldPath: 'userId' },
            op: 'IN',
            value: {
              arrayValue: { values: chunk.map((id) => ({ stringValue: id })) },
            },
          },
        },
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
      throw new Error(`Member elo query failed: ${response.status} ${detail}`);
    }

    const data = await response.json();
    for (const row of data || []) {
      const doc = row?.document;
      const fields = doc?.fields || {};
      const userId = fields.userId?.stringValue;
      if (!userId) continue;
      const eloRaw = fields.elo?.integerValue ?? fields.elo?.doubleValue;
      const elo = eloRaw !== undefined && eloRaw !== null ? Number(eloRaw) : undefined;
      if (Number.isFinite(elo)) {
        eloByUser.set(userId, elo);
      }
    }
  }
  return eloByUser;
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

function buildInAppNotificationFields(payload, createdAtIso) {
  const eventId = typeof payload?.eventId === 'string' ? payload.eventId.trim() : '';
  const link = typeof payload?.link === 'string' ? payload.link.trim() : '';
  return {
    type: { stringValue: String(payload?.type || 'event_created') },
    groupId: { stringValue: String(payload?.groupId || '') },
    eventId: eventId ? { stringValue: eventId } : { nullValue: null },
    title: { stringValue: String(payload?.title || 'Értesítés') },
    body: { stringValue: String(payload?.body || '') },
    link: { stringValue: link },
    createdAt: { timestampValue: createdAtIso },
    read: { booleanValue: false },
    actorId: { nullValue: null },
    actorName: { stringValue: 'Rendszer' },
    actorPhoto: { nullValue: null },
  };
}

async function writeInAppNotificationsForGroupMembers(
  projectId,
  accessToken,
  userIds,
  payload
) {
  const uniqueUserIds = Array.from(
    new Set(
      (Array.isArray(userIds) ? userIds : [])
        .map((value) => String(value || '').trim())
        .filter(Boolean)
    )
  );
  if (uniqueUserIds.length === 0) return 0;

  const createdAtIso = new Date().toISOString();
  let written = 0;
  const chunks = chunkArray(uniqueUserIds, 300);

  for (const chunk of chunks) {
    const writes = chunk.map((uid) => ({
      update: {
        name: `projects/${projectId}/databases/(default)/documents/users/${uid}/notifications/${crypto.randomUUID()}`,
        fields: buildInAppNotificationFields(payload, createdAtIso),
      },
    }));
    await commitWrites(projectId, accessToken, writes);
    written += writes.length;
  }

  return written;
}

/**
 * Removes stale tokens from Firestore private push token documents
 */
async function cleanupDeadTokens(env, deadTokens) {
  if (!deadTokens || deadTokens.length === 0) return;

  const config = await getFirestoreAuth(env);
  if (!config.ok) {
    console.error('Cleanup: Failed to get Firestore auth');
    return;
  }

  const { projectId, accessToken } = config;
  console.log(`Starting cleanup for ${deadTokens.length} dead tokens`);

  // Process tokens in small batches to avoid hitting rate limits too hard
  for (const token of deadTokens) {
    try {
      // 1. Find private push token docs containing this token
      const queryUrl = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents:runQuery`;
      const queryBody = {
        structuredQuery: {
          from: [{ collectionId: 'private', allDescendants: true }],
          where: {
            fieldFilter: {
              field: { fieldPath: 'tokens' },
              op: 'ARRAY_CONTAINS',
              value: { stringValue: token },
            },
          },
        },
      };

      const resp = await fetch(queryUrl, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(queryBody),
      });

      if (!resp.ok) {
        const errText = await resp.text();
        console.warn(`Cleanup: Query failed for token: ${errText}`);
        continue;
      }

      const results = await resp.json();
      const writes = [];

      for (const row of results || []) {
        const doc = row?.document;
        if (!doc?.name) continue;
        if (!doc.name.endsWith('/pushTokens')) continue;

        const currentTokens = doc.fields?.tokens?.arrayValue?.values || [];
        const filteredTokens = currentTokens
          .map((v) => v.stringValue)
          .filter((t) => t && t !== token);

        writes.push({
          update: {
            name: doc.name,
            fields: {
              tokens: {
                arrayValue:
                  filteredTokens.length > 0
                    ? { values: filteredTokens.map((t) => ({ stringValue: t })) }
                    : {},
              },
            },
          },
          updateMask: { fieldPaths: ['tokens'] },
        });
      }

      if (writes.length > 0) {
        await commitWrites(projectId, accessToken, writes);
        console.log(`Cleanup: Removed token ${token.substring(0, 10)}... from ${writes.length} user(s)`);
      }
    } catch (err) {
      console.error(`Cleanup: Error processing token ${token.substring(0, 10)}...:`, err);
    }
  }
}

async function getMinimalFirestoreAuth(env) {
  const projectId = env.FCM_PROJECT_ID || env.FIREBASE_PROJECT_ID;
  const clientEmail = env.FIRESTORE_MINIMAL_CLIENT_EMAIL || env.FCM_CLIENT_EMAIL;
  const privateKeyStr = env.FIRESTORE_MINIMAL_PRIVATE_KEY || env.FCM_PRIVATE_KEY;
  const privateKey = normalizePrivateKey(privateKeyStr);

  if (!projectId || !clientEmail || !privateKey) {
    console.error('Missing minimal Firestore configuration in secrets');
    return { ok: false, error: 'Server configuration error' };
  }

  try {
    const accessToken = await getAccessToken(
      clientEmail,
      privateKey,
      'https://www.googleapis.com/auth/datastore'
    );
    return { ok: true, projectId, accessToken };
  } catch (error) {
    console.error('Minimal Firestore token generation failed:', error);
    return { ok: false, error: 'Failed to obtain minimal Firestore access token' };
  }
}

async function handleIssuePushChallenge(request, env) {
  const authResult = await verifyAuth(request, env);
  if (!authResult.authorized) {
    return jsonResponse(request, env, { error: 'Unauthorized', detail: authResult.error }, 401);
  }

  try {
    await rateLimiter.checkGlobal(env, 'issue-push-challenge');
    await rateLimiter.check(request, env, authResult.user);
  } catch (error) {
    if (error instanceof RateLimitExceededError) {
      return jsonResponse(request, env, { error: 'Rate limit exceeded', message: error.message, retryAfter: error.retryAfter }, 429);
    }
  }

  const config = await getMinimalFirestoreAuth(env);
  if (!config.ok) return jsonResponse(request, env, { error: config.error }, 500);

  const challengeId = crypto.randomUUID();
  const now = new Date();
  const expiresAt = new Date(now.getTime() + 120 * 1000); // 120 seconds

  const fields = {
    challengeId: { stringValue: challengeId },
    userId: { stringValue: authResult.user },
    sessionId: { stringValue: 'na' },
    status: { stringValue: 'issued' },
    createdAt: { timestampValue: now.toISOString() },
    expiresAt: { timestampValue: expiresAt.toISOString() }
  };

  const docUrl = `https://firestore.googleapis.com/v1/projects/${config.projectId}/databases/(default)/documents/pushChallenges?documentId=${challengeId}`;

  try {
    const response = await fetch(docUrl, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${config.accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ fields }),
    });

    if (!response.ok) {
      const detail = await response.text();
      throw new Error(detail);
    }
  } catch (err) {
    console.error('Failed to create push challenge:', err);
    return jsonResponse(request, env, { error: 'Database error' }, 500);
  }

  return jsonResponse(request, env, { ok: true, challengeId, expiresAt: expiresAt.toISOString() }, 200);
}

async function handleRegisterPushToken(request, env) {
  const authResult = await verifyAuth(request, env);
  if (!authResult.authorized) {
    return jsonResponse(request, env, { error: 'Unauthorized', detail: authResult.error }, 401);
  }

  try {
    await rateLimiter.checkGlobal(env, 'register-push-token');
    await rateLimiter.check(request, env, authResult.user);
  } catch (error) {
    if (error instanceof RateLimitExceededError) {
      return jsonResponse(request, env, { error: 'Rate limit exceeded', message: error.message, retryAfter: error.retryAfter }, 429);
    }
  }

  const body = await readJsonBody(request);
  if (!body.ok) return jsonResponse(request, env, { error: body.error }, 400);

  const challengeId = typeof body.data?.challengeId === 'string' ? body.data.challengeId.trim() : '';
  const token = typeof body.data?.token === 'string' ? body.data.token.trim() : '';

  if (!challengeId || !token) {
    return jsonResponse(request, env, { error: 'Missing challengeId or token' }, 400);
  }

  const config = await getMinimalFirestoreAuth(env);
  if (!config.ok) return jsonResponse(request, env, { error: config.error }, 500);

  const docUrl = `https://firestore.googleapis.com/v1/projects/${config.projectId}/databases/(default)/documents/pushChallenges/${challengeId}`;
  
  let doc;
  try {
    const response = await fetch(docUrl, {
      headers: { Authorization: `Bearer ${config.accessToken}` },
    });
    if (response.status === 404) {
      console.warn(`Audit: Unknown push challenge '${challengeId}' by user ${authResult.user}`);
      return jsonResponse(request, env, { error: 'Invalid or unknown challenge' }, 400);
    }
    if (!response.ok) throw new Error(await response.text());
    doc = await response.json();
  } catch (err) {
    console.error('Validation: Failed to fetch challenge:', err);
    return jsonResponse(request, env, { error: 'Validation failed' }, 500);
  }

  const fields = doc?.fields || {};
  const status = fields.status?.stringValue || '';
  const expiresAtStr = fields.expiresAt?.timestampValue || '';
  const challengeUserId = fields.userId?.stringValue || '';

  if (status === 'used') {
    console.warn(`Audit: Attempt to reuse used challenge '${challengeId}' by user ${authResult.user}`);
    return jsonResponse(request, env, { error: 'Challenge already used' }, 400);
  }
  if (challengeUserId !== authResult.user) {
    console.warn(`Audit: Challenge '${challengeId}' user mismatch: belongs to ${challengeUserId}, attempted by ${authResult.user}`);
    return jsonResponse(request, env, { error: 'User mismatch for challenge' }, 403);
  }
  if (!expiresAtStr || new Date(expiresAtStr) < new Date()) {
    console.warn(`Audit: Expired challenge '${challengeId}' accessed by ${authResult.user}`);
    return jsonResponse(request, env, { error: 'Challenge expired' }, 400);
  }

  const writes = [
    {
      update: {
        name: doc.name,
        fields: {
          ...fields,
          status: { stringValue: 'used' },
        }
      },
      updateMask: { fieldPaths: ['status'] }
    },
    {
      transform: {
        document: `projects/${config.projectId}/databases/(default)/documents/users/${authResult.user}/private/pushTokens`,
        fieldTransforms: [
          {
            fieldPath: 'tokens',
            appendMissingElements: {
              values: [{ stringValue: token }]
            }
          },
          {
            fieldPath: 'updatedAt',
            setToServerValue: 'REQUEST_TIME'
          }
        ]
      }
    }
  ];

  try {
    await commitWrites(config.projectId, config.accessToken, writes);
  } catch (err) {
    console.error('Failed to register token:', err);
    return jsonResponse(request, env, { error: 'Database write error' }, 500);
  }

  return jsonResponse(request, env, { ok: true }, 200);
}
