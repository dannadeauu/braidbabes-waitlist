// ---------------------------------------------------------------------------
// Customer app: pick a service, join the line, watch your place.
//
// The customer's own ticket is mirrored into localStorage so a refresh (or
// closing and reopening the tab) drops them straight back on the status screen.
// It is cleared the moment the admin checks them off.
// ---------------------------------------------------------------------------

import { getDb, watch, DEFAULT_SETTINGS } from '../shared/db.js';
import {
  computeWaits, waitIfJoiningNow, formatWait,
  formatPhone, isValidPhone, entryDuration,
} from '../shared/waitlist.js';
import { wordmark, loadHeroPhoto, toast, confirmDialog, esc } from '../shared/ui.js';

const TICKET_KEY = 'bb.waitlist.myTicket';

const $ = (sel) => document.querySelector(sel);

const state = {
  db: null,
  settings: null,
  entries: [],
  selected: [],
  ticket: null, // { id, name, phone }
};

// --- ticket persistence ----------------------------------------------------

function readTicket() {
  try {
    const raw = localStorage.getItem(TICKET_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

const writeTicket = (t) => localStorage.setItem(TICKET_KEY, JSON.stringify(t));
const clearTicket = () => localStorage.removeItem(TICKET_KEY);

// --- screens ---------------------------------------------------------------

function show(id) {
  document.querySelectorAll('.screen').forEach((s) => s.classList.toggle('is-active', s.id === id));
  window.scrollTo(0, 0);
}

// --- page 1 ----------------------------------------------------------------

function visibleServices() {
  return state.settings.services.filter((s) => s.visible && s.name.trim());
}

function renderServices() {
  const services = visibleServices();
  const list = $('#svc-list');

  if (services.length === 0) {
    list.innerHTML = '<p class="note muted">no services are available right now.</p>';
    state.selected = [];
    return;
  }

  // Drop selections that no longer exist, then default to the first service.
  state.selected = state.selected.filter((id) => services.some((s) => s.id === id));
  if (state.selected.length === 0) state.selected = [services[0].id];

  list.innerHTML = services
    .map((s) => {
      const on = state.selected.includes(s.id);
      return `<button type="button" class="svc-btn${on ? ' is-selected' : ''}"
                data-svc="${esc(s.id)}" aria-pressed="${on}">${esc(s.name)}</button>`;
    })
    .join('');
}

function onServiceClick(e) {
  const btn = e.target.closest('[data-svc]');
  if (!btn) return;
  const id = btn.dataset.svc;

  if (state.settings.allow_multiple) {
    state.selected = state.selected.includes(id)
      ? state.selected.filter((x) => x !== id)
      : [...state.selected, id];
    if (state.selected.length === 0) state.selected = [id]; // never allow zero
  } else {
    state.selected = [id];
  }

  renderServices();
  renderJoinWait();
}

function renderJoinWait() {
  const mins = waitIfJoiningNow(
    state.entries, state.settings.services, state.settings.braiders, state.selected
  );
  $('#join-wait').textContent = `estimated wait: ${formatWait(mins)}`;
}

function renderJoinScreen() {
  $('#join-event').textContent = state.settings.event_name || '';
  renderServices();
  renderJoinWait();

  const closed = state.settings.status !== 'open';
  const btn = $('#btn-join');
  btn.disabled = closed || visibleServices().length === 0;
  btn.textContent = closed ? 'waitlist is closed' : 'join the line';
}

async function submitJoin(e) {
  e.preventDefault();

  const name = $('#in-name').value.trim();
  const phone = $('#in-phone').value.trim();

  $('#err-name').textContent = '';
  $('#err-phone').textContent = '';
  $('#in-name').classList.remove('is-error');
  $('#in-phone').classList.remove('is-error');

  if (!name) {
    $('#err-name').textContent = 'please enter your name';
    $('#in-name').classList.add('is-error');
    $('#in-name').focus();
    return;
  }

  if (!isValidPhone(phone)) {
    $('#err-phone').textContent = 'that phone number looks off — or leave it blank';
    $('#in-phone').classList.add('is-error');
    $('#in-phone').focus();
    return;
  }

  const btn = $('#btn-join');
  btn.disabled = true;
  btn.textContent = 'joining…';

  try {
    const entry = await state.db.addEntry({
      name,
      phone: phone ? formatPhone(phone) : '',
      service_ids: state.selected,
    });

    state.ticket = { id: entry.id, name: entry.name, phone: entry.phone };
    writeTicket(state.ticket);

    $('#in-name').value = '';
    $('#in-phone').value = '';

    await refresh(); // lands on the status screen
  } catch (err) {
    console.error(err);
    toast("couldn't join the waitlist — please try again");
    btn.disabled = false;
    btn.textContent = 'join the line';
  }
}

// --- page 2 ----------------------------------------------------------------

function renderStatusScreen() {
  const { settings, entries, ticket } = state;
  $('#status-event').textContent = settings.event_name || '';

  const index = entries.findIndex((x) => x.id === ticket.id);
  if (index === -1) return; // refresh() handles the removed case

  const bits = [];

  if (settings.show_time) {
    const waits = computeWaits(entries, settings.services, settings.braiders);
    bits.push(`estimated wait: ${formatWait(waits[index])}`);
  }

  if (settings.show_place) {
    bits.push(`you're #${index + 1} in line`);
  }

  if (bits.length === 0) {
    const dur = entryDuration(entries[index], settings.services);
    bits.push(`your service takes about ${formatWait(dur)}`);
  }

  $('#status-wait').innerHTML = bits.map(esc).join('<br>');

  $('#status-you').innerHTML =
    esc(ticket.name) + (ticket.phone ? `<br>${esc(ticket.phone)}` : '');
}

async function onRefresh() {
  const btn = $('#btn-refresh');
  btn.disabled = true;
  const original = btn.textContent;
  btn.textContent = 'refreshing…';
  await refresh();
  btn.textContent = original;
  btn.disabled = false;
}

async function onLeave() {
  const ok = await confirmDialog({
    title: 'leave the waitlist?',
    body: "you'll lose your spot in line. you can always join again.",
    confirmText: 'leave',
    cancelText: 'stay',
  });
  if (!ok) return;

  try {
    await state.db.removeEntry(state.ticket.id);
  } catch (err) {
    console.error(err);
  }

  clearTicket();
  state.ticket = null;
  await refresh();
  show('screen-join');
  toast('you left the waitlist');
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
    // Usually a bad Supabase URL/key or the schema not having been run yet.
    // Never leave the customer staring at a blank page.
    console.error('refresh failed', err);
    if (!state.settings) {
      state.settings = { ...DEFAULT_SETTINGS };
      renderJoinScreen();
      $('#btn-join').disabled = true;
      $('#btn-join').textContent = 'waitlist unavailable';
      show('screen-join');
      toast("can't reach the waitlist right now");
    }
    return;
  }

  if (state.ticket) {
    const stillListed = state.entries.some((x) => x.id === state.ticket.id);
    if (!stillListed) {
      // Removed by the admin — clear the phone-side copy and say goodbye.
      clearTicket();
      state.ticket = null;
      renderJoinScreen();
      show('screen-done');
      return;
    }
    renderStatusScreen();
    show('screen-status');
    return;
  }

  renderJoinScreen();
  if (!document.querySelector('.screen.is-active')) show('screen-join');
}

// --- boot ------------------------------------------------------------------

async function main() {
  ['#hero-join', '#hero-status', '#hero-done'].forEach((sel) => {
    $(sel).innerHTML = wordmark('Waitlist');
  });
  loadHeroPhoto();

  state.db = await getDb();
  state.ticket = readTicket();

  $('#svc-list').addEventListener('click', onServiceClick);
  $('#join-form').addEventListener('submit', submitJoin);
  $('#btn-refresh').addEventListener('click', onRefresh);
  $('#btn-leave').addEventListener('click', onLeave);
  $('#btn-again').addEventListener('click', () => show('screen-join'));

  // refresh() picks the screen: status if they hold a live ticket, the
  // "you're all set" note if the admin just checked them off, join otherwise.
  await refresh();

  // Keep the estimate honest without the customer having to tap refresh.
  watch(state.db, refresh, 20000);
}

main();
