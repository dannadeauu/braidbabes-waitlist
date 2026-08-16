// ---------------------------------------------------------------------------
// Admin app: password gate, live waitlist, settings.
//
// The bell / "message everyone" buttons are STUBBED — they record that someone
// was notified (which drives the "1m ago" badge) but do not send any SMS yet.
// See sendSms() below for the one function to fill in when wiring a provider.
// ---------------------------------------------------------------------------

import { getDb, watch, DEFAULT_SETTINGS } from '../shared/db.js';
import { ADMIN_PASSWORD, SUPABASE_URL } from '../shared/config.js';
import {
  computeWaits, formatWait, formatAgo, formatElapsed, serviceNames,
} from '../shared/waitlist.js';
import { icons, wordmark, toast, confirmDialog, esc } from '../shared/ui.js';

const AUTH_KEY = 'bb.waitlist.adminAuthed';

const $ = (sel) => document.querySelector(sel);

const state = {
  db: null,
  // Seeded so the settings form and queue still render if the very first
  // fetch fails (bad Supabase key, schema not run yet).
  settings: { ...DEFAULT_SETTINGS },
  entries: [],
  saveTimer: null,
};

// ---------------------------------------------------------------------------
// SMS — stubbed for now.
//
// To go live, replace the body with a call to your own send endpoint (a Twilio
// key must never sit in front-end code — put it behind a Supabase Edge Function
// or any small server, and POST to that from here).
// ---------------------------------------------------------------------------

async function sendSms(_phone, _message) {
  return { sent: false, reason: 'stubbed' };
}

function turnMessage(entry) {
  const event = state.settings.event_name ? ` at ${state.settings.event_name}` : '';
  return `hi ${entry.name}! you're up next${event} — come on over to the braidbabes chair!`;
}

// --- screens ---------------------------------------------------------------

function show(id) {
  document.querySelectorAll('.screen').forEach((s) => s.classList.toggle('is-active', s.id === id));
  window.scrollTo(0, 0);
}

// --- page 3: login ---------------------------------------------------------

function onLogin(e) {
  e.preventDefault();
  const input = $('#in-pass');

  if (input.value !== ADMIN_PASSWORD) {
    $('#err-pass').textContent = 'incorrect password';
    input.classList.add('is-error');
    input.select();
    return;
  }

  $('#err-pass').textContent = '';
  input.classList.remove('is-error');
  input.value = '';
  sessionStorage.setItem(AUTH_KEY, '1');
  enterAdmin();
}

async function enterAdmin() {
  await refresh();
  fillSettingsForm();
  show('screen-queue');
}

// --- page 4: waitlist ------------------------------------------------------

function renderQueue() {
  const { settings, entries } = state;
  const list = $('#queue-list');

  const statusBtn = $('#btn-status');
  const open = settings.status === 'open';
  statusBtn.textContent = open ? 'open' : 'closed';
  statusBtn.classList.toggle('is-closed', !open);

  $('#btn-msg-all').disabled = entries.length === 0;

  if (entries.length === 0) {
    list.innerHTML = `<li class="empty">nobody's in line right now.<br>
      the waitlist is ${open ? 'open and ready' : 'currently closed'}.</li>`;
    return;
  }

  const waits = computeWaits(entries, settings.services, settings.braiders);

  list.innerHTML = entries
    .map((entry, i) => {
      const names = serviceNames(entry, settings.services);
      const tags = names.map((n) => `<span class="tag">${esc(n)}</span>`).join('');

      const notified = entry.notified_at
        ? `<span class="tag tag-notified">${icons.bell}${esc(formatAgo(entry.notified_at))}</span>`
        : '';

      return `<li class="queue-item" data-id="${esc(entry.id)}">
          <div class="qi-main">
            <div class="qi-name"><span class="num">${i + 1}.</span>${esc(entry.name)}</div>
            <div class="qi-sub">waiting for: ${esc(formatElapsed(entry.joined_at))}</div>
            <div class="qi-sub muted">${
              waits[i] === 0 ? 'up next' : `up in about ${esc(formatWait(waits[i]))}`
            }${entry.phone ? ` &middot; ${esc(entry.phone)}` : ''}</div>
            <div class="qi-tags">${tags}${notified}</div>
          </div>
          <div class="qi-actions">
            <button class="icon-btn" data-act="notify" type="button"
                    aria-label="notify ${esc(entry.name)} it's their turn"
                    title="notify it's their turn">${icons.bell}</button>
            <button class="icon-btn is-done" data-act="done" type="button"
                    aria-label="remove ${esc(entry.name)} from the waitlist"
                    title="done — remove from waitlist">${icons.check}</button>
            <button class="btn btn-primary btn-sm qi-msg" data-act="message" type="button">message</button>
          </div>
        </li>`;
    })
    .join('');
}

