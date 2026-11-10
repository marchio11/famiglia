// Backup automatico dei dati dell'app (Firestore) su Google Drive.
//
// Una volta al giorno, il primo telefono che apre l'app con il permesso
// Google attivo salva una copia di tutti i dati (comprese le liste private
// di chi lo fa) in "Casa Marchionni/Backup app/backup-AAAA-MM-GG.json".
// Si tengono le ultime 30 copie: le più vecchie vanno nel cestino di Drive.
// La data dell'ultimo backup sta in Firestore config/backup, così gli altri
// telefoni sanno che per oggi è già fatto. Nessun ripristino dall'app: se
// servisse, il file JSON contiene tutto ed è leggibile.

import * as store from './store.js';
import * as drive from './drive.js';

export const KEEP = 30;
let running = false;
let failedAt = 0; // dopo un errore si aspetta un po' prima di riprovare

const pad = (n) => String(n).padStart(2, '0');
const today = () => {
  const d = new Date();
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
};

/** Tutti i dati in un unico oggetto. */
export function snapshot() {
  const collections = {};
  for (const c of [...store.COLLECTIONS, ...Object.keys(store.PRIVATE)]) {
    collections[c] = Object.fromEntries(store.getAll(c).map((it) => [it.id, it]));
  }
  return {
    app: 'Casa Marchionni',
    createdAt: new Date().toISOString(),
    by: store.getUser(),
    note: 'privLists e privItems sono le liste private di chi ha fatto il backup',
    collections,
  };
}

/** Fa il backup se oggi non è ancora stato fatto (da nessun telefono). */
export async function runIfDue() {
  if (running || Date.now() - failedAt < 10 * 60e3 || !store.CLOUD || !drive.connected() || !drive.config() || !store.synced()) return false;
  const day = today();
  if (store.get('config', 'backup')?.lastDay === day) return false;
  const data = snapshot();
  // Mai salvare un backup vuoto (dati non ancora arrivati).
  const total = ['spesa', 'todo', 'lists', 'listItems', 'scadenze', 'viaggi']
    .reduce((n, c) => n + Object.keys(data.collections[c]).length, 0);
  if (!total) return false;
  running = true;
  try {
    const folder = await drive.backupFolder();
    const blob = new Blob([JSON.stringify(data, null, 1)], { type: 'application/json' });
    await drive.upload(blob, folder, `backup-${day}.json`);
    store.set('config', 'backup', { lastDay: day, by: store.getUser(), at: Date.now() });
    // Tiene solo le ultime copie.
    const files = (await drive.filesIn(folder))
      .filter((f) => /^backup-\d{4}-\d{2}-\d{2}\.json$/.test(f.name))
      .sort((a, b) => b.name.localeCompare(a.name) || (b.createdTime || '').localeCompare(a.createdTime || ''));
    for (const f of files.slice(KEEP)) {
      await drive.remove(f).catch((e) => console.warn('Backup vecchio non eliminato', e));
    }
    return true;
  } catch (e) {
    failedAt = Date.now();
    console.warn('Backup non riuscito (si riprova più tardi)', e);
    return false;
  } finally {
    running = false;
  }
}

/** Prova appena i dati sono sincronizzati, e poi a ogni occasione utile. */
export function start() {
  if (!store.CLOUD) return;
  let timer = null;
  const later = () => {
    clearTimeout(timer);
    timer = setTimeout(runIfDue, 5000);
  };
  store.subscribe(() => {
    if (store.synced() && store.get('config', 'backup')?.lastDay !== today()) later();
  });
  drive.onChange(later);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') later();
  });
}
