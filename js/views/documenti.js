import * as store from '../store.js';
import * as drive from '../drive.js';
import * as scad from '../scadenze.js';
import { analyze } from '../ocr.js';
import {
  esc, pageHead, formDialog, toast, dateField, avatar, relDate, dueClass, daysUntil,
} from '../util.js';
import { icon } from '../icons.js';

const COLOR = 'var(--c-doc)';
const ITEM_ICON = { persona: '', altro: '👤', veicolo: '🚗', immobile: '🏠', animale: '🐶' };
const ADD_LABEL = { altri: 'familiare', veicoli: 'veicolo', immobili: 'immobile', animali: 'animale' };

/* ---------- Pezzi comuni ---------- */

/** Esegue `then` dopo aver chiesto il permesso a Google, se serve (dentro un tocco). */
async function withPermission(then) {
  try {
    if (!drive.connected()) await drive.connect();
  } catch (err) {
    const msg = drive.explain(err);
    if (msg) toast(msg);
    return;
  }
  then();
}

/** Messaggio di errore con, se serve, il pulsante per attivare l'API Drive. */
function errorBanner(err) {
  if (!err) return '';
  if (err.code === 'disabled') {
    return `
      <div class="banner warn column">
        <span>⚠️ Google risponde che l'<b>API Google Drive</b> non è attiva nel progetto dell'app.</span>
        <span>Apri la pagina qui sotto <b>con l'account di famiglia</b>, premi <b>Abilita</b>, aspetta un paio di minuti e poi tocca ${icon('refresh', 'sm')}.</span>
        <a class="btn primary" href="${esc(drive.enableApiUrl(err))}" target="_blank" rel="noopener">Apri la pagina di attivazione</a>
        <small>Dettaglio tecnico: ${esc(err.message)}</small>
      </div>`;
  }
  const msg = drive.explain(err);
  return `
    <div class="banner warn column">
      <span>⚠️ ${esc(msg)}</span>
      ${err.message && err.message !== msg ? `<small>Dettaglio tecnico: ${esc(err.message)}</small>` : ''}
    </div>`;
}

function staleBanner() {
  return `<button class="banner" type="button" data-connect>${icon('refresh', 'sm')}<span>Elenco non aggiornato. <b>Tocca per aggiornare</b></span></button>`;
}

/** Piccolo menu a comparsa dal basso con un elenco di azioni. */
function menu(title, actions) {
  const dlg = document.createElement('dialog');
  dlg.className = 'sheet';
  dlg.style.setProperty('--c', COLOR);
  dlg.innerHTML = `
    <form method="dialog">
      <div class="grab"></div>
      <h2>${esc(title)}</h2>
      <div class="menu-list">
        ${actions.map((a, i) => `<button type="button" class="menu-item ${a.danger ? 'danger' : ''}" data-i="${i}"><span>${a.icon || ''}</span>${esc(a.label)}</button>`).join('')}
      </div>
      <div class="actions"><span class="spacer"></span><button type="submit" class="btn ghost">Chiudi</button></div>
    </form>`;
  document.body.append(dlg);
  dlg.addEventListener('click', (e) => {
    if (e.target === dlg) return dlg.close();
    const b = e.target.closest('[data-i]');
    if (!b) return;
    dlg.close();
    actions[b.dataset.i].run();
  });
  dlg.addEventListener('close', () => dlg.remove());
  dlg.showModal();
}

function confirm(title, text, okLabel, run) {
  formDialog({
    title,
    color: COLOR,
    autofocus: false,
    submitLabel: okLabel,
    body: `<p>${text}</p>`,
    onSubmit: () => run(),
  });
}

function nameDialog({ title, label = 'Nome', value = '', placeholder = '', submitLabel = 'Salva', hint = '' }, run) {
  formDialog({
    title,
    color: COLOR,
    submitLabel,
    body: `
      <label class="field"><span>${esc(label)}</span><input name="name" required value="${esc(value)}" placeholder="${esc(placeholder)}" autocomplete="off"></label>
      ${hint ? `<p class="hint">${hint}</p>` : ''}`,
    onSubmit: (v) => run(v.name.replace(/[\\/]/g, '-')),
  });
}

function scadRow(s, { showEntity = false } = {}) {
  const sub = [showEntity ? esc(s.entityName) : '', s.eventId ? '📅 nel calendario' : ''].filter(Boolean).join(' · ');
  return `
    <div class="row" data-scad="${esc(s.id)}">
      <span class="lead" aria-hidden="true">${daysUntil(s.date) < 0 ? '⚠️' : '⏰'}</span>
      <div class="row-main" data-act="scad">
        <div class="row-title">${esc(scad.label(s))}</div>
        <div class="row-sub"><span class="tag ${dueClass(s.date) || 'week'}">${esc(relDate(s.date))}</span>${sub ? `<span>${sub}</span>` : ''}</div>
      </div>
    </div>`;
}

/* ---------- Scadenze: finestre ---------- */

