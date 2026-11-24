import { config } from './config.js';

const BASE = 'https://api.hubapi.com';
export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * Call the HubSpot API, retrying transient errors (429/5xx) with exponential backoff.
 */
async function api(method, path, body) {
  const retries = 5;
  for (let attempt = 0; ; attempt++) {
    const res = await fetch(`${BASE}${path}`, {
      method,
      headers: {
        Authorization: `Bearer ${config.token}`,
        'Content-Type': 'application/json',
      },
      body: body ? JSON.stringify(body) : undefined,
    });
    if (res.ok) return res.status === 204 ? null : res.json();

    const transient = [429, 500, 502, 503, 504].includes(res.status);
    if (!transient || attempt >= retries) {
      const text = await res.text();
      throw new Error(`HubSpot ${method} ${path} → ${res.status}: ${text}`);
    }
    const wait = 1000 * 2 ** attempt;
    console.warn(`  HubSpot ${res.status} on ${path} — retrying in ${wait}ms`);
    await sleep(wait);
  }
}

const chunk = (arr, n) => Array.from({ length: Math.ceil(arr.length / n) }, (_, i) => arr.slice(i * n, i * n + n));

/** Search open tasks owned by the configured owners, with extra hs_timestamp filters. */
async function searchOpenTasks(timestampFilters) {
  const tasks = [];
  let after;
  do {
    const data = await api('POST', '/crm/v3/objects/tasks/search', {
      filterGroups: [{
        filters: [
          { propertyName: 'hs_task_status', operator: 'NOT_IN', values: ['COMPLETED', 'DEFERRED'] },
          { propertyName: 'hubspot_owner_id', operator: 'IN', values: config.ownerIds },
          ...timestampFilters,
        ],
      }],
      properties: ['hs_task_subject', 'hs_task_status', 'hs_timestamp', 'hs_task_priority', 'hs_task_type', 'hs_task_body', 'hubspot_owner_id'],
      sorts: [{ propertyName: 'hs_timestamp', direction: 'ASCENDING' }],
      limit: 100,
      after,
    });
    tasks.push(...data.results);
    after = data.paging?.next?.after;
  } while (after);
  return tasks;
}

export const getTasksDueBetween = (start, end) => searchOpenTasks([
  { propertyName: 'hs_timestamp', operator: 'GTE', value: String(start.getTime()) },
  { propertyName: 'hs_timestamp', operator: 'LTE', value: String(end.getTime()) },
]);

export const getOverdueTasks = (before) => searchOpenTasks([
  { propertyName: 'hs_timestamp', operator: 'LT', value: String(before.getTime()) },
]);

/** Map of fromId → [toId, ...] using the v4 batch associations API. */
export async function batchAssociations(fromType, toType, ids) {
  const map = new Map();
  for (const part of chunk([...new Set(ids.map(String))], 1000)) {
    if (part.length === 0) continue;
    const data = await api('POST', `/crm/v4/associations/${fromType}/${toType}/batch/read`, {
      inputs: part.map((id) => ({ id })),
    });
    for (const r of data.results ?? []) {
      map.set(String(r.from.id), (r.to ?? []).map((t) => String(t.toObjectId)));
    }
  }
  return map;
}

/** Map of id → properties for a batch read of any CRM object type. */
export async function batchRead(objectType, ids, properties) {
  const map = new Map();
  for (const part of chunk([...new Set(ids.map(String))], 100)) {
    if (part.length === 0) continue;
    const data = await api('POST', `/crm/v3/objects/${objectType}/batch/read`, {
      inputs: part.map((id) => ({ id })),
      properties,
    });
    for (const r of data.results ?? []) map.set(String(r.id), r.properties);
  }
  return map;
}

/** All associated IDs for one record (paginated). */
async function associatedIds(fromType, fromId, toType) {
  const ids = [];
  let after;
  do {
    const qs = new URLSearchParams({ limit: '500', ...(after ? { after } : {}) });
    const data = await api('GET', `/crm/v4/objects/${fromType}/${fromId}/associations/${toType}?${qs}`);
    ids.push(...(data.results ?? []).map((r) => String(r.toObjectId)));
    after = data.paging?.next?.after;
  } while (after);
  return ids;
}

const ownerCache = new Map();
export async function getOwnerName(ownerId) {
  if (!ownerId) return null;
  if (ownerCache.has(ownerId)) return ownerCache.get(ownerId);
  let name = null;
  try {
    const o = await api('GET', `/crm/v3/owners/${ownerId}`);
    name = [o.firstName, o.lastName].filter(Boolean).join(' ') || o.email || null;
  } catch {
    // owner may be deactivated — leave as null
  }
  ownerCache.set(ownerId, name);
  return name;
}

/**
 * Latest N notes across a set of records (e.g. the task's contact and company),
 * de-duplicated and sorted newest-first by creation date.
 */
export async function getLatestNotes(records, limit) {
  const noteIds = new Set();
  for (const { type, id } of records) {
    try {
      (await associatedIds(type, id, 'notes')).forEach((n) => noteIds.add(n));
    } catch (err) {
      console.warn(`  Could not load notes for ${type} ${id}: ${err.message}`);
    }
  }
  if (noteIds.size === 0) return [];

  const notes = await batchRead('notes', [...noteIds], ['hs_note_body', 'hs_createdate', 'hs_timestamp', 'hubspot_owner_id']);
  // hs_createdate = when the note was actually written (hs_timestamp can be back-dated)
  const latest = [...notes.values()]
    .sort((a, b) => new Date(b.hs_createdate) - new Date(a.hs_createdate))
    .slice(0, limit);

  return Promise.all(latest.map(async (n) => ({
    body: n.hs_note_body ?? '',
    date: n.hs_createdate ?? n.hs_timestamp ?? null,
    addedBy: await getOwnerName(n.hubspot_owner_id),
  })));
}
