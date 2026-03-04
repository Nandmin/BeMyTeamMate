import assert from 'node:assert/strict';
import test from 'node:test';

import worker from '../worker.js';

test('worker handles OPTIONS preflight', async () => {
  const request = new Request('https://worker.example/send-notification', {
    method: 'OPTIONS',
    headers: { Origin: 'http://localhost:4200' },
  });

  const response = await worker.fetch(request, {}, {});
  assert.equal(response.status, 204);
  assert.equal(response.headers.get('access-control-allow-origin'), 'http://localhost:4200');
});

test('worker rejects unsupported HTTP methods', async () => {
  const request = new Request('https://worker.example/send-notification', {
    method: 'GET',
  });

  const response = await worker.fetch(request, {}, {});
  assert.equal(response.status, 405);
  assert.deepEqual(await response.json(), { error: 'Method not allowed' });
});

test('worker returns 404 for unknown endpoint', async () => {
  const request = new Request('https://worker.example/unknown-endpoint', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: '{}',
  });

  const response = await worker.fetch(request, {}, {});
  assert.equal(response.status, 404);
  assert.deepEqual(await response.json(), { error: 'Endpoint not found' });
});

test('worker forwards csp-report to CSP handler', async () => {
  const request = new Request('https://worker.example/csp-report', {
    method: 'POST',
    headers: { 'Content-Type': 'application/csp-report' },
    body: '{"csp-report":{"blocked-uri":"https://bad.example"}}',
  });

  const response = await worker.fetch(request, {}, {});
  assert.equal(response.status, 204);
});