function scadenzaForm(entity, existing, onDone) {
  const kind = entity.kind;
  const types = scad.typesFor(kind);
  const info = store.get('docInfo', entity.id) || {};
  const s = existing || { type: types[0].id, label: '', date: '', notes: '' };
  const dlg = formDialog({
    title: existing ? 'Modifica scadenza' : `Nuova scadenza · ${entity.name}`,
    color: COLOR,
    autofocus: false,
    submitLabel: existing ? 'Salva' : 'Aggiungi',
    body: `
      <label class="field"><span>Tipo</span>
        <select name="type">${types.map((t) => `<option value="${t.id}" ${t.id === s.type ? 'selected' : ''}>${esc(t.name)}</option>`).join('')}</select>
      </label>
      <label class="field" data-label-field><span>Descrizione</span><input name="label" value="${esc(s.label)}" placeholder="es. Rinnovo abbonamento" autocomplete="off"></label>
      ${kind === 'veicolo' ? `<label class="field" data-imm-field><span>Data di immatricolazione</span><input type="date" name="immatricolazione" value="${esc(info.immatricolazione || '')}"></label>` : ''}
      ${dateField('date', 'Data di scadenza', s.date, { quick: false })}
      <p class="hint" data-type-hint></p>
      <button type="button" class="chip suggest" data-suggest hidden></button>
      <label class="switch cal"><input type="checkbox" name="calendar" ${!existing || existing.eventId ? 'checked' : ''}> Aggiungi al calendario Famiglia (promemoria una settimana e un giorno prima)</label>
      <label class="field"><span>Note</span><textarea name="notes" rows="2" placeholder="Facoltative (es. numero del documento)">${esc(s.notes)}</textarea></label>`,
    onSubmit: (v, form) => {
      if (!v.date) {
        form.elements.date.focus();
        toast('Inserisci la data di scadenza');
        return false;
      }
      if (v.type === 'altro' && !v.label) {
        form.elements.label.focus();
        toast('Scrivi una descrizione');
        return false;
      }
      if (kind === 'veicolo' && v.immatricolazione !== (info.immatricolazione || '')) {
        store.set('docInfo', entity.id, { ...info, immatricolazione: v.immatricolazione });
      }
      const data = {
        entityId: entity.id, entityName: entity.name, kind, type: v.type, label: v.type === 'altro' ? v.label : '', date: v.date, notes: v.notes,
      };
      toast('Salvataggio…');
      scad.save(existing, data, { calendar: !!v.calendar }).then(({ calError }) => {
        toast(calError ? `Scadenza salvata, ma non nel calendario: ${scad.label(data)} (${drive.explain(calError)})` : 'Scadenza salvata ✓');
        onDone?.();
      });
    },
    onDelete: existing ? () => confirm('Eliminare la scadenza?', `<strong>${esc(scad.label(existing))}</strong> verrà eliminata${existing.eventId ? ', anche dal calendario' : ''}.`, 'Elimina', () => {
      scad.removeScadenza(existing).then(() => toast('Scadenza eliminata'));
    }) : null,
  });

  // Suggerimenti in base al tipo scelto
  const form = dlg.querySelector('form');
  const sync = () => {
    const type = form.elements.type.value;
    const t = scad.typeOf(kind, type);
    form.querySelector('[data-label-field]').hidden = type !== 'altro';
    const imm = form.querySelector('[data-imm-field]');
    if (imm) imm.hidden = type !== 'revisione';
    form.querySelector('[data-type-hint]').textContent = t.hint || '';
    const sugg = scad.suggest(kind, type, { immatricolazione: form.elements.immatricolazione?.value });
    const btn = form.querySelector('[data-suggest]');
    btn.hidden = !sugg || sugg === form.elements.date.value;
    btn.textContent = sugg ? `💡 Suggerita: ${new Date(`${sugg}T12:00`).toLocaleDateString('it-IT', { day: 'numeric', month: 'long', year: 'numeric' })} — tocca per usarla` : '';
    btn.dataset.value = sugg;
  };
  form.querySelector('[data-suggest]').onclick = (e) => {
    form.elements.date.value = e.currentTarget.dataset.value;
    sync();
  };
  form.addEventListener('change', sync);
  form.addEventListener('input', sync);
  sync();
}

function renewForm(s, onDone) {
  const next = scad.renewDate(s);
  formDialog({
    title: `${scad.label(s)} rinnovata 🎉`,
    color: COLOR,
    autofocus: false,
    submitLabel: 'Salva',
    body: `
      <p>Qual è la nuova scadenza${next ? ' (ti propongo quella calcolata)' : ''}?</p>
      ${dateField('date', 'Nuova scadenza', next, { quick: false })}
      ${s.eventId ? '<p class="hint">Aggiorno anche l\'evento nel calendario Famiglia.</p>' : ''}`,
    onSubmit: (v, form) => {
      if (!v.date) {
        form.elements.date.focus();
        return false;
      }
      toast('Salvataggio…');
      scad.save(s, { date: v.date }, { calendar: !!s.eventId }).then(({ calError }) => {
        toast(calError ? `Salvata, ma il calendario non è stato aggiornato (${drive.explain(calError)})` : 'Nuova scadenza salvata ✓');
        onDone?.();
      });
    },
  });
}

