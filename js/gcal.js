// Collegamento a Google Calendar (Fase 3).
//
// - Calendario "Famiglia": condiviso, visibile a tutti e tre.
// - Calendario personale ("primary") di chi usa l'app: eventi "Solo io",
//   che gli altri non possono vedere.
//
// Le chiamate usano un permesso temporaneo (circa un'ora) chiesto a Google
// con un tocco. Gli eventi vengono salvati anche sul telefono, così la home
// e il calendario si vedono pure quando il permesso è scaduto o manca la rete.

import * as store from './store.js';
import { getAccount } from './user.js';
import { ymd } from './util.js';

const API = 'https://www.googleapis.com/calendar/v3';
const TZ = Intl.DateTimeFormat().resolvedOptions().timeZone || 'Europe/Rome';
export const FAMILY_NAME = 'Famiglia';
export const DEFAULT_DAYS = 60;

/* ---------- Avvisi di cambiamento ---------- */

const listeners = new Set();
export function onChange(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}
const emit = () => listeners.forEach((fn) => fn());

/* ---------- Memoria sul telefono (per account) ---------- */

const key = (k) => `cm:cal:${getAccount()?.uid || 'nessuno'}:${k}`;
function read(k) {
  try {
    return JSON.parse(localStorage.getItem(key(k)));
  } catch {
    return null;
  }
}
function save(k, v) {
  try {
    if (v === null) localStorage.removeItem(key(k));
    else localStorage.setItem(key(k), JSON.stringify(v));
  } catch { /* spazio pieno o modalità privata */ }
}

/** Cancella tutto ciò che riguarda il calendario (all'uscita dall'account). */
export function forget() {
  try {
    Object.keys(localStorage).filter((k) => k.startsWith('cm:cal:')).forEach((k) => localStorage.removeItem(k));
  } catch { /* ignora */ }
}

/* ---------- Permesso ---------- */

export const available = () => store.CLOUD && !!getAccount();

export function connected() {
  const t = read('token');
  return !!(t && t.exp > Date.now() + 60_000);
}

/** Chiede il permesso a Google (apre una finestra: va chiamato da un tocco). */
export async function connect() {
  const value = await store.getCloud().calendarToken();
  save('token', { value, exp: Date.now() + 55 * 60_000 });
  emit();
}

export class CalError extends Error {
  constructor(code, message) {
    super(message);
    this.code = code;
  }
}

async function api(path, { method = 'GET', body, query } = {}) {
  if (!connected()) throw new CalError('auth', 'Serve il permesso di Google Calendar');
  const url = new URL(API + path);
  for (const [k, v] of Object.entries(query || {})) if (v !== undefined) url.searchParams.set(k, v);
  let res;
  try {
    res = await fetch(url, {
      method,
      headers: { Authorization: `Bearer ${read('token').value}`, ...(body ? { 'Content-Type': 'application/json' } : {}) },
      body: body ? JSON.stringify(body) : undefined,
    });
  } catch {
    throw new CalError('offline', 'Nessuna connessione a internet');
  }
  if (res.status === 401) {
    save('token', null);
    emit();
    throw new CalError('auth', 'Il permesso di Google Calendar è scaduto');
  }
  if (res.status === 204) return null;
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const text = JSON.stringify(data);
    const code = /accessNotConfigured|SERVICE_DISABLED/.test(text) ? 'disabled'
      : /insufficientPermissions|ACCESS_TOKEN_SCOPE_INSUFFICIENT/.test(text) ? 'scope'
        : res.status === 403 ? 'forbidden' : 'api';
    throw new CalError(code, data.error?.message || `Errore ${res.status}`);
  }
  return data;
}

const enc = encodeURIComponent;

/* ---------- Calendari ---------- */

