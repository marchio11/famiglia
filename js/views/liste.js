import * as store from '../store.js';
import { esc, byWho, toast, formDialog, pageHead, dueTag, dateField } from '../util.js';
import { icon } from '../icons.js';

const COLOR = 'var(--c-liste)';
const EMOJIS = ['📋', '🍝', '🍽️', '🎁', '🧳', '🚐', '🏠', '🛠️', '🌱', '🎬', '📚', '💊', '🎂', '✈️', '🐾', '💡'];
const TEMPLATES = [
  { name: 'Ricette', emoji: '🍝' },
  { name: 'Menu della settimana', emoji: '🍽️' },
  { name: 'Valigia camper', emoji: '🚐' },
  { name: 'Idee regalo', emoji: '🎁' },
  { name: 'Lavoretti in casa', emoji: '🛠️' },
  { name: 'Film da vedere', emoji: '🎬' },
];

/* ---------- Finestre ---------- */

function listForm(list) {
  const l = list || { name: '', emoji: '📋' };
  formDialog({
    title: list ? 'Modifica lista' : 'Nuova lista',
    color: COLOR,
    autofocus: !list,
    submitLabel: list ? 'Salva' : 'Crea',
    body: `
      <label class="field"><span>Nome</span><input name="name" required value="${esc(l.name)}" placeholder="es. Ricette della nonna"></label>
      <fieldset class="field"><legend>Icona</legend>
        <div class="emoji-pick">
          ${EMOJIS.map((e) => `<label><input type="radio" name="emoji" value="${e}" ${e === l.emoji ? 'checked' : ''}><span>${e}</span></label>`).join('')}
        </div>
      </fieldset>`,
    onSubmit: (v) => {
      if (list) store.update('lists', list.id, { name: v.name, emoji: v.emoji || '📋' });
      else location.hash = `#/liste/${store.add('lists', { name: v.name, emoji: v.emoji || '📋' })}`;
    },
    onDelete: list
      ? () => {
          const items = store.getAll('listItems').filter((i) => i.listId === list.id);
          const removedList = store.remove('lists', list.id);
          const removedItems = store.remove('listItems', items.map((i) => i.id));
          location.hash = '#/liste';
          toast(`Lista "${list.name}" eliminata`, {
            label: 'Annulla',
            run: () => {
              store.restore('lists', removedList);
              store.restore('listItems', removedItems);
            },
          });
        }
      : null,
    deleteLabel: 'Elimina lista',
  });
}

function itemForm(item) {
  formDialog({
    title: 'Modifica voce',
    color: COLOR,
    autofocus: false,
    body: `
      <label class="field"><span>Testo</span><input name="text" required value="${esc(item.text)}"></label>
      ${dateField('due', 'Data o scadenza (facoltativa)', item.due)}
      <label class="field"><span>Note</span><textarea name="notes" rows="4" placeholder="Ingredienti, link, dettagli…">${esc(item.notes)}</textarea></label>`,
    onSubmit: (v) => store.update('listItems', item.id, { text: v.text, due: v.due, notes: v.notes }),
    onDelete: () => {
      const removed = store.remove('listItems', item.id);
      toast('Voce eliminata', { label: 'Annulla', run: () => store.restore('listItems', removed) });
    },
  });
}

/* ---------- Elenco delle liste ---------- */

function index(root) {
  root.innerHTML = `
    ${pageHead({ badge: icon('list'), title: 'Liste' })}
    <div data-lists></div>
    <button class="fab" type="button" data-new>${icon('plus')}Nuova lista</button>`;

  root.querySelector('[data-new]').onclick = () => listForm();
  const el = root.querySelector('[data-lists]');

  el.addEventListener('click', (e) => {
    const b = e.target.closest('[data-template]');
    if (!b) return;
    const t = TEMPLATES[b.dataset.template];
    location.hash = `#/liste/${store.add('lists', { name: t.name, emoji: t.emoji })}`;
  });

  const draw = () => {
    const lists = store.getAll('lists').sort((a, b) => a.name.localeCompare(b.name, 'it'));
    const items = store.getAll('listItems');
    if (!lists.length) {
      el.innerHTML = `
        <div class="empty-state">
          <span class="big">📋</span>
          <p><strong>Nessuna lista, per ora</strong></p>
          <p>Crea liste per tutto ciò che vi serve. Qualche idea per iniziare:</p>
          <div class="templates">
            ${TEMPLATES.map((t, i) => `<button class="chip" type="button" data-template="${i}">${t.emoji} ${t.name}</button>`).join('')}
          </div>
        </div>`;
      return;
    }
    el.innerHTML = `<div class="list-cards">${lists.map((l) => {
      const its = items.filter((i) => i.listId === l.id);
      const open = its.filter((i) => !i.done).length;
      const info = its.length ? `${open} da fare · ${its.length} in tutto` : 'Vuota';
      return `
        <a class="card list-card" href="#/liste/${l.id}">
          <span class="emoji">${esc(l.emoji || '📋')}</span>
          <span class="grow"><div class="name">${esc(l.name)}</div><div class="info">${info}</div></span>
          ${icon('chevron')}
        </a>`;
    }).join('')}</div>`;
  };

  draw();
  return store.subscribe(draw);
}

