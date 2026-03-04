import assert from 'node:assert/strict';
import { generateKeyPairSync } from 'node:crypto';
import test from 'node:test';

import {
  handleIssuePushChallenge,
  handleRegisterPushToken,
} from '../worker/handlers/push-token.js';

function jsonResponse(status, payload) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

async function withMockedFetch(queue, fn) {
  const originalFetch = globalThis.fetch;
  const calls = [];

  globalThis.fetch = async (input, init = {}) => {
    const call = { input: String(input), init };
    calls.push(call);

    const next = queue.shift();
    if (!next) {
      throw new Error(`Unexpected fetch call: ${call.input}`);
    }

    return next(call);
  };

  try {
    return await fn(calls);
  } finally {
    globalThis.fetch = originalFetch;
  }
}

function buildTestEnv(privateKeyPem) {
  return {
    ADMIN_SECRET: 'super-secret',
    FCM_PROJECT_ID: 'demo-project',
    FCM_CLIENT_EMAIL: 'worker@demo-project.iam.gserviceaccount.com',
    FCM_PRIVATE_KEY: privateKeyPem,
    ENVIRONMENT: 'test',
  };
}

test('handleIssuePushChallenge creates a push challenge document', async () => {
  const { privateKey } = generateKeyPairSync('rsa', {
    modulusLength: 2048,
    privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
    publicKeyEncoding: { type: 'spki', format: 'pem' },
  });

  const env = buildTestEnv(privateKey);
  const request = new Request('https://worker.example/issue-push-challenge', {
    method: 'POST',
    headers: {
      'X-Admin-Secret': env.ADMIN_SECRET,
    },
  });

  await withMockedFetch([
    () => jsonResponse(200, { access_token: 'oauth-token' }),
    () => jsonResponse(200, { name: 'projects/demo-project/databases/(default)/documents/pushChallenges/doc1' }),
  ], async (calls) => {
    const response = await handleIssuePushChallenge(request, env);

    assert.equal(response.status, 200);
    const payload = await response.json();
    assert.equal(payload.ok, true);
    assert.equal(typeof payload.challengeId, 'string');
    assert.equal(typeof payload.expiresAt, 'string');

    assert.equal(calls.length, 2);
    assert.match(calls[0].input, /oauth2\.googleapis\.com\/token/);
    assert.match(calls[1].input, /documents\/pushChallenges\?documentId=/);
  });
});

test('handleRegisterPushToken validates challenge and commits writes', async () => {
  const { privateKey } = generateKeyPairSync('rsa', {
    modulusLength: 2048,
    privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
    publicKeyEncoding: { type: 'spki', format: 'pem' },
  });

  const env = buildTestEnv(privateKey);
  const challengeId = 'challenge-123';
  const token = 'fcm-' + 'x'.repeat(120);

  const request = new Request('https://worker.example/register-push-token', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Admin-Secret': env.ADMIN_SECRET,
    },
    body: JSON.stringify({ challengeId, token }),
  });

  const expiresAt = new Date(Date.now() + 5 * 60 * 1000).toISOString();
  const challengeDoc = {
    name: `projects/${env.FCM_PROJECT_ID}/databases/(default)/documents/pushChallenges/${challengeId}`,
    fields: {
      status: { stringValue: 'issued' },
      expiresAt: { timestampValue: expiresAt },
      userId: { stringValue: 'internal-admin' },
    },
  };

  await withMockedFetch([
    () => jsonResponse(200, { access_token: 'oauth-token' }),
    () => jsonResponse(200, challengeDoc),
    () => jsonResponse(200, { writeResults: [] }),
  ], async (calls) => {
    const response = await handleRegisterPushToken(request, env);
    const payload = await response.json();
    assert.equal(response.status, 200, `Unexpected payload: ${JSON.stringify(payload)}`);
    assert.deepEqual(payload, { ok: true });

    assert.equal(calls.length, 3);
    assert.match(calls[2].input, /documents:commit$/);

    const commitBody = JSON.parse(calls[2].init.body);
    assert.equal(Array.isArray(commitBody.writes), true);
    assert.equal(commitBody.writes.length, 2);

    const transform = commitBody.writes[1]?.transform;
    assert.equal(typeof transform?.document, 'string');
    assert.match(transform.document, /users\/internal-admin\/private\/pushTokens$/);
  });
});