/** Trova il calendario "Famiglia" tra quelli dell'utente (null se manca). */
export async function familyId({ refresh = false } = {}) {
  if (!refresh && read('familyId')) return read('familyId');
  let pageToken;
  do {
    const d = await api('/users/me/calendarList', { query: { maxResults: '250', pageToken } });
    const found = (d.items || []).find((c) => [c.summaryOverride, c.summary]
      .some((s) => s && s.trim().toLowerCase() === FAMILY_NAME.toLowerCase()));
    if (found) {
      save('familyId', found.id);
      return found.id;
    }
    pageToken = d.nextPageToken;
  } while (pageToken);
  save('familyId', null);
  return null;
}

const calId = (cal) => (cal === 'famiglia' ? read('familyId') : 'primary');

/* ---------- Eventi ---------- */

function normalize(e, cal) {
  const allDay = !!e.start?.date;
  return {
    id: e.id,
    cal,
    title: e.summary || '(senza titolo)',
    allDay,
    start: allDay ? e.start.date : e.start.dateTime,
    end: allDay ? e.end?.date : e.end?.dateTime,
    location: e.location || '',
    notes: e.description || '',
    recurring: !!e.recurringEventId,
    reminders: e.reminders || { useDefault: true },
    link: e.htmlLink || '',
  };
}

const localMidnight = (dateStr) => {
  const [y, m, d] = dateStr.split('-').map(Number);
  return new Date(y, m - 1, d);
};

export const startDate = (e) => (e.allDay ? localMidnight(e.start) : new Date(e.start));

/** Giorno (AAAA-MM-GG) in cui mostrare l'evento: se è già iniziato, oggi. */
export function dayKey(e) {
  const today = ymd(new Date());
  const d = e.allDay ? e.start : ymd(new Date(e.start));
  return d < today ? today : d;
}

/** Ultimo giorno (incluso) di un evento di più giorni. */
export function lastDay(e) {
  if (e.allDay) {
    const d = localMidnight(e.end || e.start);
    d.setDate(d.getDate() - 1);
    return ymd(d);
  }
  return ymd(new Date(e.end || e.start));
}

/** Evento con orario già terminato (quelli di tutto il giorno valgono fino a sera). */
export const isOver = (e) => !e.allDay && new Date(e.end || e.start) < new Date();

export const timeOf = (iso) => new Date(iso).toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' });

/** Scarica gli eventi da oggi ai prossimi `days` giorni (Famiglia + personale). */
export async function fetchEvents(days = DEFAULT_DAYS) {
  const from = new Date();
  from.setHours(0, 0, 0, 0);
  const to = new Date(from);
  to.setDate(to.getDate() + days);

  const fam = await familyId();
  const sources = [['privato', 'primary']];
  if (fam) sources.unshift(['famiglia', fam]);

  const lists = await Promise.all(sources.map(async ([cal, id]) => {
    const items = [];
    let pageToken;
    do {
      const d = await api(`/calendars/${enc(id)}/events`, {
        query: {
          timeMin: from.toISOString(),
          timeMax: to.toISOString(),
          singleEvents: 'true',
          orderBy: 'startTime',
          maxResults: '250',
          pageToken,
        },
      });
      items.push(...(d.items || []).filter((e) => e.status !== 'cancelled').map((e) => normalize(e, cal)));
      pageToken = d.nextPageToken;
    } while (pageToken);
    return items;
  }));

  const result = {
    at: Date.now(),
    days,
    familyMissing: !fam,
    events: lists.flat().sort((a, b) => startDate(a) - startDate(b)),
  };
  save('cache', result);
  emit();
  return result;
}

/** Ultimi eventi scaricati (o null). */
export const cached = () => read('cache');

/* ---------- Creazione e modifica ---------- */

function nextDay(dateStr) {
  const d = localMidnight(dateStr);
  d.setDate(d.getDate() + 1);
  return ymd(d);
}

