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
    if (arg === '--help' || arg === '-h') {
      console.log('Usage: node scripts/migrations/migrate-group-members.js [options]');
      console.log('');
      console.log('Options:');
      console.log('  --project=<projectId>                 Firebase project ID');
      console.log('  --service-account=<path>              Path to service account JSON file');
      console.log('  --service-account-json=<json>         Service account JSON inline');
      console.log('  -h, --help                            Show this help');
      process.exit(0);
    }
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

function resolveRuntimeConfig() {
  loadOptionalEnvFile('.env.migrations');
  loadOptionalEnvFile('.env');

  const cli = parseArgs(process.argv.slice(2));

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

  return { projectId, serviceAccount };
}

function resolveCredential(serviceAccount) {
  if (serviceAccount) {
    return admin.credential.cert(serviceAccount);
  }
  return admin.credential.applicationDefault();
}

function buildGroupSummary(groupId, group) {
  const summary = {
    id: groupId,
    name: group.name,
    type: group.type,
    ownerId: group.ownerId,
    ownerName: group.ownerName,
    ownerPhoto: group.ownerPhoto ?? null,
    createdAt: group.createdAt,
    memberCount: group.memberCount ?? 0,
    image: group.image,
    description: group.description ?? '',
  };
  Object.keys(summary).forEach((key) => summary[key] === undefined && delete summary[key]);
  return summary;
}

async function migrate() {
  const { projectId, serviceAccount } = resolveRuntimeConfig();
  if (!projectId) {
    throw new Error(
      [
        'Missing Firebase project ID.',
        'Set one of: FIREBASE_PROJECT_ID, GOOGLE_CLOUD_PROJECT, GCLOUD_PROJECT, or pass --project=<id>.',
        'Also provide credentials via FIREBASE_SERVICE_ACCOUNT_PATH/FIREBASE_SERVICE_ACCOUNT_JSON (or --service-account).',
        'Example (PowerShell):',
        '$env:FIREBASE_PROJECT_ID="your-project-id"; ' +
          '$env:FIREBASE_SERVICE_ACCOUNT_PATH="C:\\path\\service-account.json"; npm run migrate:group-members',
      ].join('\n'),
    );
  }

  admin.initializeApp({
    credential: resolveCredential(serviceAccount),
    projectId,
  });

  const db = admin.firestore();
  const groupsSnap = await db.collection('groups').get();
  let updatedMembers = 0;
  let createdSummaries = 0;
  let normalizedIds = 0;
  let skipped = 0;

  for (const groupDoc of groupsSnap.docs) {
    const groupId = groupDoc.id;
    const groupData = groupDoc.data();
    const membersSnap = await db.collection(`groups/${groupId}/members`).get();
    if (membersSnap.empty) continue;

    let batch = db.batch();
    let batchOps = 0;

    for (const memberDoc of membersSnap.docs) {
      const data = memberDoc.data();
      const memberUid = data.userId || memberDoc.id;
      if (!memberUid) {
        skipped += 1;
        continue;
      }

      if (memberDoc.id !== memberUid) {
        const targetRef = db.doc(`groups/${groupId}/members/${memberUid}`);
        batch.set(targetRef, { ...data, userId: memberUid }, { merge: true });
        batch.delete(memberDoc.ref);
        normalizedIds += 1;
        batchOps += 2;
      } else if (!data.userId) {
        batch.update(memberDoc.ref, { userId: memberUid });
        updatedMembers += 1;
        batchOps += 1;
      }

      const summaryRef = db.doc(`users/${memberUid}/groups/${groupId}`);
      batch.set(summaryRef, buildGroupSummary(groupId, groupData), { merge: true });
      createdSummaries += 1;
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
  }

  console.log('Migration complete.');
  console.log(`Normalized member doc IDs: ${normalizedIds}`);
  console.log(`Updated missing userId fields: ${updatedMembers}`);
  console.log(`Group summaries written: ${createdSummaries}`);
  console.log(`Skipped members without uid: ${skipped}`);
}

migrate().catch((error) => {
  if (error instanceof Error) {
    console.error(`Migration failed: ${error.message}`);
  } else {
    console.error('Migration failed:', error);
  }
  process.exitCode = 1;
});
