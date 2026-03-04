import { getAccessToken, normalizePrivateKey } from './google-auth.js';
import { chunkArray, parseFirestoreNumberValue } from './utils.js';

export function getPushTokensDocUrl(projectId, userId) {
  return `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents/users/${userId}/private/pushTokens`;
}

function extractTokensFromPushTokenDoc(doc) {
  const values = doc?.fields?.tokens?.arrayValue?.values || [];
  const tokens = [];
  for (const value of values) {
    if (typeof value?.stringValue === 'string' && value.stringValue.trim()) {
      tokens.push(value.stringValue.trim());
    }
  }
  return tokens;
}

export async function fetchPushTokensForUserIds(projectId, accessToken, userIds) {
  const uniqueUserIds = Array.from(
    new Set(
      (Array.isArray(userIds) ? userIds : [])
        .map((value) => String(value || '').trim())
        .filter(Boolean)
    )
  );
  if (uniqueUserIds.length === 0) return [];

  const tokens = [];
  const chunks = chunkArray(uniqueUserIds, 20);
  for (const chunk of chunks) {
    const results = await Promise.all(
      chunk.map(async (userId) => {
        const response = await fetch(getPushTokensDocUrl(projectId, userId), {
          headers: { Authorization: `Bearer ${accessToken}` },
        });

        if (response.status === 404) return [];
        if (!response.ok) {
          const detail = await response.text();
          throw new Error(`Push token doc fetch failed (${userId}): ${response.status} ${detail}`);
        }

        const doc = await response.json();
        return extractTokensFromPushTokenDoc(doc);
      })
    );
    for (const row of results) {
      tokens.push(...row);
    }
  }

  return Array.from(new Set(tokens));
}

export function getUserDocUrl(projectId, userId) {
  return `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents/users/${userId}`;
}

export function getGroupMemberDocUrl(projectId, groupId, userId) {
  return `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents/groups/${groupId}/members/${userId}`;
}

export function getGroupInviteDocUrl(projectId, groupId, userId) {
  return `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents/groups/${groupId}/invites/${userId}`;
}

export function getGroupJoinRequestDocUrl(projectId, groupId, userId) {
  return `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents/groups/${groupId}/joinRequests/${userId}`;
}

export function getGroupDocUrl(projectId, groupId) {
  return `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents/groups/${groupId}`;
}

