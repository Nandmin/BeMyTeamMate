import { verifyAuth, verifyInternalAdminSecret } from '../auth.js';
import { getAccessToken, normalizePrivateKey } from '../google-auth.js';
import { jsonResponse, readJsonBody } from '../http.js';
import { rateLimiter, RateLimitExceededError } from '../rate-limit.js';
import {
  canFinalizeGroupMatchResult,
  commitWrites,
  findGroupMemberDoc,
  getFirestoreAuth,
  isUserGroupMember,
  isUserSiteAdmin,
} from '../firestore.js';
import { isValidFirestoreDocId } from '../utils.js';

export async function handleMvpGroupFinalize(request, env) {
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
  const dryRun = Boolean(payload.dryRun);
  const eventId = typeof payload.eventId === 'string' ? payload.eventId.trim() : '';
  if (!groupId) return jsonResponse(request, env, { error: 'Missing groupId' }, 400);
  if (!isValidFirestoreDocId(groupId)) {
    return jsonResponse(request, env, { error: 'Invalid groupId format' }, 400);
  }
  if (eventId && !isValidFirestoreDocId(eventId)) {
    return jsonResponse(request, env, { error: 'Invalid eventId format' }, 400);
  }

  const config = await getFirestoreAuth(env);
  if (!config.ok) return jsonResponse(request, env, { error: config.error }, 500);

  const [isSiteAdmin, isMember] = await Promise.all([
    isUserSiteAdmin(config.projectId, config.accessToken, authResult.user),
    isUserGroupMember(config.projectId, config.accessToken, groupId, authResult.user),
  ]);
  if (!isSiteAdmin && !isMember) {
    return jsonResponse(
      request,
      env,
      { error: 'Forbidden: group membership required' },
      403
    );
  }

  const allowed = await canFinalizeGroupMatchResult(
    config.projectId,
    config.accessToken,
    groupId,
    authResult.user
  );
  if (!allowed) {
    return jsonResponse(request, env, { error: 'Forbidden: group admin required' }, 403);
  }

  const now = new Date();
  const cutoffIso = now.toISOString();
  const events = await fetchEligibleMvpEvents(
    config.projectId,
    config.accessToken,
    groupId,
    cutoffIso
  );
  const legacyEvents = await fetchLegacyMvpEvents(
    config.projectId,
    config.accessToken,
    groupId
  );
  const mergedEvents = mergeEventDocs(events, legacyEvents);
  const mergedCount = mergedEvents.length;
  let total = mergedCount;
  let eligible = mergedEvents.filter((doc) => summarizeMvpEventDoc(doc, now).eligible);
  if (eligible.length === 0 && mergedEvents.length === 0) {
    const allEvents = await listGroupEvents(config.projectId, config.accessToken, groupId);
    const fallbackEvents = allEvents.filter(
      (doc) => doc?.fields?.mvpVotingEnabled?.booleanValue
    );
    total = fallbackEvents.length;
    eligible = fallbackEvents.filter((doc) => summarizeMvpEventDoc(doc, now).eligible);
  }
  if (eventId) {
    eligible = eligible.filter((doc) => doc?.name?.split('/').pop() === eventId);
  }
  if (!dryRun) {
    for (const eventDoc of eligible) {
      await finalizeMvpEvent(config.projectId, config.accessToken, groupId, eventDoc);
    }
  }

  return jsonResponse(request, env,
    {
      ok: true,
      groupId,
      eventId: eventId || null,
      dryRun,
      total,
      eligible: eligible.length,
    },
    200
  );
}

export async function handleMvpCronRunNow(request, env, ctx) {
  const internalAuth = verifyInternalAdminSecret(request, env);
  if (!internalAuth.authorized) {
    return jsonResponse(request, env, { error: 'Unauthorized', detail: internalAuth.error }, 401);
  }
  try {
    await rateLimiter.checkGlobal(env, 'mvp-cron-run-now');
  } catch (error) {
    if (error instanceof RateLimitExceededError) {
      return jsonResponse(request, env, { error: 'Rate limit exceeded', message: error.message, retryAfter: error.retryAfter }, 429);
    }
    console.error('MVP run-now rate limiter failed:', error);
    return jsonResponse(request, env, { error: 'Rate limiter unavailable' }, 503);
  }

  if (ctx?.waitUntil) {
    ctx.waitUntil(handleMvpCron(env, { force: true, trigger: 'manual' }));
    return jsonResponse(request, env, { ok: true, queued: true }, 202);
  }

  await handleMvpCron(env, { force: true, trigger: 'manual' });
  return jsonResponse(request, env, { ok: true, queued: false }, 200);
}

