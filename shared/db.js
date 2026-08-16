// ---------------------------------------------------------------------------
// Data layer. Two interchangeable adapters behind one API:
//
//   supabase  - shared across every device (used when config.js is filled in)
//   local     - browser storage only (demo / single-device fallback)
//
// Both resolve to the same shape so the apps never branch on which is active.
// ---------------------------------------------------------------------------

import { SUPABASE_URL, SUPABASE_ANON_KEY } from './config.js';

export const DEFAULT_SETTINGS = {
  event_name: '',
  braiders: null, // null / blank means 1
  services: [
    { id: 'braid', name: 'braid service', minutes: 15, visible: true },
    { id: 'tinsel', name: 'tinsel service', minutes: 15, visible: true },
  ],
  allow_multiple: false,
  show_time: true,
  show_place: false,
  status: 'open',
};

const SETTINGS_ROW_ID = 1;

function normalizeSettings(raw) {
  const s = { ...DEFAULT_SETTINGS, ...(raw || {}) };
  if (!Array.isArray(s.services) || s.services.length === 0) {
    s.services = DEFAULT_SETTINGS.services.map((x) => ({ ...x }));
  }
  s.services = s.services.map((svc, i) => ({
    id: svc.id || `svc-${i}-${Math.random().toString(36).slice(2, 7)}`,
    name: svc.name ?? '',
    minutes: Number.isFinite(+svc.minutes) ? Math.max(0, +svc.minutes) : 15,
    visible: svc.visible !== false,
  }));
  s.braiders = s.braiders === null || s.braiders === '' ? null : Math.max(1, parseInt(s.braiders, 10) || 1);
  return s;
}

function normalizeEntry(row) {
  if (!row) return null;
  return {
    id: String(row.id),
    name: row.name ?? '',
    phone: row.phone ?? '',
    service_ids: Array.isArray(row.service_ids) ? row.service_ids : [],
    joined_at: row.joined_at,
    notified_at: row.notified_at ?? null,
  };
}

const byJoined = (a, b) => new Date(a.joined_at) - new Date(b.joined_at);

// ---------------------------------------------------------------------------
// Local adapter
// ---------------------------------------------------------------------------