function scadenzaMenu(entity, s) {
  menu(`${scad.label(s)} · ${relDate(s.date)}`, [
    { icon: '✅', label: 'Rinnovata: imposta la prossima scadenza', run: () => withPermission(() => renewForm(s)) },
    { icon: '✏️', label: 'Modifica', run: () => withPermission(() => scadenzaForm(entity, s)) },
    ...(s.docLink ? [{ icon: '📎', label: `Apri il documento (${s.docName || 'file'})`, run: () => window.open(s.docLink, '_blank', 'noopener') }] : []),
  ]);
}

/* ---------- Lettura dei documenti (OCR) ---------- */

const fmtDate = (d) => new Date(`${d}T12:00`).toLocaleDateString('it-IT', { day: 'numeric', month: 'short', year: 'numeric' });

/**
 * Legge il testo di un file su Drive e propone nome, scadenza e dati utili.
 * file: { id, name, mimeType, webViewLink }; folderId: cartella che lo contiene.
 */
async function readAndPropose(file, folderId, { isNew = false, onBusy = () => {}, onDone = () => {} } = {}) {
  let entity = null;
  let result;
  try {
    onBusy('Leggo il documento… (qualche secondo)');
    [entity, result] = await Promise.all([
      drive.findEntity(folderId).catch((err) => {
        console.warn('Elemento della cartella non trovato', err);
        return null;
      }),
      drive.readText(file.id).then((text) => text),
    ]);
  } catch (err) {
    onBusy('');
    toast(`Lettura non riuscita: ${drive.explain(err)}`);
    return;
  }
  onBusy('');
  const r = analyze(result, entity?.kind);
  ocrDialog(file, entity, r, { isNew, onDone });
}

function ocrDialog(file, entity, r, { isNew, onDone }) {
  const ext = file.name.match(/\.\w{2,4}$/)?.[0] || '';
  const proposedName = isNew
    ? `${r.docName || 'Documento'}${entity ? ` ${entity.name}` : ''}${ext}`
    : file.name;
  const kind = entity?.kind;
  const types = kind ? scad.typesFor(kind) : [];
  const scadType = r.scadType || 'altro';
  // Data proposta: scadenza letta; per la revisione si calcola dall'ultima o dall'immatricolazione.
  let proposed = r.expiry;
  if (kind === 'veicolo' && scadType === 'revisione' && !proposed) {
    if (r.revisione) proposed = scad.renewDate({ kind: 'veicolo', type: 'revisione', date: r.revisione });
    else if (r.immatricolazione) proposed = scad.nextRevisione(r.immatricolazione);
  }
  const info = entity ? store.get('docInfo', entity.id) || {} : {};
  const futureDates = r.dates.filter((d) => d.role !== 'nascita');

  const dlg = formDialog({
    title: r.hasText ? 'Ecco cosa ho letto 🔍' : 'Non sono riuscito a leggere 😕',
    color: COLOR,
    autofocus: false,
    submitLabel: 'Conferma',
    body: `
      ${r.hasText ? `
        <p class="ocr-found">${r.docName ? `Sembra: <b>${esc(r.docName)}</b>` : 'Tipo di documento non riconosciuto'}${r.targa ? ` · targa <b>${esc(r.targa)}</b>` : ''}</p>
        ${r.dates.length ? `<p class="hint">Date trovate: ${r.dates.map((d) => `${esc(d.label)} ${fmtDate(d.date)}`).join(' · ')}</p>` : '<p class="hint">Nessuna data trovata.</p>'}`
        : '<p class="hint">Il testo non è leggibile. Prova con una foto dritta, ben illuminata e senza riflessi. Il documento è stato comunque salvato.</p>'}
      <label class="field"><span>Nome del file</span><input name="name" required value="${esc(proposedName)}" autocomplete="off"></label>
      ${entity && r.hasText ? `
        <label class="switch cal"><input type="checkbox" name="makeScad" ${proposed ? 'checked' : ''}><span>Crea una scadenza per <b>${esc(entity.name)}</b></span></label>
        <div data-scad-fields>
          <label class="field"><span>Tipo</span>
            <select name="type">${types.map((t) => `<option value="${t.id}" ${t.id === scadType ? 'selected' : ''}>${esc(t.name)}</option>`).join('')}</select>
          </label>
          <label class="field" data-label-field><span>Descrizione</span><input name="label" value="${esc(r.docName)}" autocomplete="off"></label>
          <div class="field">
            <label><span>Data di scadenza</span><input type="date" name="date" value="${esc(proposed)}"></label>
            ${futureDates.length ? `<div class="quick-dates">${futureDates.map((d) => `<button type="button" class="chip" data-target="date" data-set-date="${d.date}">${esc(d.label)} · ${fmtDate(d.date)}</button>`).join('')}</div>` : ''}
          </div>
          ${kind === 'veicolo' && r.immatricolazione ? `<label class="switch cal"><input type="checkbox" name="saveImm" ${info.immatricolazione === r.immatricolazione ? '' : 'checked'}> Salva l'immatricolazione: ${fmtDate(r.immatricolazione)}</label>` : ''}
          <label class="switch cal"><input type="checkbox" name="calendar" checked> Aggiungi al calendario Famiglia</label>
        </div>` : ''}`,
    onSubmit: (v, form) => {
      const makeScad = !!v.makeScad && entity;
      if (makeScad && !v.date) {
        form.elements.date.focus();
        toast('Inserisci la data di scadenza');
        return false;
      }
      const tasks = [];
      if (v.name && v.name !== file.name) tasks.push(drive.rename(file.id, v.name));
      if (v.saveImm && entity) store.set('docInfo', entity.id, { ...info, immatricolazione: r.immatricolazione });
      if (makeScad) {
        const data = {
          entityId: entity.id,
          entityName: entity.name,
          kind,
          type: v.type,
          label: v.type === 'altro' ? (v.label || r.docName || 'Scadenza') : '',
          date: v.date,
          notes: '',
          docLink: file.webViewLink || '',
          docName: v.name || file.name,
        };
        tasks.push(scad.save(null, data, { calendar: !!v.calendar }).then(({ calError }) => {
          if (calError) toast(`Scadenza salvata, ma non nel calendario (${drive.explain(calError)})`);
        }));
      }
      Promise.all(tasks)
        .then(() => {
          toast(makeScad ? 'Scadenza creata ✓' : 'Fatto ✓');
          onDone();
        })
        .catch((err) => toast(drive.explain(err)));
    },
  });

  const form = dlg.querySelector('form');
  const fields = form.querySelector('[data-scad-fields]');
  if (fields) {
    const sync = () => {
      fields.hidden = !form.elements.makeScad.checked;
      form.querySelector('[data-label-field]').hidden = form.elements.type.value !== 'altro';
    };
    form.addEventListener('change', sync);
    sync();
  }
}