export async function handleMvpCronListGroup(request, env) {
  const internalAuth = verifyInternalAdminSecret(request, env);
  if (!internalAuth.authorized) {
    return jsonResponse(request, env, { error: 'Unauthorized', detail: internalAuth.error }, 401);
  }

  const body = await readJsonBody(request);
  if (!body.ok) return jsonResponse(request, env, { error: body.error }, 400);
  const groupId = typeof body.data?.groupId === 'string' ? body.data.groupId.trim() : '';
  if (!groupId) return jsonResponse(request, env, { error: 'Missing groupId' }, 400);
  if (!isValidFirestoreDocId(groupId)) {
    return jsonResponse(request, env, { error: 'Invalid groupId format' }, 400);
  }

  const config = await getFirestoreAuth(env);
  if (!config.ok) return jsonResponse(request, env, { error: config.error }, 500);

  const now = new Date();
  const cutoffIso = now.toISOString();
  const events = await fetchEligibleMvpEvents(
    config.projectId,
    config.accessToken,
    groupId,
    cutoffIso
  );
  const legacyEvents = await fetchLegacyMvpEvents(
    config.projectId,
    config.accessToken,
    groupId
  );
  const mergedEvents = mergeEventDocs(events, legacyEvents);
  const items = mergedEvents.map((doc) =>
    summarizeMvpEventDoc(doc, now)
  );
  const eligible = items.filter((item) => item.eligible);
  return jsonResponse(request, env,
    { ok: true, groupId, total: items.length, eligible: eligible.length, items },
    200
  );
}

export async function handleMvpCronRunGroup(request, env) {
  const internalAuth = verifyInternalAdminSecret(request, env);
  if (!internalAuth.authorized) {
    return jsonResponse(request, env, { error: 'Unauthorized', detail: internalAuth.error }, 401);
  }

  const body = await readJsonBody(request);
  if (!body.ok) return jsonResponse(request, env, { error: body.error }, 400);
  const payloadRoot = body.data || {};
  const payload =
    payloadRoot && typeof payloadRoot.data === 'object' && payloadRoot.data !== null
      ? payloadRoot.data
      : payloadRoot;
  const groupId = typeof payload.groupId === 'string' ? payload.groupId.trim() : '';
  const dryRun = Boolean(payload.dryRun);
  const eventId = typeof payload.eventId === 'string' ? payload.eventId.trim() : '';
  if (!groupId) return jsonResponse(request, env, { error: 'Missing groupId' }, 400);
  if (!isValidFirestoreDocId(groupId)) {
    return jsonResponse(request, env, { error: 'Invalid groupId format' }, 400);
  }
  if (eventId && !isValidFirestoreDocId(eventId)) {
    return jsonResponse(request, env, { error: 'Invalid eventId format' }, 400);
  }

  const config = await getFirestoreAuth(env);
  if (!config.ok) return jsonResponse(request, env, { error: config.error }, 500);

  const now = new Date();
  const cutoffIso = now.toISOString();
  const events = await fetchEligibleMvpEvents(
    config.projectId,
    config.accessToken,
    groupId,
    cutoffIso
  );
  const legacyEvents = await fetchLegacyMvpEvents(
    config.projectId,
    config.accessToken,
    groupId
  );
  const mergedEvents = mergeEventDocs(events, legacyEvents);
  const mergedCount = mergedEvents.length;
  let total = mergedCount;
  let eligible = mergedEvents.filter((doc) => summarizeMvpEventDoc(doc, now).eligible);
  if (eligible.length === 0 && mergedEvents.length === 0) {
    const allEvents = await listGroupEvents(config.projectId, config.accessToken, groupId);
    const fallbackEvents = allEvents.filter(
      (doc) => doc?.fields?.mvpVotingEnabled?.booleanValue
    );
    total = fallbackEvents.length;
    eligible = fallbackEvents.filter((doc) => summarizeMvpEventDoc(doc, now).eligible);
  }
  if (eventId) {
    eligible = eligible.filter((doc) => doc?.name?.split('/').pop() === eventId);
  }
  if (!dryRun) {
    for (const eventDoc of eligible) {
      await finalizeMvpEvent(config.projectId, config.accessToken, groupId, eventDoc);
    }
  }

  return jsonResponse(request, env,
    {
      ok: true,
      groupId,
      eventId: eventId || null,
      dryRun,
      total,
      eligible: eligible.length,
    },
    200
  );
}

