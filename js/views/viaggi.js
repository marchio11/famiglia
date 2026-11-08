import * as store from '../store.js';
import * as trips from '../viaggi.js';
import * as drive from '../drive.js';
import * as google from '../google.js';
import * as offline from '../offline.js';
import { listForm } from './liste.js';
import {
  esc, pageHead, formDialog, toast, avatar, daysUntil, ymd,
} from '../util.js';
import { icon } from '../icons.js';

const COLOR = 'var(--c-viaggi)';
const EMOJIS = ['✈️', '🏖️', '🏔️', '🏛️', '🚐', '🚢', '🚆', '🗺️', '🎡', '🍷', '⛷️', '🎒'];

/** Chiede il permesso a Google se serve (dentro un tocco), poi esegue `then`. */
async function withPermission(then) {
  if (!google.available()) return then();
  try {
    if (!google.connected()) await google.connect();
  } catch (err) {
    const msg = google.explain(err);
    if (msg) toast(msg);
    return;
  }
  then();
}

const whoLine = (t) => (t.who?.length && t.who.length < store.MEMBERS.length
  ? `<span class="who-mini">${t.who.map((m) => avatar(m, 'xs')).join('')}${esc(t.who.join(' e '))}</span>`
  : '<span class="who-mini">👨‍👩‍👧 Tutta la famiglia</span>');

/* ---------- Finestra viaggio ---------- */

function tripForm(t) {
  const isNew = !t;
  const v0 = t || { name: '', emoji: '✈️', destination: '', start: '', end: '', who: [], notes: '' };
  const dlg = formDialog({
    title: isNew ? 'Nuovo viaggio' : 'Modifica viaggio',
    color: COLOR,
    autofocus: isNew,
    submitLabel: isNew ? 'Crea' : 'Salva',
    body: `
      <label class="field"><span>Nome del viaggio</span><input name="name" required value="${esc(v0.name)}" placeholder="es. Vienna" autocomplete="off"></label>
      <label class="field"><span>Destinazione (facoltativa)</span><input name="destination" value="${esc(v0.destination)}" placeholder="es. Vienna, Austria" autocomplete="off"></label>
      <div class="field-row">
        <label class="field"><span>Partenza</span><input type="date" name="start" required value="${esc(v0.start)}"></label>
        <label class="field"><span>Ritorno</span><input type="date" name="end" required value="${esc(v0.end)}"></label>
      </div>
      <fieldset class="field"><legend>Chi parte?</legend>
        <div class="who-pick">
          ${store.MEMBERS.map((m) => `<label><input type="checkbox" name="who" value="${m}" ${(v0.who || []).includes(m) ? 'checked' : ''}><span>${avatar(m, 'xs')}${m}</span></label>`).join('')}
        </div>
        <p class="hint">Tutti vedono il viaggio, ma compare "In evidenza" solo a chi parte. Nessuno scelto = tutta la famiglia.</p>
      </fieldset>
      <fieldset class="field"><legend>Icona</legend>
        <div class="emoji-pick">
          ${EMOJIS.map((e) => `<label><input type="radio" name="emoji" value="${e}" ${e === v0.emoji ? 'checked' : ''}><span>${e}</span></label>`).join('')}
        </div>
      </fieldset>
      ${isNew ? `
      <fieldset class="field"><legend>Liste da preparare</legend>
        ${trips.STARTER_LISTS.map((l) => `<label class="switch cal"><input type="checkbox" name="lists" value="${l.key}" checked><span>${l.emoji} ${esc(l.name)}${l.key === 'program' ? ' (un giorno per categoria)' : l.items ? ' (con le voci tipiche)' : ''}</span></label>`).join('')}
      </fieldset>` : ''}
      <label class="field"><span>Note</span><textarea name="notes" rows="3" placeholder="Indirizzo dell'hotel, numeri utili…">${esc(v0.notes)}</textarea></label>
      ${google.available() ? `<label class="switch cal"><input type="checkbox" name="calendar" ${isNew || t.eventId ? 'checked' : ''}><span>Mostra il viaggio nel calendario Famiglia</span></label>` : ''}`,
    onSubmit: (v, form) => {
      if (v.end < v.start) {
        form.elements.end.focus();
        toast('Il ritorno deve essere dopo la partenza');
        return false;
      }
      const fd = new FormData(form);
      const picked = fd.getAll('who');
      const data = {
        name: v.name,
        emoji: v.emoji || '✈️',
        destination: v.destination,
        start: v.start,
        end: v.end,
        who: picked.length < store.MEMBERS.length ? picked : [],
        notes: v.notes,
      };
      toast('Salvataggio…');
      trips.save(t, data, { calendar: !!v.calendar, lists: fd.getAll('lists') }).then(({ id, calError }) => {
        toast(calError ? `Viaggio salvato, ma non nel calendario (${google.explain(calError)})` : 'Viaggio salvato ✓');
        if (isNew) location.hash = `#/viaggi/${id}`;
      });
    },
    onDelete: isNew ? null : () => formDialog({
      title: 'Eliminare il viaggio?',
      color: COLOR,
      autofocus: false,
      submitLabel: 'Elimina',
      body: `<p><strong>${esc(t.name)}</strong> verrà eliminato con le sue liste${t.eventId ? ' e l\'evento nel calendario' : ''}.${t.folderId ? ' La cartella dei documenti resta su Google Drive.' : ''}</p>`,
      onSubmit: () => {
        trips.remove(t).then(() => toast('Viaggio eliminato'));
        location.hash = '#/viaggi';
      },
    }),
    deleteLabel: 'Elimina viaggio',
  });
  // Partenza scelta: se il ritorno è vuoto o prima, lo allinea.
  const form = dlg.querySelector('form');
  form.elements.start.addEventListener('change', () => {
    if (!form.elements.end.value || form.elements.end.value < form.elements.start.value) form.elements.end.value = form.elements.start.value;
  });
}

