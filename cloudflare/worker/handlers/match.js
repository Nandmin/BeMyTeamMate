import { verifyAuth } from '../auth.js';
import { jsonResponse, readJsonBody } from '../http.js';
import {
  canFinalizeGroupMatchResult,
  commitWrites,
  fetchUserElos,
  getFirestoreAuth,
  getFirestoreDocumentByUrl,
  getGroupMemberDocUrl,
  getUserDocUrl,
} from '../firestore.js';
import {
  chunkArray,
  createHttpError,
  getHttpStatusFromError,
  isValidFirestoreDocId,
  parseFirestoreNumberValue,
  parseFirestoreStringArray,
  parseRatingSnapshotField,
  toBoundedInt,
} from '../utils.js';
import {
  MATCH_ASSIST_BONUS,
  MATCH_DEFAULT_ELO,
  MATCH_ELO_K_FACTOR,
  MATCH_GOAL_BONUS,
  MAX_MATCH_PLAYER_STAT,
} from '../constants.js';

function sanitizeMatchStats(rawStats, participantIds) {
  const safeStats = new Map();
  const source = rawStats && typeof rawStats === 'object' ? rawStats : {};
  for (const userId of participantIds) {
    const item = source[userId];
    const goals = toBoundedInt(item?.goals, 0, MAX_MATCH_PLAYER_STAT);
    const assists = toBoundedInt(item?.assists, 0, MAX_MATCH_PLAYER_STAT);
    safeStats.set(userId, { goals, assists });
  }
  return safeStats;
}

function calculateAverageElo(team) {
  if (!Array.isArray(team) || team.length === 0) return MATCH_DEFAULT_ELO;
  const total = team.reduce((sum, player) => {
    const elo = Number(player?.elo);
    return sum + (Number.isFinite(elo) ? elo : MATCH_DEFAULT_ELO);
  }, 0);
  return total / team.length;
}

function getExpectedScore(ratingA, ratingB) {
  return 1 / (1 + Math.pow(10, (ratingB - ratingA) / 400));
}

function calculateMatchRatingChanges(teamA, teamB, goalsA, goalsB, statsByUser) {
  const changes = new Map();
  const avgEloA = calculateAverageElo(teamA);
  const avgEloB = calculateAverageElo(teamB);
  const expectedA = getExpectedScore(avgEloA, avgEloB);
  const expectedB = getExpectedScore(avgEloB, avgEloA);

  let actualA = 0.5;
  let actualB = 0.5;
  if (goalsA > goalsB) {
    actualA = 1;
    actualB = 0;
  } else if (goalsB > goalsA) {
    actualA = 0;
    actualB = 1;
  }

  const deltaA = Math.round(MATCH_ELO_K_FACTOR * (actualA - expectedA));
  const deltaB = Math.round(MATCH_ELO_K_FACTOR * (actualB - expectedB));

  for (const player of teamA) {
    const currentElo = Number.isFinite(player?.elo) ? Number(player.elo) : MATCH_DEFAULT_ELO;
    const stats = statsByUser.get(player.userId) || { goals: 0, assists: 0 };
    const bonus = stats.goals * MATCH_GOAL_BONUS + stats.assists * MATCH_ASSIST_BONUS;
    changes.set(player.userId, Math.round(currentElo + deltaA + bonus));
  }

  for (const player of teamB) {
    const currentElo = Number.isFinite(player?.elo) ? Number(player.elo) : MATCH_DEFAULT_ELO;
    const stats = statsByUser.get(player.userId) || { goals: 0, assists: 0 };
    const bonus = stats.goals * MATCH_GOAL_BONUS + stats.assists * MATCH_ASSIST_BONUS;
    changes.set(player.userId, Math.round(currentElo + deltaB + bonus));
  }

  return changes;
}

