// Viaggi: ogni viaggio raccoglie programma, liste, documenti e note.
//
// Firestore "viaggi": { name, emoji, destination, start, end (AAAA-MM-GG),
//   who: [persone che partono], notes, eventId (calendario Famiglia),
//   folderId (cartella su Drive) }
// Le liste del viaggio sono normali liste ("lists") con tripId; il programma
// è una lista con program: true e una categoria per ogni giorno (id = data).

import * as store from './store.js';
import * as gcal from './gcal.js';
import { ymd, daysUntil } from './util.js';

export const all = () => store.getAll('viaggi').sort((a, b) => a.start.localeCompare(b.start));
export const get = (id) => store.get('viaggi', id);
export const listsOf = (tripId) => store.getAll('lists').filter((l) => l.tripId === tripId);
export const programOf = (tripId) => listsOf(tripId).find((l) => l.program);

/** 'prossimo' | 'in corso' | 'concluso' */
export function status(t) {
  const today = ymd(new Date());
  if (t.end < today) return 'concluso';
  if (t.start <= today) return 'in corso';
  return 'prossimo';
}

export const concerns = (t, name) => !t.who?.length || t.who.length === store.MEMBERS.length || t.who.includes(name);

const fmt = (d, opts) => new Date(`${d}T12:00`).toLocaleDateString('it-IT', opts);

export function datesLabel(t) {
  const sameMonth = t.start.slice(0, 7) === t.end.slice(0, 7);
  const sameYear = t.start.slice(0, 4) === t.end.slice(0, 4);
  if (t.start === t.end) return fmt(t.start, { day: 'numeric', month: 'long', year: 'numeric' });
  if (sameMonth) return `${fmt(t.start, { day: 'numeric' })}–${fmt(t.end, { day: 'numeric', month: 'long', year: 'numeric' })}`;
  if (sameYear) return `${fmt(t.start, { day: 'numeric', month: 'short' })} – ${fmt(t.end, { day: 'numeric', month: 'short', year: 'numeric' })}`;
  return `${fmt(t.start, { day: 'numeric', month: 'short', year: 'numeric' })} – ${fmt(t.end, { day: 'numeric', month: 'short', year: 'numeric' })}`;
}

export const length = (t) => daysUntil(t.end) - daysUntil(t.start) + 1;

/** Testo breve sul tempo: "tra 5 giorni", "giorno 2 di 4", "concluso". */
export function countdown(t) {
  const s = status(t);
  if (s === 'in corso') return `In corso · giorno ${1 - daysUntil(t.start)} di ${length(t)}`;
  if (s === 'concluso') return 'Concluso';
  const n = daysUntil(t.start);
  return n === 1 ? 'Si parte domani!' : `Tra ${n} giorni`;
}

/* ---------- Giorni del programma ---------- */

export function tripDays(t) {
  const out = [];
  const d = new Date(`${t.start}T12:00`);
  for (let i = 0; i < 60 && ymd(d) <= t.end; i += 1) {
    out.push(ymd(d));
    d.setDate(d.getDate() + 1);
  }
  return out;
}

