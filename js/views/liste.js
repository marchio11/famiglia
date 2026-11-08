import * as store from '../store.js';
import {
  esc, byWho, toast, formDialog, pageHead, dueTag, dateField, categorySelect, categoriesDialog, ymd,
} from '../util.js';
import { icon } from '../icons.js';

const COLOR = 'var(--c-liste)';
const EMOJIS = ['📋', '🛍️', '📍', '✅', '🍕', '🍝', '🍽️', '🎁', '🧳', '🚐', '✈️', '🏠', '🛠️', '🌱', '🎬', '📚', '💊', '🎂', '🐾', '💡'];

/** Tipi di lista: le liste vengono raggruppate per tipo. */
const TYPES = [
  { id: 'acquisti', name: 'Acquisti', emoji: '🛍️', hint: 'Negozi, regali, cose da comprare', done: 'Comprati' },
  { id: 'luoghi', name: 'Luoghi da visitare', emoji: '📍', hint: 'Ristoranti, gite, viaggi', done: 'Visitati' },
  { id: 'cose', name: 'Cose da fare', emoji: '✅', hint: 'Film, libri, lavoretti', done: 'Fatte' },
  { id: 'altro', name: 'Altre liste', emoji: '📋', hint: 'Ricette, menu, valigie', done: 'Completate' },
];
const typeOf = (list) => TYPES.find((t) => t.id === list?.type) || TYPES.at(-1);

const TEMPLATES = [
  { type: 'acquisti', name: 'Ferramenta e bricolage', emoji: '🛠️' },
  { type: 'acquisti', name: 'Regali di Natale', emoji: '🎁', sections: ['Andrea', 'Laura', 'Claudia', 'Altri'] },
  { type: 'luoghi', name: 'Ristoranti da provare', emoji: '🍕', sections: ['Pizzerie', 'Cinesi', 'Giapponesi e sushi', 'Trattorie'] },
  { type: 'luoghi', name: 'Gite e viaggi', emoji: '✈️' },
  { type: 'cose', name: 'Film e serie da vedere', emoji: '🎬', sections: ['Film', 'Serie TV'] },
  { type: 'cose', name: 'Lavoretti in casa', emoji: '🏠' },
  { type: 'altro', name: 'Ricette', emoji: '🍝', sections: ['Primi', 'Secondi', 'Dolci'] },
  { type: 'altro', name: 'Menu della settimana', emoji: '🍽️' },
  { type: 'altro', name: 'Valigia camper', emoji: '🚐' },
];

// Categoria in cui finiscono le voci aggiunte velocemente (per lista).
const target = {};

function createFromTemplate(t) {
  const sections = (t.sections || []).map((name) => ({ id: store.uid(), name }));
  return store.add('lists', { name: t.name, emoji: t.emoji, type: t.type, sections });
}

/** Aggiunge una categoria (sezione) alla lista, o riusa quella con lo stesso nome. */
function addSection(listId, name) {
  const list = store.get('lists', listId);
  const sections = list.sections || [];
  const same = sections.find((s) => s.name.toLowerCase() === name.toLowerCase());
  if (same) return same.id;
  const sec = { id: store.uid(), name };
  store.update('lists', listId, { sections: [...sections, sec] });
  return sec.id;
}

/* ---------- Finestre ---------- */

