import { verifyAuth } from '../auth.js';
import { jsonResponse, readJsonBody } from '../http.js';
import { rateLimiter, RateLimitExceededError } from '../rate-limit.js';
import { commitWrites, getMinimalFirestoreAuth } from '../firestore.js';

export async function handleIssuePushChallenge(request, env) {
  const authResult = await verifyAuth(request, env);
  if (!authResult.authorized) {
    return jsonResponse(request, env, { error: 'Unauthorized', detail: authResult.error }, 401);
  }

  try {
    await rateLimiter.check(request, env);
  } catch (error) {
    if (error instanceof RateLimitExceededError) {
      return jsonResponse(request, env, { error: 'Rate limit exceeded', message: error.message, retryAfter: error.retryAfter }, 429);
    }
    console.error('Issue challenge rate limiter failed:', error);
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
    expiresAt: { timestampValue: expiresAt.toISOString() },
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

export async function handleRegisterPushToken(request, env) {
  const authResult = await verifyAuth(request, env);
  if (!authResult.authorized) {
    return jsonResponse(request, env, { error: 'Unauthorized', detail: authResult.error }, 401);
  }

  try {
    await rateLimiter.check(request, env);
  } catch (error) {
    if (error instanceof RateLimitExceededError) {
      return jsonResponse(request, env, { error: 'Rate limit exceeded', message: error.message, retryAfter: error.retryAfter }, 429);
    }
    console.error('Register token rate limiter failed:', error);
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
        },
      },
      updateMask: { fieldPaths: ['status'] },
    },
    {
      transform: {
        document: `projects/${config.projectId}/databases/(default)/documents/users/${authResult.user}/private/pushTokens`,
        fieldTransforms: [
          {
            fieldPath: 'tokens',
            appendMissingElements: {
              values: [{ stringValue: token }],
            },
          },
          {
            fieldPath: 'updatedAt',
            setToServerValue: 'REQUEST_TIME',
          },
        ],
      },
    },
  ];

  try {
    await commitWrites(config.projectId, config.accessToken, writes);
  } catch (err) {
    console.error('Failed to register token:', err);
    return jsonResponse(request, env, { error: 'Database write error' }, 500);
  }

  return jsonResponse(request, env, { ok: true }, 200);
}
