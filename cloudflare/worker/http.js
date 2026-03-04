export function corsHeaders(request, env) {
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

export function jsonResponse(request, env, payload, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: {
      'Content-Type': 'application/json',
      ...corsHeaders(request, env),
    },
  });
}

export async function readJsonBody(request) {
  try {
    const data = await request.json();
    return { ok: true, data };
  } catch {
    return { ok: false, error: 'Invalid JSON body' };
  }
}