export function dayName(dateStr) {
  const s = fmt(dateStr, { weekday: 'short', day: 'numeric', month: 'short' });
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/** Aggiunge al programma i giorni mancanti (se cambiano le date), in ordine. */
export function syncProgramDays(t) {
  const prog = programOf(t.id);
  if (!prog) return;
  const sections = prog.sections || [];
  const existing = new Set(sections.map((s) => s.id));
  const days = tripDays(t);
  const added = days.filter((d) => !existing.has(d)).map((d) => ({ id: d, name: dayName(d) }));
  if (!added.length) return;
  const next = [...sections, ...added].sort((a, b) => a.id.localeCompare(b.id));
  store.update('lists', prog.id, { sections: next });
}

/* ---------- Liste iniziali ---------- */

// Liste create con il viaggio: tutte vuote. La valigia ha una sezione per
// ogni persona che parte (id = nome), il programma una per ogni giorno.
export const STARTER_LISTS = [
  { key: 'program', name: 'Programma', emoji: '📅', type: 'cose' },
  { key: 'luoghi', name: 'Posti da visitare', emoji: '📍', type: 'luoghi' },
  { key: 'valigia', name: 'Valigia', emoji: '🧳', type: 'altro' },
  { key: 'prima', name: 'Da fare prima di partire', emoji: '✅', type: 'cose' },
];

/** Persone che partono (nessuna scelta = tutta la famiglia). */
const travellers = (t) => (t.who?.length ? t.who : store.MEMBERS);

function createStarterLists(t, keys) {
  for (const s of STARTER_LISTS.filter((x) => keys.includes(x.key))) {
    let sections = [];
    if (s.key === 'program') sections = tripDays(t).map((d) => ({ id: d, name: dayName(d) }));
    if (s.key === 'valigia') sections = travellers(t).map((m) => ({ id: m, name: m }));
    store.add('lists', {
      name: s.name,
      emoji: s.emoji,
      type: s.type,
      sections,
      tripId: t.id,
      program: s.key === 'program',
      packing: s.key === 'valigia',
    });
  }
}

/** Se cambiano i partecipanti, aggiunge alla valigia le sezioni mancanti. */
export function syncPacking(t) {
  const list = listsOf(t.id).find((l) => l.packing);
  if (!list) return;
  const sections = list.sections || [];
  const added = travellers(t).filter((m) => !sections.some((x) => x.id === m)).map((m) => ({ id: m, name: m }));
  if (added.length) store.update('lists', list.id, { sections: [...sections, ...added] });
}

/* ---------- Calendario ---------- */

function eventFields(t) {
  return {
    title: `${t.emoji || '✈️'} ${t.name}`,
    allDay: true,
    date: t.start,
    endDate: t.end,
    location: t.destination || '',
    notes: 'Viaggio inserito dall\'app Casa Marchionni.',
    reminder: 'default',
    who: t.who || [],
  };
}

async function syncEvent(t, calendar) {
  if (!calendar) {
    if (t.eventId && gcal.connected()) await gcal.deleteEvent({ cal: 'famiglia', id: t.eventId }).catch(() => {});
    return '';
  }
  if (!gcal.connected()) throw new gcal.CalError('auth', 'Permesso scaduto');
  await gcal.familyId();
  if (t.eventId) {
    try {
      await gcal.updateEvent({ cal: 'famiglia', id: t.eventId }, 'famiglia', eventFields(t));
      return t.eventId;
    } catch (err) {
      if (err.code !== 'notfound') throw err;
    }
  }
  return (await gcal.createEvent('famiglia', eventFields(t)))?.id || '';
}

/* ---------- Creazione, modifica, eliminazione ---------- */

/**
 * Crea o aggiorna un viaggio. data: { name, emoji, destination, start, end, who, notes }
 * Restituisce { id, calError }.
 */
export async function save(existing, data, { calendar = true, lists = [] } = {}) {
  let id = existing?.id;
  if (existing) store.update('viaggi', id, data);
  else id = store.add('viaggi', { ...data, eventId: '', folderId: '' });
  const t = get(id);
  if (existing) {
    syncProgramDays(t);
    syncPacking(t);
  }
  else createStarterLists(t, lists);

  let calError = null;
  try {
    const eventId = await syncEvent(t, calendar);
    if (eventId !== (t.eventId || '')) store.update('viaggi', id, { eventId });
    gcal.fetchEvents().catch(() => {});
  } catch (err) {
    calError = err;
  }
  return { id, calError };
}

export async function remove(t) {
  const lists = listsOf(t.id);
  const items = store.getAll('listItems').filter((i) => lists.some((l) => l.id === i.listId));
  store.remove('listItems', items.map((i) => i.id));
  store.remove('lists', lists.map((l) => l.id));
  store.remove('viaggi', t.id);
  if (t.eventId && gcal.connected()) {
    await gcal.deleteEvent({ cal: 'famiglia', id: t.eventId }).catch(() => {});
    gcal.fetchEvents().catch(() => {});
  }
}

/** Id degli eventi di calendario creati dai viaggi (per non mostrarli due volte). */
export const eventIds = () => new Set(store.getAll('viaggi').map((t) => t.eventId).filter(Boolean));

/** Voci del programma di un giorno, in ordine di orario. */
export function programItems(tripId, day) {
  const prog = programOf(tripId);
  if (!prog) return [];
  return store.getAll('listItems')
    .filter((i) => i.listId === prog.id && i.section === day)
    .sort((a, b) => (a.time || '99').localeCompare(b.time || '99') || a.createdAt - b.createdAt);
}
