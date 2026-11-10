// Foto dei prodotti della lista della spesa.
//
// La foto viene ridotta e caricata su Google Drive nella cartella
// "Casa Marchionni/Lista della spesa". Nel prodotto (Firestore) si salvano
// l'id del file, il link e una piccola anteprima (circa 10 KB) che si vede
// subito, anche senza rete.
//
// Quando un prodotto viene eliminato, la sua foto va nel cestino di Drive.
// L'eliminazione aspetta qualche secondo (per il tasto "Annulla") ed è messa
// in coda sul telefono: se il permesso Google non è attivo, viene fatta alla
// prossima occasione.

import * as drive from './drive.js';
import * as google from './google.js';

const QUEUE_KEY = 'cm:photoDeletes';
const DELAY = 8000; // il tempo del tasto "Annulla", con un po' di margine

/** Anteprima piccola (lato max 160 px) come immagine incorporata. */
async function thumbnail(file) {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, 160 / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  canvas.getContext('2d').drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  return canvas.toDataURL('image/jpeg', 0.7);
}

/**
 * Carica la foto di un prodotto. Restituisce i campi da salvare nel prodotto:
 * { photoId, photoLink, photoFolder, thumb }.
 */
export async function upload(file, productName) {
  const folder = await drive.shoppingFolder();
  const small = await drive.compressPhoto(file, 1600);
  const date = new Date().toLocaleDateString('it-IT').replace(/\//g, '-');
  const safe = productName.replace(/[\\/]/g, '-').slice(0, 60);
  const f = await drive.upload(small, folder, `${safe} ${date}.jpg`);
  return {
    photoId: f.id,
    photoLink: f.webViewLink || `https://drive.google.com/file/d/${f.id}/view`,
    photoFolder: folder,
    thumb: await thumbnail(small).catch(() => ''),
  };
}

/* ---------- Eliminazione (con coda) ---------- */

function readQueue() {
  try {
    return JSON.parse(localStorage.getItem(QUEUE_KEY)) || [];
  } catch {
    return [];
  }
}
function saveQueue(q) {
  try {
    localStorage.setItem(QUEUE_KEY, JSON.stringify(q));
  } catch { /* ignora */ }
}

/** Mette in coda l'eliminazione della foto di un prodotto. */
export function scheduleDelete(item) {
  if (!item?.photoId) return;
  const q = readQueue().filter((x) => x.id !== item.photoId);
  q.push({ id: item.photoId, folder: item.photoFolder || '', at: Date.now() + DELAY });
  saveQueue(q);
  setTimeout(processQueue, DELAY + 500);
}

/** Toglie dalla coda (es. dopo "Annulla"). */
export function cancelDelete(item) {
  if (!item?.photoId) return;
  saveQueue(readQueue().filter((x) => x.id !== item.photoId));
}

let running = false;

/** Elimina le foto in coda il cui tempo è scaduto (serve il permesso Google). */
export async function processQueue() {
  if (running || !google.available() || !google.connected()) return;
  running = true;
  try {
    for (const job of readQueue().filter((x) => x.at <= Date.now())) {
      try {
        await drive.remove({ id: job.id, parents: job.folder ? [job.folder] : [] });
      } catch (err) {
        // Già eliminata (o non più accessibile): niente da fare.
        if (err.code !== 'notfound' && err.code !== 'forbidden') continue;
      }
      saveQueue(readQueue().filter((x) => x.id !== job.id));
    }
  } finally {
    running = false;
  }
}