export async function handleMvpCronGetEvent(request, env) {
  const internalAuth = verifyInternalAdminSecret(request, env);
  if (!internalAuth.authorized) {
    return jsonResponse(request, env, { error: 'Unauthorized', detail: internalAuth.error }, 401);
  }

  const body = await readJsonBody(request);
  if (!body.ok) return jsonResponse(request, env, { error: body.error }, 400);
  const groupId = typeof body.data?.groupId === 'string' ? body.data.groupId.trim() : '';
  const eventId = typeof body.data?.eventId === 'string' ? body.data.eventId.trim() : '';
  if (!groupId || !eventId) {
    return jsonResponse(request, env, { error: 'Missing groupId or eventId' }, 400);
  }
  if (!isValidFirestoreDocId(groupId) || !isValidFirestoreDocId(eventId)) {
    return jsonResponse(request, env, { error: 'Invalid groupId or eventId format' }, 400);
  }

  const config = await getFirestoreAuth(env);
  if (!config.ok) return jsonResponse(request, env, { error: config.error }, 500);

  const docName = `projects/${config.projectId}/databases/(default)/documents/groups/${groupId}/events/${eventId}`;
  const eventUrl = `https://firestore.googleapis.com/v1/${docName}`;
  const response = await fetch(eventUrl, {
    headers: { Authorization: `Bearer ${config.accessToken}` },
  });
  if (!response.ok) {
    const detail = await response.text();
    return jsonResponse(request, env, { error: `Event fetch failed: ${response.status} ${detail}` }, 500);
  }

  const doc = await response.json();
  const summary = summarizeMvpEventDoc(doc, new Date());
  return jsonResponse(request, env, { ok: true, groupId, eventId, summary }, 200);
}

export async function handleMvpCronListEvents(request, env) {
  const internalAuth = verifyInternalAdminSecret(request, env);
  if (!internalAuth.authorized) {
    return jsonResponse(request, env, { error: 'Unauthorized', detail: internalAuth.error }, 401);
  }

  const body = await readJsonBody(request);
  if (!body.ok) return jsonResponse(request, env, { error: body.error }, 400);
  const groupId = typeof body.data?.groupId === 'string' ? body.data.groupId.trim() : '';
  const pageSizeRaw = Number(body.data?.pageSize ?? 50);
  const pageSize = Number.isFinite(pageSizeRaw) ? Math.min(Math.max(pageSizeRaw, 1), 200) : 50;
  const pageToken = typeof body.data?.pageToken === 'string' ? body.data.pageToken.trim() : '';
  if (!groupId) return jsonResponse(request, env, { error: 'Missing groupId' }, 400);
  if (!isValidFirestoreDocId(groupId)) {
    return jsonResponse(request, env, { error: 'Invalid groupId format' }, 400);
  }

  const config = await getFirestoreAuth(env);
  if (!config.ok) return jsonResponse(request, env, { error: config.error }, 500);

  const listUrl = new URL(
    `https://firestore.googleapis.com/v1/projects/${config.projectId}/databases/(default)/documents/groups/${groupId}/events`
  );
  listUrl.searchParams.set('pageSize', String(pageSize));
  if (pageToken) listUrl.searchParams.set('pageToken', pageToken);

  const response = await fetch(listUrl.toString(), {
    headers: { Authorization: `Bearer ${config.accessToken}` },
  });
  if (!response.ok) {
    const detail = await response.text();
    return jsonResponse(request, env, { error: `Events list failed: ${response.status} ${detail}` }, 500);
  }

  const data = await response.json();
  const docs = data.documents || [];
  const now = new Date();
  const items = docs.map((doc) => summarizeMvpEventDoc(doc, now));
  return jsonResponse(request, env,
    {
      ok: true,
      groupId,
      total: items.length,
      items,
      nextPageToken: data.nextPageToken || null,
    },
    200
  );
}

export async function handleMvpCronNormalizeGroup(request, env) {
  const internalAuth = verifyInternalAdminSecret(request, env);
  if (!internalAuth.authorized) {
    return jsonResponse(request, env, { error: 'Unauthorized', detail: internalAuth.error }, 401);
  }

  const body = await readJsonBody(request);
  if (!body.ok) return jsonResponse(request, env, { error: body.error }, 400);
  const groupId = typeof body.data?.groupId === 'string' ? body.data.groupId.trim() : '';
  if (!groupId) return jsonResponse(request, env, { error: 'Missing groupId' }, 400);
  if (!isValidFirestoreDocId(groupId)) {
    return jsonResponse(request, env, { error: 'Invalid groupId format' }, 400);
  }

  const config = await getFirestoreAuth(env);
  if (!config.ok) return jsonResponse(request, env, { error: config.error }, 500);

  const now = new Date();
  const result = await normalizeMvpEventsForGroup(
    config.projectId,
    config.accessToken,
    groupId,
    now
  );
  return jsonResponse(request, env, { ok: true, groupId, ...result }, 200);
}

