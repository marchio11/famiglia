// Faccende di casa: ogni faccenda ha un "timer" (ogni quanto va fatta) che
// riparte da zero quando qualcuno la segna come fatta. Se il tempo scade
// diventa urgente (e compare in home). Le faccende sono di tutti.
//
// Dati in Firestore "faccende":
//   { name, emoji, n, unit, every (giorni), since (AAAA-MM-GG, da quando si
//     conta se non c'è storico), history: [{ by, day, at }], deleted }
// Eliminare una faccenda la nasconde (deleted: true) ma ne conserva lo
// storico, che resta visibile nella scheda "Storico".

import * as store from '../store.js';
import { esc, toast, formDialog, pageHead, sheetMenu, avatar, ymd, daysUntil, splitEmoji } from '../util.js';
import { icon } from '../icons.js';

const COLOR = 'var(--c-faccende)';
const UNITS = { giorni: 1, settimane: 7, mesi: 30 };
const UNIT_ONE = { giorni: 'giorno', settimane: 'settimana', mesi: 'mese' };

/** Faccende suggerite per cominciare (modificabili). */
const SUGGESTED = [
  ['🛁', 'Pulire il bagno', 1, 'settimane'],
  ['🧹', 'Passare l\'aspirapolvere', 1, 'settimane'],
  ['🧽', 'Lavare i pavimenti', 1, 'settimane'],
  ['🛏️', 'Cambiare le lenzuola', 2, 'settimane'],
  ['🧺', 'Cambiare gli asciugamani', 1, 'settimane'],
  ['🗑️', 'Pulire il bidone della spazzatura', 1, 'mesi'],
  ['🧊', 'Pulire il frigorifero', 1, 'mesi'],
  ['🔥', 'Pulire il forno', 1, 'mesi'],
  ['🪟', 'Lavare i vetri', 2, 'mesi'],
  ['🪟', 'Lavare le tende', 6, 'mesi'],
  ['❄️', 'Pulire i filtri del condizionatore', 6, 'mesi'],
];

const plural = (n, unit) => (n === 1 ? UNIT_ONE[unit] : unit);
export const everyLabel = (f) => (f.n === 1 ? `ogni ${UNIT_ONE[f.unit]}` : `ogni ${f.n} ${plural(f.n, f.unit)}`);

/* ---------- Calcoli ---------- */

export const active = () => store.getAll('faccende').filter((f) => !f.deleted);

/** Ultima volta che è stata fatta (AAAA-MM-GG) o '' se mai. */
export function lastDone(f) {
  return (f.history || []).reduce((m, h) => (h.day > m ? h.day : m), f.since || '');
}
const lastEntry = (f) => (f.history || []).reduce((m, h) => (!m || h.day > m.day || (h.day === m.day && h.at > m.at) ? h : m), null);

function addDaysTo(day, n) {
  const [y, m, d] = day.split('-').map(Number);
  return ymd(new Date(y, m - 1, d + n));
}

/**
 * Stato della faccenda: quanti giorni mancano (negativo = in ritardo) e
 * livello: 'late' (in ritardo → urgente), 'soon' (tocca a breve), 'ok'.
 */
export function status(f) {
  const last = lastDone(f);
  const due = last ? addDaysTo(last, f.every) : ymd(new Date());
  const left = daysUntil(due);
  const window = Math.max(1, Math.min(7, Math.round(f.every * 0.2)));
  const level = left < 0 ? 'late' : left <= window ? 'soon' : 'ok';
  return { last, due, left, level, never: !last };
}

/** Faccende in ritardo (per la home), le più in ritardo prima. */
export function late() {
  return active().map((f) => ({ f, s: status(f) })).filter((x) => x.s.level === 'late')
    .sort((a, b) => a.s.left - b.s.left).map((x) => x.f);
}

function ago(day) {
  const n = -daysUntil(day);
  if (n <= 0) return 'oggi';
  if (n === 1) return 'ieri';
  if (n < 60) return `${n} giorni fa`;
  return `il ${shortDay(day)}`;
}
function shortDay(day) {
  const [y, m, d] = day.split('-').map(Number);
  const opts = { day: 'numeric', month: 'short' };
  if (y !== new Date().getFullYear()) opts.year = 'numeric';
  return new Date(y, m - 1, d).toLocaleDateString('it-IT', opts);
}

/* ---------- Azioni ---------- */

