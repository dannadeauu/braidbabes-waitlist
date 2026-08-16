// ---------------------------------------------------------------------------
// Small shared UI bits: icons, the wordmark, toasts, the confirm modal.
// ---------------------------------------------------------------------------

export const icons = {
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

  google: `<svg viewBox="0 0 48 48" aria-hidden="true">
      <path fill="#4285F4" d="M45.1 24.5c0-1.6-.1-3.1-.4-4.5H24v8.5h11.8c-.5 2.7-2 5-4.4 6.6v5.5h7.1c4.2-3.8 6.6-9.5 6.6-16.1z"/>
      <path fill="#34A853" d="M24 46c6 0 11-2 14.6-5.4l-7.1-5.5c-2 1.3-4.5 2.1-7.5 2.1-5.8 0-10.7-3.9-12.4-9.1H4.2v5.7C7.8 41.1 15.3 46 24 46z"/>
      <path fill="#FBBC05" d="M11.6 28.1c-.5-1.3-.7-2.7-.7-4.1s.3-2.8.7-4.1v-5.7H4.2A22 22 0 0 0 2 24c0 3.6.9 6.9 2.2 9.8l7.4-5.7z"/>
      <path fill="#EA4335" d="M24 10.8c3.3 0 6.2 1.1 8.5 3.3l6.3-6.3C35 4.1 30 2 24 2 15.3 2 7.8 6.9 4.2 14.2l7.4 5.7c1.7-5.2 6.6-9.1 12.4-9.1z"/>
    </svg>`,

  close: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"
      stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
      <path d="M18 6 6 18M6 6l12 12"/>
    </svg>`,
};

/**
 * The braidbabes logo, optionally with a script line under it.
 *
 * This is the real brand asset (heart-shaped "bb" monogram over the wordmark),
 * not a redrawn approximation — the mark and its lettering don't reduce to
 * anything we could reproduce faithfully in CSS.
 *
 *   variant 'white'  the all-white lockup, for over the photo banner
 *   variant 'color'  pink hearts + black wordmark, for white backgrounds
 */
export function wordmark(scriptText, scriptClass = '', { variant = 'color', base = '../assets' } = {}) {
  return `<div class="wordmark">
      <img class="logo" src="${base}/logo-${variant}.png" alt="braidbabes"
           width="600" height="${variant === 'white' ? 206 : 198}">
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
