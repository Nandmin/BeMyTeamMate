import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDir = dirname(fileURLToPath(import.meta.url));
const rootDir = resolve(scriptDir, '..');
const outputPath = resolve(rootDir, 'public/runtime-config.js');

const toTrimmed = (value, fallback = '') => {
  if (typeof value !== 'string') return fallback;
  const normalized = value.trim();
  return normalized || fallback;
};

const vapidKey = toTrimmed(process.env.BMT_VAPID_KEY, 'YOUR_VAPID_KEY');
const turnstileSiteKey = toTrimmed(process.env.BMT_TURNSTILE_SITE_KEY, '');

const runtimeConfigJs = `window.__BMT_RUNTIME_CONFIG__ = {
  vapidKey: ${JSON.stringify(vapidKey)},
  turnstileSiteKey: ${JSON.stringify(turnstileSiteKey)},
};
`;

mkdirSync(dirname(outputPath), { recursive: true });
writeFileSync(outputPath, runtimeConfigJs, 'utf8');

const report = {
  outputPath,
  hasVapidKey: vapidKey !== 'YOUR_VAPID_KEY',
  hasTurnstileSiteKey: Boolean(turnstileSiteKey),
};

console.log('[runtime-config] Generated runtime public config', report);
