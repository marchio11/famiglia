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

export const memberColor = (name) => AV_COLORS[name] || '#7a7168';

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

  // Menu categoria: "➕ Nuova categoria…" mostra il campo per il nome.
  dlg.querySelectorAll('select[data-newcat]').forEach((sel) => {
    const input = form.elements[`${sel.name}New`];
    const sync = (focus) => {
      const on = sel.value === '__new__';
      input.closest('.field').hidden = !on;
      input.required = on;
      if (on && focus) input.focus();
    };
    sel.addEventListener('change', () => sync(true));
    sync(false);
  });

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
export function dateField(name, label, value = '', { quick = true } = {}) {
  const next = new Date();
  const toSat = (6 - next.getDay() + 7) % 7 || 7;
  return `
    <div class="field">
      <label><span>${esc(label)}</span><input type="date" name="${name}" value="${esc(value)}"></label>
      <div class="quick-dates" ${quick ? '' : 'hidden'}>
        <button type="button" class="chip" data-target="${name}" data-set-date="${addDays(0)}">Oggi</button>
        <button type="button" class="chip" data-target="${name}" data-set-date="${addDays(1)}">Domani</button>
        <button type="button" class="chip" data-target="${name}" data-set-date="${addDays(toSat)}">Sabato</button>
        <button type="button" class="chip" data-target="${name}" data-set-date="${addDays(7)}">Tra 1 settimana</button>
        <button type="button" class="chip" data-target="${name}" data-set-date="">Nessuna</button>
      </div>
    </div>`;
}

/** Intestazione delle pagine interne. */
export function pageHead({ title, badge = '', count = '', back = '#/', actions = '' }) {
  return `
    <header class="page-head">
      <a class="icon-btn" href="${back}" aria-label="Indietro">${icon('back')}</a>
      ${badge ? `<span class="badge-icon">${badge}</span>` : ''}
      <h1><span class="title-text">${title}</span>${count !== '' ? `<span class="count" data-count>${count}</span>` : ''}</h1>
      ${actions}
    </header>`;
}

/* ---------- Categorie personalizzate ---------- */

/** Separa un'eventuale emoji iniziale dal nome: "🐶 Animali" → {emoji, name}. */
export function splitEmoji(text) {
  const t = String(text || '').trim();
  const m = t.match(/^(\p{Extended_Pictographic}(?:️|‍\p{Extended_Pictographic}|\p{Emoji_Modifier})*)\s*(.*)$/u);
  return m ? { emoji: m[1], name: m[2].trim() || m[1] } : { emoji: '', name: t };
}

/** Menu a tendina delle categorie con l'opzione "Nuova categoria…". */
export function categorySelect({ name, label = 'Categoria', options, selected = '', placeholder = 'es. Pizzerie' }) {
  return `
    <label class="field"><span>${esc(label)}</span>
      <select name="${name}" data-newcat>
        ${options.map((o) => `<option value="${esc(o.value)}" ${o.value === selected ? 'selected' : ''}>${esc(o.label)}</option>`).join('')}
        <option value="__new__">➕ Nuova categoria…</option>
      </select>
    </label>
    <label class="field" hidden><span>Nome della nuova categoria</span><input name="${name}New" placeholder="${esc(placeholder)}" autocomplete="off"></label>`;
}

/**
 * Finestra per gestire categorie: rinominare, eliminare, aggiungere.
 * cats: [{ id, label }]; onSave({ renamed: [{id, label}], deleted: [id], added: [label] })
 */
export function categoriesDialog({ title, color, cats, hint = '', placeholder = 'Nome della categoria', reorder = false, onSave }) {
  const row = (c) => `
    <div class="cat-row" data-cat="${esc(c.id)}">
      ${reorder ? `<span class="move"><button type="button" class="icon-btn" data-up aria-label="Sposta su ${esc(c.label)}">▲</button><button type="button" class="icon-btn" data-down aria-label="Sposta giù ${esc(c.label)}">▼</button></span>` : ''}
      <input name="name:${esc(c.id)}" value="${esc(c.label)}" required aria-label="Nome categoria" autocomplete="off">
      ${c.locked
        ? '<span class="icon-btn locked" title="Non si può eliminare" aria-hidden="true">🔒</span>'
        : `<button type="button" class="icon-btn" data-del aria-label="Elimina ${esc(c.label)}">${icon('trash', 'sm')}</button>`}
    </div>`;
  const dlg = formDialog({
    title,
    color,
    autofocus: false,
    body: `
      <div class="cat-list" data-cats>${cats.map(row).join('')}</div>
      ${cats.length ? '' : '<p class="hint cat-none">Ancora nessuna categoria.</p>'}
      <div class="field">
        <span>Aggiungi una categoria</span>
        <div class="cat-row">
          <input name="new" placeholder="${esc(placeholder)}" autocomplete="off" enterkeyhint="done">
          <button type="button" class="icon-btn add" data-add-new aria-label="Aggiungi">${icon('plus')}</button>
        </div>
      </div>
      ${hint ? `<p class="hint">${hint}</p>` : ''}`,
    onSubmit: (v, form) => {
      const deleted = [...form.querySelectorAll('.cat-row.deleted')].map((r) => r.dataset.cat);
      const renamed = cats
        .filter((c) => !deleted.includes(c.id) && v[`name:${c.id}`] && v[`name:${c.id}`] !== c.label)
        .map((c) => ({ id: c.id, label: v[`name:${c.id}`] }));
      const added = [...form.querySelectorAll('[data-newname]')].map((i) => i.value.trim());
      if (v.new) added.push(v.new);
      // Ordine scelto con le frecce (solo categorie esistenti, non eliminate).
      const order = [...form.querySelectorAll('.cat-row[data-cat]:not(.deleted)')].map((r) => r.dataset.cat);
      const moved = reorder && order.join('|') !== cats.map((c) => c.id).filter((id) => !deleted.includes(id)).join('|');
      onSave({ renamed, deleted, added: added.filter(Boolean), order: moved ? order : null });
    },
  });
  const list = dlg.querySelector('[data-cats]');
  const newInput = dlg.querySelector('input[name=new]');

  list.addEventListener('click', (e) => {
    const move = e.target.closest('[data-up], [data-down]');
    if (move) {
      const r = move.closest('.cat-row');
      const up = move.hasAttribute('data-up');
      const sib = up ? r.previousElementSibling : r.nextElementSibling;
      if (sib?.dataset.cat) {
        if (up) sib.before(r);
        else sib.after(r);
        r.classList.remove('moved');
        void r.offsetWidth; // fa ripartire l'evidenziazione
        r.classList.add('moved');
        move.focus();
      }
      return;
    }
    const del = e.target.closest('[data-del]');
    if (!del) return;
    const r = del.closest('.cat-row');
    if (r.dataset.pending) return r.remove();
    const on = r.classList.toggle('deleted');
    r.querySelector('input').disabled = on;
    del.setAttribute('aria-label', on ? 'Ripristina' : 'Elimina');
  });
  dlg.querySelector('[data-add-new]').onclick = () => {
    const val = newInput.value.trim();
    if (!val) return newInput.focus();
    list.insertAdjacentHTML('beforeend', `
      <div class="cat-row" data-pending="1">
        <input value="${esc(val)}" data-newname aria-label="Nuova categoria" autocomplete="off">
        <button type="button" class="icon-btn" data-del aria-label="Rimuovi">${icon('trash', 'sm')}</button>
      </div>`);
    dlg.querySelector('.cat-none')?.remove();
    newInput.value = '';
    newInput.focus();
  };
  return dlg;
}
