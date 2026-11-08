// Scadenze dei documenti (bollo, revisione, carta d'identità…).
//
// Sono salvate in Firestore (collezione "scadenze"), così compaiono nella home
// anche senza connessione, e diventano eventi "tutto il giorno" nel calendario
// Famiglia con promemoria una settimana e un giorno prima.
//
// La data è sempre suggerita e poi confermata dall'utente.

import * as store from './store.js';
import * as gcal from './gcal.js';
import { ymd } from './util.js';

/** Tipi di scadenza per tipo di elemento. months = ogni quanto si rinnova. */
const PERSONA = [
  { id: 'carta', name: 'Carta d\'identità', months: 120, hint: 'Usa la data di scadenza stampata sul documento.' },
  { id: 'patente', name: 'Patente', months: 120, hint: 'Usa la data stampata sulla patente (punto 4b).' },
  { id: 'passaporto', name: 'Passaporto', months: 120, hint: 'Usa la data di scadenza stampata sul passaporto.' },
  { id: 'tessera', name: 'Tessera sanitaria', months: 72, hint: 'Usa la data di scadenza stampata sulla tessera.' },
  { id: 'visita', name: 'Visita o controllo medico', months: 12 },
  { id: 'altro', name: 'Altro' },
];

export const TYPES = {
  persona: PERSONA,
  altro: PERSONA,
  veicolo: [
    { id: 'bollo', name: 'Bollo', months: 12, hint: 'Si paga ogni anno: indica la scadenza dell\'ultimo pagamento.' },
    { id: 'revisione', name: 'Revisione', months: 24, hint: 'Prima revisione 4 anni dopo l\'immatricolazione, poi ogni 2 anni (entro la fine del mese).' },
    { id: 'assicurazione', name: 'Assicurazione', months: 12 },
    { id: 'tagliando', name: 'Tagliando', months: 12 },
    { id: 'altro', name: 'Altro' },
  ],
  immobile: [
    { id: 'assicurazione', name: 'Assicurazione casa', months: 12 },
    { id: 'caldaia', name: 'Manutenzione caldaia', months: 12 },
    { id: 'tasse', name: 'Tasse (IMU…)', months: 6 },
    { id: 'altro', name: 'Altro' },
  ],
  animale: [
    { id: 'vaccino', name: 'Vaccino', months: 12 },
    { id: 'antiparassitario', name: 'Antiparassitario', months: 3 },
    { id: 'visita', name: 'Visita dal veterinario', months: 12 },
    { id: 'altro', name: 'Altro' },
  ],
};

export const typesFor = (kind) => TYPES[kind] || PERSONA;
export const typeOf = (kind, id) => typesFor(kind).find((t) => t.id === id) || typesFor(kind).at(-1);

/* ---------- Date ---------- */

function parse(dateStr) {
  const [y, m, d] = dateStr.split('-').map(Number);
  return { y, m, d };
}

/** Aggiunge mesi senza "sforare" (31 gennaio + 1 mese = 28/29 febbraio). */
export function addMonths(dateStr, months) {
  const { y, m, d } = parse(dateStr);
  const last = new Date(y, m - 1 + months + 1, 0).getDate();
  return ymd(new Date(y, m - 1 + months, Math.min(d, last)));
}

const endOfMonth = (dateStr) => {
  const { y, m } = parse(dateStr);
  return ymd(new Date(y, m, 0));
};

/** Prossima revisione: 4 anni dall'immatricolazione, poi ogni 2, entro fine mese. */
export function nextRevisione(immatricolazione, after = ymd(new Date())) {
  let d = endOfMonth(addMonths(immatricolazione, 48));
  while (d < after) d = endOfMonth(addMonths(d, 24));
  return d;
}

/** Data suggerita per una nuova scadenza ('' se va letta dal documento). */
export function suggest(kind, typeId, { immatricolazione } = {}) {
  if (kind === 'veicolo' && typeId === 'revisione' && immatricolazione) return nextRevisione(immatricolazione);
  return '';
}

/** Data suggerita quando una scadenza viene rinnovata. */
export function renewDate(s) {
  const t = typeOf(s.kind, s.type);
  if (s.kind === 'veicolo' && s.type === 'revisione') return endOfMonth(addMonths(s.date, 24));
  return t.months ? addMonths(s.date, t.months) : '';
}

export const label = (s) => (s.type === 'altro' && s.label ? s.label : typeOf(s.kind, s.type).name);

/* ---------- Salvataggio (con evento nel calendario Famiglia) ---------- */

function eventFields(s) {
  return {
    title: `📄 ${label(s)} · ${s.entityName}`,
    allDay: true,
    date: s.date,
    endDate: '',
    location: '',
    notes: `${s.notes ? `${s.notes}\n\n` : ''}Scadenza inserita dall'app Casa Marchionni.`,
    reminder: '10080,1440', // una settimana e un giorno prima
  };
}

/**
 * Crea o aggiorna una scadenza. Restituisce { calError } se il calendario
 * non è stato aggiornato (la scadenza viene salvata comunque).
 */
export async function save(existing, data, { calendar = true } = {}) {
  const s = { ...existing, ...data };
  let eventId = existing?.eventId || '';
  let calError = null;
  try {
    if (calendar) {
      if (!gcal.connected()) throw new gcal.CalError('auth', 'Permesso scaduto');
      await gcal.familyId();
      const f = eventFields(s);
      if (eventId) {
        try {
          await gcal.updateEvent({ cal: 'famiglia', id: eventId }, 'famiglia', f);
        } catch (err) {
          if (err.code !== 'notfound') throw err;
          eventId = ''; // l'evento era stato cancellato dal calendario: lo si ricrea
        }
      }
      if (!eventId) eventId = (await gcal.createEvent('famiglia', f))?.id || '';
    } else if (eventId) {
      await gcal.deleteEvent({ cal: 'famiglia', id: eventId }).catch(() => {});
      eventId = '';
    }
  } catch (err) {
    calError = err;
  }
  const doc = { ...data, eventId };
  if (existing) store.update('scadenze', existing.id, doc);
  else store.add('scadenze', doc);
  if (!calError && calendar) gcal.fetchEvents().catch(() => {});
  return { calError };
}

export async function removeScadenza(s) {
  store.remove('scadenze', s.id);
  if (s.eventId && gcal.connected()) {
    await gcal.deleteEvent({ cal: 'famiglia', id: s.eventId }).catch(() => {});
    gcal.fetchEvents().catch(() => {});
  }
}

/** Tutte le scadenze, dalla più vicina. */
export const all = () => store.getAll('scadenze').sort((a, b) => a.date.localeCompare(b.date));

/** Id degli eventi di calendario che corrispondono a scadenze (per non mostrarli due volte). */
export const eventIds = () => new Set(store.getAll('scadenze').map((s) => s.eventId).filter(Boolean));
