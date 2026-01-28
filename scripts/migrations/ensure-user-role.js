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

admin.initializeApp({
  credential: resolveCredential(),
  projectId: projectId || undefined,
});

const db = admin.firestore();

async function ensureRoles() {
  const usersSnap = await db.collection('users').get();
  let updated = 0;
  let skipped = 0;
  let batch = db.batch();
  let batchOps = 0;

  for (const doc of usersSnap.docs) {
    const data = doc.data();
    if (data.role !== undefined && data.role !== null && data.role !== '') {
      skipped += 1;
      continue;
    }

    batch.update(doc.ref, { role: 'user' });
    updated += 1;
    batchOps += 1;

    if (batchOps >= 450) {
      await batch.commit();
      batch = db.batch();
      batchOps = 0;
    }
  }

  if (batchOps > 0) {
    await batch.commit();
  }

  console.log('Role backfill complete.');
  console.log(`Updated users: ${updated}`);
  console.log(`Skipped users (already had role): ${skipped}`);
}

ensureRoles().catch((error) => {
  console.error('Role backfill failed:', error);
  process.exitCode = 1;
});
