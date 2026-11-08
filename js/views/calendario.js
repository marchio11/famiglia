import * as store from '../store.js';
import * as gcal from '../gcal.js';
import {
  esc, pageHead, formDialog, toast, dateField, addDays, ymd, daysUntil, memberColor,
} from '../util.js';
import { icon } from '../icons.js';

const COLOR = 'var(--c-cal)';
const REMINDERS = [
  ['default', 'Predefinito del calendario'],
  ['none', 'Nessuno'],
  ['10', '10 minuti prima'],
  ['30', '30 minuti prima'],
  ['60', '1 ora prima'],
  ['120', '2 ore prima'],
  ['1440', '1 giorno prima'],
  ['2880', '2 giorni prima'],
  ['10080', '1 settimana prima'],
];
const REPEAT = [['', 'Mai'], ['DAILY', 'Ogni giorno'], ['WEEKLY', 'Ogni settimana'], ['MONTHLY', 'Ogni mese'], ['YEARLY', 'Ogni anno']];

let days = gcal.DEFAULT_DAYS; // periodo mostrato (si allunga con "Mostra altro")

const privColor = () => memberColor(store.getUser());
const evColor = (e) => (e.cal === 'privato' ? privColor() : COLOR);

function dayLabel(dateStr) {
  const n = daysUntil(dateStr);
  const [y, m, d] = dateStr.split('-').map(Number);
  const long = new Date(y, m - 1, d).toLocaleDateString('it-IT', {
    weekday: 'long', day: 'numeric', month: 'long', ...(y !== new Date().getFullYear() ? { year: 'numeric' } : {}),
  });
  if (n === 0) return `Oggi · ${long}`;
  if (n === 1) return `Domani · ${long}`;
  return long.charAt(0).toUpperCase() + long.slice(1);
}

function nextHour() {
  const h = (new Date().getHours() + 1) % 24;
  return `${String(h).padStart(2, '0')}:00`;
}

/* ---------- Modulo evento ---------- */

function eventForm(ev, onSaved) {
  const isNew = !ev;
  const start = nextHour();
  const f = ev ? gcal.toForm(ev) : {
    title: '', cal: 'famiglia', allDay: false, date: addDays(start === '00:00' ? 1 : 0), endDate: '',
    startTime: start, endTime: `${String((Number(start.slice(0, 2)) + 1) % 24).padStart(2, '0')}:00`,
    location: '', notes: '', reminder: 'default', repeat: '',
  };
  const lockCal = ev?.recurring; // un evento ricorrente si sposta solo dal calendario Google

  const dlg = formDialog({
    title: isNew ? 'Nuovo evento' : 'Modifica evento',
    color: COLOR,
    autofocus: isNew,
    submitLabel: isNew ? 'Aggiungi' : 'Salva',
    body: `
      <label class="field"><span>Titolo</span><input name="title" required value="${esc(f.title)}" placeholder="es. Cena dai nonni" autocomplete="off"></label>
      <fieldset class="field"><legend>Chi lo vede?</legend>
        <div class="seg">
          <label><input type="radio" name="cal" value="famiglia" ${f.cal === 'famiglia' ? 'checked' : ''} ${lockCal ? 'disabled' : ''}><span>👨‍👩‍👧 Famiglia</span></label>
          <label><input type="radio" name="cal" value="privato" ${f.cal === 'privato' ? 'checked' : ''} ${lockCal ? 'disabled' : ''}><span>🔒 Solo io</span></label>
        </div>
        <p class="hint" data-cal-hint></p>
      </fieldset>
      <label class="switch"><input type="checkbox" name="allDay" ${f.allDay ? 'checked' : ''}> Tutto il giorno (es. scadenze, compleanni)</label>
      ${dateField('date', 'Data', f.date)}
      <div class="field-row" data-times>
        <label class="field"><span>Dalle</span><input type="time" name="startTime" value="${esc(f.startTime)}"></label>
        <label class="field"><span>Alle</span><input type="time" name="endTime" value="${esc(f.endTime)}"></label>
      </div>
      <label class="field" data-enddate><span>Fino al (se dura più giorni)</span><input type="date" name="endDate" value="${esc(f.endDate !== f.date ? f.endDate : '')}"></label>
      <label class="field"><span>Luogo</span><input name="location" value="${esc(f.location)}" placeholder="Facoltativo" autocomplete="off"></label>
      <label class="field"><span>Note</span><textarea name="notes" rows="2" placeholder="Facoltative">${esc(f.notes)}</textarea></label>
      <div class="field-row">
        <label class="field"><span>Promemoria</span>
          <select name="reminder">${REMINDERS.map(([v, l]) => `<option value="${v}" ${v === f.reminder ? 'selected' : ''}>${l}</option>`).join('')}</select>
        </label>
        ${isNew ? `<label class="field"><span>Ripeti</span>
          <select name="repeat">${REPEAT.map(([v, l]) => `<option value="${v}">${l}</option>`).join('')}</select>
        </label>` : ''}
      </div>
      ${ev?.recurring ? '<p class="hint">🔁 Evento ripetuto: le modifiche valgono solo per questa volta.</p>' : ''}`,
    onSubmit: (v, form) => {
      if (!v.date) {
        form.elements.date.focus();
        toast('Scegli una data');
        return false;
      }
      const cal = lockCal ? ev.cal : v.cal;
      const data = { ...v, allDay: !!v.allDay, repeat: v.repeat || '' };
      toast('Salvataggio…');
      (isNew ? gcal.createEvent(cal, data) : gcal.updateEvent(ev, cal, data))
        .then(() => {
          toast(cal === 'privato' ? 'Evento salvato (solo per te) 🔒' : 'Evento salvato nel calendario Famiglia');
          onSaved();
        })
        .catch((err) => toast(gcal.explain(err)));
    },
    onDelete: isNew ? null : () => confirmDelete(ev, onSaved),
    deleteLabel: ev?.recurring ? 'Elimina questa volta' : 'Elimina',
  });

  // Mostra/nasconde i campi in base a "Tutto il giorno" e al calendario scelto.
  const form = dlg.querySelector('form');
  const sync = () => {
    const allDay = form.elements.allDay.checked;
    form.querySelector('[data-times]').hidden = allDay;
    form.querySelector('[data-enddate]').hidden = !allDay;
    const cal = form.querySelector('input[name=cal]:checked')?.value;
    form.querySelector('[data-cal-hint]').textContent = cal === 'privato'
      ? 'Finisce nel tuo calendario Google personale: gli altri non lo vedono.'
      : `Finisce nel calendario "${gcal.FAMILY_NAME}": lo vedono tutti e tre.`;
  };
  form.addEventListener('change', sync);
  sync();
}