/* ---------- Dettaglio di una lista ---------- */

function row(it) {
  const sub = [it.done ? '' : dueTag(it.due), it.notes ? '📝 Note' : '', byWho(it.createdBy)].filter(Boolean).join('');
  return `
    <div class="row ${it.done ? 'done' : ''}" data-id="${it.id}">
      <button class="check" type="button" data-act="toggle" aria-label="${it.done ? 'Togli la spunta' : 'Spunta'}: ${esc(it.text)}"></button>
      <div class="row-main" data-act="edit">
        <div class="row-title">${esc(it.text)}</div>
        <div class="row-sub">${sub}</div>
      </div>
    </div>`;
}

function detail(root, id) {
  const list = store.get('lists', id);
  if (!list) {
    location.replace('#/liste');
    return null;
  }

  root.innerHTML = `
    ${pageHead({
      title: `<span data-title></span>`,
      count: ' ',
      back: '#/liste',
      actions: `<button class="icon-btn" type="button" data-edit-list aria-label="Modifica lista">${icon('edit')}</button>`,
    })}
    <form class="quick-add" data-add>
      <input name="text" placeholder="Aggiungi una voce…" autocomplete="off" enterkeyhint="done" aria-label="Nuova voce">
      <button class="icon-btn" type="submit" aria-label="Aggiungi">${icon('plus')}</button>
    </form>
    <div data-items></div>`;

  const form = root.querySelector('[data-add]');
  const el = root.querySelector('[data-items]');
  root.querySelector('[data-edit-list]').onclick = () => listForm(store.get('lists', id));

  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const text = form.elements.text.value.trim();
    if (!text) return;
    store.add('listItems', { listId: id, text, done: false, due: '', notes: '' });
    form.elements.text.value = '';
    form.elements.text.focus();
  });

  el.addEventListener('click', (e) => {
    if (e.target.closest('[data-clear]')) {
      const done = store.getAll('listItems').filter((i) => i.listId === id && i.done);
      const removed = store.remove('listItems', done.map((i) => i.id));
      toast(`${removed.length} voci rimosse`, { label: 'Annulla', run: () => store.restore('listItems', removed) });
      return;
    }
    const act = e.target.closest('[data-act]');
    const rowEl = e.target.closest('[data-id]');
    if (!act || !rowEl) return;
    const it = store.get('listItems', rowEl.dataset.id);
    if (!it) return;
    if (act.dataset.act === 'toggle') store.update('listItems', it.id, { done: !it.done, doneAt: Date.now() });
    if (act.dataset.act === 'edit') itemForm(it);
  });

  const draw = () => {
    const l = store.get('lists', id);
    if (!l) return; // eliminata: il cambio pagina è già in corso
    root.querySelector('[data-title]').textContent = `${l.emoji || '📋'} ${l.name}`;
    const items = store.getAll('listItems').filter((i) => i.listId === id);
    const open = items.filter((i) => !i.done).sort((a, b) => a.createdAt - b.createdAt);
    const done = items.filter((i) => i.done).sort((a, b) => (b.doneAt || 0) - (a.doneAt || 0));
    root.querySelector('[data-count]').textContent = open.length || '';

    if (!items.length) {
      el.innerHTML = `<div class="empty-state"><span class="big">${esc(l.emoji || '📋')}</span><p><strong>Lista vuota</strong></p><p>Scrivi qui sopra la prima voce. Toccando una voce puoi aggiungere note e una data.</p></div>`;
      return;
    }
    let html = '';
    if (open.length) html += `<section class="group"><div class="card rows">${open.map(row).join('')}</div></section>`;
    else html += `<div class="empty-state"><span class="big">✅</span><p><strong>Tutto completato!</strong></p></div>`;
    if (done.length) {
      html += `
        <section class="group">
          <h3 class="group-head"><span>Completate · ${done.length}</span><button class="link-btn" type="button" data-clear>Rimuovi</button></h3>
          <div class="card rows">${done.map(row).join('')}</div>
        </section>`;
    }
    el.innerHTML = html;
  };

  draw();
  return store.subscribe(draw);
}

export default function liste(root, [id]) {
  root.style.setProperty('--c', COLOR);
  return id ? detail(root, id) : index(root);
}