async function onQueueClick(e) {
  const btn = e.target.closest('[data-act]');
  if (!btn) return;

  const id = btn.closest('.queue-item')?.dataset.id;
  const entry = state.entries.find((x) => x.id === id);
  if (!entry) return;

  if (btn.dataset.act === 'notify') return notifyOne(entry);
  if (btn.dataset.act === 'message') return messageOne(entry);
  if (btn.dataset.act === 'done') return removeOne(entry);
}

// The bell always records the notification — phone or not, it's the admin's
// marker that this person has been called up. Only the text is conditional.
async function notifyOne(entry) {
  if (entry.phone) await sendSms(entry.phone, turnMessage(entry));
  await state.db.markNotified(entry.id);
  await refresh();
  toast(
    entry.phone
      ? `${entry.name} marked as notified — SMS isn't wired up yet`
      : `${entry.name} marked as notified (no phone number on file)`
  );
}

async function messageOne(entry) {
  if (!entry.phone) {
    toast(`${entry.name} didn't leave a phone number`);
    return;
  }
  await sendSms(entry.phone, turnMessage(entry));
  await state.db.markNotified(entry.id);
  await refresh();
  toast('SMS sending is not wired up yet');
}

async function removeOne(entry) {
  const ok = await confirmDialog({
    title: `remove ${entry.name}?`,
    body: 'this takes them off the waitlist and clears the waitlist from their phone.',
    confirmText: 'remove',
    cancelText: 'cancel',
  });
  if (!ok) return;

  await state.db.removeEntry(entry.id);
  await refresh();
  toast(`${entry.name} removed`);
}

async function onMessageEveryone() {
  const withPhones = state.entries.filter((e) => e.phone);
  const ok = await confirmDialog({
    title: 'message everyone?',
    body: `this will text all ${withPhones.length} ${
      withPhones.length === 1 ? 'person' : 'people'
    } who left a phone number.`,
    confirmText: 'send',
    cancelText: 'cancel',
  });
  if (!ok) return;

  await Promise.all(withPhones.map((e) => sendSms(e.phone, turnMessage(e))));
  await state.db.markAllNotified();
  await refresh();
  toast('everyone marked as notified (SMS not sent yet)');
}

async function onToggleStatus() {
  const next = state.settings.status === 'open' ? 'closed' : 'open';
  state.settings = await state.db.saveSettings({ status: next });
  renderQueue();
  toast(`waitlist ${next}`);
}

// --- page 5: settings ------------------------------------------------------

function renderServiceRows() {
  $('#svc-rows').innerHTML = state.settings.services
    .map(
      (s, i) => `<div class="svc-row${s.visible ? '' : ' is-hidden'}" data-i="${i}">
        <input class="input" data-f="name" type="text" value="${esc(s.name)}"
               placeholder="service name" maxlength="40" aria-label="service name">
        <input class="input" data-f="minutes" type="number" min="0" max="600" step="1"
               value="${s.minutes}" inputmode="numeric" aria-label="minutes">
        <span class="unit">minutes</span>
        <button class="mini-btn${s.visible ? '' : ' off'}" data-f="toggle" type="button"
                title="${s.visible ? 'hide from customers' : 'show to customers'}"
                aria-label="${s.visible ? 'hide from customers' : 'show to customers'}"
          >${s.visible ? icons.eye : icons.eyeOff}</button>
        <button class="mini-btn danger" data-f="remove" type="button"
                title="delete service" aria-label="delete service">${icons.close}</button>
      </div>`
    )
    .join('');
}

function fillSettingsForm() {
  const s = state.settings;
  $('#in-event').value = s.event_name || '';
  $('#in-braiders').value = s.braiders ?? '';
  $('#ck-multi').checked = s.allow_multiple;
  $('#ck-time').checked = s.show_time;
  $('#ck-place').checked = s.show_place;
  renderServiceRows();

  const supabase = state.db.mode === 'supabase';
  $('#mode-state').innerHTML = supabase
    ? '<span class="mode-badge">synced via supabase</span>'
    : '<span class="mode-badge warn">demo mode — this device only</span>';
}

/** Reads every control back into state and saves, debounced while typing. */
function collectAndSave({ immediate = false } = {}) {
  const braidersRaw = $('#in-braiders').value.trim();

  const services = [...document.querySelectorAll('.svc-row')].map((row, i) => {
    const existing = state.settings.services[i] || {};
    return {
      id: existing.id,
      name: row.querySelector('[data-f="name"]').value,
      minutes: parseInt(row.querySelector('[data-f="minutes"]').value, 10),
      visible: existing.visible !== false,
    };
  });

  const patch = {
    event_name: $('#in-event').value.trim(),
    braiders: braidersRaw === '' ? null : Math.max(1, parseInt(braidersRaw, 10) || 1),
    services,
    allow_multiple: $('#ck-multi').checked,
    show_time: $('#ck-time').checked,
    show_place: $('#ck-place').checked,
  };

  clearTimeout(state.saveTimer);
  const run = async () => {
    $('#save-state').textContent = 'saving…';
    try {
      state.settings = await state.db.saveSettings(patch);
      $('#save-state').textContent = 'saved';
      setTimeout(() => {
        if ($('#save-state').textContent === 'saved') $('#save-state').textContent = '';
      }, 1600);
    } catch (err) {
      console.error(err);
      $('#save-state').textContent = "couldn't save — check your connection";
    }
  };

  if (immediate) run();
  else state.saveTimer = setTimeout(run, 550);
}

