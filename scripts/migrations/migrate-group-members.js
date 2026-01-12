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
  console.error('Migration failed:', error);
  process.exitCode = 1;
});
