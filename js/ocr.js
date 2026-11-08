// Interpretazione del testo letto dai documenti (OCR fatto da Google Drive).
//
// Riconosce il tipo di documento, le date con il loro significato
// (scadenza, rilascio, nascita, immatricolazione…) e la targa.
// È solo un suggerimento: l'utente conferma sempre.

const MONTHS = {
  gen: 1, gennaio: 1, jan: 1, feb: 2, febbraio: 2, mar: 3, marzo: 3, apr: 4, aprile: 4, mag: 5, maggio: 5, may: 5,
  giu: 6, giugno: 6, jun: 6, lug: 7, luglio: 7, jul: 7, ago: 8, agosto: 8, aug: 8, set: 9, settembre: 9, sep: 9,
  ott: 10, ottobre: 10, oct: 10, nov: 11, novembre: 11, dic: 12, dicembre: 12, dec: 12,
};

/** Tipi di documento: id della scadenza corrispondente per ogni tipo di elemento. */
const DOC_TYPES = [
  { re: /carta\s+d.?\s?identit|carta\s+di\s+identit|identity\s+card|\bC\.?I\.?E\b/i, name: 'Carta d\'identità', scad: { persona: 'carta', altro: 'carta' } },
  { re: /patente\s+di\s+guida|driving\s+licen|\bpatente\b/i, name: 'Patente', scad: { persona: 'patente', altro: 'patente' } },
  { re: /passaporto|passport/i, name: 'Passaporto', scad: { persona: 'passaporto', altro: 'passaporto' } },
  { re: /tessera\s+sanitaria|tessera\s+europea|carta\s+nazionale\s+dei\s+servizi/i, name: 'Tessera sanitaria', scad: { persona: 'tessera', altro: 'tessera' } },
  { re: /certificato\s+di\s+assicurazione|polizza|assicurazion|\bR\.?C\.?A\.?\b|contrassegno/i, name: 'Assicurazione', scad: { veicolo: 'assicurazione', immobile: 'assicurazione' } },
  { re: /tassa\s+automobilistica|bollo\s+auto|tassa\s+di\s+possesso/i, name: 'Bollo', scad: { veicolo: 'bollo' } },
  { re: /carta\s+di\s+circolazione|documento\s+unico|libretto\s+di\s+circolazione/i, name: 'Libretto di circolazione', scad: { veicolo: 'revisione' } },
  { re: /revisione/i, name: 'Revisione', scad: { veicolo: 'revisione' } },
  { re: /tagliando|manutenzione\s+programmata/i, name: 'Tagliando', scad: { veicolo: 'tagliando' } },
  { re: /caldaia|impianto\s+termico|libretto\s+di\s+impianto/i, name: 'Manutenzione caldaia', scad: { immobile: 'caldaia' } },
  { re: /\bIMU\b|F24/i, name: 'Tasse', scad: { immobile: 'tasse' } },
  { re: /vaccin/i, name: 'Vaccino', scad: { animale: 'vaccino' } },
  { re: /antiparassitar/i, name: 'Antiparassitario', scad: { animale: 'antiparassitario' } },
  { re: /veterinari|ricetta\s+medica|referto|esame|analisi/i, name: 'Visita / referto', scad: { animale: 'visita', persona: 'visita', altro: 'visita' } },
];

/** Parole vicino alla data che ne indicano il significato. */
const ROLES = [
  { role: 'scadenza', re: /scad|valid|valevole|fino\s+al|expir|data\s+di\s+fine|4\s?b\b|termine|entro\s+il|rinnov|richiamo|\bal\b/gi },
  { role: 'immatricolazione', re: /immatricolaz|(?:^|\s)B\s?[.)]|prima\s+iscrizione/gi },
  { role: 'revisione', re: /revision/gi },
  { role: 'nascita', re: /nascita|nato|nata|birth|(?:^|\s)3\s?[.)]/gi },
  { role: 'rilascio', re: /rilasci|emission|emess|issue|\b4\s?a\b|data\s+del|decorrenza|\bdal\b|eseguit/gi },
];

const ROLE_LABEL = {
  scadenza: 'Scadenza', immatricolazione: 'Immatricolazione', revisione: 'Ultima revisione', nascita: 'Nascita', rilascio: 'Rilascio / inizio', '': 'Data',
};

const pad = (n) => String(n).padStart(2, '0');