export async function getFirestoreDocumentByUrl(docUrl, accessToken) {
  const response = await fetch(docUrl, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (response.status === 404) return null;
  if (!response.ok) {
    const detail = await response.text();
    throw new Error(`Document fetch failed: ${response.status} ${detail}`);
  }
  return response.json();
}

export async function documentExists(docUrl, accessToken) {
  const response = await fetch(docUrl, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (response.status === 404) return false;
  if (!response.ok) {
    const detail = await response.text();
    throw new Error(`Document lookup failed: ${response.status} ${detail}`);
  }
  return true;
}

export async function isUserSiteAdmin(projectId, accessToken, userId) {
  const response = await fetch(getUserDocUrl(projectId, userId), {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (response.status === 404) return false;
  if (!response.ok) {
    const detail = await response.text();
    throw new Error(`User lookup failed (${userId}): ${response.status} ${detail}`);
  }
  const doc = await response.json();
  const role = doc?.fields?.role?.stringValue || '';
  return role === 'siteadmin';
}

export async function findGroupMemberDoc(projectId, accessToken, groupId, userId) {
  const url = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents:runQuery`;
  const body = {
    structuredQuery: {
      from: [{ collectionId: 'members' }],
      where: {
        fieldFilter: {
          field: { fieldPath: 'userId' },
          op: 'EQUAL',
          value: { stringValue: userId },
        },
      },
      limit: 1,
    },
    parent: `projects/${projectId}/databases/(default)/documents/groups/${groupId}`,
  };

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const detail = await response.text();
    throw new Error(`Member query failed: ${response.status} ${detail}`);
  }

  const data = await response.json();
  for (const row of data || []) {
    if (row?.document?.name) return row.document.name;
  }
  return null;
}

export async function getGroupMemberDocument(projectId, accessToken, groupId, userId) {
  if (!groupId || !userId) return null;

  let memberDoc = await getFirestoreDocumentByUrl(
    getGroupMemberDocUrl(projectId, groupId, userId),
    accessToken
  );
  if (memberDoc) return memberDoc;

  const memberDocName = await findGroupMemberDoc(projectId, accessToken, groupId, userId);
  if (!memberDocName) return null;

  memberDoc = await getFirestoreDocumentByUrl(
    `https://firestore.googleapis.com/v1/${memberDocName}`,
    accessToken
  );
  return memberDoc || null;
}

export async function isUserGroupMember(projectId, accessToken, groupId, userId) {
  const memberDoc = await getGroupMemberDocument(projectId, accessToken, groupId, userId);
  return Boolean(memberDoc);
}

export async function canSendGroupNotification(projectId, accessToken, groupId, userId, type) {
  if (!groupId || !userId) return false;
  const [isMember, isSiteAdmin] = await Promise.all([
    isUserGroupMember(projectId, accessToken, groupId, userId),
    isUserSiteAdmin(projectId, accessToken, userId),
  ]);
  if (isMember || isSiteAdmin) return true;

  // Allow non-members to notify admins about their own pending join request.
  if (type === 'group_join') {
    return documentExists(getGroupJoinRequestDocUrl(projectId, groupId, userId), accessToken);
  }

  return false;
}

export async function fetchGroupMemberUserIds(projectId, accessToken, groupId) {
  const userIds = [];
  let pageToken = '';

  do {
    const url = new URL(
      `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents/groups/${groupId}/members`
    );
    url.searchParams.set('pageSize', '200');
    if (pageToken) url.searchParams.set('pageToken', pageToken);

    const response = await fetch(url.toString(), {
      headers: { Authorization: `Bearer ${accessToken}` },
    });

    if (response.status === 404) return [];
    if (!response.ok) {
      const detail = await response.text();
      throw new Error(`Group members list failed (${groupId}): ${response.status} ${detail}`);
    }

    const data = await response.json();
    const docs = data.documents || [];
    for (const doc of docs) {
      const userId = doc?.fields?.userId?.stringValue || doc?.name?.split('/').pop() || '';
      if (userId) userIds.push(userId);
    }
    pageToken = data.nextPageToken || '';
  } while (pageToken);

  return Array.from(new Set(userIds));
}

async function isUserEligibleTarget(projectId, accessToken, groupId, userId, memberSet) {
  if (memberSet?.has(userId)) return true;

  const [hasInvite, hasJoinRequest] = await Promise.all([
    documentExists(getGroupInviteDocUrl(projectId, groupId, userId), accessToken),
    documentExists(getGroupJoinRequestDocUrl(projectId, groupId, userId), accessToken),
  ]);
  return hasInvite || hasJoinRequest;
}

export async function filterEligibleTargetUserIds(
  projectId,
  accessToken,
  groupId,
  targetUserIds,
  memberUserIds
) {
  const uniqueTargetUserIds = Array.from(
    new Set(
      (Array.isArray(targetUserIds) ? targetUserIds : [])
        .map((value) => String(value || '').trim())
        .filter(Boolean)
    )
  );
  if (uniqueTargetUserIds.length === 0) return [];

  const memberSet = new Set(
    (Array.isArray(memberUserIds) ? memberUserIds : [])
      .map((value) => String(value || '').trim())
      .filter(Boolean)
  );

  const allowed = [];
  const chunks = chunkArray(uniqueTargetUserIds, 20);
  for (const chunk of chunks) {
    const results = await Promise.all(
      chunk.map(async (userId) => {
        const eligible = await isUserEligibleTarget(
          projectId,
          accessToken,
          groupId,
          userId,
          memberSet
        );
        return eligible ? userId : '';
      })
    );
    for (const userId of results) {
      if (userId) allowed.push(userId);
    }
  }
  return allowed;
}

export async function canFinalizeGroupMatchResult(projectId, accessToken, groupId, userId) {
  if (!groupId || !userId) return false;
  const isSiteAdmin = await isUserSiteAdmin(projectId, accessToken, userId);
  if (isSiteAdmin) return true;

  const groupDoc = await getFirestoreDocumentByUrl(getGroupDocUrl(projectId, groupId), accessToken);
  if (!groupDoc) return false;
  const ownerId = groupDoc?.fields?.ownerId?.stringValue || '';
  if (ownerId && ownerId === userId) return true;

  const memberDoc = await getGroupMemberDocument(projectId, accessToken, groupId, userId);
  if (!memberDoc) return false;
  return Boolean(memberDoc?.fields?.isAdmin?.booleanValue);
}

export async function createFirestoreDocument(projectId, accessToken, collection, fields) {
  const url = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents/${collection}`;
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ fields }),
  });

  if (!response.ok) {
    const detail = await response.text();
    throw new Error(`Firestore write failed: ${response.status} ${detail}`);
  }
}

export async function fetchSiteAdminTokens(projectId, accessToken) {
  const url = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents:runQuery`;
  const body = {
    structuredQuery: {
      from: [{ collectionId: 'users' }],
      where: {
        fieldFilter: {
          field: { fieldPath: 'role' },
          op: 'EQUAL',
          value: { stringValue: 'siteadmin' },
        },
      },
    },
  };

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const detail = await response.text();
    throw new Error(`Firestore query failed: ${response.status} ${detail}`);
  }

  const data = await response.json();
  const userIds = [];
  for (const row of data || []) {
    const doc = row?.document;
    const userId = doc?.name?.split('/').pop();
    if (userId) userIds.push(userId);
  }

  return fetchPushTokensForUserIds(projectId, accessToken, userIds);
}

export async function fetchUserElos(projectId, accessToken, userIds) {
  const elos = new Map();
  if (!Array.isArray(userIds) || userIds.length === 0) return elos;

  const chunks = chunkArray(userIds, 20);
  for (const chunk of chunks) {
    const results = await Promise.all(
      chunk.map(async (userId) => {
        const response = await fetch(getUserDocUrl(projectId, userId), {
          headers: { Authorization: `Bearer ${accessToken}` },
        });
        if (response.status === 404) return { userId, elo: null };
        if (!response.ok) {
          const detail = await response.text();
          throw new Error(`User elo fetch failed (${userId}): ${response.status} ${detail}`);
        }
        const userDoc = await response.json();
        return {
          userId,
          elo: parseFirestoreNumberValue(userDoc?.fields?.elo, null),
        };
      })
    );

    for (const result of results) {
      if (Number.isFinite(result.elo)) {
        elos.set(result.userId, Number(result.elo));
      }
    }
  }

  return elos;
}

export async function commitWrites(projectId, accessToken, writes) {
  const url = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents:commit`;
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ writes }),
  });

  if (!response.ok) {
    const detail = await response.text();
    throw new Error(`Commit failed: ${response.status} ${detail}`);
  }
}

export async function getFirestoreAuth(env) {
  const projectId = env.FCM_PROJECT_ID;
  const clientEmail = env.FCM_CLIENT_EMAIL;
  const privateKey = normalizePrivateKey(env.FCM_PRIVATE_KEY);

  if (!projectId || !clientEmail || !privateKey) {
    console.error('Missing Firestore configuration in secrets');
    return { ok: false, error: 'Server configuration error' };
  }

  try {
    const accessToken = await getAccessToken(
      clientEmail,
      privateKey,
      'https://www.googleapis.com/auth/datastore'
    );
    return { ok: true, projectId, accessToken };
  } catch (error) {
    console.error('Firestore token generation failed:', error);
    return { ok: false, error: 'Failed to obtain Firestore access token' };
  }
}

export async function getMinimalFirestoreAuth(env) {
  const projectId = env.FCM_PROJECT_ID || env.FIREBASE_PROJECT_ID;
  const clientEmail = env.FIRESTORE_MINIMAL_CLIENT_EMAIL || env.FCM_CLIENT_EMAIL;
  const privateKeyStr = env.FIRESTORE_MINIMAL_PRIVATE_KEY || env.FCM_PRIVATE_KEY;
  const privateKey = normalizePrivateKey(privateKeyStr);

  if (!projectId || !clientEmail || !privateKey) {
    console.error('Missing minimal Firestore configuration in secrets');
    return { ok: false, error: 'Server configuration error' };
  }

  try {
    const accessToken = await getAccessToken(
      clientEmail,
      privateKey,
      'https://www.googleapis.com/auth/datastore'
    );
    return { ok: true, projectId, accessToken };
  } catch (error) {
    console.error('Minimal Firestore token generation failed:', error);
    return { ok: false, error: 'Failed to obtain minimal Firestore access token' };
  }
}