/** Registra che la faccenda è stata fatta (di default: oggi, da chi usa l'app). */
function markDone(f, day = ymd(new Date()), by = store.getUser()) {
  const entry = { by, day, at: Date.now() };
  const prev = f.history || [];
  store.update('faccende', f.id, { history: [...prev, entry] });
  const who = by === store.getUser() ? '' : ` (da ${by})`;
  toast(`${f.emoji} ${f.name}: fatto${who}! ✓`, {
    label: 'Annulla',
    run: () => store.update('faccende', f.id, { history: (store.get('faccende', f.id)?.history || []).filter((h) => h.at !== entry.at) }),
  });
}

function doneOtherDay(f) {
  const me = store.getUser();
  const today = ymd(new Date());
  formDialog({
    title: `${f.emoji} ${f.name}`,
    color: COLOR,
    autofocus: false,
    submitLabel: 'Registra',
    body: `
      <label class="field"><span>Quando è stata fatta?</span><input type="date" name="day" value="${today}" max="${today}" required></label>
      <fieldset class="field"><legend>Chi l'ha fatta?</legend>
        <div class="who-pick">
          ${store.MEMBERS.map((m) => `<label><input type="radio" name="by" value="${m}" ${m === me ? 'checked' : ''}><span>${avatar(m, 'xs')}${m}</span></label>`).join('')}
        </div>
      </fieldset>`,
    onSubmit: (v) => {
      if (!v.day || v.day > today) {
        toast('Scegli una data di oggi o del passato');
        return false;
      }
      markDone(f, v.day, v.by || me);
    },
  });
}

function openForm(item) {
  const f = item || { name: '', emoji: '', n: 1, unit: 'settimane' };
  const today = ymd(new Date());
  formDialog({
    title: item ? 'Modifica faccenda' : 'Nuova faccenda',
    color: COLOR,
    autofocus: !item,
    submitLabel: item ? 'Salva' : 'Aggiungi',
    body: `
      <label class="field"><span>Cosa c'è da fare?</span><input name="name" required value="${esc(item ? `${f.emoji} ${f.name}` : '')}" placeholder="es. 🛁 Pulire il bagno"></label>
      <div class="field"><span class="label">Ogni quanto va fatta?</span>
        <div class="every-pick">
          <span>Ogni</span>
          <input type="number" name="n" min="1" max="365" inputmode="numeric" value="${f.n}" required aria-label="Numero">
          <select name="unit" aria-label="Unità">
            ${Object.keys(UNITS).map((u) => `<option value="${u}" ${u === f.unit ? 'selected' : ''}>${u}</option>`).join('')}
          </select>
        </div>
      </div>
      ${item ? '' : `
      <label class="field"><span>Ultima volta che è stata fatta</span><input type="date" name="since" value="${today}" max="${today}"></label>
      <p class="hint" style="margin: -4px 0 16px">Da qui parte il conto alla rovescia. Se non te lo ricordi, cancella la data: risulterà da fare subito.</p>`}`,
    onSubmit: (v) => {
      const n = Math.max(1, Math.min(365, Math.round(Number(v.n) || 1)));
      const unit = UNITS[v.unit] ? v.unit : 'giorni';
      const { emoji, name } = splitEmoji(v.name);
      if (!name) return false;
      const data = { name, emoji: emoji || '🧹', n, unit, every: n * UNITS[unit] };
      if (item) store.update('faccende', item.id, data);
      else store.add('faccende', { ...data, since: v.since && v.since <= today ? v.since : '', history: [] });
    },
    onDelete: item ? () => removeChore(item) : null,
  });
}

function removeChore(f) {
  formDialog({
    title: `Eliminare "${f.name}"?`,
    color: COLOR,
    autofocus: false,
    submitLabel: 'Elimina',
    body: '<p>Sparisce dall\'elenco delle faccende. Quello che è stato fatto in passato resta nello <b>Storico</b>.</p>',
    onSubmit: () => {
      store.update('faccende', f.id, { deleted: true, deletedAt: Date.now() });
      toast('Faccenda eliminata', { label: 'Annulla', run: () => store.update('faccende', f.id, { deleted: false }) });
    },
  });
}

/** Storico di una faccenda: chi l'ha fatta e quando (si può togliere una registrazione sbagliata). */
function historyDialog(f) {
  const list = [...(f.history || [])].sort((a, b) => b.day.localeCompare(a.day) || b.at - a.at);
  sheetMenu(`${f.emoji} ${f.name} · storico`, list.length
    ? list.slice(0, 30).map((h) => ({
      icon: avatar(h.by, 'xs') || '✓',
      label: `${h.by || '?'} · ${shortDay(h.day)} (${ago(h.day)}) — tocca per togliere`,
      run: () => formDialog({
        title: 'Togliere questa registrazione?',
        color: COLOR,
        autofocus: false,
        submitLabel: 'Togli',
        body: `<p>${esc(f.name)}: fatta da <b>${esc(h.by || '?')}</b> il ${esc(shortDay(h.day))}. Utile se è stata segnata per sbaglio.</p>`,
        onSubmit: () => {
          const cur = store.get('faccende', f.id);
          store.update('faccende', f.id, { history: (cur?.history || []).filter((x) => x.at !== h.at) });
          toast('Registrazione tolta');
        },
      }),
    }))
    : [{ icon: '🌱', label: 'Ancora nessuna registrazione', run: () => {} }], COLOR);
}