export async function handleMvpCronReportGroup(request, env) {
  const internalAuth = verifyInternalAdminSecret(request, env);
  if (!internalAuth.authorized) {
    return jsonResponse(request, env, { error: 'Unauthorized', detail: internalAuth.error }, 401);
  }

  const body = await readJsonBody(request);
  if (!body.ok) return jsonResponse(request, env, { error: body.error }, 400);
  const groupId = typeof body.data?.groupId === 'string' ? body.data.groupId.trim() : '';
  if (!groupId) return jsonResponse(request, env, { error: 'Missing groupId' }, 400);
  if (!isValidFirestoreDocId(groupId)) {
    return jsonResponse(request, env, { error: 'Invalid groupId format' }, 400);
  }

  const config = await getFirestoreAuth(env);
  if (!config.ok) return jsonResponse(request, env, { error: config.error }, 500);

  const docs = await listGroupEvents(config.projectId, config.accessToken, groupId);
  const items = docs
    .filter((doc) => doc?.fields?.mvpVotingEnabled?.booleanValue)
    .map((doc) => {
      const fields = doc.fields || {};
      return {
        id: doc.name?.split('/').pop() || 'unknown',
        status: fields.status?.stringValue || null,
        mvpEloAwarded: Boolean(fields.mvpEloAwarded?.booleanValue),
        mvpWinnerId: fields.mvpWinnerId?.stringValue || null,
        endedAt: fields.endedAt?.timestampValue || null,
        updateTime: doc.updateTime || null,
      };
    });

  return jsonResponse(request, env, { ok: true, groupId, total: items.length, items }, 200);
}

export async function handleMvpScheduled(event, env, ctx) {
  console.log('MVP cron triggered', { scheduledTime: event.scheduledTime });
  ctx.waitUntil(handleMvpCron(env));
}

async function handleMvpCron(env, options = {}) {
  console.log('MVP cron start');
  const startedAt = Date.now();
  const { force = false, trigger = 'scheduled' } = options || {};
  const now = new Date();
  if (!force && !shouldRunBudapestCron(now)) {
    console.log('MVP cron skipped: not 00:30 in Europe/Budapest');
    return;
  }
  if (force) {
    console.log('MVP cron forced run', { trigger });
  }

  const projectId = env.FCM_PROJECT_ID;
  const clientEmail = env.FCM_CLIENT_EMAIL;
  const privateKey = normalizePrivateKey(env.FCM_PRIVATE_KEY);

  if (!projectId || !clientEmail || !privateKey) {
    console.error('Missing Firestore configuration in secrets');
    return;
  }

  let accessToken;
  try {
    accessToken = await getAccessToken(
      clientEmail,
      privateKey,
      'https://www.googleapis.com/auth/datastore'
    );
  } catch (error) {
    console.error('Firestore token generation failed:', error);
    return;
  }

  const cutoffIso = now.toISOString();
  console.log('MVP cron now', { nowIso: cutoffIso });

  const groupIds = await fetchAllGroupIds(projectId, accessToken);
  console.log('MVP cron groups found', { count: groupIds.length });
  let totalEvents = 0;
  let totalFinalized = 0;
  for (const groupId of groupIds) {
    try {
      const normalization = await normalizeMvpEventsForGroup(projectId, accessToken, groupId, now);
      if (normalization.updatedCount > 0) {
        console.log('MVP cron normalization', { groupId, ...normalization });
      }
      const events = await fetchEligibleMvpEvents(projectId, accessToken, groupId, cutoffIso);
      const legacyEvents = force
        ? await fetchLegacyMvpEvents(projectId, accessToken, groupId)
        : [];
      const mergedEvents = mergeEventDocs(events, legacyEvents);
      let eligibleEvents = mergedEvents.filter((eventDoc) => {
        const fields = eventDoc?.fields || {};
        const endAtUtc = fields.mvpVotingEndsAt?.timestampValue
          ? new Date(fields.mvpVotingEndsAt.timestampValue)
          : getEventVotingEndUtc(fields);
        if (!endAtUtc) return false;
        return now >= endAtUtc;
      });
      if (eligibleEvents.length === 0 && mergedEvents.length === 0) {
        const allEvents = await listGroupEvents(projectId, accessToken, groupId);
        const fallbackEvents = allEvents.filter(
          (doc) => doc?.fields?.mvpVotingEnabled?.booleanValue
        );
        eligibleEvents = fallbackEvents.filter((eventDoc) => {
          const fields = eventDoc?.fields || {};
          if (fields.status?.stringValue !== 'finished') return false;
          if (fields.mvpEloAwarded?.booleanValue) return false;
          const endAtUtc = fields.mvpVotingEndsAt?.timestampValue
            ? new Date(fields.mvpVotingEndsAt.timestampValue)
            : getEventVotingEndUtc(fields);
          if (!endAtUtc) return false;
          return now >= endAtUtc;
        });
        if (eligibleEvents.length > 0) {
          console.log('MVP cron fallback eligible events found', {
            groupId,
            count: eligibleEvents.length,
          });
        }
      }
      if (mergedEvents.length !== events.length) {
        const legacyCount = mergedEvents.length - events.length;
        if (legacyCount > 0) {
          console.log('MVP cron legacy events detected', { groupId, legacyCount });
        }
      }
      if (eligibleEvents.length > 0) {
        console.log('MVP cron events found', { groupId, count: eligibleEvents.length });
      }
      totalEvents += eligibleEvents.length;
      for (const eventDoc of eligibleEvents) {
        await finalizeMvpEvent(projectId, accessToken, groupId, eventDoc);
        totalFinalized += 1;
      }
    } catch (error) {
      console.error(`MVP cron failed for group ${groupId}:`, error);
    }
  }

  const durationMs = Date.now() - startedAt;
  if (totalEvents === 0) {
    console.log('MVP cron finished with no operations', { durationMs });
  } else {
    console.log('MVP cron finished', { totalEvents, totalFinalized, durationMs });
  }

  console.log('MVP cron done');
}

