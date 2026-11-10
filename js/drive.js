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
const FILE_FIELDS = 'id,name,mimeType,webViewLink,modifiedTime,createdTime,size,parents,ownedByMe';

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
  // Con la ricerca nel testo Drive non permette di ordinare: ordina lui per pertinenza.
  const fullText = query.includes('fullText');
  const files = [];
  let pageToken;
  do {
    const d = await google.request(`${API}/files`, {
      query: {
        q: query,
        fields: `nextPageToken,files(${fields})`,
        orderBy: fullText ? undefined : 'folder,name_natural',
        pageSize: fullText ? '100' : '1000',
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

/* ---------- Lettura del testo (OCR di Google Drive) ---------- */

const GDOC = 'application/vnd.google-apps.document';

/** Formati da cui Drive sa ricavare il testo. */
export const canRead = (f) => /^image\/(jpeg|png|gif|webp)|application\/pdf/.test(f.mimeType || '') || f.mimeType === GDOC;

/**
 * Restituisce il testo di un file su Drive. Drive ne fa una copia convertita
 * in documento Google (riconoscendo il testo di foto e PDF), l'app legge il
 * testo e cancella subito la copia.
 */
export async function readText(fileId) {
  const copy = await google.request(`${API}/files/${fileId}/copy`, {
    method: 'POST',
    query: { ocrLanguage: 'it', fields: 'id', supportsAllDrives: 'true' },
    json: { mimeType: GDOC, name: 'Casa Marchionni - lettura temporanea' },
  });
  try {
    const res = await google.request(`${API}/files/${copy.id}/export`, { query: { mimeType: 'text/plain' }, raw: true });
    return await res.text();
  } finally {
    google.request(`${API}/files/${copy.id}`, { method: 'DELETE' }).catch(() => {});
  }
}

/**
 * Trova la persona/veicolo/… a cui appartiene una cartella, risalendo le
 * cartelle che la contengono. Restituisce { id, name, kind } o null.
 */
export async function findEntity(folderId) {
  let id = folderId;
  for (let i = 0; i < 6 && id; i += 1) {
    if (isSectionFolder(id) || id === config()?.rootId) return null;
    const f = cachedFolder(id)?.folder || await getFile(id);
    const kind = kindOfParent(f.parents?.[0]);
    if (kind) return { id: f.id, name: f.name, kind };
    id = f.parents?.[0];
  }
  return null;
}

/* ---------- Ricerca ---------- */

/** Tutte le cartelle dentro "Casa Marchionni": Map id -> { name, parent }. */
let tree = null;
let treeAt = 0;
export async function folderTree() {
  if (tree && Date.now() - treeAt < 10 * 60_000) return tree;
  const c = config();
  const map = new Map([[c.rootId, { name: ROOT_NAME, parent: null }]]);
  let level = [c.rootId];
  while (level.length) {
    const next = [];
    for (let i = 0; i < level.length; i += 40) {
      const chunk = level.slice(i, i + 40);
      const found = await list(`(${chunk.map((id) => `'${id}' in parents`).join(' or ')}) and mimeType = '${FOLDER}' and trashed = false`, 'id,name,parents');
      for (const f of found) {
        if (map.has(f.id)) continue;
        map.set(f.id, { name: f.name, parent: f.parents?.find((p) => map.has(p)) });
        next.push(f.id);
      }
    }
    level = next;
  }
  tree = map;
  treeAt = Date.now();
  return tree;
}

/** Percorso leggibile di una cartella, es. "Veicoli › Toyota Yaris › Bollo". */
function pathOf(map, folderId) {
  const parts = [];
  let id = folderId;
  while (id && map.has(id) && id !== config().rootId) {
    parts.unshift(map.get(id).name);
    id = map.get(id).parent;
  }
  return parts.filter((p) => p !== 'Altri familiari' || parts.length < 3).join(' › ');
}

/**
 * Cerca nel nome e nel testo dei documenti (Drive legge anche il testo di
 * foto e PDF). Restituisce solo i file dentro "Casa Marchionni".
 */
export async function search(text) {
  const words = text.trim().split(/\s+/).filter(Boolean).slice(0, 6);
  if (!words.length) return [];
  const [map, found] = await Promise.all([
    folderTree(),
    list(`${words.map((w) => `fullText contains '${q(w)}'`).join(' and ')} and trashed = false`, `${FILE_FIELDS}`),
  ]);
  return found
    .filter((f) => f.parents?.some((p) => map.has(p)))
    .map((f) => {
      const parent = f.parents.find((p) => map.has(p));
      return { ...f, folderId: parent, path: pathOf(map, parent) };
    });
}

/* ---------- Foto più leggere ---------- */

/**
 * Riduce una foto (lato lungo max 2400 px, JPEG): i documenti restano ben
 * leggibili, occupano meno spazio e la lettura del testo è più affidabile.
 */
export async function compressPhoto(file, maxSide = 2400) {
  if (!/^image\/(jpeg|png|webp)/.test(file.type) || file.size < 900_000) return file;
  try {
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(bitmap.width * scale);
    canvas.height = Math.round(bitmap.height * scale);
    canvas.getContext('2d').drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise((res) => canvas.toBlob(res, 'image/jpeg', 0.85));
    return blob && blob.size < file.size ? new File([blob], file.name.replace(/\.\w+$/, '.jpg'), { type: 'image/jpeg' }) : file;
  } catch {
    return file;
  }
}

/* ---------- Viaggi ---------- */

/** Cartella "Viaggi" dentro "Casa Marchionni" (creata la prima volta). */
export async function tripsFolder() {
  const c = config();
  if (c.sections.viaggi) return c.sections.viaggi;
  const f = await ensureFolder('Viaggi', c.rootId);
  store.update('config', 'drive', { sections: { ...c.sections, viaggi: f.id } });
  return f.id;
}

/** Crea la cartella dei documenti di un viaggio (es. "2027 Vienna"). */
export async function createTripFolder(name) {
  const parent = await tripsFolder();
  return ensureFolder(name, parent);
}

/** Scarica il contenuto di un file (i documenti Google vengono esportati in PDF). */
export async function download(file) {
  const native = (file.mimeType || '').startsWith('application/vnd.google-apps');
  const res = native
    ? await google.request(`${API}/files/${file.id}/export`, { query: { mimeType: 'application/pdf' }, raw: true })
    : await google.request(`${API}/files/${file.id}`, { query: { alt: 'media', supportsAllDrives: 'true' }, raw: true });
  return res.blob();
}

/* ---------- Spostare file e cartelle ---------- */

/** Sposta un file (o una cartella) in un'altra cartella. */
export async function move(file, toFolderId) {
  const from = file.parents?.[0];
  await google.request(`${API}/files/${file.id}`, {
    method: 'PATCH',
    query: { addParents: toFolderId, removeParents: from, supportsAllDrives: 'true', fields: 'id,parents' },
    json: {},
  });
  forgetListing(from);
  forgetListing(toFolderId);
  tree = null; // l'albero delle cartelle va ricostruito
}

/* ---------- Foto della lista della spesa ---------- */

/** Cartella "Lista della spesa" dentro "Casa Marchionni" (creata la prima volta). */
export async function shoppingFolder() {
  const c = config();
  if (c.sections.spesa) return c.sections.spesa;
  const f = await ensureFolder('Lista della spesa', c.rootId);
  store.update('config', 'drive', { sections: { ...c.sections, spesa: f.id } });
  return f.id;
}