/** Finestra lista. tripId: crea la lista dentro un viaggio. */
export function listForm(list, presetType = 'altro', tripId = '') {
  const l = list || { name: '', emoji: '', type: presetType };
  const type = typeOf(l).id;
  formDialog({
    title: list ? 'Modifica lista' : 'Nuova lista',
    color: COLOR,
    autofocus: !list,
    submitLabel: list ? 'Salva' : 'Crea',
    body: `
      <label class="field"><span>Nome</span><input name="name" required value="${esc(l.name)}" placeholder="es. Ristoranti da provare" autocomplete="off"></label>
      <fieldset class="field"><legend>Che tipo di lista è?</legend>
        <div class="type-pick">
          ${TYPES.map((t) => `<label><input type="radio" name="type" value="${t.id}" ${t.id === type ? 'checked' : ''}><span><b>${t.emoji} ${t.id === 'altro' ? 'Altro' : t.name}</b><small>${t.hint}</small></span></label>`).join('')}
        </div>
      </fieldset>
      <fieldset class="field"><legend>Icona</legend>
        <div class="emoji-pick">
          ${EMOJIS.map((e) => `<label><input type="radio" name="emoji" value="${e}" ${e === l.emoji ? 'checked' : ''}><span>${e}</span></label>`).join('')}
        </div>
      </fieldset>`,
    onSubmit: (v) => {
      const t = TYPES.find((x) => x.id === v.type) || TYPES.at(-1);
      const data = { name: v.name, type: t.id, emoji: v.emoji || t.emoji };
      if (list) store.update('lists', list.id, data);
      else location.hash = `#/liste/${store.add('lists', { ...data, sections: [], ...(tripId ? { tripId } : {}) })}`;
    },
    onDelete: list
      ? () => {
          const items = store.getAll('listItems').filter((i) => i.listId === list.id);
          const removedList = store.remove('lists', list.id);
          const removedItems = store.remove('listItems', items.map((i) => i.id));
          location.hash = list.tripId ? `#/viaggi/${list.tripId}` : '#/liste';
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

function manageSections(listId) {
  const list = store.get('lists', listId);
  const sections = list.sections || [];
  categoriesDialog({
    title: `Categorie di "${list.name}"`,
    color: COLOR,
    cats: sections.map((s) => ({ id: s.id, label: s.name })),
    placeholder: typeOf(list).id === 'luoghi' ? 'es. Pizzerie' : 'es. Urgenti',
    hint: 'Le voci di una categoria eliminata restano nella lista, "senza categoria".',
    reorder: true,
    onSave: ({ renamed, deleted, added, order }) => {
      let next = sections
        .filter((s) => !deleted.includes(s.id))
        .map((s) => ({ ...s, name: renamed.find((r) => r.id === s.id)?.label || s.name }));
      if (order) next.sort((a, b) => order.indexOf(a.id) - order.indexOf(b.id));
      for (const name of added) {
        if (!next.some((s) => s.name.toLowerCase() === name.toLowerCase())) next.push({ id: store.uid(), name });
      }
      store.getAll('listItems')
        .filter((i) => i.listId === listId && deleted.includes(i.section))
        .forEach((i) => store.update('listItems', i.id, { section: '' }));
      if (deleted.includes(target[listId])) target[listId] = '';
      store.update('lists', listId, { sections: next });
    },
  });
}

function newSectionDialog(listId) {
  formDialog({
    title: 'Nuova categoria',
    color: COLOR,
    submitLabel: 'Crea',
    body: `
      <label class="field"><span>Nome</span><input name="name" required placeholder="${typeOf(store.get('lists', listId)).id === 'luoghi' ? 'es. Pizzerie' : 'es. Urgenti'}" autocomplete="off"></label>
      <p class="hint">Le nuove voci verranno aggiunte in questa categoria (puoi cambiarla toccando le etichette sotto la barra).</p>`,
    onSubmit: (v) => {
      target[listId] = addSection(listId, v.name);
    },
  });
}

/** Finestra completa per una voce: nuova (item = null) o modifica. */
/** Ora facoltativa (menu ore/minuti, niente orologio di Android). */
function timePick(value = '') {
  const [h = '', m = '00'] = value ? value.split(':') : [];
  const mins = Array.from({ length: 12 }, (_, i) => String(i * 5).padStart(2, '0'));
  if (!mins.includes(m)) mins.push(m);
  mins.sort();
  return `
    <div class="field">
      <span>Ora (facoltativa)</span>
      <div class="time-pick">
        <select name="timeH" aria-label="Ora"><option value="">--</option>${Array.from({ length: 24 }, (_, i) => String(i).padStart(2, '0')).map((x) => `<option ${x === h ? 'selected' : ''}>${x}</option>`).join('')}</select>
        <b>:</b>
        <select name="timeM" aria-label="Minuti">${mins.map((x) => `<option ${x === m ? 'selected' : ''}>${x}</option>`).join('')}</select>
      </div>
    </div>`;
}

function itemForm(listId, item, prefill = '') {
  const list = store.get('lists', listId);
  const isLuogo = typeOf(list).id === 'luoghi';
  const isProgram = !!list.program;
  const isNew = !item;
  const it = item || { text: prefill, section: target[listId] || '', due: '', notes: '', place: '' };
  const sections = list.sections || [];
  formDialog({
    title: isNew ? 'Nuova voce' : 'Modifica voce',
    color: COLOR,
    autofocus: isNew,
    submitLabel: isNew ? 'Aggiungi' : 'Salva',
    body: `
      <label class="field"><span>${isLuogo ? 'Nome del posto' : 'Testo'}</span><input name="text" required value="${esc(it.text)}" autocomplete="off"></label>
      ${categorySelect({
        name: 'section',
        label: isProgram ? 'Giorno' : 'Categoria',
        options: [{ value: '', label: isProgram ? 'Senza giorno' : list.packing ? 'In comune' : 'Senza categoria' }, ...sections.map((s) => ({ value: s.id, label: s.name }))],
        selected: sections.some((s) => s.id === it.section) ? it.section : '',
        placeholder: isLuogo ? 'es. Pizzerie' : 'es. Urgenti',
      })}
      ${isLuogo ? `<label class="field"><span>Indirizzo o città</span><input name="place" value="${esc(it.place)}" placeholder="es. Via Roma 1, Bologna" autocomplete="off"></label>` : ''}
      ${isProgram ? timePick(it.time) : dateField('due', 'Data o scadenza (facoltativa)', it.due)}
      <label class="field"><span>Note</span><textarea name="notes" rows="3" placeholder="${isLuogo ? 'Consigliato da…, link, prezzi…' : 'Dettagli, link…'}">${esc(it.notes)}</textarea></label>`,
    onSubmit: (v) => {
      const section = v.section === '__new__' ? addSection(listId, v.sectionNew) : v.section;
      const data = { text: v.text, section, due: v.due || '', notes: v.notes };
      if (isLuogo) data.place = v.place;
      if (isProgram) data.time = v.timeH ? `${v.timeH}:${v.timeM || '00'}` : '';
      if (isNew) store.add('listItems', { ...data, listId, done: false });
      else store.update('listItems', item.id, data);
    },
    onDelete: isNew ? null : () => {
      const removed = store.remove('listItems', item.id);
      toast('Voce eliminata', { label: 'Annulla', run: () => store.restore('listItems', removed) });
    },
  });
}

/* ---------- Elenco delle liste ---------- */

function templateChips(lists) {
  const existing = new Set(lists.map((l) => l.name.toLowerCase()));
  return TEMPLATES
    .map((t, i) => (existing.has(t.name.toLowerCase()) ? '' : `<button class="chip" type="button" data-template="${i}">${t.emoji} ${t.name}</button>`))
    .join('');
}

function index(root) {
  root.innerHTML = `
    ${pageHead({ badge: icon('list'), title: 'Liste' })}
    <div data-lists></div>
    <button class="fab" type="button" data-new>${icon('plus')}Nuova lista</button>`;

  root.querySelector('[data-new]').onclick = () => listForm();
  const el = root.querySelector('[data-lists]');

  el.addEventListener('click', (e) => {
    const tpl = e.target.closest('[data-template]');
    if (tpl) location.hash = `#/liste/${createFromTemplate(TEMPLATES[tpl.dataset.template])}`;
    const add = e.target.closest('[data-new-type]');
    if (add) listForm(null, add.dataset.newType);
  });

  const draw = () => {
    const lists = store.getAll('lists').filter((l) => !l.tripId).sort((a, b) => a.name.localeCompare(b.name, 'it'));
    const items = store.getAll('listItems');
    if (!lists.length) {
      el.innerHTML = `
        <div class="empty-state">
          <span class="big">📋</span>
          <p><strong>Nessuna lista, per ora</strong></p>
          <p>Liste di acquisti, ristoranti da provare, film da vedere… Qualche idea per iniziare:</p>
          <div class="templates">${templateChips(lists)}</div>
        </div>`;
      return;
    }
    let html = '';
    for (const t of TYPES) {
      const group = lists.filter((l) => typeOf(l).id === t.id);
      if (!group.length) continue;
      html += `
        <section class="group">
          <h3 class="group-head"><span>${t.emoji} ${t.name}</span><button class="link-btn" type="button" data-new-type="${t.id}">+ Nuova</button></h3>
          <div class="list-cards">${group.map((l) => {
            const its = items.filter((i) => i.listId === l.id);
            const nSec = (l.sections || []).length;
            const info = its.length ? (its.length === 1 ? '1 voce' : `${its.length} voci`) : 'Vuota';
            return `
              <a class="card list-card" href="#/liste/${l.id}">
                <span class="emoji">${esc(l.emoji || t.emoji)}</span>
                <span class="grow"><div class="name">${esc(l.name)}</div><div class="info">${info}${nSec ? ` · ${nSec} categorie` : ''}</div></span>
                ${icon('chevron')}
              </a>`;
          }).join('')}</div>
        </section>`;
    }
    const chips = templateChips(lists);
    if (chips) {
      html += `<details class="ideas"><summary>💡 Idee per nuove liste</summary><div class="templates">${chips}</div></details>`;
    }
    el.innerHTML = html;
  };

  draw();
  return store.subscribe(draw);
}

/* ---------- Dettaglio di una lista ---------- */

function row(it) {
  const maps = it.place
    ? `<a class="maps" href="https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${it.text} ${it.place}`)}" target="_blank" rel="noopener">${icon('pin', 'sm')}${esc(it.place)}</a>`
    : '';
  const sub = [it.done ? '' : dueTag(it.due), maps, it.notes ? '<span>📝 Note</span>' : '', byWho(it.createdBy)].filter(Boolean).join('');
  return `
    <div class="row ${it.done ? 'done' : ''}" data-id="${it.id}">
      <button class="check" type="button" data-act="toggle" aria-label="${it.done ? 'Togli la spunta' : 'Spunta'}: ${esc(it.text)}"></button>
      <div class="row-main" data-act="edit">
        <div class="row-title">${it.time ? `<span class="time-tag">${esc(it.time)}</span>` : ''}${esc(it.text)}</div>
        <div class="row-sub">${sub}</div>
      </div>
    </div>`;
}

function detail(root, id, day = '') {
  if (!store.get('lists', id)) {
    location.replace('#/liste');
    return null;
  }

  root.innerHTML = `
    ${pageHead({
      title: '<span data-title></span>',
      count: ' ',
      back: store.get('lists', id).tripId ? `#/viaggi/${store.get('lists', id).tripId}` : '#/liste',
      actions: `
        <button class="icon-btn" type="button" data-sections aria-label="Gestisci categorie">${icon('tag')}</button>
        <button class="icon-btn" type="button" data-edit-list aria-label="Modifica lista">${icon('edit')}</button>`,
    })}
    <form class="quick-add" data-add>
      <input name="text" placeholder="Aggiungi una voce…" autocomplete="off" enterkeyhint="done" aria-label="Nuova voce">
      <button class="icon-btn secondary" type="button" data-detailed aria-label="Aggiungi con dettagli">${icon('sliders')}</button>
      <button class="icon-btn" type="submit" aria-label="Aggiungi veloce">${icon('plus')}</button>
    </form>
    <div class="target" data-target></div>
    <div class="cat-groups" data-items></div>`;

  // Programma di viaggio: si aggiunge nel giorno toccato, o in quello di oggi.
  const startList = store.get('lists', id);
  if (startList.program) {
    const today = ymd(new Date());
    const days = (startList.sections || []).map((x) => x.id);
    if (day && days.includes(day)) target[id] = day;
    else if (!target[id] && days.includes(today)) target[id] = today;
  }
  // Valigia: si parte dalla propria sezione.
  if (startList.packing && target[id] === undefined && (startList.sections || []).some((x) => x.id === store.getUser())) {
    target[id] = store.getUser();
  }

  const form = root.querySelector('[data-add]');
  const el = root.querySelector('[data-items]');
  root.querySelector('[data-edit-list]').onclick = () => listForm(store.get('lists', id));
  root.querySelector('[data-sections]').onclick = () => manageSections(id);
  root.querySelector('[data-detailed]').onclick = () => {
    const prefill = form.elements.text.value.trim();
    form.elements.text.value = '';
    itemForm(id, null, prefill);
  };

  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const text = form.elements.text.value.trim();
    if (!text) return;
    store.add('listItems', { listId: id, text, section: target[id] || '', done: false, due: '', notes: '' });
    form.elements.text.value = '';
    form.elements.text.focus();
  });

  root.querySelector('[data-target]').addEventListener('click', (e) => {
    const b = e.target.closest('[data-sec]');
    if (!b) return;
    if (b.dataset.sec === '__new__') newSectionDialog(id);
    else {
      target[id] = b.dataset.sec;
      draw();
    }
  });

  el.addEventListener('click', (e) => {
    if (e.target.closest('a')) return; // link a Google Maps
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
    if (act.dataset.act === 'edit') itemForm(id, it);
  });

  function draw() {
    const l = store.get('lists', id);
    if (!l) return; // eliminata: il cambio pagina è già in corso
    const t = typeOf(l);
    const sections = l.sections || [];
    if (!sections.some((s) => s.id === target[id])) target[id] = '';

    root.querySelector('[data-title]').textContent = `${l.emoji || t.emoji} ${l.name}`;
    const items = store.getAll('listItems').filter((i) => i.listId === id);
    const open = items.filter((i) => !i.done)
      .sort((a, b) => (l.program ? (a.time || '99').localeCompare(b.time || '99') : 0) || a.createdAt - b.createdAt);
    const done = items.filter((i) => i.done).sort((a, b) => (b.doneAt || 0) - (a.doneAt || 0));
    root.querySelector('[data-count]').textContent = open.length || '';

    // Dove finiscono le voci aggiunte con "+"
    root.querySelector('[data-target]').innerHTML = sections.length
      ? `<span class="lbl">Aggiungi in:</span>
         ${[{ id: '', name: l.packing ? 'In comune' : 'Senza categoria' }, ...sections].map((s) => `<button class="chip" type="button" data-sec="${s.id}" aria-pressed="${(target[id] || '') === s.id}">${esc(s.name)}</button>`).join('')}
         <button class="chip dashed" type="button" data-sec="__new__">+ Categoria</button>`
      : `<button class="chip dashed" type="button" data-sec="__new__">+ Dividi in categorie</button>`;

    if (!items.length) {
      el.innerHTML = `<div class="empty-state"><span class="big">${esc(l.emoji || t.emoji)}</span><p><strong>Lista vuota</strong></p><p>Scrivi qui sopra la prima voce. Con ${icon('sliders', 'sm')} puoi aggiungere subito categoria, note e data.</p></div>`;
      return;
    }

    let html = '';
    if (!open.length) {
      html += `<div class="empty-state"><span class="big">✅</span><p><strong>Tutto completato!</strong></p></div>`;
    } else if (!sections.length) {
      html += `<section class="group"><div class="card rows">${open.map(row).join('')}</div></section>`;
    } else {
      const known = new Set(sections.map((s) => s.id));
      for (const s of [...sections, { id: '', name: l.packing ? 'In comune' : 'Senza categoria' }]) {
        const g = open.filter((i) => (known.has(i.section) ? i.section : '') === s.id);
        if (!g.length) continue;
        html += `
          <section class="group">
            <h3 class="group-head"><span>${esc(s.name)} · ${g.length}</span></h3>
            <div class="card rows">${g.map(row).join('')}</div>
          </section>`;
      }
    }
    if (done.length) {
      html += `
        <section class="group">
          <h3 class="group-head"><span>${t.done} · ${done.length}</span><button class="link-btn" type="button" data-clear>Rimuovi</button></h3>
          <div class="card rows">${done.map(row).join('')}</div>
        </section>`;
    }
    el.innerHTML = html;
  }

  draw();
  return store.subscribe(draw);
}

export default function liste(root, [id, day]) {
  root.style.setProperty('--c', COLOR);
  return id ? detail(root, id, day) : index(root);
}
