import { verifyAuth } from '../auth.js';
import { getAccessToken, normalizePrivateKey } from '../google-auth.js';
import { jsonResponse, readJsonBody } from '../http.js';
import { rateLimiter, RateLimitExceededError } from '../rate-limit.js';
import {
  canSendGroupNotification,
  commitWrites,
  fetchGroupMemberUserIds,
  fetchPushTokensForUserIds,
  filterEligibleTargetUserIds,
  getFirestoreAuth,
} from '../firestore.js';
import {
  calculateDataPayloadSize,
  chunkArray,
  isRelativeAppLink,
  normalizeData,
  validateRecipientTokens,
} from '../utils.js';
import {
  MAX_BODY_LENGTH,
  MAX_DATA_SIZE_BYTES,
  MAX_LINK_LENGTH,
  MAX_RECIPIENT_TOKENS,
  MAX_TARGET_USER_IDS,
  MAX_TITLE_LENGTH,
} from '../constants.js';

export async function handleSendNotification(request, env, ctx) {
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

async function sendToFcm(tokens, notification, data, accessToken, projectId) {
  let success = 0;
  let failure = 0;
  const errors = [];

  // Batch tokens in chunks to avoid hitting concurrency limits too hard
  const chunks = chunkArray(tokens, 10);

  for (const chunk of chunks) {
    const promises = chunk.map((token) =>
      sendSingleMessage(token, notification, data, accessToken, projectId)
    );
    const results = await Promise.all(promises);

    results.forEach((res) => {
      if (res.ok) {
        success += 1;
      } else {
        failure += 1;
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
    }

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
  } catch (err) {
    console.error(`Fetch Error: ${err}`);
    return { ok: false, error: { token, status: 0, detail: String(err) } };
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
