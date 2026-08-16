// ---------------------------------------------------------------------------
// Wait-time math and shared formatting.
// ---------------------------------------------------------------------------

/** Minutes of chair time one entry needs, summed across the services it picked. */
export function entryDuration(entry, services) {
  const byId = new Map(services.map((s) => [s.id, s]));
  const total = (entry.service_ids || []).reduce((sum, id) => {
    const svc = byId.get(id);
    return sum + (svc ? svc.minutes : 0);
  }, 0);
  // An entry whose services were all deleted still occupies a chair — fall back
  // to the shortest service on offer rather than pretending it takes no time.
  if (total > 0) return total;
  const shortest = services.reduce((min, s) => Math.min(min, s.minutes), Infinity);
  return Number.isFinite(shortest) ? shortest : 15;
}

/**
 * Minutes each entry waits before a braider frees up, in queue order.
 *
 * Models `braiders` chairs running in parallel: each entry goes to whichever
 * braider frees up first, so with 2 braiders the 3rd person waits only as long
 * as the first of the two ahead of them takes.
 */
export function computeWaits(entries, services, braiders) {
  const chairs = new Array(Math.max(1, braiders || 1)).fill(0);
  return entries.map((entry) => {
    let next = 0;
    for (let i = 1; i < chairs.length; i++) {
      if (chairs[i] < chairs[next]) next = i;
    }
    const wait = chairs[next];
    chairs[next] += entryDuration(entry, services);
    return wait;
  });
}

/** What someone joining right now would wait, given the queue as it stands. */
export function waitIfJoiningNow(entries, services, braiders, serviceIds = []) {
  const hypothetical = [...entries, { service_ids: serviceIds }];
  const waits = computeWaits(hypothetical, services, braiders);
  return waits[waits.length - 1];
}

/** 0 -> "no wait", 45 -> "45 mins", 90 -> "1 hr 30 mins" */
export function formatWait(mins) {
  const m = Math.max(0, Math.round(mins));
  if (m === 0) return 'no wait';
  if (m < 60) return `${m} min${m === 1 ? '' : 's'}`;
  const hrs = Math.floor(m / 60);
  const rem = m % 60;
  const hrPart = `${hrs} hr${hrs === 1 ? '' : 's'}`;
  return rem === 0 ? hrPart : `${hrPart} ${rem} min${rem === 1 ? '' : 's'}`;
}

/** "just now", "1m ago", "25 mins" */
export function minutesSince(iso) {
  if (!iso) return 0;
  return Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 60000));
}

export function formatAgo(iso) {
  const m = minutesSince(iso);
  if (m < 1) return 'just now';
  if (m < 60) return `${m}m ago`;
  const hrs = Math.floor(m / 60);
  return `${hrs}h ago`;
}

export function formatElapsed(iso) {
  const m = minutesSince(iso);
  if (m < 1) return 'just joined';
  return formatWait(m);
}

/** (716) 984-4489 for 10-digit US numbers, otherwise returned untouched. */
export function formatPhone(raw) {
  const digits = String(raw || '').replace(/\D/g, '');
  if (digits.length === 10) {
    return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`;
  }
  if (digits.length === 11 && digits[0] === '1') {
    return `(${digits.slice(1, 4)}) ${digits.slice(4, 7)}-${digits.slice(7)}`;
  }
  return String(raw || '');
}

export function isValidPhone(raw) {
  if (!String(raw || '').trim()) return true; // optional field
  const digits = String(raw).replace(/\D/g, '');
  return digits.length === 10 || (digits.length === 11 && digits[0] === '1');
}

export function serviceNames(entry, services) {
  const byId = new Map(services.map((s) => [s.id, s]));
  return (entry.service_ids || []).map((id) => byId.get(id)?.name).filter(Boolean);
}