async function fetchGroupMemberRecords(projectId, accessToken, groupId, userIds) {
  const records = new Map();
  if (!Array.isArray(userIds) || userIds.length === 0) return records;

  const url = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents:runQuery`;
  for (let i = 0; i < userIds.length; i += 10) {
    const chunk = userIds.slice(i, i + 10);
    const body = {
      structuredQuery: {
        from: [{ collectionId: 'members' }],
        where: {
          fieldFilter: {
            field: { fieldPath: 'userId' },
            op: 'IN',
            value: {
              arrayValue: { values: chunk.map((id) => ({ stringValue: id })) },
            },
          },
        },
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
      throw new Error(`Group member query failed: ${response.status} ${detail}`);
    }

    const rows = await response.json();
    for (const row of rows || []) {
      const memberDoc = row?.document;
      if (!memberDoc?.name) continue;
      const fields = memberDoc.fields || {};
      const userId = typeof fields.userId?.stringValue === 'string' ? fields.userId.stringValue : '';
      if (!userId) continue;
      const current = records.get(userId) || { docNames: [], elo: null };
      current.docNames.push(memberDoc.name);
      const eloValue = parseFirestoreNumberValue(fields.elo, null);
      if (!Number.isFinite(current.elo) && Number.isFinite(eloValue)) {
        current.elo = eloValue;
      }
      records.set(userId, current);
    }
  }

  return records;
}

async function fetchCanonicalGroupMemberRecords(projectId, accessToken, groupId, userIds) {
  const records = new Map();
  if (!Array.isArray(userIds) || userIds.length === 0) return records;

  const chunks = chunkArray(userIds, 20);
  for (const chunk of chunks) {
    const results = await Promise.all(
      chunk.map(async (userId) => {
        const memberDoc = await getFirestoreDocumentByUrl(
          getGroupMemberDocUrl(projectId, groupId, userId),
          accessToken
        );
        if (!memberDoc?.name) return { userId, docName: null, elo: null };
        return {
          userId,
          docName: memberDoc.name,
          elo: parseFirestoreNumberValue(memberDoc?.fields?.elo, null),
        };
      })
    );

    for (const result of results) {
      if (!result.docName) continue;
      records.set(result.userId, { docName: result.docName, elo: result.elo });
    }
  }

  return records;
}

async function finalizeGroupMatchResult(projectId, accessToken, groupId, eventId, rawStats) {
  const eventDocName = `projects/${projectId}/databases/(default)/documents/groups/${groupId}/events/${eventId}`;
  const eventDocUrl = `https://firestore.googleapis.com/v1/${eventDocName}`;
  const eventDoc = await getFirestoreDocumentByUrl(eventDocUrl, accessToken);
  if (!eventDoc) throw createHttpError(404, 'Event not found');

  const fields = eventDoc.fields || {};
  const status = fields.status?.stringValue || '';
  if (status === 'finished') {
    throw createHttpError(409, 'Event already finished');
  }

  const teamAIds = parseFirestoreStringArray(fields.teamA);
  const teamBIds = parseFirestoreStringArray(fields.teamB);
  if (teamAIds.length === 0 || teamBIds.length === 0) {
    throw createHttpError(400, 'Event teams are missing or empty');
  }

  const overlap = teamAIds.some((userId) => teamBIds.includes(userId));
  if (overlap) {
    throw createHttpError(400, 'Event teams overlap');
  }

  const participantIds = Array.from(new Set([...teamAIds, ...teamBIds]));
  const statsByUser = sanitizeMatchStats(rawStats, participantIds);
  const goalsA = teamAIds.reduce((sum, userId) => sum + (statsByUser.get(userId)?.goals || 0), 0);
  const goalsB = teamBIds.reduce((sum, userId) => sum + (statsByUser.get(userId)?.goals || 0), 0);

  const [memberRecords, canonicalMemberRecords, userElos] = await Promise.all([
    fetchGroupMemberRecords(projectId, accessToken, groupId, participantIds),
    fetchCanonicalGroupMemberRecords(projectId, accessToken, groupId, participantIds),
    fetchUserElos(projectId, accessToken, participantIds),
  ]);
  const snapshotElos = parseRatingSnapshotField(fields.playerRatingSnapshot);

  const getCurrentElo = (userId) => {
    const snapshotElo = snapshotElos.get(userId);
    if (Number.isFinite(snapshotElo)) return Number(snapshotElo);
    const canonicalMemberElo = canonicalMemberRecords.get(userId)?.elo;
    if (Number.isFinite(canonicalMemberElo)) return Number(canonicalMemberElo);
    const memberElo = memberRecords.get(userId)?.elo;
    if (Number.isFinite(memberElo)) return Number(memberElo);
    const userElo = userElos.get(userId);
    if (Number.isFinite(userElo)) return Number(userElo);
    return MATCH_DEFAULT_ELO;
  };

  const teamA = teamAIds.map((userId) => ({ userId, elo: getCurrentElo(userId) }));
  const teamB = teamBIds.map((userId) => ({ userId, elo: getCurrentElo(userId) }));
  const newRatings = calculateMatchRatingChanges(teamA, teamB, goalsA, goalsB, statsByUser);

  const playerStatsFields = {};
  for (const userId of participantIds) {
    const playerStats = statsByUser.get(userId) || { goals: 0, assists: 0 };
    const currentElo = getCurrentElo(userId);
    const newElo = newRatings.get(userId) ?? currentElo;
    const eloDelta = Math.round(newElo - currentElo);
    playerStatsFields[userId] = {
      mapValue: {
        fields: {
          goals: { integerValue: String(playerStats.goals) },
          assists: { integerValue: String(playerStats.assists) },
          eloDelta: { integerValue: String(eloDelta) },
        },
      },
    };
  }

  const nowIso = new Date().toISOString();
  const shouldStartMvpVoting =
    fields.mvpVotingEnabled?.booleanValue && !fields.mvpVotingStartedAt?.timestampValue;

  const eventFields = {
    playerStats: { mapValue: { fields: playerStatsFields } },
    goalsA: { integerValue: String(goalsA) },
    goalsB: { integerValue: String(goalsB) },
    status: { stringValue: 'finished' },
    endedAt: { timestampValue: nowIso },
    ...(shouldStartMvpVoting ? { mvpVotingStartedAt: { timestampValue: nowIso } } : {}),
  };
  const eventUpdateMask = ['playerStats', 'goalsA', 'goalsB', 'status', 'endedAt'];
  if (shouldStartMvpVoting) eventUpdateMask.push('mvpVotingStartedAt');

  const writes = [
    {
      update: {
        name: eventDocName,
        fields: eventFields,
      },
      updateMask: { fieldPaths: eventUpdateMask },
    },
  ];

  for (const userId of participantIds) {
    const newElo = Math.round(newRatings.get(userId) ?? getCurrentElo(userId));
    writes.push({
      update: {
        name: getUserDocUrl(projectId, userId),
        fields: {
          elo: { integerValue: String(newElo) },
          lastGroupId: { stringValue: groupId },
        },
      },
      updateMask: { fieldPaths: ['elo', 'lastGroupId'] },
    });
    writes.push({
      transform: {
        document: `projects/${projectId}/databases/(default)/documents/users/${userId}`,
        fieldTransforms: [
          { fieldPath: 'profileUpdatedAt', setToServerValue: 'REQUEST_TIME' },
          {
            fieldPath: 'lastModifiedFields',
            appendMissingElements: { values: [{ stringValue: 'elo' }] },
          },
        ],
      },
    });

    const memberDocNames = new Set();
    const canonicalMember = canonicalMemberRecords.get(userId);
    if (canonicalMember?.docName) {
      memberDocNames.add(canonicalMember.docName);
    }
    const memberRecord = memberRecords.get(userId);
    const legacyMemberDocNames = Array.isArray(memberRecord?.docNames) ? memberRecord.docNames : [];
    legacyMemberDocNames.forEach((docName) => {
      if (typeof docName === 'string' && docName.trim()) memberDocNames.add(docName);
    });

    memberDocNames.forEach((docName) => {
      writes.push({
        update: {
          name: docName,
          fields: { elo: { integerValue: String(newElo) } },
        },
        updateMask: { fieldPaths: ['elo'] },
      });
    });
  }

  if (writes.length > 499) {
    throw createHttpError(400, 'Too many participants to finalize in one operation');
  }

  await commitWrites(projectId, accessToken, writes);

  return {
    groupId,
    eventId,
    participantCount: participantIds.length,
    goalsA,
    goalsB,
  };
}

