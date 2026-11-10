// Strato dati dell'app. Le schermate usano solo queste funzioni.
//
// Due modalità:
// - LOCALE (firebase-config.js vuoto): dati nel localStorage del telefono.
// - CLOUD (Fase 2): dati su Firebase Firestore, condivisi in tempo reale tra
//   i telefoni di famiglia e disponibili anche offline.
//
// Ogni "collezione" (spesa, todo, lists, listItems, spesaMemo) è una mappa
// id -> oggetto, tenuta in memoria per letture immediate.

import { firebaseConfig } from './firebase-config.js';

export const CLOUD = !!(firebaseConfig && firebaseConfig.apiKey);
export const COLLECTIONS = ['spesa', 'spesaCats', 'spesaMemo', 'todo', 'lists', 'listItems', 'config', 'scadenze', 'docInfo', 'viaggi'];
export const MEMBERS = ['Andrea', 'Laura', 'Claudia'];

const KEY = 'cm:data:v1';
const USER_KEY = 'cm:user';

const listeners = new Set();
let data = CLOUD ? {} : loadLocal();
let cloud = null;
let currentUser = null;
let errorHandler = (e) => console.error(e);

/* ---------- Persistenza ---------- */

function loadLocal() {
  try {
    return JSON.parse(localStorage.getItem(KEY)) || {};
  } catch {
    return {};
  }
}

function saveLocal() {
  try {
    localStorage.setItem(KEY, JSON.stringify(data));
  } catch (e) {
    console.error('Salvataggio non riuscito', e);
  }
}

function notify() {
  listeners.forEach((fn) => fn());
}

/** Dopo ogni modifica: salva (locale) e aggiorna le schermate. */
function commit(cloudOp) {
  if (CLOUD) {
    cloudOp().catch((e) => errorHandler(e));
  } else {
    saveLocal();
  }
  notify();
}

/* ---------- Cloud ---------- */

/** Carica Firebase. Restituisce il modulo per login/logout. */
export async function loadCloud(onError) {
  if (onError) errorHandler = onError;
  cloud = await import('./cloud.js');
  return cloud;
}

/** Id del progetto Firebase (per i link alla console Google). */
export const firebaseProject = () => firebaseConfig?.messagingSenderId || firebaseConfig?.projectId || '';

/** Il modulo Firebase già caricato (o null in modalità locale). */
export const getCloud = () => cloud;

let stopListening = null;

/**
 * Collezioni private: visibili solo a chi le crea. Nell'app hanno un nome
 * (es. "privLists"), nel database stanno sotto users/<uid>/… e le regole di
 * sicurezza permettono l'accesso solo a quell'utente.
 */
export const PRIVATE = { privLists: 'lists', privItems: 'listItems' };
const paths = {};
const pathOf = (col) => paths[col] || col;

/** Inizia a ricevere i dati in tempo reale (dopo il login). */
export function connect(uid) {
  disconnect();
  for (const [name, sub] of Object.entries(PRIVATE)) paths[name] = `users/${uid}/${sub}`;
  const names = [...COLLECTIONS, ...Object.keys(PRIVATE)];
  const byPath = Object.fromEntries(names.map((n) => [pathOf(n), n]));
  stopListening = cloud.listen(
    names.map(pathOf),
    (path, map) => {
      data[byPath[path]] = map;
      notify();
    },
    (e) => errorHandler(e),
  );
}

export function disconnect() {
  if (stopListening) stopListening();
  stopListening = null;
  data = {};
}

/* ---------- Lettura ---------- */

export function uid() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

export function getAll(col) {
  return Object.values(data[col] || {});
}

export function get(col, id) {
  return data[col]?.[id];
}

export function subscribe(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

/* ---------- Scrittura ---------- */

export function add(col, obj) {
  const id = uid();
  const item = { ...obj, id, createdBy: getUser(), createdAt: Date.now() };
  data[col] ??= {};
  data[col][id] = item;
  commit(() => cloud.write(pathOf(col), id, item));
  return id;
}

/** Scrive un oggetto con un id scelto. */
export function set(col, id, obj) {
  const item = { ...obj, id };
  data[col] ??= {};
  data[col][id] = item;
  commit(() => cloud.write(pathOf(col), id, item));
}

export function update(col, id, patch) {
  const item = data[col]?.[id];
  if (!item) return;
  const full = { ...patch, updatedBy: getUser(), updatedAt: Date.now() };
  Object.assign(item, full);
  commit(() => cloud.patch(pathOf(col), id, full));
}

/** Elimina e restituisce le copie eliminate (per poterle ripristinare). */
export function remove(col, ids) {
  const list = (Array.isArray(ids) ? ids : [ids]).filter((id) => data[col]?.[id]);
  const removed = list.map((id) => data[col][id]);
  list.forEach((id) => delete data[col][id]);
  if (list.length) commit(() => cloud.removeMany(pathOf(col), list));
  return removed;
}

/** Ripristina elementi eliminati (tasto "Annulla"). */
export function restore(col, items) {
  if (!items.length) return;
  data[col] ??= {};
  for (const it of items) data[col][it.id] = it;
  commit(() => cloud.writeMany(pathOf(col), items));
}

/* ---------- Utente ---------- */

export function getUser() {
  if (currentUser) return currentUser;
  if (CLOUD) return null;
  try {
    return localStorage.getItem(USER_KEY);
  } catch {
    return null;
  }
}

export function setUser(name) {
  currentUser = name;
  if (!CLOUD) {
    try {
      localStorage.setItem(USER_KEY, name);
    } catch { /* modalità privata: resta in memoria */ }
  }
  notify();
}

// In modalità locale, se l'app è aperta in due schede le tiene allineate.
if (!CLOUD) {
  window.addEventListener('storage', (e) => {
    if (e.key === KEY) {
      data = loadLocal();
      notify();
    }
  });
}
