const fs = require('fs');
const path = require('path');
const admin = require('firebase-admin');

function loadOptionalEnvFile(fileName) {
  const filePath = path.resolve(process.cwd(), fileName);
  if (!fs.existsSync(filePath)) return;

  const content = fs.readFileSync(filePath, 'utf8');
  const lines = content.split(/\r?\n/);
  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    const match = line.match(/^([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/);
    if (!match) continue;

    const key = match[1];
    let value = match[2].trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (process.env[key] === undefined) {
      process.env[key] = value;
    }
  }
}

function parseArgs(argv) {
  const result = {
    projectId: null,
    serviceAccountPath: null,
    serviceAccountJson: null,
    dryRun: false,
    limit: null,
    pageSize: 300,
    source: 'username',
    allowPlaceholder: false,
  };

  for (const arg of argv) {
    if (arg.startsWith('--project=')) {
      result.projectId = arg.split('=')[1]?.trim() || null;
      continue;
    }
    if (arg.startsWith('--service-account=')) {
      result.serviceAccountPath = arg.split('=')[1]?.trim() || null;
      continue;
    }
    if (arg.startsWith('--service-account-json=')) {
      result.serviceAccountJson = arg.slice('--service-account-json='.length).trim() || null;
      continue;
    }
    if (arg === '--dry-run') {
      result.dryRun = true;
      continue;
    }
    if (arg.startsWith('--limit=')) {
      const limit = Number(arg.split('=')[1]);
      if (!Number.isFinite(limit) || limit <= 0) {
        throw new Error('Invalid --limit value. Use a positive integer.');
      }
      result.limit = Math.floor(limit);
      continue;
    }
    if (arg.startsWith('--page-size=')) {
      const pageSize = Number(arg.split('=')[1]);
      if (!Number.isFinite(pageSize) || pageSize < 1 || pageSize > 1000) {
        throw new Error('Invalid --page-size value. Use an integer between 1 and 1000.');
      }
      result.pageSize = Math.floor(pageSize);
      continue;
    }
    if (arg.startsWith('--source=')) {
      const source = arg.split('=')[1]?.trim();
      if (!['username', 'displayName', 'username-or-displayName'].includes(source)) {
        throw new Error(
          'Invalid --source value. Use one of: username, displayName, username-or-displayName.'
        );
      }
      result.source = source;
      continue;
    }
    if (arg === '--allow-placeholder') {
      result.allowPlaceholder = true;
      continue;
    }
    if (arg === '--help' || arg === '-h') {
      console.log('Usage: node scripts/migrations/migrate-usernames.js [options]');
      console.log('');
      console.log('Options:');
      console.log('  --project=<projectId>                 Firebase project ID');
      console.log('  --service-account=<path>              Path to service account JSON file');
      console.log('  --service-account-json=<json>         Service account JSON inline');
      console.log('  --dry-run                             Analyze only, do not write');
      console.log('  --limit=<n>                           Process only the first n users');
      console.log('  --page-size=<n>                       Read page size (1-1000, default: 300)');
      console.log(
        '  --source=<mode>                       username | displayName | username-or-displayName'
      );
      console.log('  --allow-placeholder                   Allow placeholder display names');
      console.log('  -h, --help                            Show this help');
      process.exit(0);
    }

    throw new Error(`Unknown argument: ${arg}`);
  }

  return result;
}

function parseServiceAccountJson(rawJson) {
  if (!rawJson) return null;
  try {
    return JSON.parse(rawJson);
  } catch (error) {
    throw new Error('Invalid FIREBASE_SERVICE_ACCOUNT_JSON (or --service-account-json) value.');
  }
}

function parseServiceAccountFile(rawPath) {
  if (!rawPath) return null;
  const resolvedPath = path.resolve(process.cwd(), rawPath);
  if (!fs.existsSync(resolvedPath)) {
    throw new Error(`Service account file not found: ${resolvedPath}`);
  }
  try {
    const raw = fs.readFileSync(resolvedPath, 'utf8');
    return JSON.parse(raw);
  } catch (error) {
    throw new Error(`Invalid service account JSON file: ${resolvedPath}`);
  }
}

function resolveRuntimeConfig(argv) {
  loadOptionalEnvFile('.env.migrations');
  loadOptionalEnvFile('.env');

  const cli = parseArgs(argv);
  const serviceAccount =
    parseServiceAccountJson(cli.serviceAccountJson || process.env.FIREBASE_SERVICE_ACCOUNT_JSON) ||
    parseServiceAccountFile(cli.serviceAccountPath || process.env.FIREBASE_SERVICE_ACCOUNT_PATH);

  const projectId =
    cli.projectId ||
    process.env.FIREBASE_PROJECT_ID ||
    process.env.GOOGLE_CLOUD_PROJECT ||
    process.env.GCLOUD_PROJECT ||
    serviceAccount?.project_id ||
    null;

  return { ...cli, projectId, serviceAccount };
}

function resolveCredential(serviceAccount) {
  if (serviceAccount) {
    return admin.credential.cert(serviceAccount);
  }
  return admin.credential.applicationDefault();
}

function normalizeUsername(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

function normalizeRawUsername(value) {
  return String(value || '').trim();
}

function isPlaceholderDisplayName(value) {
  const normalized = normalizeUsername(value);
  if (!normalized) return true;
  const placeholders = new Set(['nevtelen', 'ismeretlen', 'felhasznalo', 'user', 'unknown']);
  return placeholders.has(normalized);
}

function resolveCandidateUsername(userData, options) {
  const rawUsername = normalizeRawUsername(userData.username);
  const rawDisplayName = normalizeRawUsername(userData.displayName);

  if (options.source === 'username') {
    return rawUsername;
  }

  if (options.source === 'displayName') {
    if (!options.allowPlaceholder && isPlaceholderDisplayName(rawDisplayName)) return '';
    return rawDisplayName;
  }

  if (rawUsername) return rawUsername;
  if (!options.allowPlaceholder && isPlaceholderDisplayName(rawDisplayName)) return '';
  return rawDisplayName;
}

function encodeUsernameKey(normalizedUsername) {
  return encodeURIComponent(normalizedUsername);
}

async function migrate() {
  const config = resolveRuntimeConfig(process.argv.slice(2));
  if (!config.projectId) {
    throw new Error(
      [
        'Missing Firebase project ID.',
        'Set one of: FIREBASE_PROJECT_ID, GOOGLE_CLOUD_PROJECT, GCLOUD_PROJECT, or pass --project=<id>.',
        'Also provide credentials via FIREBASE_SERVICE_ACCOUNT_PATH/FIREBASE_SERVICE_ACCOUNT_JSON (or --service-account).',
      ].join('\n'),
    );
  }

  admin.initializeApp({
    credential: resolveCredential(config.serviceAccount),
    projectId: config.projectId,
  });

  const db = admin.firestore();
  const counters = {
    scanned: 0,
    processed: 0,
    noCandidate: 0,
    invalid: 0,
    reservationsCreated: 0,
    reservationsUpdated: 0,
    userDocsPatched: 0,
    conflicts: 0,
    errors: 0,
  };
  const conflictSamples = [];
  const errorSamples = [];

  const shouldStop = () => config.limit !== null && counters.scanned >= config.limit;
  let lastDoc = null;

  while (true) {
    if (shouldStop()) break;

    let query = db
      .collection('users')
      .orderBy(admin.firestore.FieldPath.documentId())
      .limit(config.pageSize);
    if (lastDoc) {
      query = query.startAfter(lastDoc);
    }

    const pageSnap = await query.get();
    if (pageSnap.empty) break;

    for (const userDoc of pageSnap.docs) {
      if (shouldStop()) break;
      counters.scanned += 1;
      const userData = userDoc.data() || {};

      const username = resolveCandidateUsername(userData, config);
      if (!username) {
        counters.noCandidate += 1;
        continue;
      }

      const usernameNormalized = normalizeUsername(username);
      if (!usernameNormalized) {
        counters.invalid += 1;
        continue;
      }

      const usernameKey = encodeUsernameKey(usernameNormalized);
      const reservationRef = db.doc(`usernames/${usernameKey}`);
      const userRef = db.doc(`users/${userDoc.id}`);

      if (config.dryRun) {
        const reservationSnap = await reservationRef.get();
        if (reservationSnap.exists) {
          const reservedUid = String(reservationSnap.data()?.uid || '');
          if (reservedUid && reservedUid !== userDoc.id) {
            counters.conflicts += 1;
            if (conflictSamples.length < 20) {
              conflictSamples.push(
                `${username} (${usernameNormalized}) -> user ${userDoc.id}, already reserved by ${reservedUid}`,
              );
            }
            continue;
          }
          counters.reservationsUpdated += 1;
        } else {
          counters.reservationsCreated += 1;
        }

        if (userData.username !== username || userData.usernameNormalized !== usernameNormalized) {
          counters.userDocsPatched += 1;
        }
        counters.processed += 1;
        continue;
      }

      try {
        const outcome = await db.runTransaction(async (tx) => {
          const reservationSnap = await tx.get(reservationRef);
          if (reservationSnap.exists) {
            const reservedUid = String(reservationSnap.data()?.uid || '');
            if (reservedUid && reservedUid !== userDoc.id) {
              return { status: 'conflict', reservedUid };
            }
          }

          const patchUser = userData.username !== username || userData.usernameNormalized !== usernameNormalized;
          tx.set(
            reservationRef,
            {
              uid: userDoc.id,
              username,
              usernameNormalized,
              usernameKey,
              createdAt: reservationSnap.exists
                ? reservationSnap.data()?.createdAt || admin.firestore.FieldValue.serverTimestamp()
                : admin.firestore.FieldValue.serverTimestamp(),
              updatedAt: admin.firestore.FieldValue.serverTimestamp(),
            },
            { merge: true },
          );

          if (patchUser) {
            tx.set(
              userRef,
              {
                username,
                usernameNormalized,
              },
              { merge: true },
            );
          }

          return {
            status: reservationSnap.exists ? 'updated' : 'created',
            patchUser,
          };
        });

        if (outcome.status === 'conflict') {
          counters.conflicts += 1;
          if (conflictSamples.length < 20) {
            conflictSamples.push(
              `${username} (${usernameNormalized}) -> user ${userDoc.id}, already reserved by ${outcome.reservedUid}`,
            );
          }
          continue;
        }

        if (outcome.status === 'created') counters.reservationsCreated += 1;
        if (outcome.status === 'updated') counters.reservationsUpdated += 1;
        if (outcome.patchUser) counters.userDocsPatched += 1;
        counters.processed += 1;
      } catch (error) {
        counters.errors += 1;
        if (errorSamples.length < 20) {
          errorSamples.push(`${userDoc.id}: ${error?.message || String(error)}`);
        }
      }
    }

    lastDoc = pageSnap.docs[pageSnap.docs.length - 1];
    if (pageSnap.size < config.pageSize) break;
  }

  console.log('Username reservation migration finished.');
  console.log(`Project: ${config.projectId}`);
  console.log(`Mode: ${config.dryRun ? 'DRY RUN (no writes)' : 'WRITE'}`);
  console.log(`Source: ${config.source}`);
  console.log(`Scanned users: ${counters.scanned}`);
  console.log(`Processed users: ${counters.processed}`);
  console.log(`Skipped (no candidate username): ${counters.noCandidate}`);
  console.log(`Skipped (invalid username after normalization): ${counters.invalid}`);
  console.log(`Reservations created: ${counters.reservationsCreated}`);
  console.log(`Reservations updated/already-owned: ${counters.reservationsUpdated}`);
  console.log(`User docs patched with username fields: ${counters.userDocsPatched}`);
  console.log(`Conflicts: ${counters.conflicts}`);
  console.log(`Errors: ${counters.errors}`);

  if (conflictSamples.length > 0) {
    console.log('');
    console.log('Conflict samples (max 20):');
    for (const sample of conflictSamples) {
      console.log(`- ${sample}`);
    }
  }

  if (errorSamples.length > 0) {
    console.log('');
    console.log('Error samples (max 20):');
    for (const sample of errorSamples) {
      console.log(`- ${sample}`);
    }
  }
}

migrate().catch((error) => {
  if (error instanceof Error) {
    console.error(`Username migration failed: ${error.message}`);
  } else {
    console.error('Username migration failed:', error);
  }
  process.exitCode = 1;
});
