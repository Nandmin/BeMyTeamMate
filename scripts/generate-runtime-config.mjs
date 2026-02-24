import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDir = dirname(fileURLToPath(import.meta.url));
const rootDir = resolve(scriptDir, '..');
const outputPath = resolve(rootDir, 'public/runtime-config.js');
const packageJsonPath = resolve(rootDir, 'package.json');

const toTrimmed = (value, fallback = '') => {
  if (typeof value !== 'string') return fallback;
  const normalized = value.trim();
  return normalized || fallback;
};

const vapidKey = toTrimmed(process.env.BMT_VAPID_KEY, 'YOUR_VAPID_KEY');
const turnstileSiteKey = toTrimmed(process.env.BMT_TURNSTILE_SITE_KEY, '');
const packageJson = JSON.parse(readFileSync(packageJsonPath, 'utf8'));
const appVersion = toTrimmed(packageJson.version, '1.0.0');

const runtimeConfigJs = `window.__BMT_RUNTIME_CONFIG__ = {
  appVersion: ${JSON.stringify(appVersion)},
  vapidKey: ${JSON.stringify(vapidKey)},
  turnstileSiteKey: ${JSON.stringify(turnstileSiteKey)},
};
`;

mkdirSync(dirname(outputPath), { recursive: true });
writeFileSync(outputPath, runtimeConfigJs, 'utf8');

const report = {
  outputPath,
  appVersion,
  hasVapidKey: vapidKey !== 'YOUR_VAPID_KEY',
  hasTurnstileSiteKey: Boolean(turnstileSiteKey),
};

console.log('[runtime-config] Generated runtime public config', report);