/* ---------- Pagina principale ---------- */

function home(root) {
  root.innerHTML = `
    ${pageHead({
      badge: icon('folder'),
      title: 'Documenti',
      actions: drive.available() ? `<button class="icon-btn" type="button" data-refresh aria-label="Aggiorna">${icon('refresh')}</button>` : '',
    })}
    ${drive.available() ? `
    <form class="quick-add search" data-search role="search" hidden>
      <input name="q" type="search" placeholder="Cerca nei documenti, anche nel testo…" autocomplete="off" enterkeyhint="search" aria-label="Cerca nei documenti">
      <button class="icon-btn" type="submit" aria-label="Cerca">${icon('search')}</button>
    </form>` : ''}
    <div data-banner></div>
    <div data-body></div>`;
  const $ = (s) => root.querySelector(s);

  if (!drive.available()) {
    $('[data-body]').innerHTML = `
      <section class="card coming"><div class="big">🗂️</div><h2>Serve l'accesso con Google</h2>
      <p>I documenti si trovano nel Google Drive di famiglia.</p></section>`;
    return null;
  }

  let error = null;
  let busy = '';
  let alive = true;
  let results = null; // risultati della ricerca (null = nessuna ricerca)
  let query = '';

  $('[data-search]')?.addEventListener('submit', (e) => {
    e.preventDefault();
    query = e.target.elements.q.value.trim();
    e.target.elements.q.blur();
    if (!query) {
      results = null;
      draw();
      return;
    }
    withPermission(async () => {
      busy = `Cerco "${query}"…`;
      error = null;
      draw();
      try {
        results = await drive.search(query);
      } catch (err) {
        error = err;
      }
      busy = '';
      draw();
    });
  });

  function resultsHtml() {
    const head = `<h3 class="group-head"><span>🔍 ${results.length === 1 ? '1 documento' : `${results.length} documenti`} per "${esc(query)}"</span><button class="link-btn" type="button" data-clear-search>Chiudi</button></h3>`;
    if (!results.length) {
      return `<section class="group">${head}<p class="hint empty-sec">Nessun documento trovato. Prova con un'altra parola. I file appena caricati possono richiedere un po' di tempo prima di essere cercabili nel testo.</p></section>`;
    }
    return `<section class="group">${head}<div class="card rows">${results.map((f) => `
      <div class="row doc-file">
        <a class="row-main doc-open" href="${esc(f.webViewLink || '#')}" target="_blank" rel="noopener">
          <div class="row-title"><span class="file-ico">${drive.fileIcon(f)}</span>${esc(f.name)}</div>
          <div class="row-sub"><span>📁 ${esc(f.path || drive.ROOT_NAME)}</span></div>
        </a>
        <a class="icon-btn" href="#/documenti/${esc(f.folderId)}" aria-label="Apri la cartella">${icon('chevron')}</a>
      </div>`).join('')}</div></section>`;
  }

  async function load() {
    if (!drive.connected() || !drive.config()) return draw();
    error = null;
    busy = 'Aggiornamento…';
    draw();
    try {
      await drive.loadSections();
    } catch (err) {
      error = err;
    }
    busy = '';
    if (alive) draw();
  }

  async function runSetup() {
    error = null;
    try {
      await drive.setup((msg) => {
        busy = `Preparo le cartelle: ${msg}`;
        draw();
      });
      toast('Cartelle pronte! 🎉');
    } catch (err) {
      error = err;
    }
    busy = '';
    await load();
  }

  function draw() {
    if (!alive) return;
    const cfg = drive.config();
    const data = drive.cachedSections();
    const banners = [];
    // La ricerca serve solo quando le cartelle sono configurate.
    $('[data-search]').hidden = !cfg;
    if (busy) banners.push(`<div class="banner">⏳ <span>${esc(busy)}</span></div>`);
    if (error?.code !== 'noroot') banners.push(errorBanner(error));

    // Primo collegamento
    if (!drive.connected() && !(cfg && data)) {
      $('[data-banner]').innerHTML = banners.join('');
      $('[data-body]').innerHTML = `
        ${scadenzeCard()}
        <section class="card coming">
          <div class="big">🗂️</div>
          <h2>Collega Google Drive</h2>
          <p>Qui troverai i documenti di famiglia salvati nella cartella <strong>"${drive.ROOT_NAME}"</strong> su Google Drive.</p>
          <button class="btn primary" type="button" data-connect>${icon('folder', 'sm')}Collega Drive e Calendario</button>
          <p class="hint">Google ti chiederà il permesso per Drive e Calendario: spunta tutte le caselle.</p>
        </section>`;
      return;
    }

    // Prima configurazione delle cartelle
    if (!cfg) {
      $('[data-banner]').innerHTML = banners.join('');
      $('[data-body]').innerHTML = `
        <section class="card coming">
          <div class="big">🧰</div>
          <h2>Prepariamo le cartelle</h2>
          ${error?.code === 'noroot'
            ? `<p class="gate-error">Non trovo la cartella "${drive.ROOT_NAME}" su Google Drive.</p>
               <p>Con l'<b>account di famiglia</b> crea su Drive una cartella chiamata esattamente <b>${drive.ROOT_NAME}</b> e condividila con i tre account personali come <b>Editor</b>. Poi riprova.</p>`
            : `<p>L'app crea dentro <b>"${drive.ROOT_NAME}"</b> le cartelle Persone, Veicoli, Immobili e Animali, con le sottocartelle di base. Le cartelle che esistono già vengono riutilizzate.</p>`}
          <button class="btn primary" type="button" data-setup ${busy ? 'disabled' : ''}>Prepara le cartelle</button>
        </section>`;
      return;
    }

    if (!drive.connected()) banners.unshift(staleBanner());
    $('[data-banner]').innerHTML = banners.join('');

    if (results) {
      $('[data-body]').innerHTML = resultsHtml();
      return;
    }

    const by = data?.bySection || {};
    let html = scadenzeCard();
    for (const s of drive.SECTIONS) {
      if (s.key === 'altri') continue; // compare come ultima voce di Persone
      const items = by[s.key] || [];
      const canAdd = s.key !== 'persone';
      const altri = s.key === 'persone' && cfg.sections.altri ? `
            <a class="row doc-item" href="#/documenti/${cfg.sections.altri}">
              <span class="lead">👴</span>
              <div class="row-main"><div class="row-title">Altri familiari</div>${(by.altri || []).length ? `<div class="row-sub"><span>${by.altri.map((f) => esc(f.name)).join(', ')}</span></div>` : ''}</div>
              ${icon('chevron')}
            </a>` : '';
      html += `
        <section class="group">
          <h3 class="group-head"><span>${s.emoji} ${s.name}</span>${canAdd ? `<button class="link-btn" type="button" data-add="${s.key}">+ Aggiungi</button>` : ''}</h3>
          ${items.length ? `<div class="card rows">${items.map((f) => `
            <a class="row doc-item" href="#/documenti/${f.id}">
              <span class="lead">${s.key === 'persone' ? avatar(f.name) : (ITEM_ICON[s.key === 'altri' ? 'altro' : s.kind])}</span>
              <div class="row-main"><div class="row-title">${esc(f.name)}</div>${countScad(f.id)}</div>
              ${icon('chevron')}
            </a>`).join('')}${altri}</div>`
            : `<p class="hint empty-sec">${data ? `Nessun ${ADD_LABEL[s.key] || 'elemento'} per ora.` : 'Caricamento…'}</p>`}
        </section>`;
    }
    html += `<p class="hint center">I documenti sono nella cartella "${drive.ROOT_NAME}" del Google Drive di famiglia.</p>`;
    $('[data-body]').innerHTML = html;
  }

  function countScad(entityId) {
    const list = scad.all().filter((s) => s.entityId === entityId);
    if (!list.length) return '';
    const next = list[0];
    return `<div class="row-sub"><span class="tag ${dueClass(next.date) || 'week'}">${esc(scad.label(next))} · ${esc(relDate(next.date))}</span>${list.length > 1 ? `<span>+${list.length - 1}</span>` : ''}</div>`;
  }

  root.addEventListener('click', (e) => {
    if (e.target.closest('[data-clear-search]')) {
      results = null;
      query = '';
      $('[data-search]').reset();
      draw();
      return;
    }
    if (e.target.closest('[data-connect]') || e.target.closest('[data-refresh]')) {
      withPermission(load);
      return;
    }
    if (e.target.closest('[data-setup]')) {
      withPermission(runSetup);
      return;
    }
    const add = e.target.closest('[data-add]');
    if (add) {
      const key = add.dataset.add;
      withPermission(() => nameDialog({
        title: `Nuovo ${ADD_LABEL[key]}`,
        placeholder: { altri: 'es. Nonno Giuseppe', veicoli: 'es. Tesla', immobili: 'es. Casa al mare', animali: 'es. Tokyo' }[key],
        submitLabel: 'Crea',
        hint: 'Creo la cartella su Google Drive con le sottocartelle di base, che potrai cambiare.',
      }, (name) => {
        toast('Creo le cartelle…');
        drive.createItem(key, name)
          .then((item) => {
            toast(`"${name}" creato ✓`);
            location.hash = `#/documenti/${item.id}`;
          })
          .catch((err) => toast(drive.explain(err)));
      }));
      return;
    }
    const scadEl = e.target.closest('[data-scad]');
    if (scadEl) {
      const s = store.get('scadenze', scadEl.dataset.scad);
      if (s) location.hash = `#/documenti/${s.entityId}`;
    }
  });

  load();
  const offStore = store.subscribe(draw);
  const offG = drive.onChange(draw);
  return () => {
    alive = false;
    offStore();
    offG();
  };
}

