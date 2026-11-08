import * as store from '../store.js';
import { esc, byWho, avatar, toast, formDialog, pageHead, dueTag, dateField, daysUntil } from '../util.js';
import { icon } from '../icons.js';

const COLOR = 'var(--c-todo)';
const PRIO = { 1: 'Bassa', 2: 'Media', 3: 'Alta' };
const FILTERS = [
  { id: 'open', label: 'Da fare' },
  { id: 'mine', label: 'Miei' },
  { id: 'done', label: 'Fatti' },
];

let filter = 'open'; // ricordato finché l'app resta aperta

/** Persone assegnate (lista vuota = tutti). Compatibile con il vecchio campo singolo. */
export function assigneesOf(t) {
  if (Array.isArray(t.assignees)) return t.assignees;
  return t.assignee ? [t.assignee] : [];
}
const isForAll = (list) => !list.length || list.length === store.MEMBERS.length;
const isMine = (t, me) => assigneesOf(t).includes(me);

function openForm(item) {
  const t = item || { title: '', assignees: [], due: '', priority: 2, notes: '' };
  const who = assigneesOf(t);
  formDialog({
    title: item ? 'Modifica attività' : 'Nuova attività',
    color: COLOR,
    autofocus: !item,
    submitLabel: item ? 'Salva' : 'Aggiungi',
    body: `
      <label class="field"><span>Cosa c'è da fare?</span><input name="title" required value="${esc(t.title)}" placeholder="es. Prenotare il tagliando"></label>
      <fieldset class="field"><legend>Chi se ne occupa?</legend>
        <div class="who-pick">
          ${store.MEMBERS.map((m) => `<label><input type="checkbox" name="who" value="${m}" ${who.includes(m) ? 'checked' : ''}><span>${avatar(m, 'xs')}${m}</span></label>`).join('')}
        </div>
        <p class="hint">Puoi sceglierne una, due o tre. Se non ne scegli nessuna, è per tutti.</p>
      </fieldset>
      ${dateField('due', 'Scadenza', t.due)}
      <fieldset class="field"><legend>Priorità</legend>
        <div class="seg">
          ${[1, 2, 3].map((p) => `<label><input type="radio" name="priority" value="${p}" ${Number(t.priority) === p ? 'checked' : ''}><span>${PRIO[p]}</span></label>`).join('')}
        </div>
      </fieldset>
      <label class="field"><span>Note</span><textarea name="notes" rows="2" placeholder="Facoltative">${esc(t.notes)}</textarea></label>`,
    onSubmit: (v, form) => {
      const picked = new FormData(form).getAll('who');
      const assignees = isForAll(picked) ? [] : picked;
      const data = { title: v.title, assignees, assignee: '', due: v.due, priority: Number(v.priority) || 2, notes: v.notes };
      if (item) store.update('todo', item.id, data);
      else {
        store.add('todo', { ...data, done: false });
        if (filter === 'done') filter = 'open';
      }
    },
    onDelete: item
      ? () => {
          const removed = store.remove('todo', item.id);
          toast('Attività eliminata', { label: 'Annulla', run: () => store.restore('todo', removed) });
        }
      : null,
  });
}

function sortOpen(a, b) {
  // Prima quelle con scadenza (più vicina prima), poi per priorità.
  if (a.due && b.due && a.due !== b.due) return a.due.localeCompare(b.due);
  if (a.due && !b.due) return -1;
  if (!a.due && b.due) return 1;
  return (b.priority || 2) - (a.priority || 2) || a.createdAt - b.createdAt;
}

function row(t) {
  const list = assigneesOf(t);
  const assignee = isForAll(list)
    ? `<span class="who-mini">${icon('user', 'sm')}Tutti</span>`
    : list.map((m) => byWho(m)).join('');
  const prio = t.priority === 3 ? `<span class="tag overdue">${icon('flag', 'sm')}Alta</span>` : '';
  const notes = t.notes ? `<span>📝 ${esc(t.notes.length > 40 ? t.notes.slice(0, 40) + '…' : t.notes)}</span>` : '';
  return `
    <div class="row ${t.done ? 'done' : `prio-${t.priority || 2}`}" data-id="${t.id}">
      <button class="check" type="button" data-act="toggle" aria-label="${t.done ? 'Segna come da fare' : 'Segna come fatto'}: ${esc(t.title)}"></button>
      <div class="row-main" data-act="edit">
        <div class="row-title">${esc(t.title)}</div>
        <div class="row-sub">${t.done ? '' : dueTag(t.due)}${prio}${assignee}${notes}</div>
      </div>
    </div>`;
}

