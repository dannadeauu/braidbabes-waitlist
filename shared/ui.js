// ---------------------------------------------------------------------------
// Small shared UI bits: icons, the wordmark, toasts, the confirm modal.
// ---------------------------------------------------------------------------

const HEART =
  'M16 29C16 29 2.6 21.4 2.6 12.6 2.6 8.1 6.2 4.6 10.5 4.6c2.4 0 4.5 1.2 5.5 3 1-1.8 3.1-3 5.5-3 4.3 0 7.9 3.5 7.9 8 0 8.8-13.4 16.4-13.4 16.4z';

export const icons = {
  hearts: `<svg class="hearts" viewBox="0 0 72 34" fill="none" stroke="currentColor" stroke-width="2.4"
      stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
      <path d="${HEART}" transform="translate(1,1) rotate(-12 16 16) scale(0.9)"/>
      <path d="${HEART}" transform="translate(35,1) rotate(12 16 16) scale(0.9)"/>
    </svg>`,

  bell: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7"
      stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
      <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/>
      <path d="M13.7 21a2 2 0 0 1-3.4 0"/>
    </svg>`,

  check: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4"
      stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
      <path d="M20 6 9 17l-5-5"/>
    </svg>`,

  list: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"
      stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
      <path d="M8 6h13M8 12h13M8 18h13M3.5 6h.01M3.5 12h.01M3.5 18h.01"/>
    </svg>`,

  gear: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7"
      stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
      <circle cx="12" cy="12" r="3"/>
      <path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1A1.7 1.7 0 0 0 9 19.4a1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1A1.7 1.7 0 0 0 4.6 9a1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/>
    </svg>`,

  eye: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7"
      stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
      <path d="M1.5 12S5 5.5 12 5.5 22.5 12 22.5 12 19 18.5 12 18.5 1.5 12 1.5 12z"/>
      <circle cx="12" cy="12" r="3"/>
    </svg>`,

  eyeOff: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7"
      stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
      <path d="M9.9 5.7A9.9 9.9 0 0 1 12 5.5c7 0 10.5 6.5 10.5 6.5a17 17 0 0 1-3.3 4.1M6.2 7.9A17 17 0 0 0 1.5 12S5 18.5 12 18.5c1.8 0 3.4-.4 4.7-1"/>
      <path d="M9.9 9.9a3 3 0 0 0 4.2 4.2"/>
      <path d="M2 2l20 20"/>
    </svg>`,

  close: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"
      stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
      <path d="M18 6 6 18M6 6l12 12"/>
    </svg>`,
};

/** The braidbabes hearts + wordmark, optionally with a script line under it. */
export function wordmark(scriptText, scriptClass = '') {
  return `<div class="wordmark">
      ${icons.hearts}
      <div class="name">braidbabes</div>
      ${scriptText ? `<div class="script ${scriptClass}">${scriptText}</div>` : ''}
    </div>`;
}

/** Swaps the hero band to a real photo if assets/header.jpg exists. */
export function loadHeroPhoto(src = '../assets/header.jpg') {
  const img = new Image();
  img.onload = () => {
    document.documentElement.style.setProperty('--hero-photo', `url('${src}')`);
  };
  img.src = src;
}

let toastTimer = null;

export function toast(message) {
  let el = document.querySelector('.toast');
  if (!el) {
    el = document.createElement('div');
    el.className = 'toast';
    el.setAttribute('role', 'status');
    document.body.appendChild(el);
  }
  el.textContent = message;
  el.classList.add('is-open');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('is-open'), 2600);
}

/**
 * Centered confirm dialog. Resolves true on confirm, false on cancel/backdrop/Esc.
 */
export function confirmDialog({ title, body = '', confirmText = 'confirm', cancelText = 'cancel' }) {
  return new Promise((resolve) => {
    const backdrop = document.createElement('div');
    backdrop.className = 'modal-backdrop';
    backdrop.innerHTML = `
      <div class="modal" role="dialog" aria-modal="true">
        <h2></h2>
        ${body ? '<p></p>' : ''}
        <div class="modal-actions">
          <button type="button" class="btn btn-outline" data-act="cancel"></button>
          <button type="button" class="btn btn-primary" data-act="ok"></button>
        </div>
      </div>`;

    backdrop.querySelector('h2').textContent = title;
    if (body) backdrop.querySelector('p').textContent = body;
    backdrop.querySelector('[data-act="cancel"]').textContent = cancelText;
    backdrop.querySelector('[data-act="ok"]').textContent = confirmText;

    document.body.appendChild(backdrop);
    requestAnimationFrame(() => backdrop.classList.add('is-open'));

    const finish = (result) => {
      document.removeEventListener('keydown', onKey);
      backdrop.classList.remove('is-open');
      setTimeout(() => backdrop.remove(), 180);
      resolve(result);
    };

    const onKey = (e) => { if (e.key === 'Escape') finish(false); };
    document.addEventListener('keydown', onKey);

    backdrop.addEventListener('click', (e) => {
      if (e.target === backdrop) return finish(false);
      const act = e.target.closest('[data-act]')?.dataset.act;
      if (act) finish(act === 'ok');
    });

    backdrop.querySelector('[data-act="ok"]').focus();
  });
}

export const esc = (s) =>
  String(s ?? '').replace(/[&<>"']/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])
  );
