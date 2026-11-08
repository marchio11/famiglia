// Strato dati dell'app.
//
// FASE 1: i dati vivono nel localStorage del telefono (non sono condivisi).
// FASE 2: questo file verrà riscritto per usare Firebase Firestore, mantenendo
// le stesse funzioni, così le schermate non dovranno cambiare.
//
// Ogni "collezione" (spesa, todo, lists, listItems, ...) è una mappa id -> oggetto.

const KEY = 'cm:data:v1';
const USER_KEY = 'cm:user';

export const MEMBERS = ['Andrea', 'Laura', 'Claudia'];

const listeners = new Set();
let data = load();
let memoryUser = null;

function load() {
  try {
    return JSON.parse(localStorage.getItem(KEY)) || {};
  } catch {
    return {};
  }
}

function persist() {
  try {
    localStorage.setItem(KEY, JSON.stringify(data));
  } catch (e) {
    console.error('Salvataggio non riuscito', e);
  }
  notify();
}

function notify() {
  listeners.forEach((fn) => fn());
}

export function uid() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

export function getAll(col) {
  return Object.values(data[col] || {});
}

export function get(col, id) {
  return data[col]?.[id];
}

export function add(col, obj) {
  const id = uid();
  data[col] ??= {};
  data[col][id] = { ...obj, id, createdBy: getUser(), createdAt: Date.now() };
  persist();
  return id;
}

/** Scrive un oggetto con un id scelto (usato anche per "Annulla"). */
export function set(col, id, obj) {
  data[col] ??= {};
  data[col][id] = { ...obj, id };
  persist();
}

export function update(col, id, patch) {
  const item = data[col]?.[id];
  if (!item) return;
  Object.assign(item, patch, { updatedBy: getUser(), updatedAt: Date.now() });
  persist();
}

/** Elimina e restituisce le copie eliminate (per poterle ripristinare). */
export function remove(col, ids) {
  const list = Array.isArray(ids) ? ids : [ids];
  const removed = [];
  for (const id of list) {
    if (data[col]?.[id]) {
      removed.push(data[col][id]);
      delete data[col][id];
    }
  }
  persist();
  return removed;
}

export function restore(col, items) {
  data[col] ??= {};
  for (const it of items) data[col][it.id] = it;
  persist();
}

export function subscribe(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

// Utente corrente (in Fase 2 arriverà dal login Google).
export function getUser() {
  try {
    return localStorage.getItem(USER_KEY) || memoryUser;
  } catch {
    return memoryUser;
  }
}

export function setUser(name) {
  memoryUser = name;
  try {
    localStorage.setItem(USER_KEY, name);
  } catch { /* modalità privata: resta in memoria */ }
  notify();
}

// Se l'app è aperta in due schede, le tiene allineate.
window.addEventListener('storage', (e) => {
  if (e.key === KEY) {
    data = load();
    notify();
  }
});
