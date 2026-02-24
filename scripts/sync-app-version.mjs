import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDir = dirname(fileURLToPath(import.meta.url));
const rootDir = resolve(scriptDir, '..');
const packageJsonPath = resolve(rootDir, 'package.json');
const outputPath = resolve(rootDir, 'src/environments/app-version.ts');

const packageJson = JSON.parse(readFileSync(packageJsonPath, 'utf8'));
const version = typeof packageJson.version === 'string' && packageJson.version.trim()
  ? packageJson.version.trim()
  : '1.0.0';

const output = `export const APP_VERSION = '${version}';
`;

writeFileSync(outputPath, output, 'utf8');
console.log('[sync-app-version] Updated', { outputPath, version });