function toYmd(d, m, y) {
  let year = Number(y);
  if (y.length === 2) year += year > 60 ? 1900 : 2000;
  const day = Number(d);
  const month = Number(m);
  if (month < 1 || month > 12 || day < 1 || day > 31 || year < 1900 || year > 2100) return null;
  const date = new Date(year, month - 1, day);
  if (date.getMonth() !== month - 1) return null; // es. 31/02
  return `${year}-${pad(month)}-${pad(day)}`;
}

/** Tutte le date nel testo, con le parole che le precedono. */
export function findDates(text) {
  const found = [];
  const add = (index, ymd, raw) => {
    if (!ymd) return;
    const before = text.slice(Math.max(0, index - 45), index).replace(/\s+/g, ' ');
    found.push({ index, date: ymd, raw, before });
  };
  // 14/03/2031 · 14.03.31 · 14-03-2031 (stesso separatore) · 14 03 2031
  for (const m of text.matchAll(/(?<![\d.\/-])(\d{1,2})([/.-])(\d{1,2})\2(\d{4}|\d{2})(?![\d])/g)) add(m.index, toYmd(m[1], m[3], m[4]), m[0]);
  for (const m of text.matchAll(/(?<![\d.\/-])(\d{2}) (\d{2}) (\d{4})\b/g)) add(m.index, toYmd(m[1], m[2], m[3]), m[0]);
  // 14 marzo 2031 · 14 MAR 2031 · 14 MAR/MAR 2031 (carta d'identità elettronica)
  for (const m of text.matchAll(/\b(\d{1,2})\s+([A-Za-zÀ-ú]{3,9})(?:\s*\/\s*[A-Za-z]{3,9})?\.?\s+(\d{4})\b/g)) {
    const month = MONTHS[m[2].toLowerCase()];
    if (month) add(m.index, toYmd(m[1], String(month), m[3]), m[0]);
  }
  // Togli i doppioni (stessa data nello stesso punto)
  const seen = new Set();
  return found
    .sort((a, b) => a.index - b.index)
    .filter((f) => {
      const k = `${f.date}@${Math.round(f.index / 5)}`;
      if (seen.has(k)) return false;
      seen.add(k);
      return true;
    });
}

function roleOf(before) {
  // Conta solo le parole sulla stessa riga, e vince quella più vicina alla data.
  const near = before.split(/\n|\s{3,}/).pop().slice(-35);
  let best = '';
  let bestPos = -1;
  for (const r of ROLES) {
    for (const m of near.matchAll(r.re)) {
      if (m.index > bestPos) {
        best = r.role;
        bestPos = m.index;
      }
    }
  }
  return best;
}

/**
 * Analizza il testo di un documento.
 * kind: tipo di elemento (persona, veicolo, immobile, animale, altro).
 */
export function analyze(text, kind = '') {
  const clean = String(text || '').replace(/\r/g, '');
  const doc = DOC_TYPES.find((t) => t.re.test(clean) && (!kind || t.scad[kind])) || DOC_TYPES.find((t) => t.re.test(clean)) || null;

  const today = new Date().toISOString().slice(0, 10);
  const dates = findDates(clean).map((d) => ({ ...d, role: roleOf(d.before) }));
  // Unisci le stesse date, tenendo il significato più preciso.
  const byDate = new Map();
  for (const d of dates) {
    const prev = byDate.get(d.date);
    if (!prev || (!prev.role && d.role)) byDate.set(d.date, d);
  }
  const list = [...byDate.values()].sort((a, b) => a.date.localeCompare(b.date));

  // Scadenza più probabile: quella indicata come tale, altrimenti la data
  // futura più lontana (sui documenti la scadenza è di solito l'ultima).
  const expiry = list.filter((d) => d.role === 'scadenza').sort((a, b) => b.date.localeCompare(a.date))[0]
    || list.filter((d) => d.date > today && !d.role).at(-1)
    || null;
  const immatricolazione = list.find((d) => d.role === 'immatricolazione')?.date || '';
  const revisione = list.filter((d) => d.role === 'revisione').at(-1)?.date || '';

  const plate = clean.toUpperCase().match(/\b([A-Z]{2})\s?(\d{3})\s?([A-Z]{2})\b/);

  return {
    docName: doc?.name || '',
    scadType: doc?.scad[kind] || '',
    dates: list.map((d) => ({ date: d.date, role: d.role, label: ROLE_LABEL[d.role] })),
    expiry: expiry?.date || '',
    immatricolazione,
    revisione,
    targa: plate ? `${plate[1]}${plate[2]}${plate[3]}` : '',
    hasText: clean.trim().length > 20,
  };
}