function shouldRunBudapestCron(now) {
  const parts = getZonedParts(now, 'Europe/Budapest');
  return parts.hour === 0 && parts.minute === 30;
}

function getZonedParts(date, timeZone) {
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hour12: false,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
  const parts = formatter.formatToParts(date);
  const lookup = (type) => Number(parts.find((p) => p.type === type)?.value || 0);
  return {
    year: lookup('year'),
    month: lookup('month'),
    day: lookup('day'),
    hour: lookup('hour'),
    minute: lookup('minute'),
    second: lookup('second'),
  };
}

function getUtcDateForZonedDate(year, month, day, hour, minute, second, timeZone) {
  const utcGuess = new Date(Date.UTC(year, month - 1, day, hour, minute, second, 0));
  const offsetMs = getTimeZoneOffsetMs(utcGuess, timeZone);
  return new Date(utcGuess.getTime() - offsetMs);
}

function getTimeZoneOffsetMs(date, timeZone) {
  const parts = getZonedParts(date, timeZone);
  const asIfUtc = Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute, parts.second);
  return asIfUtc - date.getTime();
}

function getEventVotingEndUtc(fields) {
  const dateField = fields.date;
  if (!dateField) return null;

  let baseDate = null;
  if (dateField.timestampValue) {
    baseDate = new Date(dateField.timestampValue);
  } else if (dateField.stringValue) {
    const raw = dateField.stringValue.trim();
    if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
      const [year, month, day] = raw.split('-').map(Number);
      baseDate = getUtcDateForZonedDate(year, month, day, 0, 0, 0, 'Europe/Budapest');
    } else {
      baseDate = new Date(raw);
    }
  }

  if (!baseDate || Number.isNaN(baseDate.getTime())) return null;
  const parts = getZonedParts(baseDate, 'Europe/Budapest');
  const endUtc = getUtcDateForZonedDate(parts.year, parts.month, parts.day, 23, 59, 59, 'Europe/Budapest');
  endUtc.setMilliseconds(999);
  return endUtc;
}

async function fetchAllGroupIds(projectId, accessToken) {
  const ids = [];
  let pageToken = '';
  do {
    const url = new URL(
      `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents/groups`
    );
    url.searchParams.set('pageSize', '200');
    if (pageToken) url.searchParams.set('pageToken', pageToken);

    const response = await fetch(url.toString(), {
      headers: { Authorization: `Bearer ${accessToken}` },
    });

    if (!response.ok) {
      const detail = await response.text();
      throw new Error(`Groups fetch failed: ${response.status} ${detail}`);
    }

    const data = await response.json();
    const docs = data.documents || [];
    for (const doc of docs) {
      const id = doc.name?.split('/').pop();
      if (id) ids.push(id);
    }

    pageToken = data.nextPageToken || '';
  } while (pageToken);

  return ids;
}