function confirmDelete(ev, onDone) {
  formDialog({
    title: 'Eliminare l\'evento?',
    color: COLOR,
    autofocus: false,
    submitLabel: 'Elimina',
    body: `<p><strong>${esc(ev.title)}</strong> verrà eliminato${ev.cal === 'famiglia' ? ' per tutta la famiglia' : ''}${ev.recurring ? ' (solo questa volta)' : ''}.</p>`,
    onSubmit: () => {
      gcal.deleteEvent(ev)
        .then(() => {
          toast('Evento eliminato');
          onDone();
        })
        .catch((err) => toast(gcal.explain(err)));
    },
  });
}

/* ---------- Agenda ---------- */

function eventRow(e) {
  let when;
  if (e.allDay) {
    const last = gcal.lastDay(e);
    when = last > e.start ? `<b>Tutto il giorno</b><small>fino al ${new Date(`${last}T12:00`).toLocaleDateString('it-IT', { day: 'numeric', month: 'short' })}</small>` : '<b>Tutto il giorno</b>';
  } else {
    const started = ymd(new Date(e.start)) < ymd(new Date());
    when = started ? `<b>In corso</b><small>fino alle ${gcal.timeOf(e.end)}</small>` : `<b>${gcal.timeOf(e.start)}</b><small>${gcal.timeOf(e.end)}</small>`;
  }
  const tags = [
    e.cal === 'privato' ? '<span class="tag priv">🔒 Solo io</span>' : '',
    e.location ? `<span>📍 ${esc(e.location)}</span>` : '',
    e.recurring ? '<span>🔁</span>' : '',
  ].filter(Boolean).join('');
  return `
    <div class="row ev ${gcal.isOver(e) ? 'over' : ''}" data-ev="${esc(e.cal)}|${esc(e.id)}" style="--ev:${evColor(e)}">
      <div class="ev-time">${when}</div>
      <div class="row-main" data-act="edit">
        <div class="row-title">${esc(e.title)}</div>
        <div class="row-sub">${tags}</div>
      </div>
    </div>`;
}

function agenda(events) {
  if (!events.length) {
    return `<div class="empty-state"><span class="big">🌤️</span><p><strong>Nessun impegno nei prossimi ${days} giorni</strong></p><p>Tocca "Nuovo evento" per aggiungerne uno.</p></div>`;
  }
  const byDay = new Map();
  for (const e of events) {
    const k = gcal.dayKey(e);
    if (!byDay.has(k)) byDay.set(k, []);
    byDay.get(k).push(e);
  }
  let html = '';
  for (const [day, list] of [...byDay.entries()].sort(([a], [b]) => a.localeCompare(b))) {
    // Prima gli eventi di tutto il giorno, poi in ordine di orario.
    list.sort((a, b) => (b.allDay - a.allDay) || (gcal.startDate(a) - gcal.startDate(b)));
    html += `
      <section class="group">
        <h3 class="group-head ${daysUntil(day) === 0 ? 'today' : ''}"><span>${esc(dayLabel(day))}</span></h3>
        <div class="card rows">${list.map(eventRow).join('')}</div>
      </section>`;
  }
  return html;
}