async function onServiceRowClick(e) {
  const btn = e.target.closest('[data-f]');
  if (!btn || btn.tagName !== 'BUTTON') return;

  const i = Number(btn.closest('.svc-row').dataset.i);
  const svc = state.settings.services[i];
  if (!svc) return;

  if (btn.dataset.f === 'toggle') {
    state.settings.services[i] = { ...svc, visible: !svc.visible };
    renderServiceRows();
    collectAndSave({ immediate: true });
    return;
  }

  if (btn.dataset.f === 'remove') {
    if (state.settings.services.length === 1) {
      toast('keep at least one service');
      return;
    }
    const ok = await confirmDialog({
      title: `delete "${svc.name || 'this service'}"?`,
      body: 'anyone already in line who picked it keeps their spot.',
      confirmText: 'delete',
      cancelText: 'cancel',
    });
    if (!ok) return;

    state.settings.services.splice(i, 1);
    renderServiceRows();
    collectAndSave({ immediate: true });
  }
}

function onAddService() {
  state.settings.services.push({
    id: `svc-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    name: '',
    minutes: 15,
    visible: true,
  });
  renderServiceRows();
  collectAndSave({ immediate: true });
  document.querySelector('.svc-row:last-child [data-f="name"]')?.focus();
}

// --- shared refresh --------------------------------------------------------

async function refresh() {
  try {
    const [settings, entries] = await Promise.all([
      state.db.getSettings(),
      state.db.listEntries(),
    ]);
    state.settings = settings;
    state.entries = entries;
  } catch (err) {
    // Almost always a Supabase misconfiguration — say so instead of going blank.
    console.error('refresh failed', err);
    $('#queue-list').innerHTML = `<li class="empty">can't reach the waitlist.<br>
      check the URL and key in <b>shared/config.js</b>, and that
      <b>schema.sql</b> has been run.</li>`;
    return;
  }
  renderQueue();
}

// --- boot ------------------------------------------------------------------

async function main() {
  $('#login-brand').innerHTML = wordmark('Admin');
  $('#queue-brand').innerHTML = wordmark('Admin', 'sm');
  $('#settings-brand').innerHTML = wordmark('Admin', 'sm');

  [['#nav-queue', icons.list], ['#nav-settings', icons.gear],
   ['#nav-queue-2', icons.list], ['#nav-settings-2', icons.gear]]
    .forEach(([sel, svg]) => { $(sel).innerHTML = svg; });

  if (!SUPABASE_URL) {
    $('#queue-banner').innerHTML = `<div class="setup-banner">
      <b>Demo mode.</b> The waitlist lives in this browser only, so a customer's
      phone won't show up here. Fill in <code>shared/config.js</code> to sync
      across devices.</div>`;
  }

  state.db = await getDb();

  $('#login-form').addEventListener('submit', onLogin);
  $('#queue-list').addEventListener('click', onQueueClick);
  $('#btn-status').addEventListener('click', onToggleStatus);
  $('#btn-msg-all').addEventListener('click', onMessageEveryone);

  $('#nav-settings').addEventListener('click', () => { fillSettingsForm(); show('screen-settings'); });
  $('#nav-settings-2').addEventListener('click', () => { fillSettingsForm(); show('screen-settings'); });
  $('#nav-queue').addEventListener('click', () => show('screen-queue'));
  $('#nav-queue-2').addEventListener('click', () => { refresh(); show('screen-queue'); });

  ['#in-event', '#in-braiders'].forEach((sel) =>
    $(sel).addEventListener('input', () => collectAndSave())
  );
  ['#ck-multi', '#ck-time', '#ck-place'].forEach((sel) =>
    $(sel).addEventListener('change', () => collectAndSave({ immediate: true }))
  );

  $('#svc-rows').addEventListener('input', () => collectAndSave());
  $('#svc-rows').addEventListener('click', onServiceRowClick);
  $('#btn-add-svc').addEventListener('click', onAddService);

  if (sessionStorage.getItem(AUTH_KEY) === '1') {
    await enterAdmin();
  } else {
    await refresh();
    show('screen-login');
  }

  // Keep the queue live while it's on screen.
  watch(state.db, () => {
    if ($('#screen-queue').classList.contains('is-active')) refresh();
  }, 8000);
}

main();