async function fetchEligibleMvpEvents(projectId, accessToken, groupId, cutoffIso) {
  const url = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents:runQuery`;
  const body = {
    structuredQuery: {
      from: [{ collectionId: 'events' }],
      where: {
        compositeFilter: {
          op: 'AND',
          filters: [
            {
              fieldFilter: {
                field: { fieldPath: 'mvpVotingEnabled' },
                op: 'EQUAL',
                value: { booleanValue: true },
              },
            },
            {
              fieldFilter: {
                field: { fieldPath: 'status' },
                op: 'EQUAL',
                value: { stringValue: 'finished' },
              },
            },
            {
              fieldFilter: {
                field: { fieldPath: 'mvpVotingEndsAt' },
                op: 'LESS_THAN_OR_EQUAL',
                value: { timestampValue: cutoffIso },
              },
            },
          ],
        },
      },
      orderBy: [{ field: { fieldPath: 'mvpVotingEndsAt' }, direction: 'DESCENDING' }],
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
    throw new Error(`Events query failed: ${response.status} ${detail}`);
  }

  const data = await response.json();
  const events = [];
  for (const row of data || []) {
    const doc = row?.document;
    if (!doc) continue;
    const fields = doc.fields || {};
    if (fields.mvpEloAwarded?.booleanValue) continue;
    events.push(doc);
  }
  return events;
}

async function fetchLegacyMvpEvents(projectId, accessToken, groupId) {
  const url = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents:runQuery`;
  const body = {
    structuredQuery: {
      from: [{ collectionId: 'events' }],
      where: {
        compositeFilter: {
          op: 'AND',
          filters: [
            {
              fieldFilter: {
                field: { fieldPath: 'mvpVotingEnabled' },
                op: 'EQUAL',
                value: { booleanValue: true },
              },
            },
            {
              fieldFilter: {
                field: { fieldPath: 'status' },
                op: 'EQUAL',
                value: { stringValue: 'finished' },
              },
            },
            {
              fieldFilter: {
                field: { fieldPath: 'mvpVotingEndsAt' },
                op: 'EQUAL',
                value: { nullValue: null },
              },
            },
          ],
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
    throw new Error(`Legacy events query failed: ${response.status} ${detail}`);
  }

  const data = await response.json();
  const events = [];
  for (const row of data || []) {
    const doc = row?.document;
    if (!doc) continue;
    const fields = doc.fields || {};
    if (fields.mvpEloAwarded?.booleanValue) continue;
    events.push(doc);
  }
  return events;
}

function mergeEventDocs(primary, secondary) {
  if (!secondary?.length) return primary;
  const seen = new Set(primary.map((doc) => doc?.name).filter(Boolean));
  const merged = [...primary];
  for (const doc of secondary) {
    if (!doc?.name || seen.has(doc.name)) continue;
    merged.push(doc);
    seen.add(doc.name);
  }
  return merged;
}

function summarizeMvpEventDoc(eventDoc, now) {
  const name = eventDoc?.name || '';
  const id = name.split('/').pop() || 'unknown';
  const fields = eventDoc?.fields || {};
  const status = fields.status?.stringValue || null;
  const mvpVotingEnabled = Boolean(fields.mvpVotingEnabled?.booleanValue);
  const mvpEloAwarded = Boolean(fields.mvpEloAwarded?.booleanValue);
  const mvpVotingEndsAt = fields.mvpVotingEndsAt?.timestampValue || null;
  const eventDateRaw = fields.date?.timestampValue || fields.date?.stringValue || null;
  const endAtUtc = mvpVotingEndsAt
    ? new Date(mvpVotingEndsAt)
    : getEventVotingEndUtc(fields);
  const endIso =
    endAtUtc && !Number.isNaN(endAtUtc.getTime()) ? endAtUtc.toISOString() : null;
  const eligible =
    mvpVotingEnabled &&
    status === 'finished' &&
    !mvpEloAwarded &&
    endAtUtc &&
    now >= endAtUtc;

  return {
    id,
    status,
    mvpVotingEnabled,
    mvpEloAwarded,
    mvpVotingEndsAt,
    computedEndIso: endIso,
    date: eventDateRaw,
    eligible,
  };
}

function hasEventResults(fields) {
  if (!fields) return false;
  if (fields.playerStats?.mapValue?.fields) return true;
  if (fields.goalsA || fields.goalsB) return true;
  if (fields.endedAt?.timestampValue) return true;
  return false;
}

function computeNormalizedStatus(fields, now) {
  if (fields.status?.stringValue) return null;
  const dateValue = fields.date?.timestampValue || fields.date?.stringValue;
  if (!dateValue) return null;
  const date = new Date(dateValue);
  if (Number.isNaN(date.getTime())) return null;
  if (date > now) return 'planned';
  if (hasEventResults(fields)) return 'finished';
  if (fields.startedAt?.timestampValue) return 'active';
  return 'planned';
}

async function normalizeMvpEventsForGroup(projectId, accessToken, groupId, now) {
  const docs = await fetchMvpEvents(projectId, accessToken, groupId);
  let updatedCount = 0;
  let statusUpdated = 0;
  let mvpEndsUpdated = 0;
  let finishedUpdated = 0;

  const writes = [];
  for (const doc of docs) {
    const fields = doc?.fields || {};
    const updateFields = {};
    const updateMask = [];

    const normalizedStatus = computeNormalizedStatus(fields, now);
    if (normalizedStatus && fields.status?.stringValue !== normalizedStatus) {
      updateFields.status = { stringValue: normalizedStatus };
      updateMask.push('status');
      if (normalizedStatus === 'finished' && !fields.endedAt?.timestampValue) {
        updateFields.endedAt = { timestampValue: now.toISOString() };
        updateMask.push('endedAt');
      }
      if (normalizedStatus === 'finished') finishedUpdated += 1;
      statusUpdated += 1;
    }

    if (
      fields.mvpVotingEnabled?.booleanValue &&
      !fields.mvpVotingEndsAt?.timestampValue
    ) {
      const endUtc = getEventVotingEndUtc(fields);
      if (endUtc && !Number.isNaN(endUtc.getTime())) {
        updateFields.mvpVotingEndsAt = { timestampValue: endUtc.toISOString() };
        updateMask.push('mvpVotingEndsAt');
        mvpEndsUpdated += 1;
      }
    }

    if (updateMask.length > 0) {
      writes.push({
        update: {
          name: doc.name,
          fields: updateFields,
        },
        updateMask: { fieldPaths: updateMask },
      });
    }

    if (writes.length >= 400) {
      const batch = writes.splice(0, writes.length);
      await commitWrites(projectId, accessToken, batch);
      updatedCount += batch.length;
    }
  }

  if (writes.length > 0) {
    await commitWrites(projectId, accessToken, writes);
    updatedCount += writes.length;
  }

  return {
    foundCount: docs.length,
    updatedCount,
    statusUpdated,
    mvpEndsUpdated,
    finishedUpdated,
  };
}

async function fetchMvpEvents(projectId, accessToken, groupId) {
  const url = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents:runQuery`;
  const body = {
    structuredQuery: {
      from: [{ collectionId: 'events' }],
      where: {
        fieldFilter: {
          field: { fieldPath: 'mvpVotingEnabled' },
          op: 'EQUAL',
          value: { booleanValue: true },
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
    throw new Error(`MVP events query failed: ${response.status} ${detail}`);
  }

  const data = await response.json();
  const events = [];
  for (const row of data || []) {
    const doc = row?.document;
    if (doc) events.push(doc);
  }
  if (events.length > 0) return events;

  // Fallback: list all group events and filter client-side if query returns empty.
  console.warn('MVP events query returned empty; falling back to list events', { groupId });
  const allEvents = await listGroupEvents(projectId, accessToken, groupId);
  return allEvents.filter((doc) => doc?.fields?.mvpVotingEnabled?.booleanValue);
}

async function listGroupEvents(projectId, accessToken, groupId) {
  const events = [];
  let pageToken = '';
  do {
    const listUrl = new URL(
      `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents/groups/${groupId}/events`
    );
    listUrl.searchParams.set('pageSize', '200');
    if (pageToken) listUrl.searchParams.set('pageToken', pageToken);

    const response = await fetch(listUrl.toString(), {
      headers: { Authorization: `Bearer ${accessToken}` },
    });

    if (!response.ok) {
      const detail = await response.text();
      throw new Error(`Events list failed: ${response.status} ${detail}`);
    }

    const data = await response.json();
    const docs = data.documents || [];
    events.push(...docs);
    pageToken = data.nextPageToken || '';
  } while (pageToken);

  return events;
}

async function finalizeMvpEvent(projectId, accessToken, groupId, eventDoc) {
  const eventId = eventDoc.name?.split('/').pop() || 'unknown';
  const fields = eventDoc.fields || {};
  const votes = fields.mvpVotes?.mapValue?.fields || {};

  const tally = new Map();
  for (const value of Object.values(votes)) {
    const votedFor = value?.stringValue;
    if (!votedFor) continue;
    tally.set(votedFor, (tally.get(votedFor) || 0) + 1);
  }

  let winnerId = null;
  let topVotes = 0;
  let topCandidates = [];
  for (const [playerId, count] of tally.entries()) {
    if (count > topVotes) {
      topVotes = count;
      topCandidates = count > 0 ? [playerId] : [];
    } else if (count === topVotes && count > 0) {
      topCandidates.push(playerId);
    }
  }
  if (topCandidates.length === 1) {
    winnerId = topCandidates[0];
  } else if (topCandidates.length > 1) {
    const eloByUser = await fetchMemberElos(projectId, accessToken, groupId, topCandidates);
    const DEFAULT_ELO = 1200;
    let lowestElo = Number.POSITIVE_INFINITY;
    let lowestIds = [];
    for (const candidateId of topCandidates) {
      const elo = eloByUser.get(candidateId) ?? DEFAULT_ELO;
      if (elo < lowestElo) {
        lowestElo = elo;
        lowestIds = [candidateId];
      } else if (elo === lowestElo) {
        lowestIds.push(candidateId);
      }
    }
    winnerId = lowestIds.length > 0 ? lowestIds.sort()[0] : null;
  }
  console.log('MVP cron winner computed', {
    groupId,
    eventId,
    winnerId,
    topVotes,
    tie: topCandidates.length > 1,
  });

  const computedEndUtc = !fields.mvpVotingEndsAt?.timestampValue
    ? getEventVotingEndUtc(fields)
    : null;
  const computedEndIso =
    computedEndUtc && !Number.isNaN(computedEndUtc.getTime()) ? computedEndUtc.toISOString() : null;

  const updateFields = {
    mvpWinnerId: winnerId ? { stringValue: winnerId } : { nullValue: null },
    mvpEloAwarded: { booleanValue: true },
    ...(computedEndIso ? { mvpVotingEndsAt: { timestampValue: computedEndIso } } : {}),
  };
  const updateMask = ['mvpWinnerId', 'mvpEloAwarded'];
  if (computedEndIso) updateMask.push('mvpVotingEndsAt');

  const writes = [
    {
      update: {
        name: eventDoc.name,
        fields: updateFields,
      },
      updateMask: { fieldPaths: updateMask },
    },
  ];

  if (winnerId) {
    const userDocName = `projects/${projectId}/databases/(default)/documents/users/${winnerId}`;
    writes.push({
      transform: {
        document: userDocName,
        fieldTransforms: [
          { fieldPath: 'elo', increment: { integerValue: '5' } },
          { fieldPath: 'profileUpdatedAt', setToServerValue: 'REQUEST_TIME' },
          {
            fieldPath: 'lastModifiedFields',
            appendMissingElements: { values: [{ stringValue: 'elo' }] },
          },
        ],
      },
    });

    const memberDoc = await findGroupMemberDoc(projectId, accessToken, groupId, winnerId);
    if (memberDoc) {
      writes.push({
        transform: {
          document: memberDoc,
          fieldTransforms: [{ fieldPath: 'elo', increment: { integerValue: '5' } }],
        },
      });
    }
  }

  await commitWrites(projectId, accessToken, writes);
}

async function fetchMemberElos(projectId, accessToken, groupId, userIds) {
  const eloByUser = new Map();
  if (!Array.isArray(userIds) || userIds.length === 0) return eloByUser;
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
      throw new Error(`Member elo query failed: ${response.status} ${detail}`);
    }

    const data = await response.json();
    for (const row of data || []) {
      const doc = row?.document;
      const fields = doc?.fields || {};
      const userId = fields.userId?.stringValue;
      if (!userId) continue;
      const eloRaw = fields.elo?.integerValue ?? fields.elo?.doubleValue;
      const elo = eloRaw !== undefined && eloRaw !== null ? Number(eloRaw) : undefined;
      if (Number.isFinite(elo)) {
        eloByUser.set(userId, elo);
      }
    }
  }
  return eloByUser;
}
