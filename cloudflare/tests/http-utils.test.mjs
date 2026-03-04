import assert from 'node:assert/strict';
import test from 'node:test';

import { corsHeaders, jsonResponse, readJsonBody } from '../worker/http.js';
import { isRelativeAppLink, validateRecipientTokens } from '../worker/utils.js';

test('corsHeaders returns request origin when origin is allowed', () => {
  const request = new Request('https://example.com', {
    method: 'POST',
    headers: { Origin: 'http://localhost:4200' },
  });

  const headers = corsHeaders(request, {});
  assert.equal(headers['Access-Control-Allow-Origin'], 'http://localhost:4200');
  assert.equal(headers['Access-Control-Allow-Methods'], 'POST, OPTIONS');
});

test('corsHeaders returns null origin for disallowed origins', () => {
  const request = new Request('https://example.com', {
    method: 'POST',
    headers: { Origin: 'https://evil.example' },
  });

  const headers = corsHeaders(request, {});
  assert.equal(headers['Access-Control-Allow-Origin'], 'null');
});

test('readJsonBody returns error object for malformed JSON', async () => {
  const request = new Request('https://example.com', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: '{invalid',
  });

  const result = await readJsonBody(request);
  assert.deepEqual(result, { ok: false, error: 'Invalid JSON body' });
});

test('jsonResponse includes CORS headers and status code', async () => {
  const request = new Request('https://example.com', {
    headers: { Origin: 'http://localhost:4200' },
  });

  const response = jsonResponse(request, {}, { ok: true }, 201);
  assert.equal(response.status, 201);
  assert.equal(response.headers.get('access-control-allow-origin'), 'http://localhost:4200');

  const payload = await response.json();
  assert.deepEqual(payload, { ok: true });
});

test('isRelativeAppLink validates only app-relative links', () => {
  assert.equal(isRelativeAppLink('/groups/abc'), true);
  assert.equal(isRelativeAppLink('https://bemyteammate.eu'), false);
  assert.equal(isRelativeAppLink('//cdn.example.com/x'), false);
  assert.equal(isRelativeAppLink('groups/abc'), false);
});

test('validateRecipientTokens removes invalid tokens and deduplicates valid ones', () => {
  const valid = 'a'.repeat(120);
  const invalid = 'short-token';

  const result = validateRecipientTokens([valid, valid, invalid, '', '   ']);
  assert.deepEqual(result, {
    tokens: [valid],
    invalidCount: 3,
  });
});
