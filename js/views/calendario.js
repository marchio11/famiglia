import * as store from '../store.js';
import * as gcal from '../gcal.js';
import {
  esc, pageHead, formDialog, toast, dateField, addDays, ymd, daysUntil, memberColor, avatar,
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


const privColor = () => memberColor(store.getUser());
/** Colore dell'evento: privato = il tuo colore; di una sola persona = il suo colore; altrimenti arancione. */
const evColor = (e) => {
  if (e.cal === 'privato') return privColor();
  if (e.who?.length === 1) return memberColor(e.who[0]);
  return COLOR;
};

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

/**
 * Orario con due menu (ore e minuti) al posto dell'orologio di Android,
 * che con i caratteri grandi non entra nello schermo.
 */
function timeField(name, label, value) {
  const [h, m] = (value || '09:00').split(':');
  const mins = Array.from({ length: 12 }, (_, i) => String(i * 5).padStart(2, '0'));
  if (!mins.includes(m)) mins.push(m);
  mins.sort();
  return `
    <div class="field">
      <span>${label}</span>
      <div class="time-pick">
        <select name="${name}H" aria-label="${label}: ore">
          ${Array.from({ length: 24 }, (_, i) => String(i).padStart(2, '0')).map((x) => `<option ${x === h ? 'selected' : ''}>${x}</option>`).join('')}
        </select>
        <b>:</b>
        <select name="${name}M" aria-label="${label}: minuti">
          ${mins.map((x) => `<option ${x === m ? 'selected' : ''}>${x}</option>`).join('')}
        </select>
      </div>
    </div>`;
}

function eventForm(ev, onSaved, preset = {}) {
  const isNew = !ev;
  const start = nextHour();
  const f = ev ? gcal.toForm(ev) : {
    title: '', cal: 'famiglia', allDay: false, date: preset.date || addDays(start === '00:00' ? 1 : 0), endDate: '',
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
      <fieldset class="field" data-who-field><legend>Chi è coinvolto?</legend>
        <div class="who-pick">
          ${store.MEMBERS.map((m) => `<label><input type="checkbox" name="who" value="${m}" ${(f.who || []).includes(m) ? 'checked' : ''}><span>${avatar(m, 'xs')}${m}</span></label>`).join('')}
        </div>
        <p class="hint">Lo vedono tutti nel calendario, ma compare "In evidenza" solo a chi è coinvolto. Nessuno scelto = tutta la famiglia.</p>
      </fieldset>
      <label class="switch"><input type="checkbox" name="allDay" ${f.allDay ? 'checked' : ''}> Tutto il giorno (es. scadenze, compleanni)</label>
      ${dateField('date', 'Data', f.date)}
      <div class="field-row" data-times>
        ${timeField('startTime', 'Dalle', f.startTime)}
        ${timeField('endTime', 'Alle', f.endTime)}
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
      const picked = new FormData(form).getAll('who');
      const data = {
        ...v,
        who: cal === 'famiglia' && picked.length < store.MEMBERS.length ? picked : [],
        startTime: `${v.startTimeH}:${v.startTimeM}`,
        endTime: `${v.endTimeH}:${v.endTimeM}`,
        allDay: !!v.allDay,
        repeat: v.repeat || '',
      };
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
    form.querySelector('[data-who-field]').hidden = cal === 'privato';
    form.querySelector('[data-cal-hint]').textContent = cal === 'privato'
      ? 'Finisce nel tuo calendario Google personale: gli altri non lo vedono.'
      : `Finisce nel calendario "${gcal.FAMILY_NAME}": lo vedono tutti e tre.`;
  };
  form.addEventListener('change', sync);
  sync();

  // Se cambia l'inizio, la fine si sposta insieme mantenendo la durata
  // (un'ora per i nuovi eventi). Se si cambia la fine, si ricorda la nuova durata.
  const DAY = 24 * 60;
  const minutes = (n) => Number(form.elements[`${n}H`].value) * 60 + Number(form.elements[`${n}M`].value);
  const durationNow = () => {
    const d = (minutes('endTime') - minutes('startTime') + DAY) % DAY;
    return d > 0 ? d : 60;
  };
  let duration = isNew ? 60 : durationNow();
  const onStart = () => {
    const end = (minutes('startTime') + duration) % DAY;
    form.elements.endTimeH.value = String(Math.floor(end / 60)).padStart(2, '0');
    const m = String(end % 60).padStart(2, '0');
    const sel = form.elements.endTimeM;
    if (![...sel.options].some((o) => o.value === m)) sel.add(new Option(m, m));
    sel.value = m;
  };
  const onEnd = () => {
    duration = durationNow();
  };
  form.elements.startTimeH.addEventListener('change', onStart);
  form.elements.startTimeM.addEventListener('change', onStart);
  form.elements.endTimeH.addEventListener('change', onEnd);
  form.elements.endTimeM.addEventListener('change', onEnd);
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

/* ---------- Righe evento ---------- */

function eventRow(e, { showDay = false } = {}) {
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
    e.cal === 'famiglia' && e.who?.length ? `<span class="who-mini">${e.who.map((m) => avatar(m, 'xs')).join('')}${e.who.length === 1 ? esc(e.who[0]) : ''}</span>` : '',
    e.location ? `<span>📍 ${esc(e.location)}</span>` : '',
    e.recurring ? '<span>🔁</span>' : '',
  ].filter(Boolean).join('');
  if (showDay) {
    const day = gcal.dayKey(e);
    const n = daysUntil(day);
    const label = n === 0 ? 'Oggi' : n === 1 ? 'Domani' : new Date(`${day}T12:00`).toLocaleDateString('it-IT', n < 7 ? { weekday: 'short', day: 'numeric' } : { day: 'numeric', month: 'short' });
    when = `<b>${esc(label)}</b><small>${e.allDay ? 'tutto il giorno' : gcal.timeOf(e.start)}</small>`;
  }
  return `
    <div class="row ev ${gcal.isOver(e) ? 'over' : ''}" data-ev="${esc(e.cal)}|${esc(e.id)}" style="--ev:${evColor(e)}">
      <div class="ev-time">${when}</div>
      <div class="row-main" data-act="edit">
        <div class="row-title">${esc(e.title)}</div>
        <div class="row-sub">${tags}</div>
      </div>
    </div>`;
}

/* ---------- Griglia del mese ---------- */

const WEEKDAYS = ['L', 'M', 'M', 'G', 'V', 'S', 'D'];

function monthTitle(y, m) {
  const t = new Date(y, m, 1).toLocaleDateString('it-IT', { month: 'long', ...(y !== new Date().getFullYear() ? { year: 'numeric' } : {}) });
  return t.charAt(0).toUpperCase() + t.slice(1);
}

/** Griglia lunedì-domenica del mese, con i pallini degli eventi. */
function monthGrid(y, m, events, selected) {
  const today = ymd(new Date());
  const first = new Date(y, m, 1);
  const start = new Date(first);
  start.setDate(1 - ((first.getDay() + 6) % 7)); // lunedì della prima settimana
  const weeks = Math.ceil((((first.getDay() + 6) % 7) + new Date(y, m + 1, 0).getDate()) / 7);

  // Colori per giorno (massimo 3 pallini)
  const dots = new Map();
  for (const e of events) {
    for (const d of gcal.daysOf(e)) {
      if (!dots.has(d)) dots.set(d, []);
      const c = evColor(e);
      if (!dots.get(d).includes(c)) dots.get(d).push(c);
    }
  }

  let cells = '';
  const d = new Date(start);
  for (let i = 0; i < weeks * 7; i += 1) {
    const key = ymd(d);
    const other = d.getMonth() !== m;
    const colors = (dots.get(key) || []).slice(0, 3);
    cells += `
      <button type="button" class="cal-day ${other ? 'other' : ''} ${key === today ? 'today' : ''} ${key === selected ? 'sel' : ''}" data-day="${key}"
        aria-label="${d.toLocaleDateString('it-IT', { weekday: 'long', day: 'numeric', month: 'long' })}${colors.length ? ', con impegni' : ''}">
        <span class="num">${d.getDate()}</span>
        <span class="dots">${colors.map((c) => `<i style="background:${c}"></i>`).join('')}</span>
      </button>`;
    d.setDate(d.getDate() + 1);
  }
  return `
    <div class="cal-week">${WEEKDAYS.map((w, i) => `<span class="${i === 6 ? 'sun' : ''}">${w}</span>`).join('')}</div>
    <div class="cal-grid">${cells}</div>`;
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
    <div data-body></div>
    ${gcal.available() ? `<button class="fab" type="button" data-new>${icon('plus')}Nuovo evento</button>` : ''}`;

  const $ = (s) => root.querySelector(s);

  if (!gcal.available()) {
    $('[data-body]').innerHTML = `
      <section class="card coming">
        <div class="big">📅</div>
        <h2>Serve l'accesso con Google</h2>
        <p>Il calendario funziona quando l'app è collegata agli account Google di famiglia.</p>
      </section>`;
    return null;
  }

  const now = new Date();
  let year = now.getFullYear();
  let month = now.getMonth();
  let selected = ymd(now);
  let loading = false;
  let error = null;
  let alive = true;
  let lookup = new Map(); // "cal|id" -> evento, per aprire quello toccato

  async function loadMonth() {
    if (!gcal.connected()) return draw();
    const y = year;
    const m = month;
    try {
      await gcal.fetchMonth(y, m);
    } catch (err) {
      error = err;
    }
    if (alive) draw();
  }

  async function load() {
    if (!gcal.connected()) return draw();
    loading = true;
    error = null;
    draw();
    try {
      await Promise.all([gcal.fetchEvents(), gcal.fetchMonth(year, month)]);
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

  function changeMonth(delta) {
    const d = new Date(year, month + delta, 1);
    year = d.getFullYear();
    month = d.getMonth();
    const today = new Date();
    selected = year === today.getFullYear() && month === today.getMonth() ? ymd(today) : ymd(d);
    draw();
    loadMonth();
  }

  function draw() {
    if (!alive) return;
    const data = gcal.cached();
    const monthData = gcal.cachedMonth(year, month);
    const banner = [];

    if (!gcal.connected() && !data && !monthData) {
      $('[data-banner]').innerHTML = '';
      $('[data-body]').innerHTML = `
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
    if (error?.code === 'disabled') {
      banner.push(`
        <div class="banner warn column">
          <span>⚠️ Google risponde che l'<b>API Google Calendar</b> non è attiva nel progetto dell'app.</span>
          <span>Apri la pagina qui sotto <b>con l'account di famiglia</b>: è già impostata sul progetto giusto. Premi <b>Abilita</b>, aspetta un paio di minuti, poi torna qui e tocca ${icon('refresh', 'sm')}.</span>
          <a class="btn primary" href="${esc(gcal.enableApiUrl(error))}" target="_blank" rel="noopener">Apri la pagina di attivazione</a>
          <small>Dettaglio tecnico: ${esc(error.message)}</small>
        </div>`);
    } else if (error) {
      banner.push(`
        <div class="banner warn column">
          <span>⚠️ ${esc(gcal.explain(error))}</span>
          ${error.message && error.message !== gcal.explain(error) ? `<small>Dettaglio tecnico: ${esc(error.message)}</small>` : ''}
        </div>`);
    }
    if ((data || monthData)?.familyMissing) {
      banner.push(`<div class="banner warn">👨‍👩‍👧 <span>Non trovo il calendario <b>"${gcal.FAMILY_NAME}"</b> nel tuo account Google: controlla di aver accettato l'invito di condivisione. Per ora vedi solo i tuoi eventi personali.</span></div>`);
    }
    if (loading) banner.push('<div class="banner">⏳ <span>Aggiornamento…</span></div>');
    $('[data-banner]').innerHTML = banner.join('');

    // Eventi del mese mostrato: dalla copia del mese, altrimenti da quella dei prossimi 60 giorni.
    const monthEvents = monthData?.events || data?.events || [];
    const upcoming = (data?.events || []).filter((e) => !gcal.isOver(e)).slice(0, 3);
    lookup = new Map([...(data?.events || []), ...monthEvents].map((e) => [`${e.cal}|${e.id}`, e]));

    const dayEvents = monthEvents
      .filter((e) => gcal.daysOf(e).includes(selected))
      .sort((a, b) => (b.allDay - a.allDay) || (gcal.startDate(a) - gcal.startDate(b)));

    const isThisMonth = year === now.getFullYear() && month === now.getMonth();
    const updated = monthData || data;
    $('[data-body]').innerHTML = `
      <section class="group">
        <h3 class="group-head"><span>⏭️ Prossimi impegni</span></h3>
        ${upcoming.length ? `<div class="card rows">${upcoming.map((e) => eventRow(e, { showDay: true })).join('')}</div>`
          : '<p class="hint empty-sec">Nessun impegno in vista 🌤️</p>'}
      </section>

      <section class="card cal">
        <div class="cal-head">
          <button class="icon-btn" type="button" data-month="-1" aria-label="Mese precedente">${icon('chevronLeft')}</button>
          <h2>${esc(monthTitle(year, month))}</h2>
          ${isThisMonth ? '' : '<button class="chip" type="button" data-today>Oggi</button>'}
          <button class="icon-btn" type="button" data-month="1" aria-label="Mese successivo">${icon('chevron')}</button>
        </div>
        <div data-swipe>${monthGrid(year, month, monthEvents, selected)}</div>
      </section>

      <section class="group day-list">
        <h3 class="group-head ${daysUntil(selected) === 0 ? 'today' : ''}"><span>${esc(dayLabel(selected))}</span></h3>
        ${dayEvents.length ? `<div class="card rows">${dayEvents.map((e) => eventRow(e)).join('')}</div>`
          : `<p class="hint empty-sec">Nessun impegno. <button class="link-btn" type="button" data-new-day>+ Aggiungi un evento in questo giorno</button></p>`}
      </section>
      ${updated ? `<p class="hint center">Aggiornato ${new Date(updated.at).toLocaleString('it-IT', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}</p>` : ''}`;
  }

  // Scorrimento a destra/sinistra sulla griglia per cambiare mese.
  let touch = null;
  root.addEventListener('touchstart', (e) => {
    if (!e.target.closest('[data-swipe]')) return;
    touch = { x: e.touches[0].clientX, y: e.touches[0].clientY };
  }, { passive: true });
  root.addEventListener('touchend', (e) => {
    if (!touch) return;
    const dx = e.changedTouches[0].clientX - touch.x;
    const dy = e.changedTouches[0].clientY - touch.y;
    touch = null;
    if (Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(dy) * 1.5) changeMonth(dx < 0 ? 1 : -1);
  }, { passive: true });

  root.addEventListener('click', (e) => {
    if (e.target.closest('[data-connect]') || e.target.closest('[data-refresh]')) {
      withPermission(() => {
        gcal.familyId({ refresh: true }).catch(() => {}).finally(load);
      });
      return;
    }
    const monthBtn = e.target.closest('[data-month]');
    if (monthBtn) {
      changeMonth(Number(monthBtn.dataset.month));
      return;
    }
    if (e.target.closest('[data-today]')) {
      changeMonth((now.getFullYear() - year) * 12 + (now.getMonth() - month));
      return;
    }
    const day = e.target.closest('[data-day]');
    if (day) {
      selected = day.dataset.day;
      const [y, m] = selected.split('-').map(Number);
      if (y !== year || m - 1 !== month) changeMonth((y - year) * 12 + (m - 1 - month));
      else draw();
      return;
    }
    if (e.target.closest('[data-new-day]')) {
      withPermission(() => eventForm(null, load, { date: selected }));
      return;
    }
    if (e.target.closest('[data-new]')) {
      withPermission(() => eventForm(null, load, { date: selected >= ymd(new Date()) ? selected : undefined }));
      return;
    }
    const rowEl = e.target.closest('[data-ev]');
    if (rowEl) {
      const ev = lookup.get(rowEl.dataset.ev);
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
