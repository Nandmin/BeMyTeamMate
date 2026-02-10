const admin = require('firebase-admin');

const projectId = process.env.FIREBASE_PROJECT_ID;
const serviceAccountJson = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
const serviceAccountPath = process.env.FIREBASE_SERVICE_ACCOUNT_PATH;

function resolveCredential() {
  if (serviceAccountJson) {
    try {
      const parsed = JSON.parse(serviceAccountJson);
      return admin.credential.cert(parsed);
    } catch (error) {
      throw new Error('Invalid FIREBASE_SERVICE_ACCOUNT_JSON value.');
    }
  }
  if (serviceAccountPath) {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const serviceAccount = require(serviceAccountPath);
    return admin.credential.cert(serviceAccount);
  }
  return admin.credential.applicationDefault();
}

function parseArgs(argv) {
  const args = new Set(argv);
  const limitArg = argv.find((arg) => arg.startsWith('--limit='));
  const limit = limitArg ? Number(limitArg.split('=')[1]) : null;
  if (limitArg && (!Number.isFinite(limit) || limit <= 0)) {
    throw new Error('Invalid --limit value. Use a positive integer.');
  }

  return {
    dryRun: args.has('--dry-run'),
    keepLegacy: args.has('--keep-legacy'),
    limit: limit ? Math.floor(limit) : null,
  };
}

function normalizeTokens(raw) {
  const values = Array.isArray(raw) ? raw : typeof raw === 'string' ? [raw] : [];
  return Array.from(
    new Set(values.map((value) => String(value || '').trim()).filter(Boolean))
  );
}

function hasLegacyField(data) {
  return Object.prototype.hasOwnProperty.call(data, 'fcmTokens');
}

async function migrate() {
  const options = parseArgs(process.argv.slice(2));

  admin.initializeApp({
    credential: resolveCredential(),
    projectId: projectId || undefined,
  });

  const db = admin.firestore();
  const usersSnap = await db.collection('users').get();
  const users = options.limit ? usersSnap.docs.slice(0, options.limit) : usersSnap.docs;

  let scanned = 0;
  let legacyUsers = 0;
  let tokenRows = 0;
  let migratedUsers = 0;
  let legacyRemovedUsers = 0;
  let cleanupOnlyUsers = 0;
  let skipped = 0;
  let malformed = 0;

  let batch = db.batch();
  let batchOps = 0;

  const flush = async () => {
    if (options.dryRun || batchOps === 0) return;
    await batch.commit();
    batch = db.batch();
    batchOps = 0;
  };

  for (const userDoc of users) {
    scanned += 1;
    const data = userDoc.data() || {};
    const legacyExists = hasLegacyField(data);
    if (!legacyExists) {
      skipped += 1;
      continue;
    }
    legacyUsers += 1;

    const tokens = normalizeTokens(data.fcmTokens);
    if (!Array.isArray(data.fcmTokens) && typeof data.fcmTokens !== 'string') {
      malformed += 1;
    }

    if (tokens.length > 0) {
      tokenRows += tokens.length;
      migratedUsers += 1;
      if (!options.dryRun) {
        const pushTokensRef = db.doc(`users/${userDoc.id}/private/pushTokens`);
        batch.set(
          pushTokensRef,
          {
            tokens: admin.firestore.FieldValue.arrayUnion(...tokens),
            updatedAt: admin.firestore.FieldValue.serverTimestamp(),
          },
          { merge: true }
        );
        batchOps += 1;
      }
    }

    if (!options.keepLegacy) {
      legacyRemovedUsers += 1;
      if (tokens.length === 0) cleanupOnlyUsers += 1;
      if (!options.dryRun) {
        batch.update(userDoc.ref, { fcmTokens: admin.firestore.FieldValue.delete() });
        batchOps += 1;
      }
    }

    if (batchOps >= 450) {
      await flush();
    }
  }

  await flush();

  console.log('FCM token migration finished.');
  console.log(`Scanned users: ${scanned}`);
  console.log(`Users with legacy fcmTokens: ${legacyUsers}`);
  console.log(`Users migrated with token payload: ${migratedUsers}`);
  console.log(`Legacy fields removed: ${legacyRemovedUsers}`);
  console.log(`Legacy-only cleanup users (empty/invalid token field): ${cleanupOnlyUsers}`);
  console.log(`Normalized token values migrated: ${tokenRows}`);
  console.log(`Malformed legacy fields seen: ${malformed}`);
  console.log(`Skipped users without legacy fcmTokens: ${skipped}`);
  console.log(`Mode: ${options.dryRun ? 'DRY RUN (no writes)' : 'WRITE'}`);
  console.log(`Legacy field removal: ${options.keepLegacy ? 'disabled' : 'enabled'}`);
}

migrate().catch((error) => {
  console.error('FCM token migration failed:', error);
  process.exitCode = 1;
});