function choreMenu(f) {
  sheetMenu(`${f.emoji} ${f.name}`, [
    { icon: '✅', label: 'Fatta oggi da me', run: () => markDone(f) },
    { icon: '📅', label: 'Fatta un altro giorno o da un altro…', run: () => doneOtherDay(f) },
    { icon: '🕘', label: 'Storico', run: () => historyDialog(f) },
    { icon: '✏️', label: 'Modifica (nome e ogni quanto)', run: () => openForm(f) },
    { icon: '🗑️', label: 'Elimina', danger: true, run: () => removeChore(f) },
  ], COLOR);
}

function suggestDialog() {
  const have = new Set(active().map((f) => f.name.toLowerCase()));
  const items = SUGGESTED.filter(([, name]) => !have.has(name.toLowerCase()));
  if (!items.length) return toast('Ci sono già tutte quelle suggerite 😊');
  formDialog({
    title: 'Faccende suggerite',
    color: COLOR,
    autofocus: false,
    submitLabel: 'Aggiungi',
    body: `
      <p class="hint">Scegli quelle che vi servono: potrai cambiare nomi e tempi quando vuoi. Il conto alla rovescia parte da oggi.</p>
      <div class="suggest-list">
        ${items.map(([emoji, name, n, unit], i) => `
          <label class="switch"><input type="checkbox" name="s${i}" checked><span>${emoji} ${esc(name)} <small>· ${esc(everyLabel({ n, unit }))}</small></span></label>`).join('')}
      </div>`,
    onSubmit: (v) => {
      const today = ymd(new Date());
      let added = 0;
      items.forEach(([emoji, name, n, unit], i) => {
        if (!v[`s${i}`]) return;
        store.add('faccende', { name, emoji, n, unit, every: n * UNITS[unit], since: today, history: [] });
        added++;
      });
      if (added) toast(`${added} faccende aggiunte ✓`);
    },
  });
}

/* ---------- Schermata ---------- */

let tab = 'list'; // 'list' | 'history'

function row(f) {
  const s = status(f);
  const last = lastEntry(f);
  const tag = s.level === 'late'
    ? `<span class="tag overdue">In ritardo di ${-s.left} ${-s.left === 1 ? 'giorno' : 'giorni'}</span>`
    : s.never ? '<span class="tag soon">Da fare</span>'
      : s.left === 0 ? '<span class="tag soon">Oggi</span>'
        : s.left === 1 ? '<span class="tag soon">Domani</span>'
          : `<span class="tag ${s.level === 'soon' ? 'week' : ''}">Tra ${s.left} giorni</span>`;
  const done = s.never ? 'Mai fatta'
    : last && last.day === s.last ? `Fatta da ${esc(last.by || '?')} ${ago(last.day)}`
      : `Ultima volta ${ago(s.last)}`;
  const pct = s.never ? 0 : Math.max(0, Math.min(100, Math.round(((s.left + 1) / (f.every + 1)) * 100)));
  return `
    <div class="row chore ${s.level}" data-id="${f.id}">
      <span class="lead">${f.emoji}</span>
      <div class="row-main" data-act="menu">
        <div class="row-title">${esc(f.name)} ${s.level === 'late' ? '<span class="tag urgent">Urgente</span>' : ''}</div>
        <div class="row-sub">${tag}<span>${done} · ${esc(everyLabel(f))}</span></div>
        <div class="chore-bar" aria-hidden="true"><span style="width:${pct}%"></span></div>
      </div>
      <button class="done-btn" type="button" data-act="done" aria-label="Segna come fatta: ${esc(f.name)}">✓ Fatto</button>
    </div>`;
}

