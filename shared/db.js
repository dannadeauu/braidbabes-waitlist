// ---------------------------------------------------------------------------
// Data layer. Two interchangeable adapters behind one API:
//
//   supabase  - shared across every device (used when config.js is filled in)
//   local     - browser storage only (demo / single-device fallback)
//
// Guests and admins take different routes to the same table on purpose:
// guests call the queue_summary / join_waitlist / leave_waitlist functions,
// which never return a name or phone number. Only a signed-in admin can read
// waitlist_entries directly. See schema.sql.
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
const SETTINGS_COLUMNS = Object.keys(DEFAULT_SETTINGS);

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
  s.braiders =
    s.braiders === null || s.braiders === '' ? null : Math.max(1, parseInt(s.braiders, 10) || 1);

  // Only ever send real columns back to Postgres.
  const out = {};
  for (const key of SETTINGS_COLUMNS) out[key] = s[key];
  return out;
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

/** The guest-visible shape: no name, no phone. */
function normalizeSummary(row) {
  return {
    id: String(row.id),
    service_ids: Array.isArray(row.service_ids) ? row.service_ids : [],
    joined_at: row.joined_at,
  };
}

const byJoined = (a, b) => new Date(a.joined_at) - new Date(b.joined_at);

// ---------------------------------------------------------------------------
// Local adapter — demo mode. No real auth; treats you as an admin throughout.
// ---------------------------------------------------------------------------

