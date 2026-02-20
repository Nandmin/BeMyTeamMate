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

function parseArgs(argv) {
  const result = {
    projectId: null,
    serviceAccountPath: null,
    serviceAccountJson: null,
    pageSize: 500,
    sample: 20,
    withAuthScan: false,
    deleteAuthOrphans: false,
    confirmDelete: '',
    orphanMinAgeHours: 24,
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
    if (arg.startsWith('--page-size=')) {
      const pageSize = Number(arg.split('=')[1]);
      if (!Number.isFinite(pageSize) || pageSize < 1 || pageSize > 1000) {
        throw new Error('Invalid --page-size value. Use an integer between 1 and 1000.');
      }
      result.pageSize = Math.floor(pageSize);
      continue;
    }
    if (arg.startsWith('--sample=')) {
      const sample = Number(arg.split('=')[1]);
      if (!Number.isFinite(sample) || sample < 1 || sample > 200) {
        throw new Error('Invalid --sample value. Use an integer between 1 and 200.');
      }
      result.sample = Math.floor(sample);
      continue;
    }
    if (arg === '--with-auth-scan') {
      result.withAuthScan = true;
      continue;
    }
    if (arg === '--delete-auth-orphans') {
      result.withAuthScan = true;
      result.deleteAuthOrphans = true;
      continue;
    }
    if (arg.startsWith('--confirm-delete=')) {
      result.confirmDelete = arg.slice('--confirm-delete='.length).trim();
      continue;
    }
    if (arg.startsWith('--orphan-min-age-hours=')) {
      const value = Number(arg.split('=')[1]);
      if (!Number.isFinite(value) || value < 0 || value > 24 * 365) {
        throw new Error('Invalid --orphan-min-age-hours value.');
      }
      result.orphanMinAgeHours = value;
      continue;
    }
    if (arg === '--help' || arg === '-h') {
      console.log('Usage: node scripts/migrations/validate-usernames.js [options]');
      console.log('');
      console.log('Options:');
      console.log('  --project=<projectId>                 Firebase project ID');
      console.log('  --service-account=<path>              Path to service account JSON file');
      console.log('  --service-account-json=<json>         Service account JSON inline');
      console.log('  --page-size=<n>                       Read page size (1-1000, default: 500)');
      console.log('  --sample=<n>                          Number of sample rows in report (default: 20)');
      console.log('  --with-auth-scan                      Include Firebase Auth orphan scan');
      console.log('  --delete-auth-orphans                 Delete orphan Auth users (dangerous)');
      console.log('  --confirm-delete=DELETE               Required with --delete-auth-orphans');
      console.log(
        '  --orphan-min-age-hours=<n>            Delete only orphans older than n hours (default: 24)'
      );
      console.log('  -h, --help                            Show this help');
      process.exit(0);
    }

    throw new Error(`Unknown argument: ${arg}`);
  }

  if (result.deleteAuthOrphans && result.confirmDelete !== 'DELETE') {
    throw new Error('Use --confirm-delete=DELETE together with --delete-auth-orphans.');
  }

  return result;
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
  if (serviceAccount) return admin.credential.cert(serviceAccount);
  return admin.credential.applicationDefault();
}

