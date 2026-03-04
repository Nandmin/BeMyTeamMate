import { jsonResponse } from '../http.js';
import { rateLimiter, RateLimitExceededError } from '../rate-limit.js';
import { createFirestoreDocument } from '../firestore.js';
import { getAccessToken, normalizePrivateKey } from '../google-auth.js';

export async function handleContactMessage(request, env) {
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
    return jsonResponse(request, env, { error: 'Rate limiter unavailable' }, 503);
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