export default function todo(root) {
  root.style.setProperty('--c', COLOR);
  root.innerHTML = `
    ${pageHead({ badge: icon('todo'), title: 'To-do', count: ' ' })}
    <div class="chips" role="group" aria-label="Filtro" data-filters></div>
    <div data-list></div>
    <button class="fab" type="button" data-new>${icon('plus')}Nuova</button>`;

  const listEl = root.querySelector('[data-list]');
  root.querySelector('[data-new]').onclick = () => openForm();

  root.querySelector('[data-filters]').addEventListener('click', (e) => {
    const b = e.target.closest('[data-filter]');
    if (!b) return;
    filter = b.dataset.filter;
    draw();
  });

  listEl.addEventListener('click', (e) => {
    if (e.target.closest('[data-clear]')) {
      const done = store.getAll('todo').filter((t) => t.done);
      const removed = store.remove('todo', done.map((t) => t.id));
      toast(`${removed.length} attività eliminate`, { label: 'Annulla', run: () => store.restore('todo', removed) });
      return;
    }
    const act = e.target.closest('[data-act]');
    const rowEl = e.target.closest('[data-id]');
    if (!act || !rowEl) return;
    const t = store.get('todo', rowEl.dataset.id);
    if (!t) return;
    if (act.dataset.act === 'edit') openForm(t);
    if (act.dataset.act === 'toggle') {
      const done = !t.done;
      store.update('todo', t.id, { done, doneAt: done ? Date.now() : null });
      if (done) toast('Fatto! ✓', { label: 'Annulla', run: () => store.update('todo', t.id, { done: false, doneAt: null }) });
    }
  });

  function draw() {
    const me = store.getUser();
    const all = store.getAll('todo');
    const open = all.filter((t) => !t.done);
    root.querySelector('[data-count]').textContent = open.length || '';

    const mineCount = open.filter((t) => isMine(t, me)).length;
    root.querySelector('[data-filters]').innerHTML = FILTERS.map((f) => {
      const n = f.id === 'open' ? open.length : f.id === 'mine' ? mineCount : all.length - open.length;
      return `<button class="chip" type="button" data-filter="${f.id}" aria-pressed="${filter === f.id}">${f.label}${n ? ` · ${n}` : ''}</button>`;
    }).join('');

    let items;
    if (filter === 'done') items = all.filter((t) => t.done).sort((a, b) => (b.doneAt || 0) - (a.doneAt || 0));
    else if (filter === 'mine') items = open.filter((t) => isMine(t, me)).sort(sortOpen);
    else items = open.sort(sortOpen);

    if (!items.length) {
      const msg = {
        open: all.length ? ['🎉', 'Niente da fare!', 'Goditi il momento… o aggiungi una nuova attività.'] : ['📝', 'Nessuna attività', 'Tocca "Nuova" per aggiungere la prima: puoi scegliere chi se ne occupa, la scadenza e la priorità.'],
        mine: ['😎', 'Nessuna attività assegnata a te', 'Quelle per "Tutti" le trovi in "Da fare".'],
        done: ['🗂️', 'Ancora nessuna attività completata', ''],
      }[filter];
      listEl.innerHTML = `<div class="empty-state"><span class="big">${msg[0]}</span><p><strong>${msg[1]}</strong></p><p>${msg[2]}</p></div>`;
      return;
    }

    if (filter === 'done') {
      listEl.innerHTML = `
        <section class="group">
          <h3 class="group-head"><span>Completate</span><button class="link-btn" type="button" data-clear>Elimina tutte</button></h3>
          <div class="card rows">${items.map(row).join('')}</div>
        </section>`;
      return;
    }

    // Raggruppa per periodo
    const groups = [
      ['In ritardo', (t) => t.due && daysUntil(t.due) < 0],
      ['Oggi e domani', (t) => t.due && daysUntil(t.due) <= 1],
      ['Prossimi 7 giorni', (t) => t.due && daysUntil(t.due) <= 7],
      ['Più avanti', (t) => !!t.due],
      ['Senza scadenza', () => true],
    ];
    const used = new Set();
    let html = '';
    for (const [label, test] of groups) {
      const g = items.filter((t) => !used.has(t.id) && test(t));
      g.forEach((t) => used.add(t.id));
      if (!g.length) continue;
      html += `
        <section class="group">
          <h3 class="group-head"><span>${label}</span></h3>
          <div class="card rows">${g.map(row).join('')}</div>
        </section>`;
    }
    listEl.innerHTML = html;
  }

  draw();
  return store.subscribe(draw);
}