function createLocalDb() {
  const SETTINGS_KEY = 'bb.waitlist.settings';
  const ENTRIES_KEY = 'bb.waitlist.entries';
  const listeners = new Set();

  const read = (key, fallback) => {
    try {
      const raw = localStorage.getItem(key);
      return raw ? JSON.parse(raw) : fallback;
    } catch {
      return fallback;
    }
  };

  const write = (key, value) => {
    localStorage.setItem(key, JSON.stringify(value));
    channel?.postMessage('changed');
    listeners.forEach((fn) => fn());
  };

  let channel = null;
  try {
    channel = new BroadcastChannel('bb.waitlist');
    channel.onmessage = () => listeners.forEach((fn) => fn());
  } catch {
    /* BroadcastChannel unavailable — the storage event below still fires */
  }

  window.addEventListener('storage', (e) => {
    if (e.key === SETTINGS_KEY || e.key === ENTRIES_KEY) listeners.forEach((fn) => fn());
  });

  const allEntries = () => read(ENTRIES_KEY, []).map(normalizeEntry).sort(byJoined);

  return {
    mode: 'local',

    async init() {},

    async getSettings() {
      return normalizeSettings(read(SETTINGS_KEY, null));
    },

    async saveSettings(patch) {
      const next = normalizeSettings({ ...read(SETTINGS_KEY, DEFAULT_SETTINGS), ...patch });
      write(SETTINGS_KEY, next);
      return next;
    },

    async listEntries() {
      return allEntries();
    },

    async getEntry(id) {
      return allEntries().find((e) => e.id === String(id)) || null;
    },

    async addEntry({ name, phone, service_ids }) {
      const entries = read(ENTRIES_KEY, []);
      const entry = {
        id: `e-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        name,
        phone: phone || '',
        service_ids,
        joined_at: new Date().toISOString(),
        notified_at: null,
      };
      entries.push(entry);
      write(ENTRIES_KEY, entries);
      return normalizeEntry(entry);
    },

    async removeEntry(id) {
      write(ENTRIES_KEY, read(ENTRIES_KEY, []).filter((e) => String(e.id) !== String(id)));
    },

    async markNotified(id) {
      const entries = read(ENTRIES_KEY, []);
      const hit = entries.find((e) => String(e.id) === String(id));
      if (hit) hit.notified_at = new Date().toISOString();
      write(ENTRIES_KEY, entries);
    },

    async markAllNotified() {
      const now = new Date().toISOString();
      const entries = read(ENTRIES_KEY, []).map((e) => ({ ...e, notified_at: now }));
      write(ENTRIES_KEY, entries);
    },

    onChange(fn) {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
  };
}

// ---------------------------------------------------------------------------
// Supabase adapter
// ---------------------------------------------------------------------------

async function createSupabaseDb() {
  const { createClient } = await import('https://esm.sh/@supabase/supabase-js@2.45.4');
  const sb = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  const listeners = new Set();

  const fire = () => listeners.forEach((fn) => fn());

  const unwrap = ({ data, error }) => {
    if (error) throw new Error(error.message);
    return data;
  };

  return {
    mode: 'supabase',

    async init() {
      // Live push updates. Requires realtime to be enabled for these tables
      // (schema.sql does it). Polling in the apps covers it if this fails.
      try {
        sb.channel('bb-waitlist')
          .on('postgres_changes', { event: '*', schema: 'public', table: 'waitlist_entries' }, fire)
          .on('postgres_changes', { event: '*', schema: 'public', table: 'waitlist_settings' }, fire)
          .subscribe();
      } catch {
        /* fall back to polling */
      }
    },

    async getSettings() {
      const rows = unwrap(
        await sb.from('waitlist_settings').select('*').eq('id', SETTINGS_ROW_ID).limit(1)
      );
      return normalizeSettings(rows?.[0] ?? null);
    },

    async saveSettings(patch) {
      const current = await this.getSettings();
      const next = normalizeSettings({ ...current, ...patch });
      unwrap(
        await sb
          .from('waitlist_settings')
          .upsert({ id: SETTINGS_ROW_ID, ...next }, { onConflict: 'id' })
          .select()
      );
      fire();
      return next;
    },

    async listEntries() {
      const rows = unwrap(
        await sb.from('waitlist_entries').select('*').order('joined_at', { ascending: true })
      );
      return (rows || []).map(normalizeEntry);
    },

    async getEntry(id) {
      const rows = unwrap(await sb.from('waitlist_entries').select('*').eq('id', id).limit(1));
      return normalizeEntry(rows?.[0] ?? null);
    },

    async addEntry({ name, phone, service_ids }) {
      const rows = unwrap(
        await sb
          .from('waitlist_entries')
          .insert({ name, phone: phone || '', service_ids, joined_at: new Date().toISOString() })
          .select()
      );
      fire();
      return normalizeEntry(rows?.[0]);
    },

    async removeEntry(id) {
      unwrap(await sb.from('waitlist_entries').delete().eq('id', id));
      fire();
    },

    async markNotified(id) {
      unwrap(
        await sb.from('waitlist_entries').update({ notified_at: new Date().toISOString() }).eq('id', id)
      );
      fire();
    },

    async markAllNotified() {
      unwrap(
        await sb
          .from('waitlist_entries')
          .update({ notified_at: new Date().toISOString() })
          .not('id', 'is', null)
      );
      fire();
    },

    onChange(fn) {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
  };
}

// ---------------------------------------------------------------------------

let dbPromise = null;

export function getDb() {
  if (!dbPromise) {
    dbPromise = (async () => {
      const configured = Boolean(SUPABASE_URL && SUPABASE_ANON_KEY);
      let db;
      if (configured) {
        try {
          db = await createSupabaseDb();
        } catch (err) {
          console.error('Supabase unavailable, falling back to local storage:', err);
          db = createLocalDb();
          db.fallbackReason = 'Could not reach Supabase.';
        }
      } else {
        db = createLocalDb();
      }
      await db.init();
      return db;
    })();
  }
  return dbPromise;
}

/** Re-runs `fn` on data changes and on an interval. Returns an unsubscribe fn. */
export function watch(db, fn, intervalMs = 10000) {
  const off = db.onChange(fn);
  const timer = setInterval(fn, intervalMs);
  const onVisible = () => { if (!document.hidden) fn(); };
  document.addEventListener('visibilitychange', onVisible);
  return () => {
    off();
    clearInterval(timer);
    document.removeEventListener('visibilitychange', onVisible);
  };
}
