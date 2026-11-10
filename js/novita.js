// Note di rilascio ("Novità"): compaiono una volta per telefono dopo un
// aggiornamento, e si possono riaprire dal link in fondo alla home.
// Aggiungere qui una voce quando si pubblica una versione con novità per la
// famiglia (il numero è quello di VERSION in sw.js).

import { esc } from './util.js';

export const RELEASE = 34;
const SEEN_KEY = 'cm:seenRelease';

const NOTES = {
  34: {
    title: 'Versione 34',
    intro: 'Un aggiornamento fatto su misura, con le vostre richieste! 🎁',
    items: [
      {
        emoji: '📷',
        title: 'Foto nella lista della spesa',
        text: 'Aggiungendo o modificando un prodotto puoi allegare una foto: così chi va al supermercato sa esattamente cosa prendere. Le foto stanno su Google Drive, nella cartella "Lista della spesa", e quando il prodotto viene eliminato se ne va anche la sua foto.',
      },
      {
        emoji: '🔒',
        title: 'Liste private',
        text: 'Creando una lista puoi renderla privata: la vedi e la modifichi solo tu, e nell\'elenco ha il lucchetto. Si può anche rendere privata una lista esistente (o tornare a condividerla) da "Modifica lista".',
      },
      {
        emoji: '🗂️',
        title: 'Documenti in ordine',
        text: 'Nelle cartelle con più documenti scegli come ordinarli: più recenti (l\'ultimo aggiunto in cima), meno recenti o per nome.',
      },
      {
        emoji: '📁',
        title: 'Sposta i documenti',
        text: 'Messo un documento nella cartella sbagliata? Dal menu ⋯ scegli "Sposta in…" e indica la cartella giusta, senza passare da Google Drive.',
      },
    ],
  },
};

function seen() {
  try {
    return Number(localStorage.getItem(SEEN_KEY)) || 0;
  } catch {
    return RELEASE; // senza memoria del telefono non insistiamo
  }
}

export function show(version = RELEASE) {
  const n = NOTES[version];
  if (!n) return;
  try {
    localStorage.setItem(SEEN_KEY, String(RELEASE));
  } catch { /* ignora */ }
  const dlg = document.createElement('dialog');
  dlg.className = 'sheet news';
  dlg.innerHTML = `
    <form method="dialog">
      <div class="grab"></div>
      <div class="news-head">
        <span class="news-badge">🎉</span>
        <div><h2>Novità dell'app</h2><p>${esc(n.title)} · Casa Marchionni</p></div>
      </div>
      <p class="news-intro">${esc(n.intro)}</p>
      <div class="news-list">
        ${n.items.map((it) => `
          <div class="news-item">
            <span class="news-emoji">${it.emoji}</span>
            <div><b>${esc(it.title)}</b><p>${esc(it.text)}</p></div>
          </div>`).join('')}
      </div>
      <p class="news-sign">Grazie per i suggerimenti! ❤️<br>— Il reparto sviluppo di Casa Marchionni</p>
      <div class="actions"><span class="spacer"></span><button class="btn primary" type="submit">Fantastico!</button></div>
    </form>`;
  document.body.append(dlg);
  dlg.addEventListener('click', (e) => {
    if (e.target === dlg) dlg.close();
  });
  dlg.addEventListener('close', () => dlg.remove());
  dlg.showModal();
  // Parte dall'inizio (altrimenti il telefono scorre fino al pulsante in fondo).
  const h2 = dlg.querySelector('h2');
  h2.tabIndex = -1;
  h2.focus({ preventScroll: true });
  dlg.scrollTop = 0;
}

/** Mostra le novità se su questo telefono non sono ancora state viste. */
export function maybeShow() {
  if (seen() < RELEASE && !document.querySelector('dialog[open]')) show();
}