export async function handleFinalizeMatchResults(request, env) {
  const authResult = await verifyAuth(request, env);
  if (!authResult.authorized) {
    return jsonResponse(request, env, { error: 'Unauthorized', detail: authResult.error }, 401);
  }
  if (authResult.authType !== 'firebase' || !authResult.user) {
    return jsonResponse(
      request,
      env,
      { error: 'Firebase ID token required for this endpoint' },
      401
    );
  }

  const body = await readJsonBody(request);
  if (!body.ok) return jsonResponse(request, env, { error: body.error }, 400);
  const payloadRoot = body.data || {};
  const payload =
    payloadRoot && typeof payloadRoot.data === 'object' && payloadRoot.data !== null
      ? payloadRoot.data
      : payloadRoot;
  const groupId = typeof payload.groupId === 'string' ? payload.groupId.trim() : '';
  const eventId = typeof payload.eventId === 'string' ? payload.eventId.trim() : '';
  const rawStats = payload.stats;

  if (!groupId || !eventId) {
    return jsonResponse(request, env, { error: 'Missing groupId or eventId' }, 400);
  }
  if (!isValidFirestoreDocId(groupId) || !isValidFirestoreDocId(eventId)) {
    return jsonResponse(request, env, { error: 'Invalid groupId or eventId format' }, 400);
  }

  const config = await getFirestoreAuth(env);
  if (!config.ok) return jsonResponse(request, env, { error: config.error }, 500);

  try {
    const allowed = await canFinalizeGroupMatchResult(
      config.projectId,
      config.accessToken,
      groupId,
      authResult.user
    );
    if (!allowed) {
      return jsonResponse(request, env, { error: 'Forbidden' }, 403);
    }

    const result = await finalizeGroupMatchResult(
      config.projectId,
      config.accessToken,
      groupId,
      eventId,
      rawStats
    );
    return jsonResponse(request, env, { ok: true, ...result }, 200);
  } catch (error) {
    const status = getHttpStatusFromError(error, 500);
    const message =
      typeof error?.message === 'string' && error.message.trim()
        ? error.message
        : 'Failed to finalize match results';
    if (status >= 500) {
      console.error('Finalize match results failed:', error);
    }
    return jsonResponse(request, env, { error: message }, status);
  }
}