/* ---------- Elenco dei viaggi ---------- */

function tripCard(t) {
  const s = trips.status(t);
  return `
    <a class="card list-card trip-card ${s === 'concluso' ? 'past' : ''}" href="#/viaggi/${t.id}">
      <span class="emoji">${esc(t.emoji || '✈️')}</span>
      <span class="grow">
        <div class="name">${esc(t.name)}</div>
        <div class="info">${esc(trips.datesLabel(t))}</div>
        <div class="row-sub"><span class="tag ${s === 'in corso' ? 'soon' : s === 'prossimo' ? 'week' : ''}">${esc(trips.countdown(t))}</span>${whoLine(t)}</div>
      </span>
      ${icon('chevron')}
    </a>`;
}

function index(root) {
  root.innerHTML = `
    ${pageHead({ badge: icon('plane'), title: 'Viaggi' })}
    <div data-list></div>
    <button class="fab" type="button" data-new>${icon('plus')}Nuovo viaggio</button>`;
  root.querySelector('[data-new]').onclick = () => withPermission(() => tripForm(null));

  const draw = () => {
    const list = trips.all();
    const el = root.querySelector('[data-list]');
    if (!list.length) {
      el.innerHTML = `
        <div class="empty-state">
          <span class="big">🧳</span>
          <p><strong>Nessun viaggio, per ora</strong></p>
          <p>Crea un viaggio per tenere insieme programma, liste, documenti e note. Tocca <b>Nuovo viaggio</b>.</p>
        </div>`;
      return;
    }
    const groups = [
      ['🟢 In corso', list.filter((t) => trips.status(t) === 'in corso')],
      ['🗓️ Prossimi', list.filter((t) => trips.status(t) === 'prossimo')],
      ['📸 Passati', list.filter((t) => trips.status(t) === 'concluso').reverse()],
    ];
    el.innerHTML = groups.filter(([, g]) => g.length).map(([label, g]) => `
      <section class="group">
        <h3 class="group-head"><span>${label}</span></h3>
        <div class="list-cards">${g.map(tripCard).join('')}</div>
      </section>`).join('');
  };
  draw();
  return store.subscribe(draw);
}

/* ---------- Scheda del viaggio ---------- */