/* ---------- Schermata ---------- */

export default function calendario(root) {
  root.style.setProperty('--c', COLOR);
  root.innerHTML = `
    ${pageHead({
      badge: icon('calendar'),
      title: 'Calendario',
      actions: gcal.available() ? `<button class="icon-btn" type="button" data-refresh aria-label="Aggiorna">${icon('refresh')}</button>` : '',
    })}
    <div data-banner></div>
    <div data-agenda></div>
    ${gcal.available() ? `<button class="fab" type="button" data-new>${icon('plus')}Nuovo evento</button>` : ''}`;

  const $ = (s) => root.querySelector(s);

  if (!gcal.available()) {
    $('[data-agenda]').innerHTML = `
      <section class="card coming">
        <div class="big">📅</div>
        <h2>Serve l'accesso con Google</h2>
        <p>Il calendario funziona quando l'app è collegata agli account Google di famiglia.</p>
      </section>`;
    return null;
  }

  let loading = false;
  let error = null;
  let alive = true;

  async function load() {
    if (!gcal.connected()) return draw();
    loading = true;
    error = null;
    draw();
    try {
      await gcal.fetchEvents(days);
    } catch (err) {
      error = err;
    }
    loading = false;
    if (alive) draw();
  }

  /** Chiede il permesso a Google se serve (dentro un tocco), poi esegue `then`. */
  async function withPermission(then) {
    try {
      if (!gcal.connected()) await gcal.connect();
    } catch (err) {
      const msg = gcal.explain(err);
      if (msg) toast(msg);
      return;
    }
    then();
  }

  function draw() {
    if (!alive) return;
    const data = gcal.cached();
    const banner = [];

    if (!gcal.connected() && !data) {
      $('[data-banner]').innerHTML = '';
      $('[data-agenda]').innerHTML = `
        <section class="card coming">
          <div class="big">📅</div>
          <h2>Collega Google Calendar</h2>
          <p>Vedrai qui gli impegni del calendario <strong>"${gcal.FAMILY_NAME}"</strong> e anche quelli del tuo calendario personale, che restano visibili solo a te.</p>
          <button class="btn primary" type="button" data-connect>${icon('calendar', 'sm')}Collega il calendario</button>
          <p class="hint">Google ti chiederà il permesso di vedere e modificare gli eventi: spunta tutte le caselle.</p>
        </section>`;
      return;
    }

    if (!gcal.connected()) {
      banner.push(`<button class="banner" type="button" data-connect>${icon('refresh', 'sm')}<span>Calendario non aggiornato. <b>Tocca per aggiornare</b></span></button>`);
    }
    if (error) {
      banner.push(`<div class="banner warn">⚠️ <span>${esc(gcal.explain(error))}</span></div>`);
    }
    if (data?.familyMissing) {
      banner.push(`<div class="banner warn">👨‍👩‍👧 <span>Non trovo il calendario <b>"${gcal.FAMILY_NAME}"</b> nel tuo account Google: controlla di aver accettato l'invito di condivisione. Per ora vedi solo i tuoi eventi personali.</span></div>`);
    }
    if (loading) banner.push('<div class="banner">⏳ <span>Aggiornamento…</span></div>');
    $('[data-banner]').innerHTML = banner.join('');

    const events = data?.events || [];
    $('[data-agenda]').innerHTML = agenda(events)
      + (data ? `<button class="btn ghost more" type="button" data-more>Mostra i mesi successivi</button>
         <p class="hint center">Aggiornato ${new Date(data.at).toLocaleString('it-IT', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}</p>` : '');
  }

  root.addEventListener('click', (e) => {
    if (e.target.closest('[data-connect]') || e.target.closest('[data-refresh]')) {
      withPermission(() => {
        gcal.familyId({ refresh: true }).catch(() => {}).finally(load);
      });
      return;
    }
    if (e.target.closest('[data-new]')) {
      withPermission(() => eventForm(null, load));
      return;
    }
    if (e.target.closest('[data-more]')) {
      days += gcal.DEFAULT_DAYS;
      withPermission(load);
      return;
    }
    const rowEl = e.target.closest('[data-ev]');
    if (rowEl) {
      const [cal, id] = rowEl.dataset.ev.split('|');
      const ev = gcal.cached()?.events.find((x) => x.cal === cal && x.id === id);
      if (ev) withPermission(() => eventForm(ev, load));
    }
  });

  load();
  const off = gcal.onChange(draw);
  return () => {
    alive = false;
    off();
  };
}
