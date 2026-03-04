/**
 * CSP violation report handler.
 * Accepts POST from browsers sending Content-Security-Policy-Report-Only violations.
 * Logs to Cloudflare Workers Observability and returns 204. No auth required -
 * reports come from end-user browsers. Oversized or non-JSON bodies are silently dropped.
 */
export async function handleCspReport(request) {
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
    // Malformed body - ignore silently
  }

  return new Response(null, { status: 204 });
}
