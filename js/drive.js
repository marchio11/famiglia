// Documenti su Google Drive (Fase 4).
//
// Drive è la fonte di verità: l'app legge le cartelle ogni volta, quindi le
// modifiche fatte direttamente su Drive compaiono da sole nell'app.
//
// Struttura (la cartella principale appartiene all'account di famiglia ed è
// condivisa in modifica con i tre account personali):
//
//   Casa Marchionni/
//     Persone/ Andrea, Laura, Claudia, Altri familiari/ (altri nomi)
//     Veicoli/ Toyota Yaris, Hyundai i10, Camper
//     Immobili/
//     Animali/ Tokyo
//
// Gli id delle cartelle principali sono salvati in Firestore (config/drive),
// così tutti i telefoni usano le stesse.

import * as store from './store.js';
import * as google from './google.js';
import { getAccount } from './user.js';

const API = 'https://www.googleapis.com/drive/v3';
const UPLOAD = 'https://www.googleapis.com/upload/drive/v3/files';
export const FOLDER = 'application/vnd.google-apps.folder';
export const ROOT_NAME = 'Casa Marchionni';
const FILE_FIELDS = 'id,name,mimeType,webViewLink,modifiedTime,size,parents,ownedByMe';

/** Sezioni della pagina Documenti, nell'ordine in cui compaiono. */
export const SECTIONS = [
  { key: 'persone', name: 'Persone', folder: 'Persone', kind: 'persona', emoji: '👨‍👩‍👧' },
  { key: 'altri', name: 'Altri familiari', folder: 'Altri familiari', parent: 'persone', kind: 'persona', emoji: '👴' },
  { key: 'animali', name: 'Animali', folder: 'Animali', kind: 'animale', emoji: '🐾' },
  { key: 'veicoli', name: 'Veicoli', folder: 'Veicoli', kind: 'veicolo', emoji: '🚗' },
  { key: 'immobili', name: 'Immobili', folder: 'Immobili', kind: 'immobile', emoji: '🏠' },
];

/** Sottocartelle create in automatico per ogni nuovo elemento (poi modificabili). */
export const DEFAULT_SUBFOLDERS = {
  persona: ['Documenti d\'identità', 'Esami medici', 'Ricette e certificati', 'Lavoro e studio'],
  altro: ['Documenti'],
  veicolo: ['Libretto e assicurazione', 'Bollo', 'Revisioni e tagliandi', 'Multe e varie'],
  immobile: ['Atti e contratti', 'Utenze', 'Manutenzioni', 'Tasse'],
  animale: ['Libretto sanitario', 'Visite e ricette', 'Vaccini'],
};

/** Elementi creati alla prima configurazione. */
const INITIAL = {
  persone: ['Andrea', 'Laura', 'Claudia'],
  altri: [],
  veicoli: ['Toyota Yaris', 'Hyundai i10', 'Camper'],
  immobili: [],
  animali: ['Tokyo'],
};

export const { available, connected, connect } = google;
export const onChange = google.onChange;

/* ---------- Configurazione ---------- */

/** Id delle cartelle principali (da Firestore) o null se non ancora configurato. */
export function config() {
  const c = store.get('config', 'drive');
  return c?.rootId ? c : null;
}

/** Tipo di elemento in base alla cartella che lo contiene (null se non è un elemento). */
export function kindOfParent(parentId) {
  const c = config();
  if (!c) return null;
  if (parentId === c.sections.altri) return 'altro';
  const sec = SECTIONS.find((s) => c.sections[s.key] === parentId);
  return sec ? sec.kind : null;
}

export const isSectionFolder = (id) => !!config() && Object.values(config().sections).includes(id);

/* ---------- Operazioni di base ---------- */