function plusHour(time) {
  const [h, m] = time.split(':').map(Number);
  return `${String((h + 1) % 24).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

/**
 * Dati del modulo → evento Google.
 * f: { title, allDay, date, endDate, startTime, endTime, location, notes, reminder }
 */
function toGoogle(f) {
  const body = { summary: f.title, location: f.location || '', description: f.notes || '' };
  if (f.allDay) {
    const last = f.endDate && f.endDate >= f.date ? f.endDate : f.date;
    body.start = { date: f.date, dateTime: null };
    body.end = { date: nextDay(last), dateTime: null };
  } else {
    const s = f.startTime || '09:00';
    const e = f.endTime || plusHour(s);
    const endDate = e <= s ? nextDay(f.date) : f.date;
    body.start = { dateTime: `${f.date}T${s}:00`, timeZone: TZ, date: null };
    body.end = { dateTime: `${endDate}T${e}:00`, timeZone: TZ, date: null };
  }
  if (f.reminder === 'default') body.reminders = { useDefault: true };
  else if (f.reminder === 'none') body.reminders = { useDefault: false, overrides: [] };
  else body.reminders = { useDefault: false, overrides: [{ method: 'popup', minutes: Number(f.reminder) }] };
  return body;
}

function requireCal(cal) {
  const id = calId(cal);
  if (!id) throw new CalError('nofamily', `Non trovo il calendario "${FAMILY_NAME}" nel tuo account`);
  return id;
}

export async function createEvent(cal, f) {
  const body = toGoogle(f);
  // Nella creazione i campi vuoti non servono.
  for (const k of ['start', 'end']) Object.keys(body[k]).forEach((x) => body[k][x] === null && delete body[k][x]);
  if (f.repeat) body.recurrence = [`RRULE:FREQ=${f.repeat}`];
  await api(`/calendars/${enc(requireCal(cal))}/events`, { method: 'POST', body });
}

export async function updateEvent(ev, cal, f) {
  let id = requireCal(ev.cal);
  if (cal !== ev.cal) {
    const dest = requireCal(cal);
    await api(`/calendars/${enc(id)}/events/${enc(ev.id)}/move`, { method: 'POST', query: { destination: dest } });
    id = dest;
  }
  await api(`/calendars/${enc(id)}/events/${enc(ev.id)}`, { method: 'PATCH', body: toGoogle(f) });
}

export async function deleteEvent(ev) {
  await api(`/calendars/${enc(requireCal(ev.cal))}/events/${enc(ev.id)}`, { method: 'DELETE' });
}

/** Evento Google → valori per il modulo di modifica. */
export function toForm(ev) {
  const r = ev.reminders || {};
  const reminder = r.useDefault !== false ? 'default'
    : !r.overrides?.length ? 'none' : String(r.overrides[0].minutes);
  return {
    title: ev.title === '(senza titolo)' ? '' : ev.title,
    cal: ev.cal,
    allDay: ev.allDay,
    date: ev.allDay ? ev.start : ymd(new Date(ev.start)),
    endDate: ev.allDay ? lastDay(ev) : '',
    startTime: ev.allDay ? '' : timeOf(ev.start),
    endTime: ev.allDay ? '' : timeOf(ev.end),
    location: ev.location,
    notes: ev.notes,
    reminder,
    repeat: '',
  };
}

/** Messaggio comprensibile per un errore. */
export function explain(err) {
  if (err?.code === 'auth/popup-closed-by-user' || err?.code === 'auth/cancelled-popup-request') return '';
  if (err?.code === 'auth/popup-blocked') return 'Il telefono ha bloccato la finestra di Google: riprova';
  if (err?.code === 'disabled') return 'Google Calendar non è ancora attivato nel progetto (vedi istruzioni di configurazione)';
  if (err?.code === 'scope') return 'Manca il permesso per il calendario: ricollegalo e spunta tutte le caselle';
  if (err?.code === 'offline') return 'Nessuna connessione a internet';
  if (err?.code === 'forbidden') return 'Non hai il permesso di modificare questo calendario';
  return err?.message || 'Qualcosa è andato storto';
}