function historyHtml() {
  const all = store.getAll('faccende').flatMap((f) => (f.history || []).map((h) => ({ ...h, f })));
  if (!all.length) return '<div class="empty-state"><span class="big">🕘</span><p><strong>Ancora niente nello storico</strong></p><p>Ogni volta che qualcuno segna una faccenda come fatta, comparirà qui.</p></div>';
  all.sort((a, b) => b.day.localeCompare(a.day) || b.at - a.at);
  const months = new Map();
  for (const h of all) {
    const [y, m] = h.day.split('-').map(Number);
    const key = new Date(y, m - 1, 1).toLocaleDateString('it-IT', { month: 'long', year: 'numeric' });
    if (!months.has(key)) months.set(key, []);
    months.get(key).push(h);
  }
  return [...months].map(([month, list]) => `
    <section class="group">
      <h3 class="group-head"><span>${esc(month.charAt(0).toUpperCase() + month.slice(1))}</span></h3>
      <div class="card rows">${list.map((h) => `
        <div class="row">
          <span class="lead">${h.f.emoji}</span>
          <div class="row-main">
            <div class="row-title">${esc(h.f.name)}${h.f.deleted ? ' <small class="hint">(eliminata)</small>' : ''}</div>
            <div class="row-sub"><span class="who-mini">${avatar(h.by, 'xs')}${esc(h.by || '?')}</span><span>${esc(shortDay(h.day))}</span></div>
          </div>
        </div>`).join('')}</div>
    </section>`).join('');
}

export default function faccende(root) {
  root.style.setProperty('--c', COLOR);
  root.innerHTML = `
    ${pageHead({ badge: icon('broom'), title: 'Faccende', count: ' ' })}
    <div class="chips" role="group" aria-label="Vista" data-tabs></div>
    <div data-list></div>
    <button class="fab" type="button" data-new>${icon('plus')}Nuova</button>`;

  const listEl = root.querySelector('[data-list]');
  root.querySelector('[data-new]').onclick = () => openForm();

  root.querySelector('[data-tabs]').addEventListener('click', (e) => {
    const b = e.target.closest('[data-tab]');
    if (!b) return;
    tab = b.dataset.tab;
    draw();
  });

  listEl.addEventListener('click', (e) => {
    if (e.target.closest('[data-suggest]')) return suggestDialog();
    const act = e.target.closest('[data-act]');
    const rowEl = e.target.closest('[data-id]');
    if (!act || !rowEl) return;
    const f = store.get('faccende', rowEl.dataset.id);
    if (!f) return;
    if (act.dataset.act === 'done') markDone(f);
    if (act.dataset.act === 'menu') choreMenu(f);
  });

  function draw() {
    const list = active().map((f) => ({ f, s: status(f) }));
    const nLate = list.filter((x) => x.s.level === 'late').length;
    root.querySelector('[data-count]').textContent = nLate || '';
    root.querySelector('[data-tabs]').innerHTML = [
      ['list', `Da fare${nLate ? ` · ${nLate} in ritardo` : ''}`],
      ['history', 'Storico'],
    ].map(([k, l]) => `<button class="chip" type="button" data-tab="${k}" aria-pressed="${tab === k}">${l}</button>`).join('');

    if (tab === 'history') {
      listEl.innerHTML = historyHtml();
      return;
    }
    if (!list.length) {
      listEl.innerHTML = `
        <div class="empty-state">
          <span class="big">🧹</span>
          <p><strong>Nessuna faccenda per ora</strong></p>
          <p>Ogni faccenda ha un tempo (es. "ogni 2 settimane"): quando qualcuno la fa, tocca <b>✓ Fatto</b> e il conto riparte. Se il tempo scade diventa urgente.</p>
          <button class="btn primary" type="button" data-suggest>Scegli tra quelle suggerite</button>
        </div>`;
      return;
    }
    // Prima le più urgenti (meno giorni rimasti), a parità quelle con il tempo più breve.
    list.sort((a, b) => a.s.left - b.s.left || a.f.every - b.f.every || a.f.name.localeCompare(b.f.name));
    const groups = [
      ['🔴 In ritardo', list.filter((x) => x.s.level === 'late')],
      ['🟠 Da fare a breve', list.filter((x) => x.s.level === 'soon')],
      ['🟢 In ordine', list.filter((x) => x.s.level === 'ok')],
    ];
    listEl.innerHTML = groups.filter(([, g]) => g.length).map(([label, g]) => `
      <section class="group">
        <h3 class="group-head"><span>${label}</span></h3>
        <div class="card rows">${g.map((x) => row(x.f)).join('')}</div>
      </section>`).join('') + `
      <p class="hint center">Tocca una faccenda per modificarla, vederne lo storico o segnarla fatta in un altro giorno.
      <br><button class="link-btn" type="button" data-suggest>+ Aggiungi tra quelle suggerite</button></p>`;
  }

  draw();
  return store.subscribe(draw);
}