function normalizeUsername(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

function normalizeRaw(value) {
  return String(value || '').trim();
}

function encodeUsernameKey(normalizedUsername) {
  return encodeURIComponent(normalizedUsername);
}

function pushSample(target, value, limit) {
  if (target.length < limit) target.push(value);
}

async function scanCollection(db, collectionPath, pageSize, onDoc) {
  let lastDoc = null;
  while (true) {
    let query = db
      .collection(collectionPath)
      .orderBy(admin.firestore.FieldPath.documentId())
      .limit(pageSize);
    if (lastDoc) query = query.startAfter(lastDoc);

    const snap = await query.get();
    if (snap.empty) break;
    for (const doc of snap.docs) {
      await onDoc(doc);
    }
    lastDoc = snap.docs[snap.docs.length - 1];
    if (snap.size < pageSize) break;
  }
}

function isOlderThanHours(dateString, hours) {
  if (!dateString) return true;
  const parsed = Date.parse(String(dateString));
  if (!Number.isFinite(parsed)) return true;
  return Date.now() - parsed >= hours * 60 * 60 * 1000;
}

async function validate() {
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
  const auth = admin.auth();

  const usersByUid = new Map();
  const usersByNormalized = new Map();
  const reservationsByKey = new Map();

  const stats = {
    usersScanned: 0,
    usersWithUsername: 0,
    reservationsScanned: 0,
    duplicateNormalizedUsers: 0,
    usersMissingReservation: 0,
    usersReservationOwnedByOther: 0,
    reservationsWithoutUser: 0,
    reservationsMismatchedNormalized: 0,
    usersWithInvalidStoredNormalized: 0,
    authUsersScanned: 0,
    authOrphansFound: 0,
    authOrphansDeleted: 0,
    authOrphansDeletionErrors: 0,
  };

  const samples = {
    duplicateNormalizedUsers: [],
    usersMissingReservation: [],
    usersReservationOwnedByOther: [],
    reservationsWithoutUser: [],
    reservationsMismatchedNormalized: [],
    usersWithInvalidStoredNormalized: [],
    authOrphansFound: [],
    authOrphansDeleted: [],
    authOrphansDeletionErrors: [],
  };

  await scanCollection(db, 'users', config.pageSize, async (doc) => {
    stats.usersScanned += 1;
    const data = doc.data() || {};
    const username = normalizeRaw(data.username);
    const usernameNormalizedStored = normalizeRaw(data.usernameNormalized);
    const usernameNormalizedComputed = normalizeUsername(username);
    const usernameNormalized = usernameNormalizedStored || usernameNormalizedComputed;
    const usernameKey = usernameNormalized ? encodeUsernameKey(usernameNormalized) : '';

    usersByUid.set(doc.id, {
      uid: doc.id,
      username,
      usernameNormalized,
      usernameKey,
      hasUsername: !!usernameNormalized,
    });

    if (!usernameNormalized) return;
    stats.usersWithUsername += 1;

    if (usernameNormalizedStored && usernameNormalizedStored !== usernameNormalizedComputed) {
      stats.usersWithInvalidStoredNormalized += 1;
      pushSample(
        samples.usersWithInvalidStoredNormalized,
        `${doc.id}: stored="${usernameNormalizedStored}" computed="${usernameNormalizedComputed}"`,
        config.sample,
      );
    }

    const list = usersByNormalized.get(usernameNormalized) || [];
    list.push(doc.id);
    usersByNormalized.set(usernameNormalized, list);
  });

  await scanCollection(db, 'usernames', config.pageSize, async (doc) => {
    stats.reservationsScanned += 1;
    const data = doc.data() || {};
    const uid = normalizeRaw(data.uid);
    const usernameNormalized = normalizeRaw(data.usernameNormalized);
    const username = normalizeRaw(data.username);
    reservationsByKey.set(doc.id, {
      key: doc.id,
      uid,
      usernameNormalized,
      username,
    });
  });

  for (const [normalized, uids] of usersByNormalized.entries()) {
    if (uids.length <= 1) continue;
    stats.duplicateNormalizedUsers += 1;
    pushSample(
      samples.duplicateNormalizedUsers,
      `${normalized}: ${uids.join(', ')}`,
      config.sample,
    );
  }

  for (const user of usersByUid.values()) {
    if (!user.hasUsername) continue;
    const reservation = reservationsByKey.get(user.usernameKey);
    if (!reservation) {
      stats.usersMissingReservation += 1;
      pushSample(
        samples.usersMissingReservation,
        `${user.uid}: username="${user.username}" normalized="${user.usernameNormalized}" key="${user.usernameKey}"`,
        config.sample,
      );
      continue;
    }
    if (reservation.uid !== user.uid) {
      stats.usersReservationOwnedByOther += 1;
      pushSample(
        samples.usersReservationOwnedByOther,
        `${user.uid}: key="${user.usernameKey}" reservedBy="${reservation.uid}"`,
        config.sample,
      );
    }
  }

  for (const reservation of reservationsByKey.values()) {
    const user = usersByUid.get(reservation.uid);
    if (!user) {
      stats.reservationsWithoutUser += 1;
      pushSample(
        samples.reservationsWithoutUser,
        `${reservation.key}: uid="${reservation.uid}" normalized="${reservation.usernameNormalized}"`,
        config.sample,
      );
      continue;
    }

    if (reservation.usernameNormalized && user.usernameNormalized) {
      if (reservation.usernameNormalized !== user.usernameNormalized) {
        stats.reservationsMismatchedNormalized += 1;
        pushSample(
          samples.reservationsMismatchedNormalized,
          `${reservation.key}: reservation="${reservation.usernameNormalized}" user="${user.usernameNormalized}" uid="${user.uid}"`,
          config.sample,
        );
      }
    }
  }

  if (config.withAuthScan) {
    let nextPageToken = undefined;
    do {
      const page = await auth.listUsers(1000, nextPageToken);
      for (const authUser of page.users) {
        stats.authUsersScanned += 1;
        const userDocExists = usersByUid.has(authUser.uid);
        if (userDocExists) continue;

        const isOldEnough = isOlderThanHours(authUser.metadata?.creationTime, config.orphanMinAgeHours);
        if (!isOldEnough) continue;

        stats.authOrphansFound += 1;
        pushSample(
          samples.authOrphansFound,
          `${authUser.uid}: email="${authUser.email || ''}" created="${authUser.metadata?.creationTime || ''}"`,
          config.sample,
        );

        if (config.deleteAuthOrphans) {
          try {
            await auth.deleteUser(authUser.uid);
            stats.authOrphansDeleted += 1;
            pushSample(
              samples.authOrphansDeleted,
              `${authUser.uid}: email="${authUser.email || ''}"`,
              config.sample,
            );
          } catch (error) {
            stats.authOrphansDeletionErrors += 1;
            pushSample(
              samples.authOrphansDeletionErrors,
              `${authUser.uid}: ${error?.message || String(error)}`,
              config.sample,
            );
          }
        }
      }
      nextPageToken = page.pageToken;
    } while (nextPageToken);
  }

  console.log('Username post-migration validation finished.');
  console.log(`Project: ${config.projectId}`);
  console.log(`Users scanned: ${stats.usersScanned}`);
  console.log(`Users with username: ${stats.usersWithUsername}`);
  console.log(`Reservations scanned: ${stats.reservationsScanned}`);
  console.log(`Duplicate normalized usernames: ${stats.duplicateNormalizedUsers}`);
  console.log(`Users missing reservation: ${stats.usersMissingReservation}`);
  console.log(`Users with reservation owned by another uid: ${stats.usersReservationOwnedByOther}`);
  console.log(`Reservations pointing to missing user: ${stats.reservationsWithoutUser}`);
  console.log(`Reservations/user normalized mismatch: ${stats.reservationsMismatchedNormalized}`);
  console.log(`Users with invalid stored usernameNormalized: ${stats.usersWithInvalidStoredNormalized}`);

  if (config.withAuthScan) {
    console.log(`Auth users scanned: ${stats.authUsersScanned}`);
    console.log(`Auth orphans found (older than ${config.orphanMinAgeHours}h): ${stats.authOrphansFound}`);
    console.log(`Auth orphans deleted: ${stats.authOrphansDeleted}`);
    console.log(`Auth orphan delete errors: ${stats.authOrphansDeletionErrors}`);
  }

  const printSample = (title, list) => {
    if (list.length === 0) return;
    console.log('');
    console.log(`${title} (max ${config.sample}):`);
    for (const item of list) {
      console.log(`- ${item}`);
    }
  };

  printSample('Duplicate normalized usernames', samples.duplicateNormalizedUsers);
  printSample('Users missing reservation', samples.usersMissingReservation);
  printSample('Users with reservation owned by another uid', samples.usersReservationOwnedByOther);
  printSample('Reservations pointing to missing user', samples.reservationsWithoutUser);
  printSample('Reservations/user normalized mismatch', samples.reservationsMismatchedNormalized);
  printSample('Users with invalid stored usernameNormalized', samples.usersWithInvalidStoredNormalized);
  printSample('Auth orphan samples', samples.authOrphansFound);
  printSample('Auth orphan deletions', samples.authOrphansDeleted);
  printSample('Auth orphan deletion errors', samples.authOrphansDeletionErrors);
}

validate().catch((error) => {
  if (error instanceof Error) {
    console.error(`Username validation failed: ${error.message}`);
  } else {
    console.error('Username validation failed:', error);
  }
  process.exitCode = 1;
});