/** Riepilogo delle prossime scadenze di tutta la famiglia. */
function scadenzeCard() {
  const list = scad.all();
  if (!list.length) return '';
  return `
    <section class="group">
      <h3 class="group-head"><span>⏰ Prossime scadenze</span></h3>
      <div class="card rows scroll-rows">${list.map((s) => scadRow(s, { showEntity: true })).join('')}</div>
    </section>`;
}

/* ---------- Cartella ---------- */

function folderView(root, id) {
  root.innerHTML = `
    <div data-head></div>
    <div data-banner></div>
    <div data-body></div>
    <input type="file" accept="image/*" capture="environment" data-camera hidden>
    <input type="file" accept="image/*" capture="environment" data-camera-ocr hidden>
    <input type="file" multiple data-files hidden>
    <button class="fab" type="button" data-fab>${icon('plus')}Aggiungi</button>`;
  const $ = (s) => root.querySelector(s);

  let error = null;
  let busy = '';
  let alive = true;

  async function load() {
    if (!drive.connected()) return draw();
    error = null;
    busy = busy || 'Aggiornamento…';
    draw();
    try {
      await drive.loadFolder(id);
    } catch (err) {
      error = err;
    }
    busy = '';
    if (alive) draw();
  }

  /** Informazioni sull'elemento (persona, veicolo…) se la cartella è uno di questi. */
  function entityOf(folder) {
    if (!folder || drive.isSectionFolder(folder.id)) return null;
    const kind = drive.kindOfParent(folder.parents?.[0]);
    return kind ? { id: folder.id, name: folder.name, kind } : null;
  }

  function backHref(folder) {
    const trip = folder && store.getAll('viaggi').find((t) => t.folderId === folder.id);
    if (trip) return `#/viaggi/${trip.id}`;
    const parent = folder?.parents?.[0];
    if (!parent || drive.isSectionFolder(parent) || parent === drive.config()?.rootId) return '#/documenti';
    return `#/documenti/${parent}`;
  }

  function draw() {
    if (!alive) return;
    const data = drive.cachedFolder(id);
    const folder = data?.folder;
    const entity = entityOf(folder);
    const protectedFolder = drive.isSectionFolder(id);

    $('[data-head]').innerHTML = pageHead({
      title: esc(folder?.name || 'Cartella'),
      back: backHref(folder),
      actions: `
        <button class="icon-btn" type="button" data-refresh aria-label="Aggiorna">${icon('refresh')}</button>
        ${folder && !protectedFolder ? `<button class="icon-btn" type="button" data-folder-menu aria-label="Opzioni cartella">${icon('edit')}</button>` : ''}`,
    });

    const banners = [];
    if (busy) banners.push(`<div class="banner">⏳ <span>${esc(busy)}</span></div>`);
    if (!drive.connected()) banners.push(staleBanner());
    banners.push(errorBanner(error));
    $('[data-banner]').innerHTML = banners.join('');

    if (!data) {
      $('[data-body]').innerHTML = drive.connected() ? '' : '<div class="empty-state"><span class="big">🗂️</span><p>Tocca qui sopra per caricare la cartella.</p></div>';
      return;
    }

    let html = '';
    if (entity) {
      const list = scad.all().filter((s) => s.entityId === entity.id);
      const info = store.get('docInfo', entity.id);
      html += `
        <section class="group">
          <h3 class="group-head"><span>⏰ Scadenze</span><button class="link-btn" type="button" data-new-scad>+ Aggiungi</button></h3>
          ${list.length ? `<div class="card rows">${list.map((s) => scadRow(s)).join('')}</div>`
            : '<p class="hint empty-sec">Nessuna scadenza.</p>'}
          ${entity.kind === 'veicolo' && info?.immatricolazione ? `<p class="hint">Immatricolato il ${new Date(`${info.immatricolazione}T12:00`).toLocaleDateString('it-IT', { day: 'numeric', month: 'long', year: 'numeric' })}</p>` : ''}
        </section>`;
    }

    const folders = data.items.filter((f) => f.mimeType === drive.FOLDER);
    const files = data.items.filter((f) => f.mimeType !== drive.FOLDER);
    const isAltri = id === drive.config()?.sections.altri;
    if (isAltri && !folders.length) {
      html += `<div class="empty-state"><span class="big">👴</span><p><strong>Nessun familiare per ora</strong></p><p>Crea una cartella con il nome della persona (anche da Google Drive, dentro "Persone/Altri familiari") oppure tocca <b>Aggiungi</b>.</p></div>`;
    }
    if (folders.length) {
      html += `
        <section class="group">
          <h3 class="group-head"><span>${isAltri ? '👴 Altri familiari' : '📁 Cartelle'}</span></h3>
          <div class="card rows">${folders.map((f) => `
            <a class="row doc-item" href="#/documenti/${f.id}">
              <span class="lead">${isAltri ? '👤' : '📁'}</span>
              <div class="row-main"><div class="row-title">${esc(f.name)}</div></div>
              ${icon('chevron')}
            </a>`).join('')}</div>
        </section>`;
    }
    // Al livello di una persona/veicolo/… i documenti vanno nelle sottocartelle:
    // la sezione compare solo se qualcuno ha messo dei file qui da Drive.
    if ((!entity && !protectedFolder) || files.length) html += `
      <section class="group">
        <h3 class="group-head"><span>📄 ${entity ? 'Altri documenti' : 'Documenti'}</span></h3>
        ${files.length ? `<div class="card rows">${files.map((f) => `
          <div class="row doc-file" data-file="${esc(f.id)}">
            <a class="row-main doc-open" href="${esc(f.webViewLink || '#')}" target="_blank" rel="noopener">
              <div class="row-title"><span class="file-ico">${drive.fileIcon(f)}</span>${esc(f.name)}</div>
              <div class="row-sub"><span>${new Date(f.modifiedTime).toLocaleDateString('it-IT', { day: 'numeric', month: 'short', year: 'numeric' })}</span>${f.size ? `<span>${drive.fileSize(f.size)}</span>` : ''}</div>
            </a>
            <button class="icon-btn" type="button" data-file-menu aria-label="Opzioni documento">⋯</button>
          </div>`).join('')}</div>`
          : `<p class="hint empty-sec">Nessun documento in questa cartella. Tocca <b>Aggiungi</b> per scattare una foto o caricare un file.</p>`}
      </section>`;
    html += `
      <p class="hint center">Aggiornato ${new Date(data.at).toLocaleString('it-IT', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}</p>`;
    $('[data-body]').innerHTML = html;
  }

  const setBusy = (msg) => {
    busy = msg;
    draw();
  };

  /** Carica i file (le foto vengono alleggerite). Restituisce i file creati. */
  async function doUpload(files, names = [], { quiet = false } = {}) {
    const done = [];
    for (const [i, original] of files.entries()) {
      setBusy(`Caricamento ${files.length > 1 ? `${i + 1} di ${files.length}` : ''}: ${names[i] || original.name}…`);
      try {
        const file = await drive.compressPhoto(original);
        let name = names[i] || original.name;
        if (file !== original && /\.(png|webp|heic)$/i.test(name)) name = name.replace(/\.\w+$/, '.jpg');
        done.push(await drive.upload(file, id, name));
      } catch (err) {
        toast(drive.explain(err));
      }
    }
    setBusy('');
    if (done.length && !quiet) toast(done.length === 1 ? 'Documento caricato ✓' : `${done.length} documenti caricati ✓`);
    load();
    return done;
  }

  $('[data-camera-ocr]').addEventListener('change', async (e) => {
    const file = e.target.files[0];
    e.target.value = '';
    if (!file) return;
    const stamp = new Date().toLocaleDateString('it-IT').replace(/\//g, '-');
    const [uploaded] = await doUpload([file], [`Documento ${stamp}.jpg`], { quiet: true });
    if (uploaded) readAndPropose(uploaded, id, { isNew: true, onBusy: setBusy, onDone: load });
  });

  $('[data-camera]').addEventListener('change', (e) => {
    const file = e.target.files[0];
    e.target.value = '';
    if (!file) return;
    const today = new Date().toLocaleDateString('it-IT', { day: 'numeric', month: 'short', year: 'numeric' });
    nameDialog({ title: 'Nome del documento', value: `Foto ${today}`, submitLabel: 'Carica', hint: 'es. "Libretto Yaris", "Ricetta veterinario"…' }, (name) => {
      const ext = (file.type.split('/')[1] || 'jpg').replace('jpeg', 'jpg');
      doUpload([file], [/\.\w{2,4}$/.test(name) ? name : `${name}.${ext}`]);
    });
  });
  $('[data-files]').addEventListener('change', (e) => {
    const files = [...e.target.files];
    e.target.value = '';
    if (files.length) doUpload(files);
  });

  root.addEventListener('click', (e) => {
    if (e.target.closest('[data-connect]') || e.target.closest('[data-refresh]')) {
      withPermission(load);
      return;
    }
    const folder = drive.cachedFolder(id)?.folder;
    if (e.target.closest('[data-fab]')) {
      const entity = entityOf(folder);
      withPermission(() => menu('Aggiungi', [
        // Persona/veicolo/…: scadenze e cartelle; dentro le sottocartelle: documenti.
        ...(id === drive.config()?.sections.altri ? [
          { icon: '👤', label: 'Nuovo familiare', run: () => nameDialog({ title: 'Nuovo familiare', placeholder: 'es. Nonno Giuseppe', submitLabel: 'Crea', hint: 'Creo la sua cartella su Google Drive con la sottocartella "Documenti".' }, (name) => {
            drive.createItem('altri', name).then((item) => { toast(`"${name}" creato ✓`); location.hash = `#/documenti/${item.id}`; }).catch((err) => toast(drive.explain(err)));
          }) },
        ] : entity ? [
          { icon: '⏰', label: 'Nuova scadenza', run: () => scadenzaForm(entity, null) },
        ] : [
          { icon: '🔍', label: 'Fotografa e leggi un documento', run: () => $('[data-camera-ocr]').click() },
          { icon: '📷', label: 'Scatta una foto', run: () => $('[data-camera]').click() },
          { icon: '📄', label: 'Carica un file dal telefono', run: () => $('[data-files]').click() },
        ]),
        { icon: '📁', label: 'Nuova cartella', run: () => nameDialog({ title: 'Nuova cartella', placeholder: 'es. Fatture', submitLabel: 'Crea' }, (name) => {
          drive.createFolder(name, id).then(() => { toast('Cartella creata ✓'); load(); }).catch((err) => toast(drive.explain(err)));
        }) },
      ]));
      return;
    }
    if (e.target.closest('[data-new-scad]')) {
      const entity = entityOf(folder);
      if (entity) withPermission(() => scadenzaForm(entity, null));
      return;
    }
    const scadEl = e.target.closest('[data-scad]');
    if (scadEl) {
      const s = store.get('scadenze', scadEl.dataset.scad);
      const entity = entityOf(folder);
      if (s && entity) scadenzaMenu(entity, s);
      return;
    }
    if (e.target.closest('[data-folder-menu]') && folder) {
      withPermission(() => menu(folder.name, [
        { icon: '✏️', label: 'Rinomina', run: () => nameDialog({ title: 'Rinomina cartella', value: folder.name }, (name) => {
          drive.rename(id, name).then(() => { toast('Cartella rinominata ✓'); load(); }).catch((err) => toast(drive.explain(err)));
        }) },
        { icon: '🗑️', label: 'Elimina cartella', danger: true, run: () => confirm('Eliminare la cartella?', `<strong>${esc(folder.name)}</strong> e tutto il suo contenuto finiranno nel cestino di Google Drive (recuperabili per 30 giorni).`, 'Elimina', () => {
          drive.remove(folder).then(() => { toast('Cartella eliminata'); location.hash = backHref(folder); }).catch((err) => toast(drive.explain(err)));
        }) },
      ]));
      return;
    }
    const fileMenu = e.target.closest('[data-file-menu]');
    if (fileMenu) {
      const f = drive.cachedFolder(id)?.items.find((x) => x.id === fileMenu.closest('[data-file]').dataset.file);
      if (!f) return;
      menu(f.name, [
        { icon: '👁️', label: 'Apri', run: () => window.open(f.webViewLink, '_blank', 'noopener') },
        ...(drive.canRead(f) ? [{ icon: '🔍', label: 'Leggi e trova scadenze', run: () => withPermission(() => readAndPropose(f, id, { onBusy: setBusy, onDone: load })) }] : []),
        { icon: '✏️', label: 'Rinomina', run: () => withPermission(() => nameDialog({ title: 'Rinomina documento', value: f.name }, (name) => {
          drive.rename(f.id, name).then(() => { toast('Documento rinominato ✓'); load(); }).catch((err) => toast(drive.explain(err)));
        })) },
        { icon: '🗑️', label: 'Elimina', danger: true, run: () => withPermission(() => confirm('Eliminare il documento?', `<strong>${esc(f.name)}</strong> finirà nel cestino di Google Drive (recuperabile per 30 giorni).`, 'Elimina', () => {
          drive.remove(f).then(() => { toast('Documento eliminato'); load(); }).catch((err) => toast(drive.explain(err)));
        })) },
      ]);
    }
  });

  load();
  const offStore = store.subscribe(draw);
  const offG = drive.onChange(draw);
  return () => {
    alive = false;
    offStore();
    offG();
  };
}

export default function documenti(root, [id]) {
  root.style.setProperty('--c', COLOR);
  return id ? folderView(root, id) : home(root);
}