function createLocalDb() {
  const SETTINGS_KEY = 'bb.waitlist.settings';
  const ENTRIES_KEY = 'bb.waitlist.entries';
  const ADMINS_KEY = 'bb.waitlist.admins';
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
    if ([SETTINGS_KEY, ENTRIES_KEY, ADMINS_KEY].includes(e.key)) {
      listeners.forEach((fn) => fn());
    }
  });

  const allEntries = () => read(ENTRIES_KEY, []).map(normalizeEntry).sort(byJoined);

  return {
    mode: 'local',

    async init() {},

    // --- auth (stubbed: demo mode is always signed in as an admin) ---
    async getAuth() {
      return { signedIn: true, email: 'demo@localhost', isAdmin: true };
    },
    async signInWithGoogle() {},
    async signOut() {},
    onAuthChange() {
      return () => {};
    },

    async listAdminEmails() {
      return read(ADMINS_KEY, ['demo@localhost']);
    },
    async addAdminEmail(email) {
      const list = read(ADMINS_KEY, ['demo@localhost']);
      const clean = email.trim().toLowerCase();
      if (!list.includes(clean)) list.push(clean);
      write(ADMINS_KEY, list);
    },
    async removeAdminEmail(email) {
      const list = read(ADMINS_KEY, ['demo@localhost']);
      if (list.length <= 1) throw new Error('cannot remove the last admin');
      write(ADMINS_KEY, list.filter((e) => e !== email));
    },

    // --- settings ---
    async getSettings() {
      return normalizeSettings(read(SETTINGS_KEY, null));
    },
    async saveSettings(patch) {
      const next = normalizeSettings({ ...read(SETTINGS_KEY, DEFAULT_SETTINGS), ...patch });
      write(SETTINGS_KEY, next);
      return next;
    },

    // --- guest paths ---
    async getQueueSummary() {
      return allEntries().map(normalizeSummary);
    },
    async joinWaitlist({ name, phone, service_ids }) {
      const settings = normalizeSettings(read(SETTINGS_KEY, null));
      if (settings.status !== 'open') throw new Error('the waitlist is closed');
      if (!name.trim()) throw new Error('name is required');

      const entries = read(ENTRIES_KEY, []);
      const entry = {
        id: `e-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        name: name.trim(),
        phone: phone || '',
        service_ids,
        joined_at: new Date().toISOString(),
        notified_at: null,
      };
      entries.push(entry);
      write(ENTRIES_KEY, entries);
      return entry.id;
    },
    async leaveWaitlist(id) {
      write(ENTRIES_KEY, read(ENTRIES_KEY, []).filter((e) => String(e.id) !== String(id)));
    },

    // --- admin paths ---
    async listEntries() {
      return allEntries();
    },
    async removeEntry(id) {
      return this.leaveWaitlist(id);
    },
    async markNotified(id) {
      const entries = read(ENTRIES_KEY, []);
      const hit = entries.find((e) => String(e.id) === String(id));
      if (hit) hit.notified_at = new Date().toISOString();
      write(ENTRIES_KEY, entries);
    },
    async markAllNotified() {
      const now = new Date().toISOString();
      write(ENTRIES_KEY, read(ENTRIES_KEY, []).map((e) => ({ ...e, notified_at: now })));
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
  const sb = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
  });
  const listeners = new Set();
  const fire = () => listeners.forEach((fn) => fn());

  const unwrap = ({ data, error }) => {
    if (error) throw new Error(error.message);
    return data;
  };

  return {
    mode: 'supabase',
    client: sb,

    async init() {
      try {
        sb.channel('bb-waitlist')
          .on('postgres_changes', { event: '*', schema: 'public', table: 'waitlist_entries' }, fire)
          .on('postgres_changes', { event: '*', schema: 'public', table: 'waitlist_settings' }, fire)
          .subscribe();
      } catch {
        /* polling covers it */
      }
    },

    // --- auth ---

    async getAuth() {
      const {
        data: { session },
      } = await sb.auth.getSession();
      if (!session) return { signedIn: false, email: null, isAdmin: false };

      // The database decides, not the client — is_admin() reads the allowlist.
      let isAdmin = false;
      try {
        isAdmin = unwrap(await sb.rpc('is_admin')) === true;
      } catch (err) {
        console.error('is_admin check failed', err);
      }
      return { signedIn: true, email: session.user.email ?? null, isAdmin };
    },

    async signInWithGoogle() {
      const redirectTo = window.location.href.split('#')[0].split('?')[0];
      const { error } = await sb.auth.signInWithOAuth({
        provider: 'google',
        options: { redirectTo },
      });
      if (error) throw new Error(error.message);
    },

    async signOut() {
      await sb.auth.signOut();
    },

    onAuthChange(fn) {
      const {
        data: { subscription },
      } = sb.auth.onAuthStateChange(() => fn());
      return () => subscription.unsubscribe();
    },

    async listAdminEmails() {
      const rows = unwrap(
        await sb.from('admin_emails').select('email').order('added_at', { ascending: true })
      );
      return (rows || []).map((r) => r.email);
    },

    async addAdminEmail(email) {
      const {
        data: { session },
      } = await sb.auth.getSession();
      unwrap(
        await sb
          .from('admin_emails')
          .insert({ email: email.trim().toLowerCase(), added_by: session?.user?.email ?? null })
      );
      fire();
    },

    async removeAdminEmail(email) {
      unwrap(await sb.from('admin_emails').delete().eq('email', email));
      fire();
    },

    // --- settings ---

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
      );
      fire();
      return next;
    },

    // --- guest paths (no personal data crosses the wire) ---

    async getQueueSummary() {
      const rows = unwrap(await sb.rpc('queue_summary'));
      return (rows || []).map(normalizeSummary);
    },

    async joinWaitlist({ name, phone, service_ids }) {
      const id = unwrap(
        await sb.rpc('join_waitlist', {
          p_name: name,
          p_phone: phone || '',
          p_service_ids: service_ids,
        })
      );
      fire();
      return String(id);
    },

    async leaveWaitlist(id) {
      unwrap(await sb.rpc('leave_waitlist', { p_id: id }));
      fire();
    },

    // --- admin paths (RLS requires a signed-in admin) ---

    async listEntries() {
      const rows = unwrap(
        await sb.from('waitlist_entries').select('*').order('joined_at', { ascending: true })
      );
      return (rows || []).map(normalizeEntry);
    },

    async removeEntry(id) {
      unwrap(await sb.from('waitlist_entries').delete().eq('id', id));
      fire();
    },

    async markNotified(id) {
      unwrap(
        await sb
          .from('waitlist_entries')
          .update({ notified_at: new Date().toISOString() })
          .eq('id', id)
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
  const onVisible = () => {
    if (!document.hidden) fn();
  };
  document.addEventListener('visibilitychange', onVisible);
  return () => {
    off();
    clearInterval(timer);
    document.removeEventListener('visibilitychange', onVisible);
  };
}
