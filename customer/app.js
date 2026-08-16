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
  pickedOwnServices: false, // once true, stop auto-selecting the first service
  svcSignature: null, // rebuild the buttons only when the services change
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
    state.svcSignature = null;
    return;
  }

  // Drop selections for services the admin has since deleted or hidden.
  state.selected = state.selected.filter((id) => services.some((s) => s.id === id));

  // Preselect the first service as a convenience, but only until the guest has
  // made a choice of their own. Re-applying it after that would fight them:
  // in multi-select mode, deselecting your last pick would snap straight back.
  if (!state.pickedOwnServices && state.selected.length === 0) {
    state.selected = [services[0].id];
  }

  const multi = state.settings.allow_multiple;
  const signature = JSON.stringify([multi, services.map((s) => [s.id, s.name])]);

  // Only rebuild the buttons when the services themselves change. Re-creating
  // them on every tap would replace the element mid-transition, so the fade
  // between selected and unselected would never get a chance to run.
  if (signature !== state.svcSignature) {
    state.svcSignature = signature;
    list.setAttribute('role', multi ? 'group' : 'radiogroup');
    list.innerHTML = services
      .map(
        (s) => `<button type="button" class="svc-btn" data-svc="${esc(s.id)}"
                  role="${multi ? 'checkbox' : 'radio'}"
                  aria-checked="false">${esc(s.name)}</button>`
      )
      .join('');
  }

  syncServiceSelection();
}

/** Paints the current selection onto the existing buttons, so CSS can fade it. */
function syncServiceSelection() {
  for (const btn of document.querySelectorAll('.svc-btn')) {
    const on = state.selected.includes(btn.dataset.svc);
    btn.classList.toggle('is-selected', on);
    btn.setAttribute('aria-checked', String(on));
  }
}

function onServiceClick(e) {
  const btn = e.target.closest('[data-svc]');
  if (!btn) return;
  const id = btn.dataset.svc;

  state.pickedOwnServices = true;

  if (state.settings.allow_multiple) {
    // Free toggling, including all the way down to none selected. The join
    // button is what stops an empty submission, not a sticky selection.
    state.selected = state.selected.includes(id)
      ? state.selected.filter((x) => x !== id)
      : [...state.selected, id];
  } else {
    state.selected = [id];
  }

  syncServiceSelection();
  renderJoinWait();
  updateJoinButton();
}

function renderJoinWait() {
  const mins = waitIfJoiningNow(
    state.entries, state.settings.services, state.settings.braiders, state.selected
  );
  $('#join-wait').textContent = `estimated wait: ${formatWait(mins)}`;
}

function updateJoinButton() {
  const btn = $('#btn-join');
  const closed = state.settings.status !== 'open';
  const nothingOffered = visibleServices().length === 0;
  const nothingPicked = state.selected.length === 0;

  btn.disabled = closed || nothingOffered || nothingPicked;
  btn.textContent = closed
    ? 'waitlist is closed'
    : nothingOffered
      ? 'waitlist unavailable'
      : nothingPicked
        ? 'select a service'
        : 'join the line';
}

function renderJoinScreen() {
  $('#join-event').textContent = state.settings.event_name || '';
  $('#svc-label').textContent = state.settings.allow_multiple
    ? 'select your services:'
    : 'select a service:';
  renderServices();
  renderJoinWait();
  updateJoinButton();
}

async function submitJoin(e) {
  e.preventDefault();

  const name = $('#in-name').value.trim();
  const phone = $('#in-phone').value.trim();

  $('#err-name').textContent = '';
  $('#err-phone').textContent = '';
  $('#in-name').classList.remove('is-error');
  $('#in-phone').classList.remove('is-error');

  if (state.selected.length === 0) {
    toast('please pick at least one service');
    $('#svc-list').scrollIntoView({ behavior: 'smooth', block: 'center' });
    return;
  }

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
    const id = await state.db.joinWaitlist({
      name,
      phone: phone ? formatPhone(phone) : '',
      service_ids: state.selected,
    });

    // The server never sends the name or phone back — the only copy lives here
    // on this phone, which is also what makes the status screen work offline.
    state.ticket = { id, name, phone: phone ? formatPhone(phone) : '' };
    writeTicket(state.ticket);

    $('#in-name').value = '';
    $('#in-phone').value = '';

    await refresh(); // lands on the status screen
  } catch (err) {
    console.error(err);
    toast("couldn't join the waitlist — please try again");
    updateJoinButton();
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
    await state.db.leaveWaitlist(state.ticket.id);
  } catch (err) {
    console.error(err);
  }

  clearTicket();
  state.ticket = null;
  await refresh();
  show('screen-join');
  toast('you left the waitlist');
}

// --- failure diagnosis -----------------------------------------------------
//
// The three ways this realistically breaks look identical to a guest but need
// completely different fixes, so name them apart rather than guessing later.

function classifyFailure(err) {
  // A missing method means index.html / app.js / db.js came from different
  // deploys — i.e. the browser served a stale file out of cache.
  if (err instanceof TypeError && /is not a function|undefined/i.test(err.message || '')) {
    return 'stale-cache';
  }
  // fetch() rejecting outright (rather than returning an HTTP error) is a
  // blocked request: an ad/privacy extension, a VPN, or no network at all.
  if (err instanceof TypeError && /fetch|network|load failed/i.test(err.message || '')) {
    return 'blocked';
  }
  if (/JWT|apikey|Invalid API key/i.test(err.message || '')) return 'bad-key';
  if (/does not exist|schema cache|PGRST/i.test(err.message || '')) return 'schema';
  return 'unknown';
}

function describeFailure(err) {
  return {
    'stale-cache':
      'mismatched files from cache. Hard-refresh (cmd/ctrl + shift + R) — the ' +
      'browser is pairing an old app.js with a new db.js after a deploy.',
    blocked:
      'the request to supabase never left the browser. Usually an ad/privacy ' +
      'blocker or VPN blocking *.supabase.co — try an incognito window.',
    'bad-key': 'supabase rejected the anon key in shared/config.js.',
    schema: 'supabase is missing a table or function — re-run schema.sql.',
    unknown: 'unrecognised failure.',
  }[classifyFailure(err)];
}

function shortFailure(err) {
  return {
    'stale-cache': 'please refresh the page',
    blocked: "can't reach the waitlist — check your ad blocker",
    'bad-key': "can't reach the waitlist right now",
    schema: "can't reach the waitlist right now",
    unknown: "can't reach the waitlist right now",
  }[classifyFailure(err)];
}

// --- shared refresh --------------------------------------------------------

async function refresh() {
  try {
    const [settings, entries] = await Promise.all([
      state.db.getSettings(),
      state.db.getQueueSummary(),
    ]);
    state.settings = settings;
    state.entries = entries;
  } catch (err) {
    // Never leave the customer staring at a blank page — and say enough that
    // the cause is obvious from the console instead of needing a bisect.
    console.error(
      `[braidbabes] could not load the waitlist.\n` +
        `reason: ${describeFailure(err)}\n` +
        `raw error:`,
      err
    );
    if (!state.settings) {
      state.settings = { ...DEFAULT_SETTINGS };
      renderJoinScreen();
      $('#btn-join').disabled = true;
      $('#btn-join').textContent = 'waitlist unavailable';
      show('screen-join');
      toast(shortFailure(err));
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