const q = (s) => s.replace(/\\/g, '\\\\').replace(/'/g, "\\'");

async function list(query, fields = FILE_FIELDS) {
  const files = [];
  let pageToken;
  do {
    const d = await google.request(`${API}/files`, {
      query: {
        q: query,
        fields: `nextPageToken,files(${fields})`,
        orderBy: 'folder,name_natural',
        pageSize: '1000',
        supportsAllDrives: 'true',
        includeItemsFromAllDrives: 'true',
        pageToken,
      },
    });
    files.push(...(d.files || []));
    pageToken = d.nextPageToken;
  } while (pageToken);
  return files;
}

export async function getFile(id) {
  return google.request(`${API}/files/${id}`, { query: { fields: FILE_FIELDS, supportsAllDrives: 'true' } });
}

export async function createFolder(name, parentId) {
  return google.request(`${API}/files`, {
    method: 'POST',
    query: { fields: FILE_FIELDS, supportsAllDrives: 'true' },
    json: { name, mimeType: FOLDER, parents: [parentId] },
  });
}

/** Trova una sottocartella per nome, o la crea. */
async function ensureFolder(name, parentId) {
  const found = await list(`'${parentId}' in parents and name = '${q(name)}' and mimeType = '${FOLDER}' and trashed = false`);
  return found[0] || createFolder(name, parentId);
}

export async function rename(id, name) {
  return google.request(`${API}/files/${id}`, { method: 'PATCH', query: { supportsAllDrives: 'true' }, json: { name } });
}

/**
 * Elimina (nel cestino di Drive, recuperabile per 30 giorni). Se il file
 * appartiene a un altro account, Drive non permette di cestinarlo: in quel
 * caso lo si toglie dalla cartella.
 */
export async function remove(file) {
  try {
    await google.request(`${API}/files/${file.id}`, { method: 'PATCH', query: { supportsAllDrives: 'true' }, json: { trashed: true } });
  } catch (err) {
    if (err.code !== 'forbidden' || !file.parents?.[0]) throw err;
    await google.request(`${API}/files/${file.id}`, {
      method: 'PATCH',
      query: { removeParents: file.parents[0], supportsAllDrives: 'true' },
      json: {},
    });
  }
  forgetListing(file.parents?.[0]);
}

/** Carica un file del telefono nella cartella (caricamento "riprendibile", anche per foto grandi). */
export async function upload(file, parentId, name = file.name) {
  const meta = { name, parents: [parentId] };
  const type = file.type || 'application/octet-stream';
  const start = await google.request(UPLOAD, {
    method: 'POST',
    query: { uploadType: 'resumable', supportsAllDrives: 'true', fields: FILE_FIELDS },
    json: meta,
    headers: { 'X-Upload-Content-Type': type },
    raw: true,
  });
  const location = start.headers.get('Location');
  if (!location) throw new google.GoogleError('api', 'Caricamento non riuscito: riprova');
  let res;
  try {
    res = await fetch(location, { method: 'PUT', headers: { 'Content-Type': type }, body: file });
  } catch {
    throw new google.GoogleError('offline', 'Connessione interrotta durante il caricamento');
  }
  if (!res.ok) throw new google.GoogleError('api', `Caricamento non riuscito (${res.status})`);
  return res.json();
}

/* ---------- Elenchi con copia sul telefono ---------- */

const cacheKey = (k) => `cm:drive:${getAccount()?.uid || 'nessuno'}:${k}`;
function readCache(k) {
  try {
    return JSON.parse(localStorage.getItem(cacheKey(k)));
  } catch {
    return null;
  }
}
function writeCache(k, v) {
  try {
    localStorage.setItem(cacheKey(k), JSON.stringify(v));
  } catch { /* spazio pieno: pazienza */ }
}
function forgetListing(folderId) {
  try {
    localStorage.removeItem(cacheKey(`f:${folderId}`));
  } catch { /* ignora */ }
}

/** Contenuto di una cartella: { folder, items } (ultimo salvato). */
export const cachedFolder = (id) => readCache(`f:${id}`);

export async function loadFolder(id) {
  const [folder, items] = await Promise.all([
    getFile(id),
    list(`'${id}' in parents and trashed = false`),
  ]);
  const data = { at: Date.now(), folder, items };
  writeCache(`f:${id}`, data);
  return data;
}

/** Elementi di tutte le sezioni (una sola richiesta): { at, bySection: {key: [file]} }. */
export const cachedSections = () => readCache('sections');

export async function loadSections() {
  const c = config();
  const ids = Object.values(c.sections);
  const folders = await list(`(${ids.map((id) => `'${id}' in parents`).join(' or ')}) and mimeType = '${FOLDER}' and trashed = false`);
  const bySection = {};
  for (const s of SECTIONS) {
    bySection[s.key] = folders.filter((f) => f.parents?.includes(c.sections[s.key]) && f.id !== c.sections.altri);
  }
  const data = { at: Date.now(), bySection };
  writeCache('sections', data);
  return data;
}

/* ---------- Prima configurazione ---------- */

/** Cerca la cartella "Casa Marchionni" tra quelle visibili all'utente. */
export async function findRoot() {
  const found = await list(`name = '${q(ROOT_NAME)}' and mimeType = '${FOLDER}' and trashed = false`, 'id,name,ownedByMe,owners(emailAddress)');
  // Meglio quella dell'account di famiglia (non mia) se ce ne sono più di una.
  return found.find((f) => !f.ownedByMe) || found[0] || null;
}

/**
 * Prepara la struttura: sezioni, elementi iniziali e sottocartelle.
 * Non crea doppioni: riusa le cartelle che esistono già con lo stesso nome.
 */
export async function setup(onProgress = () => {}) {
  const root = await findRoot();
  if (!root) throw new google.GoogleError('noroot', `Non trovo la cartella "${ROOT_NAME}" su Drive`);
  const sections = {};
  for (const s of SECTIONS) {
    onProgress(`Cartella ${s.name}…`);
    const parent = s.parent ? sections[s.parent] : root.id;
    sections[s.key] = (await ensureFolder(s.folder, parent)).id;
  }
  for (const s of SECTIONS) {
    for (const name of INITIAL[s.key]) {
      onProgress(`${name}…`);
      const item = await ensureFolder(name, sections[s.key]);
      const kind = s.key === 'altri' ? 'altro' : s.kind;
      for (const sub of DEFAULT_SUBFOLDERS[kind]) await ensureFolder(sub, item.id);
    }
  }
  store.set('config', 'drive', { rootId: root.id, sections, at: Date.now() });
  return sections;
}

/** Crea un nuovo elemento (es. "Tesla" in Veicoli) con le sottocartelle tipiche. */
export async function createItem(sectionKey, name) {
  const c = config();
  const kind = sectionKey === 'altri' ? 'altro' : SECTIONS.find((s) => s.key === sectionKey).kind;
  const item = await createFolder(name, c.sections[sectionKey]);
  await Promise.all(DEFAULT_SUBFOLDERS[kind].map((sub) => createFolder(sub, item.id)));
  return item;
}

/* ---------- Aspetto dei file ---------- */

export function fileIcon(f) {
  const t = f.mimeType || '';
  if (t === FOLDER) return '📁';
  if (t.startsWith('image/')) return '🖼️';
  if (t === 'application/pdf') return '📄';
  if (t.includes('spreadsheet') || t.includes('excel')) return '📊';
  if (t.includes('document') || t.includes('word')) return '📝';
  if (t.includes('presentation')) return '📽️';
  if (t.startsWith('video/')) return '🎬';
  if (t.startsWith('audio/')) return '🎵';
  return '📎';
}

export function fileSize(bytes) {
  const n = Number(bytes);
  if (!n) return '';
  if (n < 1024 * 1024) return `${Math.max(1, Math.round(n / 1024))} KB`;
  return `${(n / 1024 / 1024).toFixed(1).replace('.', ',')} MB`;
}

export const enableApiUrl = (err) => google.enableApiUrl(err, 'drive.googleapis.com');
export const explain = (err) => {
  if (err?.code === 'noroot') return err.message;
  return google.explain(err);
};