function detail(root, id) {
  if (!trips.get(id)) {
    location.replace('#/viaggi');
    return null;
  }
  root.innerHTML = `
    ${pageHead({
      title: '<span data-title></span>',
      back: '#/viaggi',
      actions: `<button class="icon-btn" type="button" data-edit aria-label="Modifica viaggio">${icon('edit')}</button>`,
    })}
    <div data-body></div>`;
  const $ = (s) => root.querySelector(s);
  let alive = true;
  let docError = null;
  let saving = '';

  async function loadDocs() {
    const t = trips.get(id);
    if (!t?.folderId || !google.connected()) return;
    try {
      await drive.loadFolder(t.folderId);
      docError = null;
    } catch (err) {
      docError = err;
    }
    if (alive) draw();
  }

  function programHtml(t) {
    const prog = trips.programOf(t.id);
    if (!prog) return '';
    const today = ymd(new Date());
    const inCorso = trips.status(t) === 'in corso';
    const days = trips.tripDays(t);
    const shown = inCorso ? [today, ...days.filter((d) => d > today)].slice(0, 3) : days;
    const rows = shown.map((d) => {
      const items = trips.programItems(t.id, d);
      const label = d === today ? `Oggi · ${trips.dayName(d)}` : trips.dayName(d);
      return `
        <a class="row doc-item prog-day ${d === today ? 'is-today' : ''}" href="#/liste/${prog.id}/${d}">
          <div class="row-main">
            <div class="row-title">${esc(label)}</div>
            <div class="row-sub">${items.length
              ? items.slice(0, 3).map((i) => `<span>${i.time ? `<b>${esc(i.time)}</b> ` : ''}${esc(i.text)}${i.done ? ' ✓' : ''}</span>`).join('') + (items.length > 3 ? `<span>+${items.length - 3}</span>` : '')
              : '<span>Niente in programma</span>'}</div>
          </div>
          ${icon('chevron')}
        </a>`;
    }).join('');
    return `
      <section class="group">
        <h3 class="group-head"><span>📅 Programma</span><a class="link-btn" href="#/liste/${prog.id}">Apri tutto</a></h3>
        <div class="card rows">${rows}</div>
      </section>`;
  }

  function listsHtml(t) {
    const lists = trips.listsOf(t.id).filter((l) => !l.program).sort((a, b) => a.createdAt - b.createdAt);
    const items = store.getAll('listItems');
    return `
      <section class="group">
        <h3 class="group-head"><span>📋 Liste</span><button class="link-btn" type="button" data-new-list>+ Nuova lista</button></h3>
        ${lists.length ? `<div class="list-cards">${lists.map((l) => {
          const its = items.filter((i) => i.listId === l.id);
          const open = its.filter((i) => !i.done).length;
          return `
            <a class="card list-card" href="#/liste/${l.id}">
              <span class="emoji">${esc(l.emoji || '📋')}</span>
              <span class="grow"><div class="name">${esc(l.name)}</div><div class="info">${its.length ? `${open} da fare · ${its.length} in tutto` : 'Vuota'}</div></span>
              ${icon('chevron')}
            </a>`;
        }).join('')}</div>` : '<p class="hint empty-sec">Nessuna lista.</p>'}
      </section>`;
  }

  function docsHtml(t) {
    if (!google.available()) return '';
    const head = '<h3 class="group-head"><span>🗂️ Documenti</span>'
      + (t.folderId ? `<a class="link-btn" href="#/documenti/${t.folderId}">Aggiungi / gestisci</a>` : '')
      + '</h3>';
    if (!t.folderId) {
      return `
        <section class="group">${head}
          <div class="card coming small">
            <p>Una cartella su Google Drive per voli, hotel, biglietti… con la lettura automatica e la ricerca.</p>
            <button class="btn primary" type="button" data-make-folder>${icon('folder', 'sm')}Crea la cartella del viaggio</button>
          </div>
        </section>`;
    }
    const data = drive.cachedFolder(t.folderId);
    const files = (data?.items || []).filter((f) => f.mimeType !== drive.FOLDER);
    const folders = (data?.items || []).filter((f) => f.mimeType === drive.FOLDER);
    const notSaved = files.filter((f) => !offline.isSaved(f.id));
    return `
      <section class="group">${head}
        ${docError ? `<div class="banner warn">⚠️ <span>${esc(google.explain(docError))}</span></div>` : ''}
        ${!data && !google.connected() ? `<button class="banner" type="button" data-connect>${icon('refresh', 'sm')}<span>Tocca per caricare i documenti</span></button>` : ''}
        ${files.length || folders.length ? `<div class="card rows">
          ${folders.map((f) => `
            <a class="row doc-item" href="#/documenti/${f.id}"><span class="lead">📁</span><div class="row-main"><div class="row-title">${esc(f.name)}</div></div>${icon('chevron')}</a>`).join('')}
          ${files.map((f) => {
            const saved = offline.isSaved(f.id);
            return `
              <div class="row doc-file" data-file="${esc(f.id)}">
                <button class="row-main doc-open plain" type="button" data-open-file>
                  <div class="row-title"><span class="file-ico">${drive.fileIcon(f)}</span>${esc(f.name)}</div>
                  <div class="row-sub">${saved ? '<span class="tag week">📱 Sul telefono</span>' : '<span>Solo online</span>'}</div>
                </button>
                <button class="icon-btn" type="button" data-offline aria-label="${saved ? 'Togli dal telefono' : 'Salva sul telefono'}">${saved ? '✓' : icon('download')}</button>
              </div>`;
          }).join('')}
        </div>` : (data ? '<p class="hint empty-sec">Nessun documento. Tocca <b>Aggiungi / gestisci</b> per fotografare o caricare voli, prenotazioni…</p>' : '')}
        ${saving ? `<div class="banner">⏳ <span>${esc(saving)}</span></div>` : ''}
        ${notSaved.length && offline.supported() ? `<button class="btn ghost more" type="button" data-save-all>📱 Salva ${notSaved.length === files.length ? 'tutti i documenti' : `gli altri ${notSaved.length}`} sul telefono</button>
          <p class="hint">Così si aprono anche senza connessione (in aereo, all'estero…).</p>` : ''}
      </section>`;
  }

  function draw() {
    if (!alive) return;
    const t = trips.get(id);
    if (!t) return;
    root.style.setProperty('--c', COLOR);
    $('[data-title]').textContent = `${t.emoji || '✈️'} ${t.name}`;
    const s = trips.status(t);
    $('[data-body]').innerHTML = `
      <section class="card trip-hero">
        <div class="trip-when">${esc(trips.datesLabel(t))} · ${trips.length(t)} ${trips.length(t) === 1 ? 'giorno' : 'giorni'}</div>
        ${t.destination ? `<a class="trip-dest" href="https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(t.destination)}" target="_blank" rel="noopener">${icon('pin', 'sm')}${esc(t.destination)}</a>` : ''}
        <div class="row-sub"><span class="tag ${s === 'in corso' ? 'soon' : s === 'prossimo' ? 'week' : ''}">${esc(trips.countdown(t))}</span>${whoLine(t)}${t.eventId ? '<span>📅 nel calendario</span>' : ''}</div>
      </section>
      ${programHtml(t)}
      ${listsHtml(t)}
      ${docsHtml(t)}
      <section class="group">
        <h3 class="group-head"><span>📝 Note</span><button class="link-btn" type="button" data-edit>Modifica</button></h3>
        ${t.notes ? `<div class="card trip-notes">${esc(t.notes)}</div>` : '<p class="hint empty-sec">Nessuna nota (indirizzo dell\'hotel, numeri utili…).</p>'}
      </section>`;
  }

  async function saveOffline(files) {
    let ok = 0;
    for (const [i, f] of files.entries()) {
      saving = `Salvo sul telefono ${files.length > 1 ? `${i + 1} di ${files.length}: ` : ''}${f.name}…`;
      draw();
      try {
        await offline.save(f);
        ok += 1;
      } catch (err) {
        toast(`Non riesco a salvare "${f.name}": ${google.explain(err)}`);
      }
    }
    saving = '';
    draw();
    if (ok) toast(ok === 1 ? 'Salvato sul telefono 📱' : `${ok} documenti salvati sul telefono 📱`);
  }

  root.addEventListener('click', (e) => {
    const t = trips.get(id);
    if (!t) return;
    if (e.target.closest('[data-edit]')) {
      withPermission(() => tripForm(t));
      return;
    }
    if (e.target.closest('[data-new-list]')) {
      listForm(null, 'cose', t.id);
      return;
    }
    if (e.target.closest('[data-connect]')) {
      withPermission(loadDocs);
      return;
    }
    if (e.target.closest('[data-make-folder]')) {
      withPermission(async () => {
        try {
          if (!drive.config()) {
            toast('Prima prepara le cartelle nella sezione Documenti');
            return;
          }
          const year = t.start.slice(0, 4);
          const f = await drive.createTripFolder(`${year} ${t.name}`);
          store.update('viaggi', id, { folderId: f.id });
          toast('Cartella creata su Drive ✓');
          loadDocs();
        } catch (err) {
          toast(google.explain(err));
        }
      });
      return;
    }
    const fileRow = e.target.closest('[data-file]');
    if (fileRow) {
      const f = drive.cachedFolder(t.folderId)?.items.find((x) => x.id === fileRow.dataset.file);
      if (!f) return;
      if (e.target.closest('[data-offline]')) {
        if (offline.isSaved(f.id)) offline.remove(f.id).then(() => toast('Tolto dal telefono'));
        else withPermission(() => saveOffline([f]));
        return;
      }
      if (e.target.closest('[data-open-file]')) {
        if (offline.isSaved(f.id)) offline.open(f.id).catch((err) => toast(err.message));
        else window.open(f.webViewLink, '_blank', 'noopener');
      }
      return;
    }
    if (e.target.closest('[data-save-all]')) {
      const files = (drive.cachedFolder(t.folderId)?.items || []).filter((f) => f.mimeType !== drive.FOLDER && !offline.isSaved(f.id));
      withPermission(() => saveOffline(files));
    }
  });

  draw();
  loadDocs();
  const offs = [store.subscribe(draw), offline.onChange(draw), google.onChange(draw)];
  return () => {
    alive = false;
    offs.forEach((off) => off());
  };
}

export default function viaggi(root, [id]) {
  root.style.setProperty('--c', COLOR);
  return id ? detail(root, id) : index(root);
}
