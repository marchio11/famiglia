// Documenti salvati sul telefono (per i viaggi): si aprono anche senza rete.
//
// I file sono tenuti nella Cache Storage del browser ("casa-offline"), che il
// service worker non cancella agli aggiornamenti. L'elenco (nome, tipo…) è in
// localStorage. Vale solo per il telefono su cui vengono salvati.

import * as drive from './drive.js';

const CACHE = 'casa-offline';
const META = 'cm:offline';
const urlFor = (id) => `/offline-file/${id}`;

const listeners = new Set();
export function onChange(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}
const emit = () => listeners.forEach((fn) => fn());

function meta() {
  try {
    return JSON.parse(localStorage.getItem(META)) || {};
  } catch {
    return {};
  }
}
function saveMeta(m) {
  try {
    localStorage.setItem(META, JSON.stringify(m));
  } catch { /* ignora */ }
}

export const supported = () => 'caches' in window;
export const isSaved = (id) => !!meta()[id];
export const savedCount = (ids) => ids.filter((id) => meta()[id]).length;

/** Scarica il file da Drive e lo tiene sul telefono. */
export async function save(file) {
  const blob = await drive.download(file);
  const cache = await caches.open(CACHE);
  await cache.put(urlFor(file.id), new Response(blob, { headers: { 'Content-Type': blob.type || file.mimeType || 'application/octet-stream' } }));
  const m = meta();
  m[file.id] = { name: file.name, mimeType: blob.type || file.mimeType, size: blob.size, at: Date.now() };
  saveMeta(m);
  // Chiede al browser di non cancellare i dati salvati quando manca spazio.
  navigator.storage?.persist?.().catch(() => {});
  emit();
}

export async function remove(id) {
  const cache = await caches.open(CACHE);
  await cache.delete(urlFor(id));
  const m = meta();
  delete m[id];
  saveMeta(m);
  emit();
}

/** Apre la copia sul telefono: le immagini dentro l'app, gli altri file con il visualizzatore del telefono. */
export async function open(id) {
  const info = meta()[id];
  const cache = await caches.open(CACHE);
  const res = await cache.match(urlFor(id));
  if (!res || !info) throw new Error('Il file non è più salvato sul telefono');
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  if ((info.mimeType || '').startsWith('image/')) {
    const dlg = document.createElement('dialog');
    dlg.className = 'viewer';
    dlg.innerHTML = `<button type="button" class="viewer-close" aria-label="Chiudi">✕</button><img alt="">`;
    dlg.querySelector('img').src = url;
    dlg.querySelector('img').alt = info.name;
    document.body.append(dlg);
    dlg.addEventListener('click', () => dlg.close());
    dlg.addEventListener('close', () => {
      URL.revokeObjectURL(url);
      dlg.remove();
    });
    dlg.showModal();
    return;
  }
  // PDF e altri file: li consegna al telefono, che li apre con il suo visualizzatore.
  const a = document.createElement('a');
  a.href = url;
  a.download = info.name;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}
