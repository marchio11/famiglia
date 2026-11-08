import { icon } from './icons.js';

export const esc = (s) =>
  String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

/* ---------- Date ---------- */

export function ymd(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export function addDays(n) {
  const d = new Date();
  d.setDate(d.getDate() + n);
  return ymd(d);
}

/** Giorni da oggi alla data (negativo = passata). */
export function daysUntil(dateStr) {
  if (!dateStr) return null;
  const [y, m, d] = dateStr.split('-').map(Number);
  const target = new Date(y, m - 1, d);
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  return Math.round((target - now) / 86400000);
}

const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);

export function relDate(dateStr) {
  const n = daysUntil(dateStr);
  if (n === null) return '';
  if (n === 0) return 'Oggi';
  if (n === 1) return 'Domani';
  if (n === -1) return 'Ieri';
  if (n < 0) return `Scaduto da ${-n} giorni`;
  const [y, m, d] = dateStr.split('-').map(Number);
  const date = new Date(y, m - 1, d);
  if (n < 7) return cap(date.toLocaleDateString('it-IT', { weekday: 'long' }));
  const opts = { day: 'numeric', month: 'short' };
  if (y !== new Date().getFullYear()) opts.year = 'numeric';
  return date.toLocaleDateString('it-IT', opts);
}

export function dueClass(dateStr) {
  const n = daysUntil(dateStr);
  if (n === null) return '';
  if (n < 0) return 'overdue';
  if (n <= 1) return 'soon';
  if (n <= 7) return 'week';
  return '';
}

export function dueTag(dateStr) {
  if (!dateStr) return '';
  return `<span class="tag ${dueClass(dateStr)}">${icon('clock', 'sm')}${esc(relDate(dateStr))}</span>`;
}

/* ---------- Persone ---------- */

const AV_COLORS = { Andrea: '#3f6fb5', Laura: '#c0577e', Claudia: '#c98a1a' };

export function avatar(name, size = '') {
  if (!name) return '';
  const color = AV_COLORS[name] || '#7a7168';
  return `<span class="avatar ${size}" style="--av:${color}" aria-hidden="true">${esc(name[0])}</span>`;
}

export function byWho(name) {
  if (!name) return '';
  return `<span class="who-mini">${avatar(name, 'xs')}${esc(name)}</span>`;
}

/* ---------- Toast con "Annulla" ---------- */

let toastTimer;
export function toast(msg, action) {
  const el = document.getElementById('toast');
  el.innerHTML = `<span class="msg">${esc(msg)}</span>${action ? `<button type="button">${esc(action.label)}</button>` : ''}`;
  if (action) {
    el.querySelector('button').onclick = () => {
      el.classList.remove('show');
      action.run();
    };
  }
  el.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), action ? 5000 : 2500);
}

/* ---------- Finestre ---------- */

/**
 * Apre una finestra dal basso con un modulo.
 * onSubmit(valori, form) -> restituire false per non chiudere.
 */
export function formDialog({ title, body, submitLabel = 'Salva', color, onSubmit, onDelete, deleteLabel = 'Elimina', autofocus = true }) {
  const dlg = document.createElement('dialog');
  dlg.className = 'sheet';
  if (color) dlg.style.setProperty('--c', color);
  dlg.innerHTML = `
    <form novalidate>
      <div class="grab"></div>
      <h2>${esc(title)}</h2>
      ${body}
      <div class="actions">
        ${onDelete ? `<button type="button" class="btn danger" data-delete>${icon('trash', 'sm')}${esc(deleteLabel)}</button>` : ''}
        <span class="spacer"></span>
        <button type="button" class="btn ghost" data-cancel>Annulla</button>
        <button type="submit" class="btn primary">${esc(submitLabel)}</button>
      </div>
    </form>`;
  document.body.append(dlg);
  const form = dlg.querySelector('form');

  dlg.querySelector('[data-cancel]').onclick = () => dlg.close();
  if (onDelete) {
    dlg.querySelector('[data-delete]').onclick = () => {
      dlg.close();
      onDelete();
    };
  }
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    if (!form.reportValidity()) return;
    const values = Object.fromEntries(new FormData(form));
    for (const k of Object.keys(values)) if (typeof values[k] === 'string') values[k] = values[k].trim();
    if (onSubmit(values, form) !== false) dlg.close();
  });
  dlg.addEventListener('click', (e) => {
    if (e.target === dlg) dlg.close();
  });
  dlg.addEventListener('close', () => dlg.remove());

  // Pulsanti "Oggi / Domani / ..." accanto ai campi data.
  dlg.querySelectorAll('[data-set-date]').forEach((b) => {
    b.onclick = () => {
      const input = form.elements[b.dataset.target];
      input.value = b.dataset.setDate;
    };
  });

  dlg.showModal();
  if (autofocus) {
    form.querySelector('input:not([type=radio]):not([type=checkbox]),textarea')?.focus();
  } else {
    // Evita che si apra la tastiera quando si modifica una voce esistente.
    const h2 = form.querySelector('h2');
    h2.tabIndex = -1;
    h2.focus();
  }
  return dlg;
}

/** Campo data con scorciatoie. */
export function dateField(name, label, value = '') {
  const next = new Date();
  const toSat = (6 - next.getDay() + 7) % 7 || 7;
  return `
    <div class="field">
      <label><span>${esc(label)}</span><input type="date" name="${name}" value="${esc(value)}"></label>
      <div class="quick-dates">
        <button type="button" class="chip" data-target="${name}" data-set-date="${addDays(0)}">Oggi</button>
        <button type="button" class="chip" data-target="${name}" data-set-date="${addDays(1)}">Domani</button>
        <button type="button" class="chip" data-target="${name}" data-set-date="${addDays(toSat)}">Sabato</button>
        <button type="button" class="chip" data-target="${name}" data-set-date="${addDays(7)}">Tra 1 settimana</button>
        <button type="button" class="chip" data-target="${name}" data-set-date="">Nessuna</button>
      </div>
    </div>`;
}

/** Intestazione delle pagine interne. */
export function pageHead({ title, count = '', back = '#/', actions = '' }) {
  return `
    <header class="page-head">
      <a class="icon-btn" href="${back}" aria-label="Indietro">${icon('back')}</a>
      <h1><span class="title-text">${title}</span>${count !== '' ? `<span class="count" data-count>${count}</span>` : ''}</h1>
      ${actions}
    </header>`;
}
